import { Logger } from '../core/Logger.js';

/**
 * KnowledgeGraph — lightweight entity-relationship store for
 * transcripts, documents, and notes.
 *
 * Inspired by mem-it: entities extracted from voice transcripts and
 * documents are stored as nodes with typed edges, enabling structured
 * queries beyond vector similarity (RAG).
 *
 * Storage is in-memory with optional persistence to HypercoreStore.
 * No external database required.
 *
 * Node: { id, name, type, source, createdAt, metadata }
 * Edge: { from, to, type, weight, source, createdAt }
 *
 * Query types:
 *   - getEntity(name) → node + connected edges
 *   - getRelationships(entity, type?) → edges
 *   - searchEntities(query) → fuzzy match on names
 *   - getSubgraph(entityId, depth) → BFS subgraph
 *   - getBySource(source) → all entities from a transcript/document
 */

export class KnowledgeGraph {
  constructor(config = {}) {
    this.logger = new Logger('KnowledgeGraph');
    this._nodes = new Map();
    this._edges = [];
    this._nodeIndex = new Map(); // lowercase name → nodeIds
    this._sourceIndex = new Map(); // source → nodeIds
    this._persistStore = config.persistStore || null;
    this._dirty = false;
  }

  /**
   * Add or merge an entity node.
   */
  addEntity({ name, type = 'entity', source = 'unknown', metadata = {} }) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    const existing = this._nodeIndex.get(key);

    if (existing && existing.size > 0) {
      const nodeId = Array.from(existing)[0];
      const node = this._nodes.get(nodeId);
      node.metadata = { ...node.metadata, ...metadata };
      if (!node.sources.includes(source)) {
        node.sources.push(source);
      }
      return node;
    }

