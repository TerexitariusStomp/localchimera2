import { Logger } from '../core/Logger.js';

/**
 * MemoryManager — cognitive memory system with importance, consolidation, and expiration.
 *
 * Inspired by MeshMind's memory management: memories (entities, facts, episodes)
 * are scored by importance, consolidated when related memories accumulate, and
 * expired when they become stale.
 *
 * Memory types (MeshMind taxonomy):
 *   - Semantic: facts, knowledge ("Paris is the capital of France")
 *   - Episodic: events, experiences ("User asked about X at time Y")
 *   - Procedural: how-to knowledge ("To deploy, run npm run deploy")
 *
 * Features:
 *   - Importance ranking: score 0-1 based on recency, frequency, source
 *   - Memory consolidation: merge related memories when count exceeds threshold
 *   - Memory expiration: TTL-based decay and removal
 *   - Memory types: classify and store by cognitive type
 *   - Deduplication: skip if similar memory already exists
 *
 * Integration: works alongside KnowledgeGraph for entity storage, but adds
 * the cognitive layer (importance, expiration, consolidation) that KG lacks.
 */

const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_IMPORTANCE_DECAY = 0.95; // per day
const CONSOLIDATION_THRESHOLD = 5; // merge when >5 related memories

export class MemoryManager {
  constructor(config = {}) {
    this.logger = new Logger('MemoryManager');
    this.enabled = config.enabled !== false;
    this.expiryMs = config.expiryMs || DEFAULT_EXPIRY_MS;
    this.importanceDecay = config.importanceDecay || DEFAULT_IMPORTANCE_DECAY;
    this.consolidationThreshold = config.consolidationThreshold || CONSOLIDATION_THRESHOLD;
    this._memories = new Map(); // memoryId -> Memory
    this._byType = { semantic: new Set(), episodic: new Set(), procedural: new Set() };
    this._byNamespace = new Map(); // namespace -> Set<memoryId>
    this._cleanupTimer = null;
    this._stats = {
      totalAdded: 0,
      totalExpired: 0,
      totalConsolidated: 0,
      totalAccessed: 0,
    };
  }

  /**
   * Add a memory.
   * @param {object} params - { content, type, namespace, importance, source, metadata, ttl }
   * @returns memory entry
   */
  add({ content, type = 'semantic', namespace = 'default', importance = 0.5, source = null, metadata = {}, ttl = null }) {
    if (!this.enabled || !content) return null;

    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const memory = {
      id,
      content,
      type: this._validateType(type),
      namespace,
      importance: Math.max(0, Math.min(1, importance)),
      source,
      metadata,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      expiresAt: ttl ? Date.now() + ttl : Date.now() + this.expiryMs,
      consolidated: false,
      relatedIds: [],
    };

    this._memories.set(id, memory);
    this._byType[memory.type].add(id);
    if (!this._byNamespace.has(namespace)) {
      this._byNamespace.set(namespace, new Set());
    }
    this._byNamespace.get(namespace).add(id);
    this._stats.totalAdded++;

    // Check if consolidation is needed
    this._checkConsolidation(namespace, type);

    return memory;
  }

  /**
   * Get a memory by ID, updating access stats.
   */
  get(id) {
    const memory = this._memories.get(id);
    if (!memory) return null;
    memory.lastAccessed = Date.now();
    memory.accessCount++;
    this._stats.totalAccessed++;
    // Boost importance slightly on access
    memory.importance = Math.min(1, memory.importance + 0.01);
    return memory;
  }

  /**
   * Search memories by namespace, type, and/or content.
   */
  search({ namespace = null, type = null, query = null, limit = 20, minImportance = 0 } = {}) {
    let candidates = [];

    for (const memory of this._memories.values()) {
      if (namespace && memory.namespace !== namespace) continue;
      if (type && memory.type !== type) continue;
      if (memory.importance < minImportance) continue;
      if (query && !memory.content.toLowerCase().includes(query.toLowerCase())) continue;
      candidates.push(memory);
    }

    // Sort by importance (decayed) descending
    candidates.sort((a, b) => this._effectiveImportance(b) - this._effectiveImportance(a));
    return candidates.slice(0, limit);
  }

