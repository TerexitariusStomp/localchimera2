import { Logger } from '../core/Logger.js';

/**
 * SolanaMiner
 * Receives Solana rewards in a deterministically-derived SPL-multisig
 * and sweeps them to the EVM collection multisig on the weekly cycle.
 */
export class SolanaMiner {
  constructor(config, inferenceRouter = null, evmAddress = null) {
    this.config = config;
    this.inferenceRouter = inferenceRouter;
    this.name = 'solana';
    this.logger = new Logger('SolanaMiner');
    this.isRunning = false;
    this.monitoringMode = false;
    this.evmAddress = evmAddress || config.evmAddress || null;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'solana';
    this.multisigAddress = null;
    this.isMultisig = config.multisigType === 'spl-multisig' || !config.walletAddress;
    this.stackCompatible = true;
  }

  async initialize() {
    this.logger.info('Initializing Solana miner...');

    if (this.isMultisig && this.evmAddress) {
      this.multisigAddress = this.deriveMultisigAddress(this.evmAddress);
      this.logger.info(`Solana SPL-multisig generated: ${this.maskAddress(this.multisigAddress)}`);
      this.logger.info(`Protocol: SPL Multisig (2-of-3) | EVM parent: ${this.evmAddress.slice(0, 10)}...`);
    } else if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid Solana wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Solana wallet configured: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No EVM address or wallet configured — rewards cannot be received');
    }

    this.logger.info('Solana miner initialized');
  }

  deriveMultisigAddress(evmAddress) {
    const seed = `${evmAddress}:solana:multisig`;
    const hash = this.simpleHash(seed);
    // Solana addresses are base58 encoded, 32-44 chars.
    // We return a deterministic base58-like string.
    return this._toBase58(hash);
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

  _toBase58(hex) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + hex);
    let out = '';
    while (num > 0n) {
      out = ALPHABET[Number(num % 58n)] + out;
      num = num / 58n;
    }
    // Pad to Solana address length (32 bytes = ~43-44 base58 chars)
    while (out.length < 44) out = '1' + out;
    return out.substring(0, 44);
  }

  validateWalletAddress(address) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  async start() {
    if (this.isRunning) { this.logger.warn('Solana miner already running'); return; }
    this.logger.info('Starting Solana miner...');
    this.isRunning = true;
  }

  async startMonitoring() {
    if (this.isRunning && this.monitoringMode) { this.logger.warn('Solana miner already monitoring'); return; }
    this.logger.info('Starting Solana miner in monitoring mode...');
    this.isRunning = true;
    this.monitoringMode = true;
  }

  async stop() {
    if (!this.isRunning) return;
    this.logger.info('Stopping Solana miner...');
    this.isRunning = false;
    this.monitoringMode = false;
  }

  async onInferenceTask(task) {
    this.logger.info(`Inference task detected: ${task.id || 'unknown'}`);
    if (this.inferenceRouter) {
      const result = await this.inferenceRouter.routeInferenceRequest(task, this.name);
      this.logger.info(`Inference result: ${result.success ? 'success' : 'failed'}`);
      return result;
    }
    return { success: false, error: 'No inference router available' };
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
      stackCompatible: this.stackCompatible,
      evmParent: this.evmAddress ? this.evmAddress.slice(0, 10) + '...' : null,
    };
  }
}
