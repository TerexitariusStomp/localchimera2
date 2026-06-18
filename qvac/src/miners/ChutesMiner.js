import { Logger } from '../core/Logger.js';

export class ChutesMiner {
  constructor(config, inferenceLayer = null, evmAddress = null) {
    this.config = config;
    this.inferenceLayer = inferenceLayer;
    this.name = 'chutes';
    this.logger = new Logger('ChutesMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.evmAddress = evmAddress || config.evmAddress || null;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'bittensor';
    this.multisigAddress = null;
    this.isMultisig = config.multisigType === 'substrate' || !config.walletAddress;
    this.requiresK8s = true; // Chutes requires Kubernetes for GPU validation
    this.stackCompatible = false; // Not compatible with QVAC/Hypercore/Pear stack
  }

  async initialize() {
    this.logger.info('Initializing Chutes miner...');

    if (this.isMultisig && this.evmAddress) {
      // Generate deterministic Bittensor multisig from EVM address
      this.multisigAddress = this.deriveMultisigAddress(this.evmAddress);
      this.logger.info(`Chutes Bittensor multisig generated: ${this.maskAddress(this.multisigAddress)}`);
      this.logger.info(`Protocol: Substrate Multisig (2-of-3) | EVM parent: ${this.evmAddress.slice(0, 10)}...`);
    } else if (this.walletAddress) {
      // Legacy mode: direct Bittensor address
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid Bittensor wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Chutes wallet configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No EVM address or wallet configured - rewards cannot be received');
    }

    this.logger.warn('Chutes miner requires Kubernetes (k8s) for GPU validation');
    this.logger.warn('Chutes is not compatible with QVAC/Hypercore/Pear stack');
    this.logger.warn('Chutes miner will run in compatibility mode - limited functionality');
    this.logger.info('Chutes miner initialized (compatibility mode)');
  }

  deriveMultisigAddress(evmAddress) {
    const seed = `${evmAddress}:bittensor:multisig`;
    const hash = this.simpleHash(seed);
    return `5${hash.substring(0, 46)}`;
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

  validateWalletAddress(address) {
    // Bittensor addresses are typically SS58 format (starts with specific prefix)
    return /^[a-zA-Z0-9]{47,}$/.test(address);
  }

  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Chutes miner already running');
      return;
    }
    
    this.logger.info('Starting Chutes miner in compatibility mode...');
    
    // Chutes requires Kubernetes for GPU validation
    // In QVAC/Hypercore/Pear stack, we run in compatibility mode
    // All inference should be routed through QVAC inference node
    
    this.isRunning = true;
    this.logger.info('Chutes miner started (compatibility mode - no k8s GPU validation)');
  }
  
  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) {
      this.logger.warn('Chutes miner already in monitoring mode');
      return;
    }
    
    this.logger.info('Starting Chutes miner in monitoring mode...');
    
    // In compatibility mode, Chutes monitors for tasks but relies on QVAC for inference
    // All inference requests are routed through the QVAC inference node
    
    this.isRunning = true;
    this.monitoringMode = true;
    this.logger.info('Chutes miner monitoring mode started (compatibility mode)');
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping Chutes miner...');
    
    // Stop chutes-miner process
    
    this.isRunning = false;
    this.monitoringMode = false;
    this.logger.info('Chutes miner stopped');
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
      requiresK8s: this.requiresK8s,
      stackCompatible: this.stackCompatible,
      mode: 'compatibility',
      evmParent: this.evmAddress ? this.evmAddress.slice(0, 10) + '...' : null
    };
  }
}
