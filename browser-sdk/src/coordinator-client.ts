import { BrowserNode } from './browser-node';

export interface CoordinatorClientOptions {
  url: string;
  token: string;
  volunteerId: string;
  address: string;
  taskTypes: number[];
  networks: string[];
  capabilities: Record<string, any>;
  heartbeatMs?: number;
}

/**
 * CoordinatorClient — connects the browser node to the protocol's volunteer coordinator.
 *
 * Instead of polling the blockchain for jobs, the coordinator pushes jobs to the
 * browser node via WebSocket. The browser node executes the work and returns the
 * result; the coordinator then submits it on-chain.
 */
export class CoordinatorClient {
  private url: string;
  private token: string;
  private volunteerId: string;
  private address: string;
  private taskTypes: number[];
  private networks: string[];
  private capabilities: Record<string, any>;
  private heartbeatMs: number;
  private ws: WebSocket | null = null;
  private node: BrowserNode;
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private log: (level: string, msg: string) => void;

  constructor(node: BrowserNode, opts: CoordinatorClientOptions, logFn: (level: string, msg: string) => void) {
    this.node = node;
    this.url = opts.url;
    this.token = opts.token;
    this.volunteerId = opts.volunteerId;
    this.address = opts.address;
    this.taskTypes = opts.taskTypes;
    this.networks = opts.networks;
    this.capabilities = opts.capabilities;
    this.heartbeatMs = opts.heartbeatMs || 30000;
    this.log = logFn;
  }

  async connect() {
    if (this.ws) return;
    const fullUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
    this.log('info', `[coordinator] connecting to ${this.url}`);
    this.ws = new WebSocket(fullUrl);

    this.ws.onopen = () => {
      this.log('success', '[coordinator] connected');
      this.send({
        type: 'REGISTER',
        volunteerId: this.volunteerId,
        address: this.address,
        taskTypes: this.taskTypes,
        networks: this.networks,
        capabilities: this.capabilities,
        network: 'browser',
      });
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        this.handleMessage(envelope);
      } catch (e: any) {
        this.log('warn', `[coordinator] message parse error: ${e.message}`);
      }
    };

    this.ws.onclose = () => {
      this.log('warn', '[coordinator] disconnected, reconnecting...');
      this.cleanup();
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = (err: any) => {
      this.log('warn', `[coordinator] websocket error: ${err.message || 'unknown'}`);
    };
  }

  disconnect() {
    this.cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'HEARTBEAT',
        volunteerId: this.volunteerId,
        status: 'idle',
        taskTypes: this.taskTypes,
        capabilities: this.capabilities,
        network: 'browser',
      });
    }, this.heartbeatMs);
  }

  private send(envelope: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  private async handleMessage(envelope: any) {
    switch (envelope.type) {
      case 'REGISTERED':
        this.log('info', `[coordinator] registered as ${envelope.volunteerId}`);
        break;
      case 'JOB_DISPATCH':
        await this.handleJobDispatch(envelope);
        break;
      case 'ERROR':
        this.log('warn', `[coordinator] server error: ${envelope.error}`);
        break;
      default:
        this.log('debug', `[coordinator] unknown message type: ${envelope.type}`);
    }
  }

  private async handleJobDispatch(envelope: any) {
    const { jobId, jobAddress, network, taskType, requestHash } = envelope;
    this.log('info', `[coordinator] received ${network} job ${jobId || jobAddress} (taskType=${taskType})`);

    try {
      // Use the browser node's existing job processor
      const resultText = await (this.node as any)._processJob(requestHash, taskType);
      this.send({
        type: 'JOB_RESULT',
        jobId,
        jobAddress,
        network,
        volunteerId: this.volunteerId,
        result: resultText,
      });
      this.log('success', `[coordinator] submitted result for ${network} job ${jobId || jobAddress}`);
    } catch (e: any) {
      this.log('error', `[coordinator] failed to process ${network} job ${jobId || jobAddress}: ${e.message}`);
      this.send({
        type: 'JOB_REJECTED',
        jobId,
        jobAddress,
        network,
        volunteerId: this.volunteerId,
        reason: e.message,
      });
    }
  }
}
