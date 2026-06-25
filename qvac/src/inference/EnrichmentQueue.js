import { Logger } from '../core/Logger.js';

/**
 * EnrichmentQueue — two-phase save: instant heuristic + background LLM enrichment.
 *
 * Inspired by Stash's pipeline: items are persisted instantly with heuristic
 * classification, then a FIFO background queue enriches them (LLM classify,
 * caption images, embed, fetch metadata). If a model is downloading or fails,
 * degrade gracefully to heuristics instead of erroring.
 *
 * Pipeline:
 *   1. save(item) → instant heuristic classify + persist
 *   2. Queue pushes enrichment job
 *   3. Background worker processes: LLM classify → embed → metadata → update
 *   4. If enrichment fails, keep heuristic result
 *
 * Integration: used by RAG ingestion, voice transcripts, document import.
 */

const JOB_TYPES = {
  CLASSIFY: 'classify',
  EMBED: 'embed',
  CAPTION: 'caption',
  METADATA: 'metadata',
  TAG: 'tag',
  FULL: 'full',
};

export class EnrichmentQueue {
  constructor(config = {}) {
    this.logger = new Logger('EnrichmentQueue');
    this.enabled = config.enabled !== false;
    this.concurrency = config.concurrency || 1;
    this.maxRetries = config.maxRetries || 2;
    this._queue = [];
    this._processing = false;
    this._workers = 0;
    this._handlers = new Map(); // jobType -> handler function
    this._stats = {
      totalQueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalRetried: 0,
      avgProcessMs: 0,
    };
    this._onUpdate = null;
  }

  /**
   * Register a handler for a job type.
   */
  registerHandler(jobType, handler) {
    this._handlers.set(jobType, handler);
  }

  /**
   * Set a callback for when an item is updated.
   */
  onUpdate(callback) {
    this._onUpdate = callback;
  }

  /**
   * Save an item instantly with heuristic classification,
   * then queue for background enrichment.
   * @param {object} item - { id, content, type, metadata }
   * @param {object} options - { enrich: true, jobTypes: [...] }
   * @returns { id, heuristicType, heuristicTitle, queued }
   */
  save(item, options = {}) {
    if (!this.enabled) return { ...item, queued: false };

    // Instant heuristic classification
    const heuristic = this._heuristicClassify(item.content || '');
    const saved = {
      id: item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: item.content,
      type: heuristic.type,
      title: heuristic.title,
      summary: heuristic.summary,
      tags: heuristic.tags,
      metadata: item.metadata || {},
      enriched: false,
      savedAt: Date.now(),
    };

    // Queue enrichment if requested
    if (options.enrich !== false) {
      const jobTypes = options.jobTypes || [JOB_TYPES.CLASSIFY, JOB_TYPES.EMBED, JOB_TYPES.TAG];
      for (const jobType of jobTypes) {
        this._enqueue({
          itemId: saved.id,
          jobType,
          content: saved.content,
          retries: 0,
          queuedAt: Date.now(),
        });
      }
      this._process();
      return { ...saved, queued: true };
    }

    return { ...saved, queued: false };
  }

  /**
   * Enqueue a job.
   */
  _enqueue(job) {
    this._queue.push(job);
    this._stats.totalQueued++;
  }

  /**
   * Process the queue.
   */
  async _process() {
    if (this._processing || this._workers >= this.concurrency) return;
    this._processing = true;

    while (this._queue.length > 0 && this._workers < this.concurrency) {
      const job = this._queue.shift();
      if (!job) break;
      this._workers++;
      this._processJob(job).finally(() => {
        this._workers--;
      });
    }

    this._processing = false;

    // Continue if more jobs
    if (this._queue.length > 0) {
      this._process();
    }
  }

