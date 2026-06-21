import { Logger } from '../core/Logger.js';

/**
 * EmbeddingService — QVAC-native embedding and RAG via @qvac/sdk.
 *
 * Loads an embedding model (e.g. EMBEDDINGGEMMA_300M_Q4_0) and exposes:
 *   - embed(texts): generate dense vectors
 *   - ragIngest(workspace, documents): index documents
 *   - ragSearch(workspace, query): semantic search
 *
 * This keeps all embedding + inference inside the QVAC SDK runtime.
 */
export class EmbeddingService {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'EMBEDDINGGEMMA_300M_Q4_0',
      qvacModelConst: config.qvacModelConst || null,
      device: config.device || 'cpu',
      workspace: config.workspace || 'chimera-rag',
      ...config
    };
    this.logger = new Logger('EmbeddingService');
    this.qvac = null;
    this.modelId = null;
    this._loading = null;
    this.ready = false;
    this.audit = this.config.audit || null;
  }

  async initialize() {
    this.logger.info('Initializing EmbeddingService (QVAC)...');
    try {
      this.qvac = await import('@qvac/sdk');
      this.logger.info('QVAC SDK loaded for embeddings.');
    } catch (e) {
      this.logger.warn(`QVAC SDK not available for embeddings: ${e.message}`);
      this.qvac = null;
      return;
    }
  }

  async start() {
    if (!this.qvac) {
      this.logger.warn('EmbeddingService cannot start — QVAC SDK unavailable');
      return;
    }
    try {
      await this._ensureModel();
      this.ready = true;
      this.logger.info('EmbeddingService ready');
    } catch (e) {
      this.logger.warn(`EmbeddingService degraded — model load failed: ${e.message}`);
      this.ready = false;
    }
  }

  async _ensureModel() {
    if (this.modelId) return this.modelId;
    if (this._loading) return this._loading;
    if (!this.qvac) throw new Error('QVAC SDK not available');

    this._loading = (async () => {
      const { loadModel } = this.qvac;
      const modelConst = this.config.qvacModelConst
        || this.qvac[this.config.model]
        || this.qvac.EMBEDDINGGEMMA_300M_Q4_0;

      this.logger.info(`Loading QVAC embedding model: ${this.config.model}`);
      this.modelId = await loadModel({
        modelSrc: modelConst,
        modelType: 'llamacpp-embedding',
        modelConfig: { device: this.config.device },
        onProgress: (p) => {
          if (p.percent % 10 === 0) this.logger.info(`Embedding model load: ${p.percent}%`);
        },
      });
      this.logger.info(`Embedding model ready: ${this.modelId}`);
      return this.modelId;
    })();

    try { await this._loading; } finally { this._loading = null; }
    return this.modelId;
  }

  async embed(texts) {
    if (!this.qvac) throw new Error('QVAC SDK not available');
    if (!this.ready) await this.start();

    const { embed } = this.qvac;
    const modelId = await this._ensureModel();

    const input = Array.isArray(texts) ? texts : [texts];
    this.logger.debug(`Embedding ${input.length} text(s)`);

    const start = Date.now();
    const result = await embed({ modelId, texts: input });
    const duration = Date.now() - start;
    const vectors = result.vectors || result.embeddings || [];
    const dimension = vectors[0]?.length || 0;
    if (this.audit) this.audit.embedding({ textCount: input.length, dimension, durationMs: duration, modelId });
    return vectors;
  }

  async ragIngest(workspace, documents) {
    if (!this.qvac) throw new Error('QVAC SDK not available');
    if (!this.ready) await this.start();

    const { ragIngest } = this.qvac;
    const modelId = await this._ensureModel();

    this.logger.info(`RAG ingest: ${documents.length} docs into workspace "${workspace}"`);
    const start = Date.now();
    await ragIngest({ modelId, workspace, documents });
    const duration = Date.now() - start;
    if (this.audit) this.audit.ragIngest({ docCount: documents.length, workspace, durationMs: duration, modelId });
  }

  async ragSearch(workspace, query, topK = 5) {
    if (!this.qvac) throw new Error('QVAC SDK not available');
    if (!this.ready) await this.start();

    const { ragSearch } = this.qvac;
    const modelId = await this._ensureModel();

    this.logger.debug(`RAG search: "${query}" in "${workspace}"`);
    const start = Date.now();
    const result = await ragSearch({ modelId, workspace, query, topK });
    const duration = Date.now() - start;
    const matches = result.matches || [];
    if (this.audit) this.audit.ragSearch({ query, topK, matchCount: matches.length, durationMs: duration, modelId });
    return matches;
  }

  async ragListWorkspaces() {
    if (!this.qvac) return [];
    const { ragListWorkspaces } = this.qvac;
    return ragListWorkspaces ? await ragListWorkspaces() : [];
  }

  async stop() {
    this.logger.info('Stopping EmbeddingService...');
    this.ready = false;
    if (this.qvac && this.modelId && this.qvac.unloadModel) {
      try {
        await this.qvac.unloadModel({ modelId: this.modelId });
        this.logger.info('Embedding model unloaded');
      } catch (e) {
        this.logger.warn(`Unload failed: ${e.message}`);
      }
    }
    this.modelId = null;
  }

  getStatus() {
    return {
      ready: this.ready,
      qvacAvailable: !!this.qvac,
      modelLoaded: !!this.modelId,
      model: this.config.model,
    };
  }
}
