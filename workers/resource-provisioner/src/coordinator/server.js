import { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { VolunteerRegistry } from './volunteer-registry.js';
import { normalizeTaskTypes } from './task-types.js';

const DEFAULT_PORT = Number(process.env.COORDINATOR_PORT || '8080');
const AUTH_TOKEN = process.env.COORDINATOR_AUTH_TOKEN || 'development-token';

/**
 * VolunteerCoordinator — WebSocket server that volunteers connect to.
 *
 * The dispatcher pushes jobs here instead of waiting for volunteers to poll
 * the blockchain. Volunteers receive a `JOB_DISPATCH` envelope, execute the
 * work, and respond with `JOB_RESULT`. The coordinator then forwards the result
 * to the dispatcher for on-chain submission.
 */
export class VolunteerCoordinator extends EventEmitter {
  constructor(port = DEFAULT_PORT) {
    super();
    this.port = port;
    this.wss = null;
    this.registry = new VolunteerRegistry();
  }

  start() {
    if (this.wss) return;
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    console.log(`[coordinator] volunteer coordinator listening on ws://0.0.0.0:${this.port}`);
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token !== AUTH_TOKEN) {
      ws.close(1008, 'invalid token');
      return;
    }

    let volunteerId = null;

    ws.on('message', (data) => {
      try {
        const envelope = JSON.parse(data.toString());
        this.handleMessage(ws, envelope);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'invalid message' }));
      }
    });

    ws.on('close', () => {
      if (volunteerId) {
        this.registry.remove(volunteerId);
        this.emit('volunteer:disconnect', volunteerId);
      }
    });

    ws.on('error', (err) => {
      console.warn('[coordinator] websocket error:', err.message);
    });

    // Helper for one-time registration handshake
    ws._setVolunteerId = (id) => { volunteerId = id; };
  }

  handleMessage(ws, envelope) {
    switch (envelope.type) {
      case 'REGISTER': {
        const volunteer = this.registry.register({
          id: envelope.volunteerId,
          address: envelope.address,
          taskTypes: envelope.taskTypes || [],
          capabilities: envelope.capabilities || {},
          networks: envelope.networks || ['casper', 'botchain'],
          ws,
          network: envelope.network,
        });
        ws._setVolunteerId(volunteer.id);
        ws.send(JSON.stringify({ type: 'REGISTERED', volunteerId: volunteer.id }));
        this.emit('volunteer:register', volunteer);
        break;
      }
      case 'HEARTBEAT': {
        const volunteer = this.registry.get(envelope.volunteerId);
        if (volunteer) {
          volunteer.lastHeartbeat = Date.now();
          volunteer.status = envelope.status || volunteer.status;
          if (envelope.taskTypes) volunteer.taskTypes = normalizeTaskTypes(envelope.taskTypes, envelope.network);
          if (envelope.capabilities) volunteer.capabilities = envelope.capabilities;
        }
        break;
      }
      case 'JOB_RESULT': {
        this.emit('job:result', {
          jobId: envelope.jobId,
          network: envelope.network,
          result: envelope.result,
          volunteerId: envelope.volunteerId,
        });
        break;
      }
      case 'JOB_REJECTED': {
        this.emit('job:rejected', {
          jobId: envelope.jobId,
          network: envelope.network,
          reason: envelope.reason,
          volunteerId: envelope.volunteerId,
        });
        break;
      }
      default: {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'unknown type' }));
      }
    }
  }

  /**
   * Dispatch a job to a volunteer.
   * @returns {Promise<{accepted: boolean, volunteerId: string | null}>}
   */
  async dispatchJob(job, network, timeoutMs = 10000) {
    const volunteer = this.registry.selectVolunteer(job.taskType || 0, job.networks, network);
    if (!volunteer) return { accepted: false, volunteerId: null };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve({ accepted: false, volunteerId: volunteer.id });
      }, timeoutMs);

      const onResult = (payload) => {
        if (payload.jobId === job.jobId && payload.volunteerId === volunteer.id) {
          cleanup();
          resolve({ accepted: true, volunteerId: volunteer.id, result: payload.result });
        }
      };

      const onReject = (payload) => {
        if (payload.jobId === job.jobId && payload.volunteerId === volunteer.id) {
          cleanup();
          resolve({ accepted: false, volunteerId: volunteer.id, reason: payload.reason });
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('job:result', onResult);
        this.off('job:rejected', onReject);
      };

      this.on('job:result', onResult);
      this.on('job:rejected', onReject);

      volunteer.ws.send(JSON.stringify({
        type: 'JOB_DISPATCH',
        jobId: job.jobId,
        jobAddress: job.jobAddress,
        network,
        taskType: job.taskType,
        requestHash: job.requestHash,
        amount: job.amount,
        validUntil: job.validUntil,
      }));

      volunteer.status = 'busy';
    });
  }

  getStatus() {
    return {
      volunteers: this.registry.count(),
      byTaskType: this.registry.countByTaskType(),
    };
  }
}
