import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * ToolResultCache — caches agent tool call results to avoid redundant computation.
 *
 * Inspired by Sanctum/mem-it: when an agent calls the same tool with the
 * same arguments, the result can be served from cache instead of re-executing.
 * Cache entries have a TTL and are invalidated by content changes.
 *
 * Cache key: hash(toolName + JSON.stringify(args))
 * Cache entry: { result, timestamp, ttl, contentHash }
 *
 * Content-aware invalidation: for tools that depend on external state
 * (e.g., search_wiki), the cache stores a content hash and invalidates
 * when the underlying data changes.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ToolResultCache {
  constructor(config = {}) {
    this.logger = new Logger('ToolResultCache');
    this.enabled = config.enabled !== false;
    this.defaultTtl = config.defaultTtl || DEFAULT_TTL_MS;
    this._cache = new Map();
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
    this._cleanupTimer = null;
  }

  /**
   * Generate a cache key from tool name and arguments.
   */
  _key(toolName, args) {
    const argsStr = JSON.stringify(args || {});
    return crypto.createHash('sha256')
      .update(`${toolName}:${argsStr}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Get a cached result.
   * Returns null if not found or expired.
   */
  get(toolName, args) {
    if (!this.enabled) return null;
    const key = this._key(toolName, args);
    const entry = this._cache.get(key);

    if (!entry) {
      this._stats.misses++;
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this._cache.delete(key);
      this._stats.evictions++;
      this._stats.misses++;
      return null;
    }

    // Content hash check (if provided)
    if (entry.contentHash && entry.contentHashFn) {
      const currentHash = entry.contentHashFn();
      if (currentHash !== entry.contentHash) {
        this.logger.debug(`Cache invalidated for ${toolName} (content changed)`);
        this._cache.delete(key);
        this._stats.evictions++;
        this._stats.misses++;
        return null;
      }
    }

    this._stats.hits++;
    this.logger.debug(`Cache hit for ${toolName} (${key})`);
    return entry.result;
  }

  /**
   * Store a result in the cache.
   * @param {string} toolName - tool name
   * @param {object} args - tool arguments
   * @param {*} result - tool result
   * @param {object} options - { ttl, contentHashFn }
   */
  set(toolName, args, result, options = {}) {
    if (!this.enabled) return;
    const key = this._key(toolName, args);
    const entry = {
      result,
      timestamp: Date.now(),
      ttl: options.ttl || this.defaultTtl,
      toolName,
      args,
    };

    if (options.contentHashFn) {
      entry.contentHashFn = options.contentHashFn;
      entry.contentHash = options.contentHashFn();
    }

    this._cache.set(key, entry);
  }

  /**
   * Invalidate all cached results for a specific tool.
   */
  invalidateTool(toolName) {
    let count = 0;
    for (const [key, entry] of this._cache) {
      if (entry.toolName === toolName) {
        this._cache.delete(key);
        count++;
      }
    }
    this.logger.info(`Invalidated ${count} cache entries for ${toolName}`);
    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear() {
    const size = this._cache.size;
    this._cache.clear();
    this.logger.info(`Cleared ${size} cache entries`);
  }

  /**
   * Remove expired entries.
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this._cache) {
      if (now - entry.timestamp > entry.ttl) {
        this._cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this._stats.evictions += removed;
      this.logger.debug(`Cleaned up ${removed} expired entries`);
    }
  }

  start() {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => this.cleanup(), 60000);
    this._cleanupTimer.unref?.();
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      cacheSize: this._cache.size,
      hits: this._stats.hits,
      misses: this._stats.misses,
      evictions: this._stats.evictions,
      hitRate: this._stats.hits + this._stats.misses > 0
        ? Math.round((this._stats.hits / (this._stats.hits + this._stats.misses)) * 100) / 100
        : 0,
    };
  }
}
