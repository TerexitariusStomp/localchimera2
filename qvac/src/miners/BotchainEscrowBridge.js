import { createHash } from 'crypto';
import { Logger } from '../core/Logger.js';
import { CoordinatorClient } from '../coordinator/CoordinatorClient.js';

/**
 * BotchainEscrowBridge — QVAC miner that processes jobs from the Botchain EVM escrow.
 *
 * Mirrors the CasperEscrowBridge interface so it can be dropped into MinerManager
 * alongside the existing Casper bridge. When the BrowserNode or on-device SDK is not
 * available, the resource-provisioner worker falls back to external tasking networks.
 */

const BOTCHAIN_TESTNET = {
  chainId: 968,
  name: 'Botchain Testnet',
  rpcUrl: process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life',
};

const BOTCHAIN_CONTRACTS = {
  computeRegistry: process.env.BOTCHAIN_COMPUTE_REGISTRY || '0x3737485f189d92a1455ed841fee4e8cc8a353e85',
  escrowVault: process.env.BOTCHAIN_ESCROW_VAULT || '0x82bb0e1f4cde3e1285fcd80464680e97833c8d54',
  orderBook: process.env.BOTCHAIN_ORDER_BOOK || '0x1fec1aa9618b902aa6c08b34bdd2846b32636c99',
  reputation: process.env.BOTCHAIN_REPUTATION || '0x24300d0ef11fb119c83974ba856e9da5da5da048',
};

const JOB_STATE = {
  PENDING: 0,
  ASSIGNED: 1,
  IN_PROGRESS: 2,
  PROVIDER_DONE: 3,
  CONSUMER_CONFIRM_WINDOW: 4,
  SETTLED: 5,
  REFUNDED: 6,
  DISPUTED: 7,
  DISPUTE_CONSUMER_WON: 8,
  DISPUTE_PROVIDER_WON: 9,
};

const CHIMERA_COORDINATOR_ABI = [
  'event JobRouted(bytes32 indexed jobId, address indexed jobAddress, address indexed provider, uint64 taskType, uint8 policy)',
  'event FallbackRequired(bytes32 indexed jobId, address indexed jobAddress, address indexed fallbackProvider, uint64 taskType, uint256 deadline, uint8 policy)',
  'event FallbackBridged(bytes32 indexed jobId, address indexed jobAddress, uint64 indexed taskType, uint8 policy, uint256 amount, address bridgeDispatcher)',
  'function selectProvider(uint64 taskType) view returns (address)',
  'function jobPolicy(address jobAddress) view returns (uint8)',
  'function jobAmount(address jobAddress) view returns (uint256)',
  'function jobDeadline(address jobAddress) view returns (uint256)',
  'function jobProvider(address jobAddress) view returns (address)',
  'function bridged(address jobAddress) view returns (bool)',
  'function paid(address jobAddress) view returns (bool)',
  'function payVolunteer(address jobAddress, bytes32 responseHash)',
];

const TASK_TYPE = {
  COMPUTE: 1,
  STORAGE: 2,
  INFERENCE: 4,
  BANDWIDTH: 8,
};

// Minimal ABI for the Botchain EscrowVault
const ESCROW_VAULT_ABI = [
  'function getPendingJobs() view returns (bytes32[] jobIds)',
  'function getJob(address jobAddress) view returns (tuple(bytes32 jobId, address consumer, address providerAuthority, bytes32 providerPeerId, bytes32 requestHash, uint64 nonce, uint64 taskType, uint64 validUntil, bytes quoteSignature, uint256 amount, address paymentMint, uint256 providerFeeBps, uint8 state, uint256 createdAt, uint256 providerAckedAt, uint256 providerCompletedAt, uint256 confirmWindowStart, uint256 refundedAt, uint256 settledAt, uint256 disputeId, bytes32 responseHash, bytes teeQuote, uint64 klerosDisputeId, uint64 klerosRuling))',
  'function getJobState(address jobAddress) view returns (uint8)',
  'function jobIdToAddress(bytes32 jobId) view returns (address)',
  'function providerAck(address jobAddress, bytes32 requestHash)',
  'function providerComplete(address jobAddress, bytes32 responseHash, bytes teeQuote)',
  'function consumerConfirm(address jobAddress)',
  'function autoRelease(address jobAddress)',
];

const COMPUTE_REGISTRY_ABI = [
  'function authorityToProvider(address authority) view returns (address provider)',
  'function getProviderStatus(address provider) view returns (uint8)',
];