    const id = `ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const node = {
      id,
      name: name.trim(),
      type,
      sources: [source],
      createdAt: Date.now(),
      metadata,
    };
    this._nodes.set(id, node);

    if (!this._nodeIndex.has(key)) {
      this._nodeIndex.set(key, new Set());
    }
    this._nodeIndex.get(key).add(id);

    if (!this._sourceIndex.has(source)) {
      this._sourceIndex.set(source, new Set());
    }
    this._sourceIndex.get(source).add(id);

    this._dirty = true;
    return node;
  }

  /**
   * Add a relationship between two entities.
   */
  addRelationship({ from, to, type = 'related', weight = 1.0, source = 'unknown' }) {
    const fromNode = this._findNode(from);
    const toNode = this._findNode(to);
    if (!fromNode || !toNode) {
      this.logger.warn(`Cannot add relationship: missing entity (${from} → ${to})`);
      return null;
    }

    const edge = {
      from: fromNode.id,
      to: toNode.id,
      type,
      weight,
      source,
      createdAt: Date.now(),
    };
    this._edges.push(edge);
    this._dirty = true;
    return edge;
  }

  /**
   * Bulk ingest entities and edges from a structured result
   * (e.g., VoicePipeline output).
   */
  ingest({ nodes = [], edges = [], source = 'unknown' }) {
    const nodeMap = new Map();
    for (const n of nodes) {
      const node = this.addEntity({ name: n.name, type: n.type, source, metadata: n.metadata || {} });
      if (node) nodeMap.set(n.name, node);
    }
    for (const e of edges) {
      this.addRelationship({
        from: e.from || e.source,
        to: e.to || e.target,
        type: e.type || e.relation || 'related',
        weight: e.weight || 1.0,
        source,
      });
    }
    this.logger.info(`Ingested ${nodes.length} entities and ${edges.length} edges from ${source}`);
    return { entities: nodeMap.size, relationships: edges.length };
  }

  /**
   * Get an entity by name (case-insensitive).
   */
  getEntity(name) {
    const node = this._findNode(name);
    if (!node) return null;
    const relationships = this._edges.filter(e => e.from === node.id || e.to === node.id);
    return { ...node, relationships };
  }

  /**
   * Get relationships for an entity, optionally filtered by type.
   */
  getRelationships(name, type = null) {
    const node = this._findNode(name);
    if (!node) return [];
    return this._edges
      .filter(e => (e.from === node.id || e.to === node.id) && (!type || e.type === type))
      .map(e => ({
        ...e,
        fromName: this._nodes.get(e.from)?.name,
        toName: this._nodes.get(e.to)?.name,
      }));
  }

  /**
   * Fuzzy search entities by name.
   */
  searchEntities(query, limit = 10) {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    const results = [];
    for (const [key, nodeIds] of this._nodeIndex) {
      if (key.includes(q) || q.includes(key)) {
        for (const id of nodeIds) {
          const node = this._nodes.get(id);
          if (node) results.push(node);
        }
      }
    }
    return results.slice(0, limit);
  }

  /**
   * Get a subgraph rooted at an entity, up to a given depth (BFS).
   */
  getSubgraph(name, depth = 2) {
    const root = this._findNode(name);
    if (!root) return { nodes: [], edges: [] };

    const visited = new Set([root.id]);
    const subNodes = [root];
    const subEdges = [];
    let frontier = [root.id];

    for (let d = 0; d < depth; d++) {
      const nextFrontier = [];
      for (const nodeId of frontier) {
        for (const edge of this._edges) {
          if (edge.from === nodeId && !visited.has(edge.to)) {
            visited.add(edge.to);
            const node = this._nodes.get(edge.to);
            if (node) {
              subNodes.push(node);
              subEdges.push(edge);
              nextFrontier.push(edge.to);
            }
          } else if (edge.to === nodeId && !visited.has(edge.from)) {
            visited.add(edge.from);
            const node = this._nodes.get(edge.from);
            if (node) {
              subNodes.push(node);
              subEdges.push(edge);
              nextFrontier.push(edge.from);
            }
          } else if (edge.from === nodeId || edge.to === nodeId) {
            if (!subEdges.includes(edge)) subEdges.push(edge);
          }
        }
      }
      frontier = nextFrontier;
    }

    return { nodes: subNodes, edges: subEdges };
  }

  /**
   * Get all entities from a specific source (transcript, document).
   */
  getBySource(source) {
    const nodeIds = this._sourceIndex.get(source);
    if (!nodeIds) return [];
    return Array.from(nodeIds).map(id => this._nodes.get(id)).filter(Boolean);
  }

  /**
   * Get graph statistics.
   */
  getStats() {
    return {
      totalEntities: this._nodes.size,
      totalRelationships: this._edges.length,
      sources: this._sourceIndex.size,
      dirty: this._dirty,
    };
  }

  /**
   * Export the full graph as JSON (for persistence).
   */
  export() {
    return {
      nodes: Array.from(this._nodes.values()),
      edges: this._edges,
    };
  }

  /**
   * Import a graph from JSON.
   */
  import(data) {
    if (!data) return;
    for (const node of data.nodes || []) {
      this._nodes.set(node.id, node);
      const key = node.name.toLowerCase();
      if (!this._nodeIndex.has(key)) this._nodeIndex.set(key, new Set());
      this._nodeIndex.get(key).add(node.id);
      for (const src of node.sources || []) {
        if (!this._sourceIndex.has(src)) this._sourceIndex.set(src, new Set());
        this._sourceIndex.get(src).add(node.id);
      }
    }
    this._edges = data.edges || [];
    this._dirty = false;
    this.logger.info(`Imported ${this._nodes.size} entities and ${this._edges.length} edges`);
  }

  /**
   * Persist to HypercoreStore if available.
   */
  async persist() {
    if (!this._persistStore || !this._dirty) return;
    try {
      await this._persistStore.append('knowledge-graph', this.export());
      this._dirty = false;
      this.logger.info('Knowledge graph persisted');
    } catch (e) {
      this.logger.warn(`Failed to persist knowledge graph: ${e.message}`);
    }
  }

  clear() {
    this._nodes.clear();
    this._nodeIndex.clear();
    this._sourceIndex.clear();
    this._edges = [];
    this._dirty = false;
  }

  _findNode(name) {
    if (!name) return null;
    const key = name.toLowerCase().trim();
    const nodeIds = this._nodeIndex.get(key);
    if (!nodeIds || nodeIds.size === 0) return null;
    return this._nodes.get(Array.from(nodeIds)[0]);
  }
}
