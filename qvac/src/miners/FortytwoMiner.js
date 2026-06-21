import { Logger } from '../core/Logger.js';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export class FortytwoMiner {
  constructor(config, inferenceLayer = null) {
    this.config = config;
    this.inferenceLayer = inferenceLayer;
    this.name = 'fortytwo';
    this.logger = new Logger('FortytwoMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'evm';
    this.nodeName = config.nodeName || 'Chimera-Fortytwo-Node';
    this.apiBase = config.apiBase || 'https://node.fortytwo.network/api';
    this.pollInterval = config.pollInterval || 120_000;
    this.inferenceUrl = config.inferenceUrl || 'http://localchimera.com:3002/v1';
    this.fortytwoHome = config.fortytwoHome || join(homedir(), '.fortytwo');
    this.identityFile = join(this.fortytwoHome, 'identity.json');
    this._nodeId = null;
    this._secretKey = null;
    this._pollTimer = null;
    this._cycleCount = 0;
  }
  
  async initialize() {
    this.logger.info('Initializing Fortytwo-Network miner...');
    
    if (!existsSync(this.fortytwoHome)) mkdirSync(this.fortytwoHome, { recursive: true });
    if (existsSync(this.identityFile)) {
      this.logger.info(`Found identity: ${this.identityFile}`);
      this._loadIdentity();
    } else {
      this.logger.warn('No Fortytwo identity — registration required');
      this.logger.info('Get credentials: https://app.fortytwo.network/');
    }
    if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) this.logger.error('Invalid EVM wallet');
      else this.logger.info(`Wallet: ${this.maskAddress(this.walletAddress)}`);
    }
    this.logger.info('Fortytwo miner initialized');
  }

  _loadIdentity() {
    try {
      const data = JSON.parse(readFileSync(this.identityFile, 'utf-8'));
      this._nodeId = data.node_id || data.nodeId || null;
      this._secretKey = data.secret_key || data.secretKey || null;
      if (this._nodeId) this.logger.info(`Loaded node ID: ${this._nodeId.slice(0, 8)}...`);
    } catch (e) { this.logger.error(`Identity load failed: ${e.message}`); }
  }
  
  validateWalletAddress(address) {
    // EVM address validation (0x + 40 hex characters)
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  
  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  async start() {
    if (this.isRunning) { this.logger.warn('Already running'); return; }
    if (!this._nodeId || !this._secretKey) {
      this.logger.warn('No Fortytwo credentials — cannot start');
      this.logger.info('Register at https://app.fortytwo.network/ then save to ~/.fortytwo/identity.json');
      return;
    }
    this.logger.info(`Starting Fortytwo node: ${this.nodeName}`);
    this._pollTimer = setInterval(() => this._poll(), this.pollInterval).unref();
    this._poll();
    this.isRunning = true;
    this.logger.info('Fortytwo node started');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) { this.logger.warn('Already monitoring'); return; }
    this.monitoringMode = true;
    await this.start();
  }
  
  async stop() {
    if (!this.isRunning) return;
    this.logger.info('Stopping Fortytwo node...');
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Fortytwo node stopped');
  }
  
  async onInferenceTask(task) {
    this.logger.info(`Inference task detected: ${task.id || 'unknown'}`);
    
    if (this.inferenceLayer) {
      this.logger.info('Routing task through centralized inference router');
      const result = await this.inferenceLayer.handleInferenceRequest(task, this.name);
      this.logger.info(`Inference result: ${result.success ? 'success' : 'failed'}`);
      return result;
    } else {
      this.logger.warn('No inference router available - task not processed');
      return { success: false, error: 'No inference router available' };
    }
  }
  
  async _poll() {
    try {
      this.logger.debug('Polling Fortytwo for tasks...');
      const res = await fetch(`${this.apiBase}/tasks/pending`, {
        headers: {
          'X-Node-ID': this._nodeId,
          'X-Node-Secret': this._secretKey,
        },
      });
      if (!res.ok) { this.logger.warn(`Poll failed: ${res.status}`); return; }
      const tasks = await res.json();
      if (tasks.length > 0) {
        this.logger.info(`Received ${tasks.length} task(s) from Fortytwo`);
        for (const task of tasks) await this._processTask(task);
      }
      this._cycleCount++;
    } catch (e) { this.logger.warn(`Poll error: ${e.message}`); }
  }

  async _processTask(task) {
    this.logger.info(`Processing task: ${task.id}`);
    try {
      const result = await this.onInferenceTask(task);
      await this._submitResult(task.id, result);
      this._lastTaskTime = Date.now();
    } catch (e) { this.logger.error(`Task ${task.id} failed: ${e.message}`); }
  }

  async _submitResult(taskId, result) {
    try {
      await fetch(`${this.apiBase}/tasks/${taskId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Node-ID': this._nodeId,
          'X-Node-Secret': this._secretKey,
        },
        body: JSON.stringify(result),
      });
      this.logger.info(`Submitted result for ${taskId}`);
    } catch (e) { this.logger.error(`Submit failed: ${e.message}`); }
  }

  async _checkNodeStatus() {
    const res = await fetch(`${this.apiBase}/nodes/${this._nodeId}`, {
      headers: { 'X-Node-Secret': this._secretKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  getStatus() {
    return {
      running: this.isRunning,
      monitoringMode: this.monitoringMode,
      name: this.name,
      network: this.network,
      walletConfigured: !!this.walletAddress,
      nodeId: this._nodeId ? `${this._nodeId.slice(0, 8)}...` : null,
      cycles: this._cycleCount,
      lastTask: this._lastTaskTime,
    };
  }
}
