import { Logger } from '../core/Logger.js';

/**
 * MCPClient — Model Context Protocol JSON-RPC client for tool calling.
 *
 * Inspired by Kvaq's MCP tool calling: connects to MCP servers (stdio or
 * HTTP) using the JSON-RPC 2.0 protocol to discover and invoke tools.
 * This allows the agent loop to call external tools (bitcoin_price,
 * kvaq_status, custom tools) via a standardized protocol.
 *
 * Protocol:
 *   1. initialize — handshake with server, exchange capabilities
 *   2. tools/list — discover available tools
 *   3. tools/call — invoke a tool with arguments, get result
 *
 * Transport:
 *   - stdio: spawn child process, communicate via stdin/stdout
 *   - http: send JSON-RPC over HTTP POST
 *
 * Integration: AgentLoop uses MCPClient to discover and call tools
 * alongside the built-in tool implementations.
 */

let childProcessCounter = 0;

export class MCPClient {
  constructor(config = {}) {
    this.logger = new Logger('MCPClient');
    this.enabled = config.enabled !== false;
    this.servers = new Map(); // serverName -> { transport, process, url, tools, initialized }
    this._stats = {
      totalCalls: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalToolsDiscovered: 0,
    };
  }

  /**
   * Connect to an MCP server via stdio.
   * @param {string} name - server identifier
   * @param {string} command - command to spawn
   * @param {string[]} args - command arguments
   */
  async connectStdio(name, command, args = []) {
    if (!this.enabled) return false;

    try {
      const { spawn } = await import('child_process');
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_MODE: '1' },
      });

      const server = {
        name,
        transport: 'stdio',
        process: proc,
        url: null,
        tools: [],
        initialized: false,
        _requestId: 0,
        _pending: new Map(),
      };

      // Handle stdout (JSON-RPC responses)
      let buffer = '';
      proc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              const msg = JSON.parse(line);
              this._handleMessage(server, msg);
            } catch {}
          }
        }
      });

      proc.stderr.on('data', (data) => {
        this.logger.debug(`MCP ${name} stderr: ${data.toString().trim()}`);
      });

      proc.on('exit', (code) => {
        this.logger.info(`MCP server ${name} exited (code: ${code})`);
        this.servers.delete(name);
      });

      this.servers.set(name, server);

      // Initialize
      await this._initialize(server);
      await this._listTools(server);

      return true;
    } catch (e) {
      this.logger.warn(`Failed to connect to MCP server ${name}: ${e.message}`);
      return false;
    }
  }

  /**
   * Connect to an MCP server via HTTP.
   * @param {string} name - server identifier
   * @param {string} url - server URL
   */
  async connectHttp(name, url) {
    if (!this.enabled) return false;

    const server = {
      name,
      transport: 'http',
      process: null,
      url,
      tools: [],
      initialized: false,
      _requestId: 0,
      _pending: new Map(),
    };

    this.servers.set(name, server);

    try {
      await this._initialize(server);
      await this._listTools(server);
      return true;
    } catch (e) {
      this.logger.warn(`Failed to connect to MCP HTTP server ${name}: ${e.message}`);
      this.servers.delete(name);
      return false;
    }
  }

  /**
   * Initialize handshake with MCP server.
   */
  async _initialize(server) {
    const response = await this._request(server, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'chimera', version: '1.0' },
    });

    if (response) {
      server.initialized = true;
      // Send initialized notification
      await this._notify(server, 'notifications/initialized', {});
    }
  }

  /**
   * List available tools from MCP server.
   */
  async _listTools(server) {
    const response = await this._request(server, 'tools/list', {});
    if (response && response.tools) {
      server.tools = response.tools;
      this._stats.totalToolsDiscovered += response.tools.length;
      this.logger.info(`MCP ${server.name}: discovered ${response.tools.length} tools`);
    }
  }

  /**
   * Call a tool on an MCP server.
   * @param {string} serverName - server identifier
   * @param {string} toolName - tool name
   * @param {object} args - tool arguments
   * @returns tool result
   */
  async callTool(serverName, toolName, args = {}) {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`MCP server ${serverName} not connected`);
    if (!server.initialized) throw new Error(`MCP server ${serverName} not initialized`);

    this._stats.totalCalls++;

    try {
      const response = await this._request(server, 'tools/call', {
        name: toolName,
        arguments: args,
      });

      if (response && response.isError) {
        this._stats.totalFailed++;
        throw new Error(response.content?.[0]?.text || 'Tool call error');
      }

      this._stats.totalSuccess++;
      return this._parseToolResult(response);
    } catch (e) {
      this._stats.totalFailed++;
      throw e;
    }
  }

  /**
   * Get all tools from all connected servers.
   */
  getAllTools() {
    const all = [];
    for (const [serverName, server] of this.servers) {
      for (const tool of server.tools) {
        all.push({
          ...tool,
          server: serverName,
          fullName: `${serverName}.${tool.name}`,
        });
      }
    }
    return all;
  }

  /**
   * Get tools from a specific server.
   */
  getTools(serverName) {
    const server = this.servers.get(serverName);
    return server ? server.tools : [];
  }

  /**
   * List connected servers.
   */
  listServers() {
    return Array.from(this.servers.values()).map(s => ({
      name: s.name,
      transport: s.transport,
      url: s.url,
      toolCount: s.tools.length,
      initialized: s.initialized,
    }));
  }

  /**
   * Disconnect from a server.
   */
  async disconnect(serverName) {
    const server = this.servers.get(serverName);
    if (!server) return;
    if (server.process) {
      try { server.process.kill(); } catch {}
    }
    this.servers.delete(serverName);
    this.logger.info(`Disconnected from MCP server: ${serverName}`);
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll() {
    for (const name of Array.from(this.servers.keys())) {
      await this.disconnect(name);
    }
  }

  /**
   * Send a JSON-RPC request and await response.
   */
  async _request(server, method, params) {
    const id = ++server._requestId;
    const message = { jsonrpc: '2.0', id, method, params };

    if (server.transport === 'stdio') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          server._pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }, 30000);

        server._pending.set(id, { resolve, reject, timeout });
        server.process.stdin.write(JSON.stringify(message) + '\n');
      });
    } else {
      // HTTP transport
      try {
        const response = await fetch(server.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.result;
      } catch (e) {
        throw new Error(`MCP HTTP request failed: ${e.message}`);
      }
    }
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  async _notify(server, method, params) {
    const message = { jsonrpc: '2.0', method, params };
    if (server.transport === 'stdio') {
      server.process.stdin.write(JSON.stringify(message) + '\n');
    } else {
      try {
        await fetch(server.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    }
  }

  /**
   * Handle incoming JSON-RPC message (stdio).
   */
  _handleMessage(server, msg) {
    if (msg.id && server._pending.has(msg.id)) {
      const pending = server._pending.get(msg.id);
      server._pending.delete(msg.id);
      clearTimeout(pending.timeout);
      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    }
  }

  /**
   * Parse tool call result into a standard format.
   */
  _parseToolResult(response) {
    if (!response) return null;
    if (response.content) {
      const textContent = response.content.find(c => c.type === 'text');
      if (textContent) return textContent.text;
      return response.content;
    }
    return response;
  }

  getStats() {
    return {
      enabled: this.enabled,
      connectedServers: this.servers.size,
      totalTools: this.getAllTools().length,
      totalCalls: this._stats.totalCalls,
      totalSuccess: this._stats.totalSuccess,
      totalFailed: this._stats.totalFailed,
      totalToolsDiscovered: this._stats.totalToolsDiscovered,
    };
  }
}
