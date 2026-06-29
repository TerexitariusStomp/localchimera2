/**
 * Chimera SDK
 * Integrate local AI mining into your application.
 * Your users earn revenue from idle inference tasks.
 * You earn a percentage as the app integrator.
 */

import { NodeManager } from '../../qvac/src/core/NodeManager.js';
import { Logger } from '../../qvac/src/core/Logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { BttAiMinerProvider } from './miners/BttAiMinerProvider.js';
import { GolemProvider } from './miners/GolemProvider.js';
import { AnyoneProtocolProvider } from './miners/AnyoneProtocolProvider.js';
import { MysteriumProvider } from './miners/MysteriumProvider.js';
import { EarnidleProvider } from './miners/EarnidleProvider.js';
import { CasperProvider } from './miners/CasperProvider.js';
import { BtfsStorageProvider } from './miners/BtfsStorageProvider.js';

const logger = new Logger('ChimeraSDK');

/**
 * ChimeraSDK — mining-only wrapper for app developers.
 *
 * Usage:
 *   import { ChimeraSDK } from '@chimera/sdk';
 *   const sdk = new ChimeraSDK({
 *     appName: 'MyApp',
 *     integratorWallet: '0x...', // your payout address
 *     revenueSplit: { integrator: 0.30, machineOwner: 0.70 }
 *   });
 *   await sdk.init();
 *   await sdk.requestConsent(); // UI: ask user to opt in
 *   await sdk.start();            // starts mining
 *   await sdk.stop();             // stops mining
 *   const status = sdk.status();   // { running, miners, earnings }
 */
export class ChimeraSDK {
  constructor(opts = {}) {
    this.appName = opts.appName || 'unknown-app';
    this.machineOwnerEVM = opts.machineOwnerEVM || null;
    this.appDeveloperEVM = opts.appDeveloperEVM || null;
    this.revenueSplit = opts.revenueSplit || { machineOwner: 0.70, appDeveloper: 0.30 };
    this.configPath = opts.configPath || path.join(process.cwd(), 'config.json');
    this.userConsent = false;
    this.nodeManager = null;
    this._config = null;
    this.externalProviders = [];
  }

  /**
   * Load and merge configuration.
   * Sets integrator wallet into the miner config if provided.
   */
  async init() {
    const raw = await fs.readFile(this.configPath, 'utf-8');
    this._config = JSON.parse(raw);

    // Inject user EVM addresses into multisig config
    if (this.machineOwnerEVM) {
      this._config.multisig = this._config.multisig || {};
      this._config.multisig.machineOwnerAddress = this.machineOwnerEVM;
      logger.info(`[${this.appName}] Machine owner EVM: ${this.machineOwnerEVM}`);
    }
    if (this.appDeveloperEVM) {
      this._config.multisig = this._config.multisig || {};
      this._config.multisig.appDeveloperAddress = this.appDeveloperEVM;
      this._config.multisig.revenueSplit = this.revenueSplit;
      logger.info(`[${this.appName}] App developer EVM: ${this.appDeveloperEVM}`);
      logger.info(`[${this.appName}] Revenue split — machine owner: ${(this.revenueSplit.machineOwner * 100).toFixed(0)}%, app developer: ${(this.revenueSplit.appDeveloper * 100).toFixed(0)}%`);
    }

    // Disable wiki / AI writer features — SDK is mining-only
    this._config.inference = this._config.inference || {};
    this._config.p2p = this._config.p2p || {};
    this._config.p2p.enabled = false; // no P2P swarm in SDK mode

    this.nodeManager = new NodeManager(this._config);
    await this.nodeManager.initialize();

    // Auto-setup external providers (all untrusted-safe, no private keys on machine)
    await this._initExternalProviders();

    logger.info(`[${this.appName}] Chimera SDK initialized`);
  }

  /**
   * Record user consent.
   * Call this from your UI after the user agrees to mining.
   */
  giveConsent() {
    this.userConsent = true;
    logger.info(`[${this.appName}] User consent given`);
  }

  revokeConsent() {
    this.userConsent = false;
    logger.info(`[${this.appName}] User consent revoked`);
  }

  hasConsent() {
    return this.userConsent;
  }

