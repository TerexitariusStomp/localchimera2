/**
 * FHEInferenceLayer — Concrete-ML FHE integration for the QVAC inference stack.
 *
 * Two modes of operation:
 *
 * 1. FHE LLM mode (full privacy): Connects to fhe_llm_server.py which runs
 *    LFM2.5-230M transformer layers in FHE. Client encrypts embeddings,
 *    server processes encrypted data, client decrypts and samples.
 *    Server NEVER sees plaintext prompt or response.
 *
 * 2. FHE classification + QVAC mode (hybrid): Uses Concrete-ML XGBoost
 *    classifier for encrypted intent detection, then QVAC generates
 *    in plaintext. Faster but QVAC sees the prompt.
 *
 * Architecture (FHE LLM mode):
 *   Client (browser) → encrypt embeddings → FHE LLM Server (GPU) → encrypted hidden states → Client decrypts → samples tokens
 *
 * Architecture (Hybrid mode):
 *   Client → encrypt prompt features → FHE Server (classify) → QVAC (generate in plaintext)
 *
 * The FHE LLM server runs as a separate Python process:
 *   inference-backend/concrete-ml/fhe_llm_server.py (full LLM FHE)
 *   inference-backend/concrete-ml/server.py (classification FHE)
 */

import { Logger } from '../core/Logger.js';

const FHE_SERVER_URL = process.env.FHE_SERVER_URL || 'http://localhost:8001';

export class FHEInferenceLayer {
  constructor(config = {}) {
    this.config = config;
    this.logger = new Logger('FHEInference');
    this.fheServerUrl = config.fheServerUrl || FHE_SERVER_URL;
    this.enabled = config.enabled !== false;
    this.mode = config.mode || 'llm';  // 'llm' = full FHE LLM, 'hybrid' = classify + QVAC
    this.healthy = false;
    this._queue = null;
    this._qvacLayer = null;
    this._sessions = new Map();  // sessionId -> metadata
  }

  setQVACLayer(qvacLayer) {
    this._qvacLayer = qvacLayer;
  }

  setQueue(queue) {
    this._queue = queue;
  }

  async initialize() {
    if (!this.enabled) {
      this.logger.info('FHE inference layer disabled');
      return;
    }
    this.logger.info(`Initializing FHE inference layer (server: ${this.fheServerUrl})`);
    await this.healthCheck();
  }

  async start() {
    this.logger.info('FHE inference layer started');
  }

  async stop() {
    this.logger.info('FHE inference layer stopped');
  }

  async healthCheck() {
    try {
      const res = await fetch(`${this.fheServerUrl}/health`);
      this.healthy = res.ok;
      if (this.healthy) {
        this.logger.info('FHE server is healthy');
      }
    } catch (err) {
      this.healthy = false;
      this.logger.warn(`FHE server not available: ${err.message}`);
    }
    return this.healthy;
  }

