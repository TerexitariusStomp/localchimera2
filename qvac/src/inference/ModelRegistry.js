import { Logger } from '../core/Logger.js';

/**
 * ModelRegistry — tracks available models on the node with metadata.
 *
 * Inspired by Sanctum's model registry: maintains a catalog of models
 * that can be loaded, their capabilities (context length, quantization,
 * type), and current load status. Integrates with:
 *   - QVACInferenceLayer hot-swapping (which models can be switched to)
 *   - CapabilityManifest (advertise accurate model inventory to peers)
 *   - VoicePipeline (which models are available for STT/summary/embedding)
 *
 * Model entry:
 *   { name, type, contextLength, quantization, modelConst,
 *     loaded, lastUsed, loadCount, avgInferenceMs, status }
 */

export class ModelRegistry {
  constructor(config = {}) {
    this.logger = new Logger('ModelRegistry');
    this._models = new Map();
    this._defaultModel = null;
    this.enabled = config.enabled !== false;
  }

  /**
   * Register a model in the registry.
   */
  register({ name, type = 'llm', contextLength = 4096, quantization = 'q4_0', modelConst = null, metadata = {} }) {
    if (!name) throw new Error('Model name required');
    const entry = {
      name,
      type,
      contextLength,
      quantization,
      modelConst,
      loaded: false,
      lastUsed: null,
      loadCount: 0,
      avgInferenceMs: 0,
      totalInferences: 0,
      status: 'available',
      metadata,
      registeredAt: Date.now(),
    };
    this._models.set(name, entry);
    if (!this._defaultModel) this._defaultModel = name;
    this.logger.info(`Registered model: ${name} (${type}, ${contextLength} ctx, ${quantization})`);
    return entry;
  }

  /**
   * Unregister a model.
   */
  unregister(name) {
    const deleted = this._models.delete(name);
    if (this._defaultModel === name) {
      this._defaultModel = this._models.keys().next().value || null;
    }
    return deleted;
  }

  /**
   * Get a model entry by name.
   */
  get(name) {
    return this._models.get(name) || null;
  }

  /**
   * Get all registered models.
   */
  list() {
    return Array.from(this._models.values());
  }

  /**
   * List models by type (llm, stt, embedding).
   */
  listByType(type) {
    return this.list().filter(m => m.type === type);
  }

  /**
   * Get the default model name.
   */
  getDefault() {
    return this._defaultModel;
  }

  /**
   * Set the default model.
   */
  setDefault(name) {
    if (!this._models.has(name)) throw new Error(`Model ${name} not registered`);
    this._defaultModel = name;
  }

  /**
   * Mark a model as loaded.
   */
  markLoaded(name) {
    const entry = this._models.get(name);
    if (entry) {
      entry.loaded = true;
      entry.loadCount++;
      entry.lastUsed = Date.now();
      entry.status = 'loaded';
    }
  }

  /**
   * Mark a model as unloaded.
   */
  markUnloaded(name) {
    const entry = this._models.get(name);
    if (entry) {
      entry.loaded = false;
      entry.status = 'available';
    }
  }

  /**
   * Record an inference result for a model.
   */
  recordInference(name, durationMs) {
    const entry = this._models.get(name);
    if (entry) {
      entry.totalInferences++;
      entry.lastUsed = Date.now();
      if (entry.avgInferenceMs === 0) {
        entry.avgInferenceMs = durationMs;
      } else {
        entry.avgInferenceMs = entry.avgInferenceMs * 0.8 + durationMs * 0.2;
      }
    }
  }

  /**
   * Get models suitable for capability manifest advertisement.
   */
  getManifestModels() {
    return this.list().map(m => ({
      name: m.name,
      type: m.type,
      contextLength: m.contextLength,
      quantization: m.quantization,
      avgLatencyMs: Math.round(m.avgInferenceMs),
      loaded: m.loaded,
    }));
  }

  /**
   * Find the best model for a given task type.
   */
  findBestModel(type = 'llm') {
    const candidates = this.listByType(type);
    if (candidates.length === 0) return null;
    // Prefer loaded models, then by lowest avg latency
    const loaded = candidates.filter(m => m.loaded);
    if (loaded.length > 0) {
      return loaded.sort((a, b) => a.avgInferenceMs - b.avgInferenceMs)[0];
    }
    return candidates.sort((a, b) => a.avgInferenceMs - b.avgInferenceMs)[0];
  }

  getStats() {
    const models = this.list();
    return {
      totalModels: models.length,
      loadedModels: models.filter(m => m.loaded).length,
      byType: models.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      }, {}),
      defaultModel: this._defaultModel,
    };
  }
}