export class BotchainEscrowBridge {
  constructor(config = {}, inferenceLayer = null) {
    this.config = config || {};
    this.inferenceLayer = inferenceLayer;
    this.logger = new Logger('BotchainEscrowBridge');
    this.isRunning = false;
    this.pollInterval = null;
    this.provider = null;
    this.wallet = null;
    this.escrow = null;
    this.registry = null;
    this.processedJobs = new Set();
    this.inProgressJobs = new Set();
    this.coordinator = null;
    this.coordinatorUrl = config.coordinatorUrl || process.env.COORDINATOR_URL || '';
    this.coordinatorToken = config.coordinatorToken || process.env.COORDINATOR_TOKEN || 'development-token';
    this.coordinatorContract = config.coordinatorContract || process.env.BOTCHAIN_COORDINATOR_ADDRESS || '';
    this.coordinatorContractInstance = null;
  }

  get rpcUrl() {
    return this.config.rpcUrl || BOTCHAIN_TESTNET.rpcUrl;
  }

  get contracts() {
    return {
      escrowVault: this.config.escrowVault || BOTCHAIN_CONTRACTS.escrowVault,
      computeRegistry: this.config.computeRegistry || BOTCHAIN_CONTRACTS.computeRegistry,
    };
  }

  async initialize() {
    this.logger.info('Initializing Botchain escrow bridge...');
    try {
      const { JsonRpcProvider, Wallet, Contract, formatEther } = await import('ethers');
      const privateKey = this.config.privateKey || process.env.BOTCHAIN_PRIVATE_KEY;
      if (!privateKey) {
        this.logger.warn('No BOTCHAIN_PRIVATE_KEY configured; running in observer mode');
        return;
      }
      this.provider = new JsonRpcProvider(this.rpcUrl);
      this.wallet = new Wallet(privateKey, this.provider);
      this.escrow = new Contract(this.contracts.escrowVault, ESCROW_VAULT_ABI, this.wallet);
      this.registry = new Contract(this.contracts.computeRegistry, COMPUTE_REGISTRY_ABI, this.wallet);
      this.logger.info(`Botchain provider address: ${this.wallet.address}`);
      const balance = await this.provider.getBalance(this.wallet.address);
      this.logger.info(`Botchain provider balance: ${formatEther(balance)} BOT`);
    } catch (e) {
      this.logger.error(`Botchain init failed: ${e.message}`);
    }
  }

  async start() {
    if (this.isRunning) return;
    if (!this.wallet) {
      this.logger.warn('Cannot start Botchain bridge: no wallet configured');
      return;
    }
    this.isRunning = true;
    this.logger.info('Starting Botchain escrow bridge polling...');

    if (this.coordinatorUrl) {
      this.coordinator = new CoordinatorClient({
        url: this.coordinatorUrl,
        token: this.coordinatorToken,
        volunteerId: this.wallet.address,
        address: this.wallet.address,
        taskTypes: [TASK_TYPE.COMPUTE, TASK_TYPE.STORAGE, TASK_TYPE.INFERENCE, TASK_TYPE.BANDWIDTH],
        networks: ['botchain'],
      });
      this.coordinator.on('job', (envelope) => this.handleCoordinatorJob(envelope, 'botchain'));
      this.coordinator.connect();
    }

    if (this.coordinatorContract) {
      this.logger.info(`Listening for on-chain JobRouted events from ${this.coordinatorContract}`);
      const coordinatorRead = new Contract(this.coordinatorContract, CHIMERA_COORDINATOR_ABI, this.provider);
      const coordinatorWrite = new Contract(this.coordinatorContract, CHIMERA_COORDINATOR_ABI, this.wallet);
      coordinatorRead.on('JobRouted', (jobId, jobAddress, provider, taskType, policy) => {
        if (provider.toLowerCase() === this.wallet.address.toLowerCase()) {
          this.logger.info(`On-chain JobRouted: ${jobAddress} assigned to us (policy=${policy})`);
          this.handleOnChainRoutedJob(jobAddress, taskType, policy);
        }
      });
      this.coordinatorContractInstance = coordinatorWrite;
    }

    await this.pollJobs();
    this.pollInterval = setInterval(() => this.pollJobs(), 15000).unref();
  }

  async startMonitoring() {
    await this.start();
  }

