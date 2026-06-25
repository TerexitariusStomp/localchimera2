import { Logger } from '../core/Logger.js';
import { QVACSDKWrapper } from './QVACSDKWrapper.js';
import { ProofOfInference } from './ProofOfInference.js';
import { TokenMeter } from './TokenMeter.js';
import { CircuitBreaker, CIRCUIT_STATES } from './CircuitBreaker.js';
import { PeerReputation } from '../p2p/PeerReputation.js';

export class InferenceRouter {
  constructor(qvacInferenceLayer, relayServer = null, config = {}) {
    this.qvacInference = qvacInferenceLayer;
    this.relay = relayServer;
    this.config = config;
    this.logger = new Logger('InferenceRouter');
    this.activeRoutes = new Map();
    this.isRunning = false;
    this.audit = config.audit || null;
    this.sdkWrapper = new QVACSDKWrapper({ ...(config.inference || {}), audit: this.audit });
    this.proofOfInference = config.proofOfInference || null;
    this.tokenMeter = config.tokenMeter || null;
    this.circuitBreaker = config.circuitBreaker || new CircuitBreaker(config.circuitBreakerConfig || {});
    this.peerReputation = config.peerReputation || new PeerReputation(config.peerReputationConfig || {});
  }

  async initialize() {
    this.logger.info('Initializing centralized inference router...');
    this.logger.info('Using @qvac/sdk for local inference (hardened container)');
    await this.sdkWrapper.initialize();
    this.isRunning = true;
    this.logger.info('Centralized inference router initialized');
  }

  async routeInferenceRequest(task, minerName) {
    if (!this.isRunning) {
      throw new Error('Inference router not running');
    }

    this.logger.info(`Routing inference request from ${minerName}: ${task.id || 'unknown'}`);

    const routeId = `${minerName}-${task.id || Date.now()}`;
    
    // Try mobile devices first if relay is available and has connected devices
    if (this.relay && this.relay.getConnectedDevices().length > 0) {
      // Use reputation-weighted selection instead of random
      const allDevices = this.relay.getConnectedDevices();
      const trustedDevices = allDevices.filter(d => this.peerReputation.isTrusted(d));
      const pool = trustedDevices.length > 0 ? trustedDevices : allDevices;
      const deviceId = this.peerReputation.selectBestPeer(pool) || this.selectDevice();

      // Circuit breaker check
      const cbCheck = this.circuitBreaker.canRequest(deviceId);
      if (!cbCheck.allowed) {
        this.logger.warn(`Circuit open for device ${deviceId}: ${cbCheck.reason}, trying fallback`);
      } else {
        try {
          this.logger.info(`Forwarding inference to mobile device: ${deviceId}`);
          const mobileStart = Date.now();
          const result = await this.relay.forwardInference(deviceId, task.prompt || task.input || '', task.maxTokens || 128);
          const mobileDur = Date.now() - mobileStart;
          this.logger.info(`Mobile inference completed for ${minerName} via ${deviceId}: ${routeId}`);
          this.relay.recordEarning(deviceId, minerName, task.id || routeId);
          if (this.audit) this.audit.inference({ prompt: task.prompt || '', outputTokens: result.tokensGenerated || 0, durationMs: mobileDur, modelId: deviceId, source: 'mobile', routeId });

          // Record success in circuit breaker + reputation
          this.circuitBreaker.recordSuccess(deviceId);
          this.peerReputation.recordSuccess(deviceId, mobileDur);

          const mobileResult = {
            success: true,
            routeId,
            miner: minerName,
            device: deviceId,
            source: 'mobile',
            result: { output: result.output, tokens: result.tokensGenerated }
          };

          if (this.proofOfInference) {
            mobileResult.receipt = this.proofOfInference.generateReceipt({
              prompt: task.prompt || '',
              output: result.output || '',
              modelId: deviceId,
              routeId,
              durationMs: mobileDur,
              tokensGenerated: result.tokensGenerated || 0,
            });
          }

          if (this.tokenMeter) {
            this.tokenMeter.meter(routeId, { completionTokens: result.tokensGenerated || 0 });
          }

          return mobileResult;
        } catch (relayError) {
          this.logger.warn(`Mobile inference failed, falling back to local: ${relayError.message}`);
          this.circuitBreaker.recordFailure(deviceId, relayError.message);
          this.peerReputation.recordFailure(deviceId, relayError.message);
        }
      }
    }
    
    try {
      // Route through @qvac/sdk (hardened container inference)
      const result = await this.sdkWrapper.generate(
        task.prompt || task.input || '',
        { maxTokens: task.maxTokens || 256, temperature: task.temperature || 0.7 }
      );

      this.logger.info(`QVAC SDK inference completed for ${minerName}: ${routeId}`);

      const sdkResult = {
        success: true,
        routeId,
        miner: minerName,
        source: 'qvac-sdk',
        result
      };

      if (this.proofOfInference) {
        sdkResult.receipt = this.proofOfInference.generateReceipt({
          prompt: task.prompt || '',
          output: result.output || '',
          modelId: result.model || 'qvac-sdk',
          routeId,
          durationMs: result.durationMs || 0,
          tokensGenerated: result.tokensGenerated || 0,
        });
      }

      if (this.tokenMeter) {
        this.tokenMeter.meter(routeId, { completionTokens: result.tokensGenerated || 0 });
      }

      return sdkResult;
    } catch (error) {
      this.logger.error(`QVAC SDK inference failed for ${minerName}: ${error.message}`);
      // Final fallback: legacy inference layer
      try {
        const result = await this.qvacInference.handleInferenceRequest({
          ...task,
          source: minerName,
          routeId
        });
        return {
          success: true,
          routeId,
          miner: minerName,
          source: 'legacy',
          result
        };
      } catch (legacyError) {
        this.logger.error(`Legacy inference also failed: ${legacyError.message}`);
        return {
          success: false,
          routeId,
          miner: minerName,
          error: `${error.message}; legacy: ${legacyError.message}`
        };
      }
    }
  }

  selectDevice() {
    const devices = this.relay.getConnectedDevices();
    // Round-robin selection
    return devices[Math.floor(Math.random() * devices.length)];
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Inference router already running');
      return;
    }
    
    this.logger.info('Starting centralized inference router...');
    this.isRunning = true;
    this.logger.info('Centralized inference router started');
  }

  async stop() {
    this.logger.info('Stopping centralized inference router...');
    this.isRunning = false;
    this.activeRoutes.clear();
    this.logger.info('Centralized inference router stopped');
  }

  getStatus() {
    return {
      running: this.isRunning,
      activeRoutes: this.activeRoutes.size,
      qvacInferenceStatus: this.qvacInference?.getStatus() || null,
      proofOfInference: this.proofOfInference?.getStatus() || null,
      tokenMeter: this.tokenMeter?.getStatus() || null,
      circuitBreaker: this.circuitBreaker?.getStatus() || null,
      peerReputation: this.peerReputation?.getStatus() || null,
    };
  }
}
