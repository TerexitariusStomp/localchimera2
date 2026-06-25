import { Logger } from '../core/Logger.js';

/**
 * VisionCaptioner — generates text captions for images using vision models.
 *
 * Inspired by Stash's image captioning: paste a screenshot and a local
 * vision model captions it so it shows up in search and RAG answers.
 * The vision model loads on demand and unloads itself when idle.
 *
 * Integration: called by EnrichmentQueue for image-type items, and by
 * RAG ingestion when images are part of documents.
 *
 * Uses QVAC SDK's completion with image attachments capability.
 */

const IDLE_UNLOAD_MS = 5 * 60 * 1000; // 5 minutes
const CAPTION_PROMPT = 'Describe this image concisely in 1-2 sentences. Focus on the main subject, any text visible, and the context.';

export class VisionCaptioner {
  constructor(config = {}) {
    this.logger = new Logger('VisionCaptioner');
    this.enabled = config.enabled !== false;
    this.modelName = config.modelName || 'qwen3-vl-2b';
    this.modelSrc = config.modelSrc || null;
    this.projectionModelSrc = config.projectionModelSrc || null;
    this.idleUnloadMs = config.idleUnloadMs || IDLE_UNLOAD_MS;
    this._modelId = null;
    this._modelLoaded = false;
    this._lastUsed = 0;
    this._unloadTimer = null;
    this._qvac = null;
    this._stats = {
      totalCaptioned: 0,
      totalFailed: 0,
      avgCaptionMs: 0,
      modelLoads: 0,
      modelUnloads: 0,
    };
  }

  /**
   * Set the QVAC SDK module (injected to avoid dynamic import at construction).
   */
  setQVAC(qvac) {
    this._qvac = qvac;
  }

  /**
   * Caption an image file.
   * @param {string} imagePath - path to the image file
   * @param {object} options - { prompt, maxTokens }
   * @returns { caption, success }
   */
  async caption(imagePath, options = {}) {
    if (!this.enabled) return { caption: '', success: false, reason: 'disabled' };

    try {
      await this._ensureModel();
      this._lastUsed = Date.now();
      this._resetUnloadTimer();

      const prompt = options.prompt || CAPTION_PROMPT;
      const maxTokens = options.maxTokens || 64;

      const result = await this._qvac.completion({
        modelId: this._modelId,
        history: [
          { role: 'system', content: 'You are a vision assistant. Describe images concisely.' },
          { role: 'user', content: prompt, attachments: [{ path: imagePath }] },
        ],
        generationParams: { predict: maxTokens, temp: 0.3 },
      });

      const caption = result.text || result.output || '';
      this._stats.totalCaptioned++;
      this._stats.avgCaptionMs = this._stats.avgCaptionMs * 0.8 + (Date.now() - this._lastUsed) * 0.2;

      this.logger.debug(`Captioned: "${caption.slice(0, 60)}..."`);
      return { caption: caption.trim(), success: true };
    } catch (e) {
      this._stats.totalFailed++;
      this.logger.warn(`Caption failed: ${e.message}`);
      return { caption: '', success: false, error: e.message };
    }
  }

  /**
   * Caption a batch of images.
   */
  async captionBatch(imagePaths, options = {}) {
    const results = [];
    for (const imagePath of imagePaths) {
      const result = await this.caption(imagePath, options);
      results.push({ imagePath, ...result });
    }
    return results;
  }

  /**
   * Ensure the vision model is loaded.
   */
  async _ensureModel() {
    if (this._modelLoaded) return;

    if (!this._qvac) {
      try {
        this._qvac = await import('@qvac/sdk');
      } catch (e) {
        throw new Error(`Cannot load @qvac/sdk: ${e.message}`);
      }
    }

    const { loadModel } = this._qvac;
    const loadOpts = {
      modelSrc: this.modelSrc,
      modelType: 'vlm',
      onProgress: (p) => {
        if (p.percent % 25 === 0) this.logger.info(`Vision model loading: ${p.percent}%`);
      },
    };

    if (this.projectionModelSrc) {
      loadOpts.projectionModelSrc = this.projectionModelSrc;
    }

    this._modelId = await loadModel(loadOpts);
    this._modelLoaded = true;
    this._stats.modelLoads++;
    this.logger.info(`Vision model loaded: ${this.modelName}`);
  }

  /**
   * Unload the vision model.
   */
  async _unloadModel() {
    if (!this._modelLoaded || !this._qvac) return;

    try {
      await this._qvac.unloadModel({ modelId: this._modelId });
      this._modelLoaded = false;
      this._modelId = null;
      this._stats.modelUnloads++;
      this.logger.info('Vision model unloaded (idle)');
    } catch (e) {
      this.logger.warn(`Failed to unload vision model: ${e.message}`);
    }
  }

  /**
   * Reset the idle unload timer.
   */
  _resetUnloadTimer() {
    if (this._unloadTimer) clearTimeout(this._unloadTimer);
    this._unloadTimer = setTimeout(() => this._unloadModel(), this.idleUnloadMs);
    this._unloadTimer.unref?.();
  }

  /**
   * Force unload.
   */
  async unload() {
    if (this._unloadTimer) {
      clearTimeout(this._unloadTimer);
      this._unloadTimer = null;
    }
    await this._unloadModel();
  }

  isModelLoaded() {
    return this._modelLoaded;
  }

  getStats() {
    return {
      enabled: this.enabled,
      modelLoaded: this._modelLoaded,
      modelName: this.modelName,
      totalCaptioned: this._stats.totalCaptioned,
      totalFailed: this._stats.totalFailed,
      avgCaptionMs: Math.round(this._stats.avgCaptionMs),
      modelLoads: this._stats.modelLoads,
      modelUnloads: this._stats.modelUnloads,
      idleUnloadMs: this.idleUnloadMs,
    };
  }
}
