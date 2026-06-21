/**
 * Chimera Coordinator WebSocket client.
 *
 * Handles:
 * - Authentication via JWT / wallet signature
 * - Job dispatch reception
 * - Heartbeat with inference metrics
 * - Result submission
 * - Model delivery requests
 *
 * Aligned with QVAC coordinator protocol v1.
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import {
  WSEnvelope,
  JobPayload,
  JobResult,
  HeartbeatMetrics,
  ResultAckPayload,
  ErrorPayload,
  NodeError,
  ErrorCode,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface CoordinatorClientOptions {
  wsUrl: string;
  authToken: string;
  publisherId: string;
  heartbeatIntervalMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export class CoordinatorClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<CoordinatorClientOptions>;
  private reconnectAttempt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentJobId: string | null = null;
  private connected = false;
  private authenticated = false;

  constructor(options: CoordinatorClientOptions) {
    super();
    this.options = {
      heartbeatIntervalMs: 10000,
      maxReconnectAttempts: 10,
      baseReconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      ...options,
    };
  }

  // ─── Connection Lifecycle ─────────────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    logger.info({ url: this.options.wsUrl }, 'Connecting to Chimera coordinator');

    this.ws = new WebSocket(this.options.wsUrl);

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data as Buffer));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
    this.ws.on('error', (err) => this.handleError(err));
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
  }

  private handleOpen(): void {
    this.connected = true;
    this.reconnectAttempt = 0;
    this.emit('connected');

    // Send INIT with auth
    this.send('INIT', {
      authToken: this.options.authToken,
      publisherId: this.options.publisherId,
      protocolVersion: 1,
    });
  }

  private handleMessage(data: Buffer): void {
    try {
      const envelope: WSEnvelope<unknown> = JSON.parse(data.toString());
      this.processEnvelope(envelope);
    } catch (err) {
      logger.warn({ err }, 'Failed to parse coordinator message');
    }
  }

  private handleClose(code: number, reason: string): void {
    this.connected = false;
    this.authenticated = false;
    this.stopHeartbeat();
    logger.warn({ code, reason }, 'Coordinator connection closed');
    this.emit('disconnected', { code, reason });

    if (this.reconnectAttempt < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.emit('reconnect:exhausted');
    }
  }

  private handleError(err: Error): void {
    logger.error({ err: err.message }, 'Coordinator WebSocket error');
    this.emit('error', err);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.options.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempt),
      this.options.maxReconnectDelayMs
    );
    this.reconnectAttempt++;
    logger.info({ attempt: this.reconnectAttempt, delayMs: delay }, 'Scheduling reconnect');
    this.emit('reconnecting', { attempt: this.reconnectAttempt, delayMs: delay });
    setTimeout(() => this.connect(), delay);
  }

  // ─── Message Processing ─────────────────────────────────────────────────

  private processEnvelope(envelope: WSEnvelope<unknown>): void {
    switch (envelope.t) {
      case 'SESSION_TICKET': {
        this.authenticated = true;
        this.startHeartbeat();
        this.emit('authenticated', envelope.payload);
        logger.info('Authenticated with coordinator');
        break;
      }

      case 'JOB_DISPATCH': {
        const job = (envelope.payload as { job: JobPayload }).job;
        this.currentJobId = job.jobId;
        logger.info({ jobId: job.jobId, modelId: job.modelId }, 'Job dispatched');
        this.emit('job', job);
        break;
      }

      case 'MODEL_DELIVERY': {
        this.emit('model', envelope.payload);
        break;
      }

      case 'HEARTBEAT_ACK': {
        this.emit('heartbeat:ack', envelope.payload);
        break;
      }

      case 'RESULT_ACK': {
        const ack = envelope.payload as ResultAckPayload;
        logger.info({ jobId: ack.jobId, accepted: ack.accepted }, 'Result acknowledged');
        this.emit('result:ack', ack);
        break;
      }

      case 'ERROR': {
        const error = envelope.payload as ErrorPayload;
        logger.error({ code: error.code, message: error.message }, 'Coordinator error');
        this.emit('protocol:error', new NodeError(
          error.code as ErrorCode,
          error.message,
          error.retryable,
          error.retryAfterMs
        ));
        break;
      }

      default: {
        logger.debug({ type: envelope.t }, 'Unhandled coordinator message');
      }
    }
  }

  // ─── Outbound Messages ────────────────────────────────────────────────────

  private send(type: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Attempted to send while disconnected');
      return;
    }

    const envelope: WSEnvelope<unknown> = {
      v: 1,
      t: type,
      id: this.generateId(),
      ts: Date.now(),
      payload,
    };

    this.ws.send(JSON.stringify(envelope));
  }

  submitResult(result: JobResult): void {
    this.send('RESULT_SUBMIT', {
      jobId: result.jobId,
      result,
    });
    this.currentJobId = null;
  }

  submitHeartbeat(metrics: HeartbeatMetrics): void {
    this.send('HEARTBEAT', metrics);
  }

  reportModelReady(modelId: string): void {
    this.send('MODEL_READY', { modelId });
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.submitHeartbeat({
        status: this.currentJobId ? 'inference' : 'idle',
        memoryMB: 0, // populated by caller
        cpuMs: 0,
      });
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }
}
