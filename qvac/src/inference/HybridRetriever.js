import { Logger } from '../core/Logger.js';

/**
 * HybridRetriever — multi-method retrieval for RAG search.
 *
 * Inspired by MeshMind's retrieval methods: combines BM25 (lexical),
 * embedding vector search, and optional LLM re-ranking for maximum
 * retrieval quality.
 *
 * Retrieval pipeline:
 *   1. BM25: lexical matching, good for exact keyword hits
 *   2. Embedding: semantic similarity, good for paraphrased content
 *   3. Fusion: reciprocal rank fusion to merge BM25 + embedding results
 *   4. Re-rank (optional): LLM scores top-K results for relevance
 *
 * Also supports:
 *   - Fuzzy search: approximate string matching
 *   - Regex search: pattern-based matching
 *   - Search filters: by metadata, date range, source
 *
 * Integration: used by EmbeddingService.ragSearch as a drop-in replacement
 * for pure cosine similarity search.
 */

const BM25_K1 = 1.5;
const BM25_B = 0.75;

export class HybridRetriever {
  constructor(config = {}) {
    this.logger = new Logger('HybridRetriever');
    this.enabled = config.enabled !== false;
    this.bm25Weight = config.bm25Weight || 0.4;
    this.embeddingWeight = config.embeddingWeight || 0.6;
    this.rerankTopK = config.rerankTopK || 10;
    this.finalK = config.finalK || 5;
    this._documents = new Map(); // workspace -> [{ id, text, embedding, metadata, terms }]
    this._stats = {
      totalSearches: 0,
      bm25Searches: 0,
      embeddingSearches: 0,
      reranked: 0,
    };
  }

  /**
   * Index documents for a workspace.
   */
  index(workspace, documents) {
    if (!this._documents.has(workspace)) {
      this._documents.set(workspace, []);
    }
    const store = this._documents.get(workspace);
    for (const doc of documents) {
      const text = doc.text || doc.content || '';
      store.push({
        id: doc.id || `doc-${Math.random().toString(36).slice(2, 8)}`,
        text,
        embedding: doc.embedding || doc.vector || null,
        metadata: doc.metadata || {},
        terms: this._tokenize(text),
        termFreq: this._termFrequencies(text),
        docLength: text.split(/\s+/).length,
      });
    }
    this._updateIDF(workspace);
  }

  /**
   * Hybrid search: BM25 + embedding + optional LLM re-rank.
   * @param {string} workspace
   * @param {string} query
   * @param {number[]} queryEmbedding - optional pre-computed embedding
   * @param {object} options - { limit, rerank, inferenceLayer, filters }
   */
  async search(workspace, query, queryEmbedding = null, options = {}) {
    if (!this.enabled) return [];
    this._stats.totalSearches++;

    const store = this._documents.get(workspace);
    if (!store || store.length === 0) return [];

    const limit = options.limit || this.finalK;
    const filters = options.filters || null;

    // Apply metadata filters
    let candidates = store;
    if (filters) {
      candidates = this._applyFilters(store, filters);
    }

    // BM25 search
    const bm25Results = this._bm25Search(candidates, query, workspace);
    this._stats.bm25Searches++;

    // Embedding search
    let embeddingResults = [];
    if (queryEmbedding) {
      embeddingResults = this._embeddingSearch(candidates, queryEmbedding);
      this._stats.embeddingSearches++;
    }

    // Reciprocal rank fusion
    let fused = this._reciprocalRankFusion(bm25Results, embeddingResults);

    // LLM re-ranking (optional)
    if (options.rerank && options.inferenceLayer && fused.length > 0) {
      fused = await this._llmRerank(query, fused.slice(0, this.rerankTopK), options.inferenceLayer);
      this._stats.reranked++;
    }

    return fused.slice(0, limit).map(r => ({
      id: r.id,
      text: r.text,
      score: r.score,
      metadata: r.metadata,
      method: r.method || 'hybrid',
    }));
  }

