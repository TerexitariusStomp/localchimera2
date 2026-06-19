import { Logger } from '../core/Logger.js';
import os from 'os';

/**
 * Fleet orchestration for collaborative LLM wiki generation.
 *
 * Usage: set ORCHESTRATOR_ROLE=commander|worker in environment.
 * Workers also need COMMANDER_URL=http://host:3000.
 *
 * Exported factory `createOrchestrator(config?)` returns the appropriate
 * concrete implementation; both share the NodeOrchestrator interface expected
 * by WebServer.
 */

const WORKER_OFFLINE_MS = 60_000;
const WORKER_STALE_MS   = 120_000;
const CLEANUP_INTERVAL  = 30_000;
const POLL_INTERVAL     = 5_000;
const REGISTER_INTERVAL = 30_000;

function normalizeUrl(url) {
  return url.replace(/\/$/, '');
}

function makeJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

/* ─────────────────────────────────────────────────────────────
   CommanderOrchestrator
   ───────────────────────────────────────────────────────────── */

export class CommanderOrchestrator {
  constructor({ defaultTags = ['collaborative', 'ai-generated'] } = {}) {
    this.logger       = new Logger('Commander');
    this.role         = 'commander';
    this.workers      = new Map();
    this.jobQueue     = [];
    this.completedJobs = [];
    this.stopFlag     = false;
    this.defaultTags  = defaultTags;
    this._cleanupTimer = null;
  }

  start() {
    this.logger.info('Commander started');
    this._cleanupTimer = setInterval(() => this._evictStaleWorkers(), CLEANUP_INTERVAL);
    return this;
  }

  stop() {
    clearInterval(this._cleanupTimer);
  }

  registerWorker(workerUrl, meta = {}) {
    const url = normalizeUrl(workerUrl);
    const existing = this.workers.get(url) ?? { registeredAt: Date.now(), activeJobs: 0, totalPages: 0 };
    this.workers.set(url, {
      ...existing,
      url,
      lastSeen: Date.now(),
      online: true,
      evmAddress: meta.evmAddress || existing.evmAddress || '',
      casperProvider: meta.casperProvider || existing.casperProvider || '',
      capacity: meta.capacity ?? existing.capacity ?? 1,
    });
    this.logger.info(`Worker registered: ${url} (total: ${this.workers.size})`);
    return { ok: true, workers: this.workers.size };
  }

  getWorkers() {
    const now = Date.now();
    return Array.from(this.workers.values()).map(w => ({
      url: w.url,
      online: w.online && (now - w.lastSeen < WORKER_OFFLINE_MS),
      activeJobs: w.activeJobs,
      totalPages: w.totalPages,
      lastSeen: new Date(w.lastSeen).toISOString(),
      evmAddress: w.evmAddress || '',
      casperProvider: w.casperProvider || '',
      capacity: w.capacity ?? 1,
    }));
  }

  getFleetStats() {
    const workers = this.getWorkers();
    return {
      workers: workers.length,
      online: workers.filter(w => w.online).length,
      queueLength: this.jobQueue.length,
      completedJobs: this.completedJobs.length,
      stopFlag: this.stopFlag,
    };
  }

  addJobs(jobs) {
    if (this.stopFlag) return { ok: false, error: 'fleet stopped' };
    for (const j of jobs) {
      this.jobQueue.push({
        id: makeJobId(),
        topic: j.topic,
        category: j.category ?? 'concepts',
        tags: j.tags ?? this.defaultTags,
        status: 'pending',
        assignedTo: null,
        createdAt: Date.now(),
      });
    }
    this.logger.info(`Added ${jobs.length} jobs. Queue depth: ${this.jobQueue.length}`);
    return { ok: true, queued: this.jobQueue.length };
  }

  claimJob(workerUrl) {
    if (this.stopFlag) return { stop: true };
    const url = normalizeUrl(workerUrl);
    this._touchWorker(url);

    const job = this.jobQueue.find(j => j.status === 'pending');
    if (!job) return { jobs: [] };

    job.status = 'running';
    job.assignedTo = url;
    const w = this.workers.get(url);
    if (w) w.activeJobs += 1;

    return { jobs: [{ id: job.id, topic: job.topic, category: job.category, tags: job.tags }] };
  }

  completeJob(jobId, workerUrl, pagesGenerated = 1) {
    const url = normalizeUrl(workerUrl);
    const w = this.workers.get(url);
    if (w) {
      w.activeJobs  = Math.max(0, w.activeJobs - 1);
      w.totalPages += pagesGenerated;
    }
    const idx = this.jobQueue.findIndex(j => j.id === jobId);
    if (idx !== -1) {
      const [job] = this.jobQueue.splice(idx, 1);
      this.completedJobs.push({ ...job, status: 'completed', completedAt: Date.now() });
    }
  }

