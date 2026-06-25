import { Logger } from '../core/Logger.js';

/**
 * SdkProviderMiner — wraps an SDK provider (@chimera/sdk) into the QVAC MinerManager interface.
 *
 * This allows SDK providers (Akash, Targon, BTFS, ZCN, IncomeGenerator,
 * CashPilot, CESS, BTT AI Miner) to appear in the desktop app alongside
 * native QVAC miners (Chutes, Fortytwo, Earnidle, Routstr, Casper, etc.).
 */
export class SdkProviderMiner {
  constructor(name, ProviderClass, config = {}, inferenceLayer = null, evmAddress = null) {
    this.name = name;
    this.ProviderClass = ProviderClass;
    this.config = config;
    this.inferenceLayer = inferenceLayer;
    this.evmAddress = evmAddress;
    this.logger = new Logger(`SdkProviderMiner:${name}`);
    this.provider = null;
    this.isRunning = false;
  }

  async initialize() {
    this.logger.info(`Initializing SDK provider wrapper for ${this.name}...`);
    try {
      this.provider = new this.ProviderClass(this.config);
      if (typeof this.provider.init === 'function') {
        await this.provider.init();
      }
      this.logger.info(`${this.name} SDK provider initialized`);
    } catch (err) {
      this.logger.warn(`${this.name} SDK provider init failed: ${err.message}`);
      this.provider = null;
    }
  }

  async start() {
    if (this.isRunning) return;
    if (!this.provider) {
      this.logger.warn(`Cannot start ${this.name}: provider not initialized`);
      return;
    }
    try {
      await this.provider.start();
      this.isRunning = true;
      this.logger.info(`${this.name} started`);
    } catch (err) {
      this.logger.warn(`${this.name} start failed: ${err.message}`);
    }
  }

  async startMonitoring() {
    await this.start();
  }

  async stop() {
    if (!this.isRunning) return;
    if (!this.provider) return;
    try {
      await this.provider.stop();
    } catch (err) {
      this.logger.warn(`${this.name} stop failed: ${err.message}`);
    }
    this.isRunning = false;
    this.logger.info(`${this.name} stopped`);
  }

  async onInferenceTask(task) {
    this.logger.info(`${this.name} inference task: ${task.id || 'unknown'}`);
    if (this.inferenceLayer) {
      return this.inferenceLayer.handleInferenceRequest({ ...task, source: this.name });
    }
    return { success: false, error: 'No inference layer available' };
  }

  getStatus() {
    const sdkStatus = this.provider && typeof this.provider.status === 'function'
      ? this.provider.status()
      : {};
    return {
      running: this.isRunning,
      name: this.name,
      source: 'sdk',
      ...sdkStatus,
    };
  }
}