  /**
   * Handle an FHE inference request.
   *
   * The request contains:
   *   - encryptedInput: base64-encoded encrypted features (from Concrete-ML client)
   *   - evaluationKey: base64-encoded evaluation keys (from Concrete-ML client)
   *
   * The flow is:
   *   1. Send encrypted input to FHE server for classification
   *   2. FHE server returns encrypted prediction
   *   3. Client decrypts the prediction (done client-side)
   *   4. For routing: the decrypted class determines which QVAC model to use
   *
   * For the integrated flow where we also need LLM generation:
   *   - The client sends the plaintext prompt to QVAC for generation
   *   - The FHE classification provides private intent detection
   *   - The server uses the classification to route the prompt
   */
  async handleFHERequest(request) {
    if (!this.enabled || !this.healthy) {
      this.logger.warn('FHE layer not available, falling back to QVAC directly');
      return this._qvacLayer?.handleInferenceRequest(request);
    }

    const requestId = Math.random().toString(36).substring(7);
    this.logger.info(`Processing FHE inference request ${requestId}`);

    try {
      // Step 1: Send encrypted input to FHE server for classification
      const fheResponse = await fetch(`${this.fheServerUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encrypted_input: request.encryptedInput,
          evaluation_key: request.evaluationKey,
        }),
      });

      if (!fheResponse.ok) {
        throw new Error(`FHE server returned ${fheResponse.status}`);
      }

      const fheResult = await fheResponse.json();
      this.logger.info(`FHE classification complete for ${requestId}`);

      return {
        requestId,
        encryptedPrediction: fheResult.encrypted_prediction,
        success: true,
        source: 'fhe',
      };
    } catch (err) {
      this.logger.error(`FHE inference failed for ${requestId}: ${err.message}`);
      return {
        requestId,
        success: false,
        error: err.message,
        source: 'fhe',
      };
    }
  }

  /**
   * Integrated flow: FHE classification + QVAC generation.
   *
   * 1. Client encrypts prompt features → FHE server classifies (encrypted)
   * 2. Client decrypts classification → determines intent
   * 3. Client sends plaintext prompt + intent to QVAC for generation
   * 4. QVAC routes to appropriate model based on intent
   *
   * This keeps the prompt private during classification while allowing
   * LLM generation (which can't run in FHE yet).
   */
  async handleIntegratedRequest(request) {
    const requestId = Math.random().toString(36).substring(7);
    this.logger.info(`Processing integrated FHE+QVAC request ${requestId}`);

    let intent = null;

    // Step 1: FHE classification (if encrypted input provided)
    if (request.encryptedInput && request.evaluationKey && this.healthy) {
      try {
        const fheResponse = await fetch(`${this.fheServerUrl}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encrypted_input: request.encryptedInput,
            evaluation_key: request.evaluationKey,
          }),
        });

        if (fheResponse.ok) {
          const fheResult = await fheResponse.json();
          this.logger.info(`FHE classification done for ${requestId}`);
          // Client will decrypt the prediction; we return it for client-side decryption
          intent = fheResult.encrypted_prediction;
        }
      } catch (err) {
        this.logger.warn(`FHE classification failed, continuing with QVAC only: ${err.message}`);
      }
    }

    // Step 2: QVAC generation (plaintext prompt — LLM generation not yet feasible in FHE)
    if (this._qvacLayer && request.prompt) {
      const qvacResult = await this._qvacLayer.handleInferenceRequest({
        ...request,
        source: request.source || 'fhe-integrated',
        // Pass intent hint for model routing if available
        intentHint: request.intentHint || null,
      });

      return {
        requestId,
        intent: intent,
        output: qvacResult.output,
        model: qvacResult.model,
        latency: qvacResult.latency,
        tokensGenerated: qvacResult.tokensGenerated,
        success: qvacResult.success,
        source: 'fhe+qvac',
        receipt: qvacResult.receipt,
      };
    }

    return {
      requestId,
      intent,
      success: false,
      error: 'No QVAC layer configured for generation',
      source: 'fhe+qvac',
    };
  }

  getStatus() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      healthy: this.healthy,
      fheServerUrl: this.fheServerUrl,
      qvacLayerConnected: !!this._qvacLayer,
      activeSessions: this._sessions.size,
    };
  }

  /**
   * FHE LLM mode: Create a new FHE inference session.
   * The client (browser) uses this session ID for autoregressive generation.
   */
  async createFHESession(encryptedPrefix = null) {
    if (!this.healthy) {
      await this.healthCheck();
      if (!this.healthy) throw new Error('FHE server not available');
    }

    const resp = await fetch(`${this.fheServerUrl}/session/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encrypted_prefix: encryptedPrefix }),
    });

    if (!resp.ok) throw new Error(`Session init failed: ${resp.status}`);
    const data = await resp.json();
    const sessionId = data.session_id;

    this._sessions.set(sessionId, {
      createdAt: Date.now(),
      tokenCount: 0,
    });

    this.logger.info(`FHE LLM session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * FHE LLM mode: Forward encrypted embedding to server.
   * Used by the browser client for autoregressive token generation.
   */
  async forwardEncrypted(sessionId, encryptedEmbedding, position) {
    if (!this.healthy) throw new Error('FHE server not available');

    const resp = await fetch(`${this.fheServerUrl}/session/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        encrypted_embedding: encryptedEmbedding,
        position,
      }),
    });

    if (!resp.ok) throw new Error(`Forward failed: ${resp.status}`);
    const result = await resp.json();

    const session = this._sessions.get(sessionId);
    if (session) session.tokenCount++;

    return result;
  }

  /**
   * FHE LLM mode: Batch forward for speculative decoding.
   */
  async forwardBatch(sessionId, encryptedEmbedding, position, speculativeTokens) {
    if (!this.healthy) throw new Error('FHE server not available');

    const resp = await fetch(`${this.fheServerUrl}/session/forward_batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        encrypted_embedding: encryptedEmbedding,
        position,
        speculative_tokens: speculativeTokens,
      }),
    });

    if (!resp.ok) throw new Error(`Batch forward failed: ${resp.status}`);
    return resp.json();
  }

  /**
   * End an FHE LLM session.
   */
  async endFHESession(sessionId) {
    try {
      await fetch(`${this.fheServerUrl}/session/${sessionId}`, { method: 'DELETE' });
    } catch (e) { /* ignore */ }
    this._sessions.delete(sessionId);
    this.logger.info(`FHE LLM session ended: ${sessionId}`);
  }
}