  stopFleet() {
    this.stopFlag = true;
    this.logger.info('STOP flag raised. Notifying workers...');
    for (const [url, w] of this.workers) {
      if (!w.online) continue;
      fetch(`${url}/api/worker/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .catch(() => {});
    }
    return { ok: true, stopped: this.workers.size };
  }

  startFleet() {
    this.stopFlag = false;
    this.logger.info('Fleet resumed');
    return { ok: true };
  }

  receiveStop() {
    /* no-op on commander */
  }

  _touchWorker(url) {
    const w = this.workers.get(url);
    if (w) { w.lastSeen = Date.now(); w.online = true; }
  }

  _evictStaleWorkers() {
    const now = Date.now();
    for (const [url, w] of this.workers) {
      if (now - w.lastSeen > WORKER_STALE_MS) {
        w.online = false;
        this.jobQueue
          .filter(j => j.status === 'running' && j.assignedTo === url)
          .forEach(j => { j.status = 'pending'; j.assignedTo = null; });
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   WorkerOrchestrator
   ───────────────────────────────────────────────────────────── */

export class WorkerOrchestrator {
  constructor({ commanderUrl, localPort = 3000 } = {}) {
    this.logger       = new Logger('Worker');
    this.role         = 'worker';
    this.commanderUrl = commanderUrl ? normalizeUrl(commanderUrl) : '';
    this.localPort    = localPort;
    this.stopFlag     = false;
    this._timers      = [];
  }

  start() {
    if (!this.commanderUrl) {
      this.logger.warn('No COMMANDER_URL set — worker polling disabled');
      return this;
    }
    this.logger.info(`Worker started -> ${this.commanderUrl}`);
    this._register();
    this._timers.push(setInterval(() => this._register(), REGISTER_INTERVAL));
    this._timers.push(setInterval(() => this._pollJobs(), POLL_INTERVAL));
    return this;
  }

  stop() {
    this._timers.forEach(t => clearInterval(t));
  }

  receiveStop() {
    this.stopFlag = true;
    this.logger.info('Received STOP. Worker halts after current job.');
  }

  /* Commander API stubs — worker defers to commander over HTTP */
  registerWorker()  { return { ok: false, error: 'not a commander' }; }
  getWorkers()      { return []; }
  getFleetStats()   { return { workers: 0, online: 0, queueLength: 0, completedJobs: 0, stopFlag: this.stopFlag }; }
  addJobs()         { return { ok: false, error: 'not a commander' }; }
  claimJob()        { return { jobs: [] }; }
  completeJob()     {}
  stopFleet()       { return { ok: false, error: 'not a commander' }; }
  startFleet()      { return { ok: false, error: 'not a commander' }; }

  get _myUrl() {
    return `http://${getLocalIp()}:${this.localPort}`;
  }

  async _register() {
    try {
      const res = await fetch(`${this.commanderUrl}/api/commander/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerUrl: this._myUrl }),
      });
      const json = await res.json();
      if (json.success) this.logger.info('Registered with commander');
    } catch { /* retry on next interval */ }
  }

  async _pollJobs() {
    if (this.stopFlag) return;
    try {
      const res = await fetch(`${this.commanderUrl}/api/commander/jobs?worker=${encodeURIComponent(this._myUrl)}`);
      const json = await res.json();
      if (!json.success) return;
      if (json.data?.stop) { this.receiveStop(); return; }
      for (const job of json.data?.jobs ?? []) {
        this._runJob(job);
      }
    } catch { /* retry on next interval */ }
  }

  async _runJob(job) {
    this.logger.info(`Running job: ${job.topic}`);
    try {
      const res = await fetch(`http://localhost:${this.localPort}/api/llmwiki-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: job.topic, category: job.category, tags: job.tags }),
      });
      const json = await res.json();
      if (json.success) {
        this.logger.info(`Job dispatched locally: ${job.id}`);
        fetch(`${this.commanderUrl}/api/commander/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, workerUrl: this._myUrl }),
        }).catch(() => {});
      }
    } catch (e) {
      this.logger.error(`Job failed: ${e.message}`);
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   Factory — reads env, instantiates the right class
   ───────────────────────────────────────────────────────────── */

export function createOrchestrator(config = {}) {
  const role = config.role ?? process.env.ORCHESTRATOR_ROLE ?? 'commander';
  const defaultTags = (config.defaultTags ?? process.env.ORCHESTRATOR_TAGS ?? 'collaborative,ai-generated')
    .split(',').map(t => t.trim()).filter(Boolean);

  if (role === 'worker') {
    return new WorkerOrchestrator({
      commanderUrl: config.commanderUrl ?? process.env.COMMANDER_URL ?? '',
      localPort:    config.localPort    ?? parseInt(process.env.PORT ?? '3000', 10),
    }).start();
  }

  return new CommanderOrchestrator({ defaultTags }).start();
}

/* Default export keeps WebServer import unchanged */
export class NodeOrchestrator {
  constructor(config) {
    return createOrchestrator(config);
  }
}
