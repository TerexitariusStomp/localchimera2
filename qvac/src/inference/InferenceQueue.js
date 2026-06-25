import { Logger } from '../core/Logger.js';

/**
 * InferenceQueue — serializes inference requests through a single promise chain.
 *
 * Inspired by Sanctum: a single loaded model can only run one completion at a
 * time, so requests queue through a tiny promise-chain instead of colliding.
 * This prevents GPU/CPU contention and ensures predictable latency.
 *
 * The queue also tracks queue depth and wait times for observability.
 */
export class InferenceQueue {
  constructor(config = {}) {
    this.logger = new Logger('InferenceQueue');
    this.maxConcurrent = config.maxConcurrent || 1;
    this._chain = Promise.resolve();
    this._activeCount = 0;
    this._totalQueued = 0;
    this._totalCompleted = 0;
    this._maxWaitMs = 0;
    this._maxDepth = 0;
    this._currentDepth = 0;
  }

  /**
   * Enqueue a function for serialized execution.
   * Returns a promise that resolves with the function's result.
   */
  enqueue(fn) {
    this._totalQueued++;
    this._currentDepth++;
    if (this._currentDepth > this._maxDepth) this._maxDepth = this._currentDepth;

    const enqueueTime = Date.now();
    const waitPromise = this._chain.then(() => {
      const waitMs = Date.now() - enqueueTime;
      if (waitMs > this._maxWaitMs) this._maxWaitMs = waitMs;
      if (waitMs > 1000) {
        this.logger.warn(`Request waited ${waitMs}ms in queue (depth: ${this._currentDepth})`);
      }
      this._currentDepth--;
      this._activeCount++;
      return fn();
    });

    this._chain = waitPromise.then(
      (result) => {
        this._activeCount--;
        this._totalCompleted++;
        return result;
      },
      (err) => {
        this._activeCount--;
        this._totalCompleted++;
        throw err;
      }
    );

    return waitPromise;
  }

  /**
   * Enqueue with a timeout. Rejects if the function doesn't complete in time.
   */
  enqueueWithTimeout(fn, timeoutMs = 300000) {
    return this.enqueue(() => {
      return Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Inference timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
    });
  }

  /**
   * Get current queue statistics.
   */
  getStats() {
    return {
      activeCount: this._activeCount,
      currentDepth: this._currentDepth,
      maxDepth: this._maxDepth,
      maxWaitMs: this._maxWaitMs,
      totalQueued: this._totalQueued,
      totalCompleted: this._totalCompleted,
      maxConcurrent: this.maxConcurrent,
    };
  }

  reset() {
    this._chain = Promise.resolve();
    this._activeCount = 0;
    this._currentDepth = 0;
  }
}
