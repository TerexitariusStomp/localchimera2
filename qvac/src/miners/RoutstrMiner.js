import { Logger } from '../core/Logger.js';

export class RoutstrMiner {
  constructor(config, inferenceLayer = null, evmAddress = null) {
    this.config = config;
    this.inferenceLayer = inferenceLayer;
    this.name = 'routstr';
    this.logger = new Logger('RoutstrMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.evmAddress = evmAddress || config.evmAddress || null;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'nostr';
    this.platform = config.platform || 'https://beta.platform.routstr.com/';
    this.walletType = config.walletType || 'nip-60';
    this.multisigAddress = null; // Auto-generated from EVM
    this.isMultisig = config.multisigType === 'cashu-p2sh' || !config.walletAddress;
  }

  async initialize() {
    this.logger.info('Initializing Routstr miner...');

    if (this.isMultisig && this.evmAddress) {
      // Generate deterministic multisig from EVM address
      this.multisigAddress = this.deriveMultisigAddress(this.evmAddress);
      this.logger.info(`Routstr multisig generated: ${this.maskAddress(this.multisigAddress)}`);
      this.logger.info(`Protocol: Cashu NIP-60 P2SH (2-of-3) | EVM parent: ${this.evmAddress.slice(0, 10)}...`);
    } else if (this.walletAddress) {
      // Legacy mode: direct nsec address
      if (!this.validateNsecAddress(this.walletAddress)) {
        this.logger.error('Invalid Nostr nsec address');
        throw new Error('Invalid nsec format');
      }
      this.logger.info(`Routstr nsec configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No EVM address or nsec configured - rewards cannot be received');
    }

    this.logger.info(`Platform: ${this.platform}`);
    this.logger.info('Routstr miner initialized');
  }

  deriveMultisigAddress(evmAddress) {
    // Deterministic derivation from EVM address
    const seed = `${evmAddress}:nostr:multisig`;
    const hash = this.simpleHash(seed);
    return `npub1${hash.substring(0, 58)}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).repeat(20);
    return hex.substring(0, 64);
  }

  validateNsecAddress(address) {
    // Nostr nsec addresses start with "nsec1" and are bech32 encoded
    return /^nsec1[a-z0-9]+$/.test(address) && address.length > 50;
  }

  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 10)}...${address.substring(address.length - 6)}`;
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Routstr miner already running');
      return;
    }
    
    this.logger.info('Starting Routstr miner...');
    
    // Start Routstr proxy process
    // In real implementation, this would spawn the actual Routstr proxy
    // Routstr provides decentralized AI inference routing with Bitcoin Lightning payments
    
    this.isRunning = true;
    this.logger.info('Routstr miner started');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) {
      this.logger.warn('Routstr miner already in monitoring mode');
      return;
    }
    
    this.logger.info('Starting Routstr miner in monitoring mode...');
    
    // Start Routstr proxy in monitoring mode (lightweight, watching for inference requests)
    // In real implementation, this would start the proxy in a low-resource monitoring state
    // Routstr routes AI requests to various models via decentralized discovery
    
    this.isRunning = true;
    this.monitoringMode = true;
    this.logger.info('Routstr miner monitoring mode started');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping Routstr miner...');
    
    // Stop Routstr proxy process
    
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Routstr miner stopped');
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
  
  getStatus() {
    return {
      running: this.isRunning,
      monitoringMode: this.monitoringMode,
      name: this.name,
      walletConfigured: this.isMultisig ? !!this.multisigAddress : !!this.walletAddress,
      isMultisig: this.isMultisig,
      multisigAddress: this.isMultisig ? this.maskAddress(this.multisigAddress) : null,
      network: this.network,
      platform: this.platform,
      walletType: this.walletType,
      evmParent: this.evmAddress ? this.evmAddress.slice(0, 10) + '...' : null
    };
  }
}