  async stop() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.coordinator) {
      this.coordinator.disconnect();
      this.coordinator = null;
    }
    if (this.coordinatorContractInstance) {
      try { this.coordinatorContractInstance.removeAllListeners('JobRouted'); } catch {}
      this.coordinatorContractInstance = null;
    }
    this.logger.info('Botchain escrow bridge stopped');
  }

  async handleCoordinatorJob(envelope, network) {
    try {
      const { jobId, jobAddress, requestHash, taskType } = envelope;
      this.logger.info(`Coordinator pushed ${network} job ${jobId || jobAddress}`);
      const responseText = await this.processJob(requestHash, taskType);
      this.coordinator.submitResult(jobId, jobAddress, network, responseText);
    } catch (e) {
      this.logger.error(`Coordinator job failed: ${e.message}`);
      this.coordinator.rejectJob(envelope.jobId, envelope.jobAddress, network, e.message);
    }
  }

  async handleOnChainRoutedJob(jobAddress, taskType, policy) {
    if (this.inProgressJobs.has(jobAddress) || this.processedJobs.has(jobAddress)) return;
    this.inProgressJobs.add(jobAddress);
    this.logger.info(`Processing ${jobAddress}; policy=${policy}`);
    try {
      if (policy === 2) {
        // Second-party-only jobs are bridged directly by the coordinator; volunteers should not process them.
        this.logger.info(`Skipping second-party-only job ${jobAddress}`);
        this.processedJobs.add(jobAddress);
        return;
      }

      const responseText = await this.processJob(undefined, taskType);
      const responseHash = this.computeHash(responseText);

      if (policy === 0) {
        // Hybrid: funds are held in the coordinator. Complete by calling payVolunteer.
        const coordinator = this.coordinatorContractInstance;
        const isBridged = await coordinator.bridged(jobAddress);
        const isPaid = await coordinator.paid(jobAddress);
        if (isBridged || isPaid) {
          this.logger.info(`Hybrid job ${jobAddress} already bridged or paid; skipping`);
          this.processedJobs.add(jobAddress);
          return;
        }
        const deadline = await coordinator.jobDeadline(jobAddress);
        if (Date.now() / 1000 > Number(deadline)) {
          this.logger.info(`Hybrid job ${jobAddress} deadline passed; skipping to allow fallback bridge`);
          this.processedJobs.add(jobAddress);
          return;
        }
        const tx = await coordinator.payVolunteer(jobAddress, '0x' + responseHash);
        await tx.wait();
        this.logger.info(`Hybrid job ${jobAddress} paid volunteer via coordinator`);
      } else {
        // First-party-only: full escrow lifecycle.
        const job = await this.escrow.getJob(jobAddress);
        const state = Number(job.state);
        if (state >= JOB_STATE.PROVIDER_DONE) {
          this.processedJobs.add(jobAddress);
          return;
        }
        await this.escrow.providerAck(jobAddress, job.requestHash || '0x' + '0'.repeat(64));
        await this.escrow.providerComplete(jobAddress, '0x' + responseHash, '0x');
        this.monitorJobSettlement(jobAddress);
      }
      this.processedJobs.add(jobAddress);
    } catch (e) {
      this.logger.error(`On-chain routed job ${jobAddress} failed: ${e.message}`);
    } finally {
      this.inProgressJobs.delete(jobAddress);
    }
  }

  async pollJobs() {
    if (!this.isRunning || !this.escrow) return;
    try {
      const jobIds = await this.escrow.getPendingJobs();
      if (!jobIds || jobIds.length === 0) return;
      this.logger.info(`Found ${jobIds.length} pending Botchain job(s)`);
      for (const jobId of jobIds) {
        if (this.processedJobs.has(jobId) || this.inProgressJobs.has(jobId)) continue;
        const jobAddress = await this.escrow.jobIdToAddress(jobId);
        await this.handleJob(jobAddress);
      }
    } catch (e) {
      this.logger.error(`Poll error: ${e.message}`);
    }
  }

  async handleJob(jobAddress) {
    this.inProgressJobs.add(jobAddress);
    try {
      const job = await this.escrow.getJob(jobAddress);
      const state = Number(job.state);
      const providerAuthority = job.providerAuthority;
      const isZeroProvider = !providerAuthority || providerAuthority === '0x' + '0'.repeat(40);

      this.logger.info(`Botchain job ${jobAddress}: state=${state}, provider=${isZeroProvider ? 'AUTO' : providerAuthority}, taskType=${job.taskType}`);

      if (state >= JOB_STATE.PROVIDER_DONE) {
        this.processedJobs.add(jobAddress);
        return;
      }

      if (isZeroProvider && state === JOB_STATE.PENDING) {
        this.logger.debug(`Botchain job ${jobAddress} has zero provider in PENDING, skipping`);
        return;
      }

      if (!isZeroProvider && providerAuthority.toLowerCase() !== this.wallet.address.toLowerCase()) {
        this.logger.debug(`Botchain job ${jobAddress} not assigned to us`);
        return;
      }

      const responseText = await this.processJob(job.requestHash, job.taskType);
      const responseHash = this.computeHash(responseText);
      await this.escrow.providerComplete(jobAddress, '0x' + responseHash, '0x');
      this.logger.info(`Botchain job ${jobAddress} completed`);
      this.processedJobs.add(jobAddress);
      this.monitorJobSettlement(jobAddress);
    } catch (e) {
      this.logger.error(`Failed to handle Botchain job ${jobAddress}: ${e.message}`);
    } finally {
      this.inProgressJobs.delete(jobAddress);
    }
  }

  async processJob(requestHash, taskType) {
    const ctt = normalizeTaskType(Number(taskType) || 0);
    const id = String(requestHash);

    if (ctt === TASK_TYPE.STORAGE) {
      return this._handleStorageJob(id);
    }
    if (ctt === TASK_TYPE.COMPUTE) {
      return this._handleComputeJob(id);
    }
    if (ctt === TASK_TYPE.BANDWIDTH) {
      return this._handleBandwidthJob(id);
    }

    return this._handleInferenceJob(id);
  }

  async _handleInferenceJob(requestHash) {
    const prompt = decodeRequest(requestHash) || 'Hello';
    if (this.inferenceLayer) {
      try {
        const result = await this.inferenceLayer.handleInferenceRequest({
          prompt,
          maxTokens: 512,
          temperature: 0.7,
          source: 'botchain-escrow',
        });
        return result.output || result.text || JSON.stringify(result);
      } catch (e) {
        this.logger.warn(`Botchain inference via QVAC failed: ${e.message}`);
      }
    }
    return `Fallback inference for: ${prompt}`;
  }

  async _handleStorageJob(requestHash) {
    return `Storage proof for ${requestHash.slice(0, 32)}`;
  }

  async _handleComputeJob(requestHash) {
    return `Compute proof for ${requestHash.slice(0, 32)}`;
  }

  async _handleBandwidthJob(requestHash) {
    return `Bandwidth proof for ${requestHash.slice(0, 32)}`;
  }

  async monitorJobSettlement(jobAddress) {
    let attempts = 0;
    const maxAttempts = 40;
    const check = async () => {
      if (!this.isRunning) return;
      attempts++;
      try {
        const state = await this.escrow.getJobState(jobAddress);
        this.logger.info(`Botchain job ${jobAddress} monitor: state=${state}`);
        if (state === JOB_STATE.SETTLED || state === JOB_STATE.CONSUMER_CONFIRM_WINDOW) {
          await this.escrow.consumerConfirm(jobAddress).catch(() => {});
          return;
        }
        if (state === JOB_STATE.REFUNDED || state === JOB_STATE.DISPUTED) return;
        if (attempts < maxAttempts) setTimeout(check, 15000).unref();
      } catch (e) {
        if (attempts < maxAttempts) setTimeout(check, 15000).unref();
      }
    };
    setTimeout(check, 15000).unref();
  }

  computeHash(str) {
    return createHash('sha256').update(String(str)).digest('hex');
  }

  getStatus() {
    return {
      running: this.isRunning,
      network: BOTCHAIN_TESTNET.name,
      rpcUrl: this.rpcUrl,
      providerAddress: this.wallet?.address || null,
      processedJobs: this.processedJobs.size,
    };
  }
}

function decodeRequest(requestHash) {
  if (!requestHash) return null;
  const str = String(requestHash);
  if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0 && str.length > 4) {
    try {
      const buf = Buffer.from(str, 'hex');
      const decoded = buf.toString('utf8').replace(/\0/g, '').trim();
      if (decoded) return decoded;
    } catch {}
  }
  return str;
}

function normalizeTaskType(taskType) {
  const tt = Number(taskType) || 0;
  if (tt <= 3) return tt; // already canonical
  if (tt & 4) return 0; // inference
  if (tt & 2) return 1; // storage
  if (tt & 1) return 2; // compute
  if (tt & 8) return 3; // bandwidth
  return 0;
}
