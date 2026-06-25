import { Logger } from '../core/Logger.js';

/**
 * AutoLinker — auto-connects related notes/documents via vector similarity.
 *
 * Inspired by Reor's approach: every note is chunked and embedded into
 * a vector database, then related notes are connected automatically via
 * vector similarity. This creates a knowledge graph of note-to-note
 * relationships without manual linking.
 *
 * Features:
 *   - Auto-link: find top-K similar documents for each document
 *   - Bidirectional links: if A links to B, B links to A
 *   - Link strength: cosine similarity score as link weight
 *   - Threshold: only create links above minimum similarity
 *   - Graph queries: get related documents, find clusters
 *   - Integration with KnowledgeGraph: add entities and relations
 *
 * Integration: called after RAG ingestion to build the similarity graph.
 */

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.65;

export class AutoLinker {
  constructor(config = {}) {
    this.logger = new Logger('AutoLinker');
    this.enabled = config.enabled !== false;
    this.topK = config.topK || DEFAULT_TOP_K;
    this.minSimilarity = config.minSimilarity || DEFAULT_MIN_SIMILARITY;
    this._links = new Map(); // workspace -> { docId -> [{ targetId, score }] }
    this._embeddings = new Map(); // workspace -> { docId -> embedding[] }
    this._knowledgeGraph = null;
    this._stats = {
      totalLinked: 0,
      totalDocuments: 0,
      avgLinksPerDoc: 0,
      workspaces: 0,
    };
  }

  /**
   * Set the KnowledgeGraph for entity/relation storage.
   */
  setKnowledgeGraph(kg) {
    this._knowledgeGraph = kg;
  }

  /**
   * Index a document with its embedding.
   * @param {string} workspace
   * @param {string} docId
   * @param {number[]} embedding
   * @param {object} metadata
   */
  indexDocument(workspace, docId, embedding, metadata = {}) {
    if (!this._embeddings.has(workspace)) {
      this._embeddings.set(workspace, new Map());
      this._links.set(workspace, new Map());
      this._stats.workspaces = this._embeddings.size;
    }
    this._embeddings.get(workspace).set(docId, { embedding, metadata });
  }

  /**
   * Build auto-links for all documents in a workspace.
   */
  async buildLinks(workspace) {
    const wsEmbeddings = this._embeddings.get(workspace);
    if (!wsEmbeddings || wsEmbeddings.size < 2) return;

    const wsLinks = this._links.get(workspace) || new Map();
    const docs = Array.from(wsEmbeddings.entries());

    for (const [docId, { embedding, metadata }] of docs) {
      const similarities = [];

      for (const [otherId, { embedding: otherEmb, metadata: otherMeta }] of docs) {
        if (docId === otherId) continue;
        const sim = this._cosine(embedding, otherEmb);
        if (sim >= this.minSimilarity) {
          similarities.push({ targetId: otherId, score: sim, metadata: otherMeta });
        }
      }

      // Sort by similarity and take top K
      similarities.sort((a, b) => b.score - a.score);
      const topLinks = similarities.slice(0, this.topK);
      wsLinks.set(docId, topLinks);

      // Add bidirectional links
      for (const link of topLinks) {
        const existing = wsLinks.get(link.targetId) || [];
        if (!existing.find(l => l.targetId === docId)) {
          existing.push({ targetId: docId, score: link.score, metadata });
          existing.sort((a, b) => b.score - a.score);
          wsLinks.set(link.targetId, existing.slice(0, this.topK));
        }
      }

      // Add to KnowledgeGraph if available
      if (this._knowledgeGraph) {
        for (const link of topLinks) {
          this._knowledgeGraph.addRelation({
            source: docId,
            target: link.targetId,
            type: 'related_to',
            weight: link.score,
            source_type: 'auto_linker',
          });
        }
      }
    }

    this._links.set(workspace, wsLinks);
    this._stats.totalDocuments = docs.length;
    this._stats.totalLinked = Array.from(wsLinks.values()).reduce((s, links) => s + links.length, 0);
    this._stats.avgLinksPerDoc = this._stats.totalDocuments > 0
      ? Math.round((this._stats.totalLinked / this._stats.totalDocuments) * 10) / 10
      : 0;

    this.logger.info(`Built links for ${workspace}: ${docs.length} docs, ${this._stats.totalLinked} links`);
  }

  /**
   * Get related documents for a given document.
   */
  getRelated(workspace, docId, limit = 10) {
    const wsLinks = this._links.get(workspace);
    if (!wsLinks) return [];
    const links = wsLinks.get(docId) || [];
    return links.slice(0, limit);
  }

  /**
   * Find clusters of related documents (connected components).
   */
  findClusters(workspace) {
    const wsLinks = this._links.get(workspace);
    if (!wsLinks) return [];

    const visited = new Set();
    const clusters = [];

    const dfs = (docId, cluster) => {
      if (visited.has(docId)) return;
      visited.add(docId);
      cluster.push(docId);
      const links = wsLinks.get(docId) || [];
      for (const link of links) {
        dfs(link.targetId, cluster);
      }
    };

    for (const docId of wsLinks.keys()) {
      if (!visited.has(docId)) {
        const cluster = [];
        dfs(docId, cluster);
        if (cluster.length > 1) clusters.push(cluster);
      }
    }

    return clusters.sort((a, b) => b.length - a.length);
  }

  /**
   * Get the full link graph for a workspace.
   */
  getGraph(workspace) {
    const wsLinks = this._links.get(workspace);
    if (!wsLinks) return { nodes: [], edges: [] };

    const nodes = new Set();
    const edges = [];

    for (const [docId, links] of wsLinks) {
      nodes.add(docId);
      for (const link of links) {
        nodes.add(link.targetId);
        edges.push({
          source: docId,
          target: link.targetId,
          weight: link.score,
        });
      }
    }

    return {
      nodes: Array.from(nodes).map(id => ({ id })),
      edges,
    };
  }

  /**
   * Remove a document from the index and links.
   */
  removeDocument(workspace, docId) {
    const wsEmbeddings = this._embeddings.get(workspace);
    const wsLinks = this._links.get(workspace);
    if (wsEmbeddings) wsEmbeddings.delete(docId);
    if (wsLinks) {
      wsLinks.delete(docId);
      // Remove references from other documents
      for (const [otherId, links] of wsLinks) {
        wsLinks.set(otherId, links.filter(l => l.targetId !== docId));
      }
    }
  }

  _cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }

  clearWorkspace(workspace) {
    this._embeddings.delete(workspace);
    this._links.delete(workspace);
  }

  getStats() {
    return {
      enabled: this.enabled,
      workspaces: this._stats.workspaces,
      totalDocuments: this._stats.totalDocuments,
      totalLinked: this._stats.totalLinked,
      avgLinksPerDoc: this._stats.avgLinksPerDoc,
      topK: this.topK,
      minSimilarity: this.minSimilarity,
    };
  }
}