  /**
   * BM25 scoring.
   */
  _bm25Search(docs, query, workspace) {
    const queryTerms = this._tokenize(query);
    const idf = this._getIDF(workspace);
    const avgDocLength = docs.reduce((s, d) => s + d.docLength, 0) / (docs.length || 1);
    const scores = [];

    for (const doc of docs) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.termFreq.get(term) || 0;
        if (tf === 0) continue;
        const termIdf = idf.get(term) || 0;
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (doc.docLength / (avgDocLength || 1)));
        score += termIdf * (numerator / denominator);
      }
      if (score > 0) {
        scores.push({ ...doc, score, method: 'bm25' });
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Embedding cosine similarity search.
   */
  _embeddingSearch(docs, queryEmbedding) {
    const scores = [];
    for (const doc of docs) {
      if (!doc.embedding) continue;
      const sim = this._cosine(queryEmbedding, doc.embedding);
      scores.push({ ...doc, score: sim, method: 'embedding' });
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Reciprocal Rank Fusion to merge BM25 and embedding results.
   */
  _reciprocalRankFusion(bm25Results, embeddingResults) {
    const k = 60; // standard RRF constant
    const fused = new Map();

    for (let i = 0; i < bm25Results.length; i++) {
      const doc = bm25Results[i];
      const score = this.bm25Weight / (k + i + 1);
      fused.set(doc.id, { ...doc, score, method: 'hybrid' });
    }

    for (let i = 0; i < embeddingResults.length; i++) {
      const doc = embeddingResults[i];
      const score = this.embeddingWeight / (k + i + 1);
      if (fused.has(doc.id)) {
        fused.get(doc.id).score += score;
      } else {
        fused.set(doc.id, { ...doc, score, method: 'hybrid' });
      }
    }

    return Array.from(fused.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * LLM re-ranking: ask the model to score relevance.
   */
  async _llmRerank(query, docs, inferenceLayer) {
    const docTexts = docs.map((d, i) => `[${i + 1}] ${d.text.slice(0, 200)}`).join('\n');
    const prompt = `Rate the relevance of each document to the query. Output ONLY a JSON array of numbers 0-1 (one per document, in order).\n\nQuery: ${query}\n\nDocuments:\n${docTexts}`;

    try {
      const result = await inferenceLayer.handleInferenceRequest({
        prompt,
        maxTokens: 128,
        temperature: 0.1,
        source: 'hybrid-retriever-rerank',
      });

      const scores = JSON.parse(result.output.match(/\[[\s\S]*\]/)?.[0] || '[]');
      if (Array.isArray(scores) && scores.length === docs.length) {
        return docs.map((doc, i) => ({
          ...doc,
          score: doc.score * 0.5 + (scores[i] || 0) * 0.5,
          method: 'hybrid+rerank',
        })).sort((a, b) => b.score - a.score);
      }
    } catch (e) {
      this.logger.warn(`LLM re-rank failed: ${e.message}`);
    }

    return docs;
  }

  /**
   * Fuzzy search: approximate string matching.
   */
  fuzzySearch(workspace, query, maxDistance = 2) {
    const store = this._documents.get(workspace);
    if (!store) return [];
    const queryLower = query.toLowerCase();
    const results = [];

    for (const doc of store) {
      const textLower = doc.text.toLowerCase();
      if (this._levenshtein(queryLower, textLower.slice(0, queryLower.length + maxDistance)) <= maxDistance) {
        results.push({ ...doc, score: 1 - (maxDistance / Math.max(queryLower.length, 1)), method: 'fuzzy' });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Regex search.
   */
  regexSearch(workspace, pattern, flags = 'gi') {
    const store = this._documents.get(workspace);
    if (!store) return [];
    const regex = new RegExp(pattern, flags);
    return store.filter(doc => regex.test(doc.text)).map(doc => ({ ...doc, score: 1.0, method: 'regex' }));
  }

  _applyFilters(docs, filters) {
    return docs.filter(doc => {
      if (filters.source && doc.metadata.source !== filters.source) return false;
      if (filters.dateFrom && doc.metadata.createdAt < filters.dateFrom) return false;
      if (filters.dateTo && doc.metadata.createdAt > filters.dateTo) return false;
      if (filters.tags && !filters.tags.some(t => (doc.metadata.tags || []).includes(t))) return false;
      return true;
    });
  }

  _tokenize(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  }

  _termFrequencies(text) {
    const terms = this._tokenize(text);
    const freq = new Map();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    return freq;
  }

  _updateIDF(workspace) {
    const store = this._documents.get(workspace);
    if (!store) return;
    const docFreq = new Map();
    for (const doc of store) {
      for (const term of doc.termFreq.keys()) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }
    const idf = new Map();
    const N = store.length;
    for (const [term, df] of docFreq) {
      idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
    }
    if (!this._idf) this._idf = new Map();
    this._idf.set(workspace, idf);
  }

  _getIDF(workspace) {
    return this._idf?.get(workspace) || new Map();
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

  _levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  clearWorkspace(workspace) {
    this._documents.delete(workspace);
    this._idf?.delete(workspace);
  }

  getStats() {
    return {
      enabled: this.enabled,
      workspaces: this._documents.size,
      totalDocuments: Array.from(this._documents.values()).reduce((s, docs) => s + docs.length, 0),
      totalSearches: this._stats.totalSearches,
      bm25Searches: this._stats.bm25Searches,
      embeddingSearches: this._stats.embeddingSearches,
      reranked: this._stats.reranked,
      bm25Weight: this.bm25Weight,
      embeddingWeight: this.embeddingWeight,
    };
  }
}