  /**
   * Initialize external providers.
   *
   * All providers here are untrusted-hardware-safe — no private keys stored in the SDK.
   * Docker-based providers (Golem, Anyone Protocol, Mysterium, BTT AI) run in containers.
   * Earnidle uses only a public wallet address for payouts.
   * Casper is used in relay-only mode — private key lives on your relay server.
   * Providers that require a local key (CESS, Akash, Targon) are excluded from the SDK.
   */
  async _initExternalProviders() {
    // GPU tasking network (vLLM/SGLang inference miner)
    try {
      const btt = new BttAiMinerProvider();
      await btt.init();
      this.externalProviders.push(btt);
      logger.info(`[${this.appName}] BTT AI miner provider ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] BTT AI miner init failed: ${err.message}`);
    }

    // Decentralized compute marketplace (Docker-based, no local keys in SDK)
    try {
      const golem = new GolemProvider();
      await golem.init();
      this.externalProviders.push(golem);
      logger.info(`[${this.appName}] Golem provider ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] Golem init failed: ${err.message}`);
    }

    // Casper escrow bridge (relay-only mode, private key on relay server)
    try {
      const casper = new CasperProvider({
        relayUrl: this._config?.casper?.relayUrl || null,
        relayToken: this._config?.casper?.relayToken || null,
        providerAccountHash: this._config?.casper?.providerAccountHash || null,
        rpcUrl: this._config?.casper?.rpcUrl || null,
        inferenceLayer: this.nodeManager?.inferenceLayer || null,
      });
      await casper.init();
      this.externalProviders.push(casper);
      logger.info(`[${this.appName}] Casper escrow provider ready (relay mode)`);
    } catch (err) {
      logger.warn(`[${this.appName}] Casper provider init failed: ${err.message}`);
    }

    // IDLE Inference Network worker (public wallet address only, no private keys)
    try {
      const earnidle = new EarnidleProvider({
        walletAddress: this._config?.earnidle?.walletAddress || null,
        model: this._config?.earnidle?.model || 'llama-3.2-1b-instruct',
        inferenceLayer: this.nodeManager?.inferenceLayer || null,
      });
      await earnidle.init();
      this.externalProviders.push(earnidle);
      logger.info(`[${this.appName}] Earnidle inference provider ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] Earnidle provider init failed: ${err.message}`);
    }

    // Onion routing relay (Docker-based, no keys)
    try {
      const anyone = new AnyoneProtocolProvider();
      await anyone.init();
      this.externalProviders.push(anyone);
      logger.info(`[${this.appName}] Anyone Protocol relay ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] Anyone Protocol init failed: ${err.message}`);
    }

    // VPN node (Docker-based, no keys)
    try {
      const myst = new MysteriumProvider();
      await myst.init();
      this.externalProviders.push(myst);
      logger.info(`[${this.appName}] Mysterium provider ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] Mysterium init failed: ${err.message}`);
    }

    // Decentralized storage node (BTFS walletless mode — no private key on device)
    try {
      const btfs = new BtfsStorageProvider({
        apiUrl: this._config?.btfs?.apiUrl || null,
        repoPath: this._config?.btfs?.repoPath || null,
      });
      await btfs.init();
      this.externalProviders.push(btfs);
      logger.info(`[${this.appName}] BTFS walletless storage provider ready`);
    } catch (err) {
      logger.warn(`[${this.appName}] BTFS storage provider init failed: ${err.message}`);
    }
  }

  /**
   * Start mining.
   * Requires user consent. Fails silently if no consent.
   */
  async start() {
    if (!this.nodeManager) throw new Error('SDK not initialized. Call init() first.');
    if (!this.userConsent) {
      logger.warn(`[${this.appName}] Cannot start: user consent required`);
      return { success: false, error: 'User consent required' };
    }
    await this.nodeManager.start();

    // Start external providers
    const providerResults = [];
    for (const p of this.externalProviders) {
      try {
        const r = await p.start();
        providerResults.push(r);
      } catch (err) {
        providerResults.push({ success: false, provider: p.constructor.name, error: err.message });
      }
    }

    logger.info(`[${this.appName}] Mining started (${providerResults.length} external providers)`);
    return { success: true, running: true, providers: providerResults };
  }

  /**
   * Stop mining.
   */
  async stop() {
    if (!this.nodeManager) throw new Error('SDK not initialized. Call init() first.');
    await this.nodeManager.stop();

    // Stop external providers
    for (const p of this.externalProviders) {
      try { await p.stop(); } catch (err) {}
    }

    logger.info(`[${this.appName}] Mining stopped`);
    return { success: true, running: false };
  }

  /**
   * Get current status.
   */
  status() {
    if (!this.nodeManager) return { initialized: false };
    const s = this.nodeManager.getStatus();
    return {
      initialized: true,
      appName: this.appName,
      consent: this.userConsent,
      running: s.running,
      miners: s.mining?.minerStatus || {},
      externalProviders: this.externalProviders.map(p => p.status()),
      machineOwnerEVM: this.machineOwnerEVM,
      appDeveloperEVM: this.appDeveloperEVM,
      revenueSplit: this.revenueSplit
    };
  }

  /**
   * Test all registered miners.
   */
  async testMiners() {
    if (!this.nodeManager?.minerManager) {
      throw new Error('Miner manager not available');
    }
    const mm = this.nodeManager.minerManager;
    const results = [];
    const testTask = { id: `test-${Date.now()}`, prompt: 'What is 2+2?', maxTokens: 32, temperature: 0.5 };
    for (const [name, miner] of mm.miners) {
      const started = Date.now();
      try {
        const result = await miner.onInferenceTask(testTask);
        results.push({ miner: name, success: result.success, latency: Date.now() - started });
      } catch (err) {
        results.push({ miner: name, success: false, latency: Date.now() - started, error: err.message });
      }
    }
    return { tested: results.length, passed: results.filter(r => r.success).length, results };
  }

  /**
   * Graceful shutdown.
   */
  async shutdown() {
    for (const p of this.externalProviders) {
      try { await p.stop(); } catch (err) {}
    }
    if (this.nodeManager) {
      await this.nodeManager.stop();
      logger.info(`[${this.appName}] SDK shutdown complete`);
    }
  }
}
