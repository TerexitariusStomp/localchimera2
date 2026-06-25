import { Logger } from '../core/Logger.js';

/**
 * SemanticDedup — detects near-duplicate documents before RAG ingestion.
 *
 * Inspired by mem-it: before ingesting documents into a RAG workspace,
 * compare their embeddings against existing documents. If cosine similarity
 * exceeds a threshold, skip or merge the duplicate.
 *
 * This prevents duplicate content from polluting search results and
 * wasting embedding storage.
 *
 * Integration: sits between DocumentChunker output and EmbeddingService
 * ragIngest. Can also be used standalone with pre-computed embeddings.
 *
 * Dedup strategies:
 *   - exact: skip if content hash matches
 *   - semantic: skip if cosine similarity > threshold
 *   - merge: combine near-duplicates into a single document
 */

const DEFAULT_THRESHOLD = 0.92;

export class SemanticDedup {
  constructor(config = {}) {
    this.logger = new Logger('SemanticDedup');
    this.enabled = config.enabled !== false;
    this.threshold = config.threshold || DEFAULT_THRESHOLD;
    this.strategy = config.strategy || 'semantic'; // 'exact', 'semantic', 'merge'
    this._workspaceVectors = new Map(); // workspace -> [{ id, embedding, text }]
    this._stats = {
      totalChecked: 0,
      duplicatesFound: 0,
      merged: 0,
      skipped: 0,
    };
  }

  /**
   * Check a single document against existing workspace documents.
   * Returns { isDuplicate, similarity, duplicateOf }.
   */
  check(workspace, embedding, text = null) {
    if (!this.enabled) return { isDuplicate: false, similarity: 0 };

    this._stats.totalChecked++;
    const existing = this._workspaceVectors.get(workspace) || [];

    // Exact text match check first
    if (text) {
      const textHash = this._hashText(text);
      for (const doc of existing) {
        if (doc.textHash === textHash) {
          this._stats.duplicatesFound++;
          this._stats.skipped++;
          return { isDuplicate: true, similarity: 1.0, duplicateOf: doc.id, method: 'exact' };
        }
      }
    }

    // Semantic similarity check
    if (embedding && existing.length > 0) {
      let bestSim = 0;
      let bestDoc = null;
      for (const doc of existing) {
        if (!doc.embedding) continue;
        const sim = this._cosineSimilarity(embedding, doc.embedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestDoc = doc;
        }
      }
      if (bestSim >= this.threshold) {
        this._stats.duplicatesFound++;
        if (this.strategy === 'merge') {
          this._stats.merged++;
        } else {
          this._stats.skipped++;
        }
        return { isDuplicate: true, similarity: bestSim, duplicateOf: bestDoc?.id, method: 'semantic' };
      }
      return { isDuplicate: false, similarity: bestSim };
    }

    return { isDuplicate: false, similarity: 0 };
  }

  /**
   * Filter a batch of documents, removing duplicates.
   * Returns { unique, duplicates }.
   */
  filterBatch(workspace, documents) {
    if (!this.enabled) return { unique: documents, duplicates: [] };

    const unique = [];
    const duplicates = [];
    const existing = this._workspaceVectors.get(workspace) || [];

    for (const doc of documents) {
      const embedding = doc.embedding || doc.vector || null;
      const text = doc.text || doc.content || '';
      const result = this.check(workspace, embedding, text);

      if (result.isDuplicate && this.strategy !== 'merge') {
        duplicates.push({ ...doc, duplicateOf: result.duplicateOf, similarity: result.similarity });
      } else {
        unique.push(doc);
      }
    }

    this.logger.info(`Dedup: ${documents.length} → ${unique.length} unique, ${duplicates.length} duplicates in ${workspace}`);
    return { unique, duplicates };
  }

  /**
   * Register documents as existing in a workspace (after ingestion).
   */
  register(workspace, documents) {
    if (!this._workspaceVectors.has(workspace)) {
      this._workspaceVectors.set(workspace, []);
    }
    const store = this._workspaceVectors.get(workspace);
    for (const doc of documents) {
      store.push({
        id: doc.id || `doc-${Math.random().toString(36).slice(2, 8)}`,
        embedding: doc.embedding || doc.vector || null,
        text: doc.text || doc.content || '',
        textHash: this._hashText(doc.text || doc.content || ''),
        registeredAt: Date.now(),
      });
    }
  }

  /**
   * Clear workspace vectors (e.g., when workspace is deleted).
   */
  clearWorkspace(workspace) {
    this._workspaceVectors.delete(workspace);
  }

  /**
   * Cosine similarity between two vectors.
   */
  _cosineSimilarity(a, b) {
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

  _hashText(text) {
    let hash = 0;
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  getStats() {
    return {
      enabled: this.enabled,
      threshold: this.threshold,
      strategy: this.strategy,
      workspaces: this._workspaceVectors.size,
      totalChecked: this._stats.totalChecked,
      duplicatesFound: this._stats.duplicatesFound,
      merged: this._stats.merged,
      skipped: this._stats.skipped,
    };
  }
}