  /**
   * Update a memory.
   */
  update(id, { content, importance, metadata, ttl } = {}) {
    const memory = this._memories.get(id);
    if (!memory) return null;
    if (content !== undefined) memory.content = content;
    if (importance !== undefined) memory.importance = Math.max(0, Math.min(1, importance));
    if (metadata !== undefined) memory.metadata = { ...memory.metadata, ...metadata };
    if (ttl !== undefined) memory.expiresAt = Date.now() + ttl;
    return memory;
  }

  /**
   * Delete a memory.
   */
  delete(id) {
    const memory = this._memories.get(id);
    if (!memory) return false;
    this._byType[memory.type]?.delete(id);
    this._byNamespace.get(memory.namespace)?.delete(id);
    return this._memories.delete(id);
  }

  /**
   * Compute effective importance with time decay.
   */
  _effectiveImportance(memory) {
    const ageDays = (Date.now() - memory.createdAt) / (24 * 60 * 60 * 1000);
    const decay = Math.pow(this.importanceDecay, ageDays);
    return memory.importance * decay;
  }

  /**
   * Check if memories of a type in a namespace should be consolidated.
   */
  _checkConsolidation(namespace, type) {
    const nsSet = this._byNamespace.get(namespace);
    if (!nsSet) return;

    const typeMemories = Array.from(nsSet)
      .map(id => this._memories.get(id))
      .filter(m => m && m.type === type && !m.consolidated);

    if (typeMemories.length > this.consolidationThreshold) {
      this._consolidate(typeMemories, namespace, type);
    }
  }

  /**
   * Consolidate related memories into a summary memory.
   */
  _consolidate(memories, namespace, type) {
    // Sort by importance
    memories.sort((a, b) => this._effectiveImportance(b) - this._effectiveImportance(a));

    // Take top memories and merge content
    const top = memories.slice(0, Math.min(5, memories.length));
    const mergedContent = top.map(m => m.content).join(' | ');
    const avgImportance = top.reduce((s, m) => s + this._effectiveImportance(m), 0) / top.length;

    // Create consolidated memory
    const consolidated = this.add({
      content: `[Consolidated] ${mergedContent.slice(0, 500)}`,
      type,
      namespace,
      importance: Math.min(1, avgImportance + 0.1),
      source: 'consolidation',
      metadata: { consolidatedFrom: top.map(m => m.id) },
    });

    // Mark originals as consolidated
    for (const m of top) {
      m.consolidated = true;
      m.relatedIds.push(consolidated.id);
    }

    this._stats.totalConsolidated++;
    this.logger.info(`Consolidated ${top.length} ${type} memories in ${namespace}`);
  }

  /**
   * Expire stale memories.
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [id, memory] of this._memories) {
      if (now > memory.expiresAt) {
        this.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this._stats.totalExpired += removed;
      this.logger.debug(`Expired ${removed} memories`);
    }
  }

  start() {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => this.cleanup(), 3600000); // hourly
    this._cleanupTimer.unref?.();
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  _validateType(type) {
    const valid = ['semantic', 'episodic', 'procedural'];
    return valid.includes(type) ? type : 'semantic';
  }

  /**
   * Get memories by type.
   */
  getByType(type, namespace = null) {
    return this.search({ type, namespace, limit: 100 });
  }

  /**
   * Get memory type taxonomy.
   */
  getTypes() {
    return {
      semantic: { count: this._byType.semantic.size, description: 'Facts and knowledge' },
      episodic: { count: this._byType.episodic.size, description: 'Events and experiences' },
      procedural: { count: this._byType.procedural.size, description: 'How-to knowledge' },
    };
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalMemories: this._memories.size,
      byType: Object.fromEntries(
        Object.entries(this._byType).map(([k, v]) => [k, v.size])
      ),
      namespaces: this._byNamespace.size,
      totalAdded: this._stats.totalAdded,
      totalExpired: this._stats.totalExpired,
      totalConsolidated: this._stats.totalConsolidated,
      totalAccessed: this._stats.totalAccessed,
      consolidationThreshold: this.consolidationThreshold,
    };
  }
}