  /**
   * Process a single enrichment job.
   */
  async _processJob(job) {
    const start = Date.now();
    const handler = this._handlers.get(job.jobType);

    if (!handler) {
      this.logger.warn(`No handler for job type: ${job.jobType}`);
      this._stats.totalFailed++;
      return;
    }

    try {
      const result = await handler(job.content, job);
      this._stats.totalCompleted++;
      const duration = Date.now() - start;
      this._stats.avgProcessMs = this._stats.avgProcessMs * 0.8 + duration * 0.2;

      // Notify update
      if (this._onUpdate) {
        this._onUpdate({
          itemId: job.itemId,
          jobType: job.jobType,
          result,
          enriched: true,
        });
      }
    } catch (e) {
      this.logger.warn(`Enrichment failed (${job.jobType} for ${job.itemId}): ${e.message}`);

      if (job.retries < this.maxRetries) {
        job.retries++;
        this._stats.totalRetried++;
        // Re-queue with delay
        setTimeout(() => {
          this._queue.push(job);
          this._process();
        }, 1000 * job.retries);
      } else {
        this._stats.totalFailed++;
        // Graceful degradation: keep heuristic result
        if (this._onUpdate) {
          this._onUpdate({
            itemId: job.itemId,
            jobType: job.jobType,
            error: e.message,
            enriched: false,
            degraded: true,
          });
        }
      }
    }
  }

  /**
   * Heuristic classification (instant, no model needed).
   */
  _heuristicClassify(content) {
    const lower = (content || '').toLowerCase();
    const type = this._guessType(lower, content);
    const title = this._extractTitle(content);
    const summary = this._extractSummary(content);
    const tags = this._extractTags(lower);

    return { type, title, summary, tags };
  }

  _guessType(lower, content) {
    if (/^https?:\/\//.test(content?.trim())) return 'link';
    if (/```|function |class |import |def /.test(content)) return 'code';
    if (/^>|"|'/.test(content?.trim())) return 'quote';
    if (/remind|todo|deadline|due/.test(lower)) return 'reminder';
    if (/data:image|\.png|\.jpg|\.jpeg|\.gif|\.webp/.test(lower)) return 'image';
    if (/youtube\.com|youtu\.be|\.mp4|\.mov/.test(lower)) return 'video';
    return 'text';
  }

  _extractTitle(content) {
    if (!content) return 'Untitled';
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.startsWith('#')) return firstLine.replace(/^#+\s*/, '');
    return firstLine.slice(0, 80) + (firstLine.length > 80 ? '...' : '');
  }

  _extractSummary(content) {
    if (!content) return '';
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    return sentences[0]?.trim().slice(0, 120) || content.slice(0, 120);
  }

  _extractTags(lower) {
    const tags = [];
    const tagMap = {
      'technology': ['code', 'software', 'ai', 'api', 'server', 'data'],
      'research': ['study', 'research', 'analysis', 'paper'],
      'personal': ['i ', 'my ', 'me ', 'we '],
      'meeting': ['meeting', 'agenda', 'attendee', 'minutes'],
      'project': ['project', 'milestone', 'task', 'deliverable'],
    };
    for (const [tag, keywords] of Object.entries(tagMap)) {
      if (keywords.some(kw => lower.includes(kw))) tags.push(tag);
    }
    return tags;
  }

  /**
   * Get queue status.
   */
  getQueueStatus() {
    return {
      queueLength: this._queue.length,
      processing: this._workers > 0,
      workers: this._workers,
      concurrency: this.concurrency,
    };
  }

  /**
   * Wait for all jobs to complete.
   */
  async drain() {
    while (this._queue.length > 0 || this._workers > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      queueLength: this._queue.length,
      activeWorkers: this._workers,
      totalQueued: this._stats.totalQueued,
      totalCompleted: this._stats.totalCompleted,
      totalFailed: this._stats.totalFailed,
      totalRetried: this._stats.totalRetried,
      avgProcessMs: Math.round(this._stats.avgProcessMs),
      successRate: this._stats.totalQueued > 0
        ? Math.round((this._stats.totalCompleted / this._stats.totalQueued) * 100) / 100
        : 0,
    };
  }
}
