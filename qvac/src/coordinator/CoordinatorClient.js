import { EventEmitter } from 'events';
import WebSocket from 'ws';

const DEFAULT_HEARTBEAT_MS = 30000;

/**
 * CoordinatorClient (Node.js) — connects a QVAC miner to the volunteer coordinator.
 *
 * Volunteers register their supported task types and capabilities; the coordinator
 * pushes matching jobs to them via WebSocket. The miner executes the job and returns
 * the result, which the coordinator then submits on-chain.
 */
export class CoordinatorClient extends EventEmitter {
  constructor(options) {
    super();
    this.url = options.url;
    this.token = options.token || 'development-token';
    this.volunteerId = options.volunteerId;
    this.address = options.address || '';
    this.taskTypes = options.taskTypes || [];
    this.networks = options.networks || ['casper', 'botchain'];
    this.capabilities = options.capabilities || {};
    this.heartbeatMs = options.heartbeatMs || DEFAULT_HEARTBEAT_MS;
    this.ws = null;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws) return;
    const fullUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(fullUrl);

    this.ws.on('open', () => {
      this.send({
        type: 'REGISTER',
        volunteerId: this.volunteerId,
        address: this.address,
        taskTypes: this.taskTypes,
        networks: this.networks,
        capabilities: this.capabilities,
        network: this.networks[0] || 'qvac',
      });
      this.startHeartbeat();
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const envelope = JSON.parse(data.toString());
        this.handleMessage(envelope);
      } catch (e) {
        this.emit('error', new Error(`Message parse error: ${e.message}`));
      }
    });

    this.ws.on('close', () => {
      this.cleanup();
      this.emit('disconnected');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
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

  cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'HEARTBEAT',
        volunteerId: this.volunteerId,
        status: 'idle',
        taskTypes: this.taskTypes,
        capabilities: this.capabilities,
        network: this.networks[0] || 'qvac',
      });
    }, this.heartbeatMs);
  }

  send(envelope) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  handleMessage(envelope) {
    switch (envelope.type) {
      case 'REGISTERED':
        this.emit('registered', envelope.volunteerId);
        break;
      case 'JOB_DISPATCH':
        this.emit('job', envelope);
        break;
      case 'ERROR':
        this.emit('error', new Error(envelope.error));
        break;
      default:
        break;
    }
  }

  submitResult(jobId, jobAddress, network, result) {
    this.send({
      type: 'JOB_RESULT',
      jobId,
      jobAddress,
      network,
      volunteerId: this.volunteerId,
      result,
    });
  }

  rejectJob(jobId, jobAddress, network, reason) {
    this.send({
      type: 'JOB_REJECTED',
      jobId,
      jobAddress,
      network,
      volunteerId: this.volunteerId,
      reason,
    });
  }
}
