import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'events';

export class RelayServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 8765;
    this.token = options.token || process.env.RELAY_TOKEN || 'chimera-relay-default';
    this.devices = new Map();
    this.pendingRequests = new Map();
    this.server = null;
    this.wss = null;
  }

  async start() {
    this.server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          devices: this.devices.size,
          uptime: process.uptime()
        }));
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`[Relay] WebSocket on ws://localhost:${this.port}`);
        console.log(`[Relay] Health: http://localhost:${this.port}/health`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  handleConnection(ws, req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    const deviceId = req.headers['x-device-id'] || `anon-${Date.now()}`;

    if (token !== this.token) {
      ws.close(1008, 'Invalid token');
      return;
    }

    console.log(`[Relay] Device connected: ${deviceId}`);
    this.devices.set(deviceId, ws);
    this.emit('deviceConnected', deviceId);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleDeviceMessage(deviceId, msg);
      } catch (e) {
        console.error('[Relay] Invalid message:', e.message);
      }
    });

    ws.on('close', () => {
      console.log(`[Relay] Device disconnected: ${deviceId}`);
      this.devices.delete(deviceId);
      this.emit('deviceDisconnected', deviceId);
    });

    ws.on('error', (err) => {
      console.error(`[Relay] Device error ${deviceId}:`, err.message);
      this.devices.delete(deviceId);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      deviceId,
      message: 'Relay connected. Waiting for inference tasks.'
    }));
  }

  handleDeviceMessage(deviceId, msg) {
    if (msg.type === 'inference_response') {
      const pending = this.pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(msg);
        this.pendingRequests.delete(msg.requestId);
      }
    }
  }

  async forwardInference(deviceId, input, maxTokens = 128, timeoutMs = 30000) {
    const ws = this.devices.get(deviceId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Inference timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      ws.send(JSON.stringify({ type: 'inference_request', requestId, input, maxTokens }), (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }

  getConnectedDevices() {
    return Array.from(this.devices.keys());
  }

  isDeviceConnected(deviceId) {
    const ws = this.devices.get(deviceId);
    return ws && ws.readyState === 1;
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.server) this.server.close(resolve);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
