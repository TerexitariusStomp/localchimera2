import { ethers } from 'ethers';

// Botchain Testnet configuration
export const BOTCHAIN_TESTNET = {
  chainId: 968,
  name: 'Botchain Testnet',
  rpcUrl: process.env.BOTCHAIN_RPC_URL || 'https://rpc.bohr.life',
  fallbackRpcUrl: process.env.BOTCHAIN_FALLBACK_RPC_URL || 'https://rpc.botchain.ai',
  explorer: 'https://scan.bohr.life',
};

export const BOTCHAIN_CONTRACTS = {
  computeRegistry: process.env.BOTCHAIN_COMPUTE_REGISTRY || '0x3737485f189d92a1455ed841fee4e8cc8a353e85',
  escrowVault: process.env.BOTCHAIN_ESCROW_VAULT || '0x82bb0e1f4cde3e1285fcd80464680e97833c8d54',
  orderBook: process.env.BOTCHAIN_ORDER_BOOK || '0x1fec1aa9618b902aa6c08b34bdd2846b32636c99',
  reputation: process.env.BOTCHAIN_REPUTATION || '0x24300d0ef11fb119c83974ba856e9da5da5da048',
  paymentChannel: process.env.BOTCHAIN_PAYMENT_CHANNEL || '0xabb4f2d31836c1cc84df441329799d0ecbd20a26',
  coordinator: process.env.BOTCHAIN_COORDINATOR_ADDRESS || '',
};

export const TASK_POLICY = {
  HYBRID: 0,
  FIRST_PARTY_ONLY: 1,
  SECOND_PARTY_ONLY: 2,
};

// Job state enum from Botchain EscrowVault
export const BOTCHAIN_JOB_STATE = {
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

export const BOTCHAIN_TASK_TYPE = {
  COMPUTE: 1,
  STORAGE: 2,
  INFERENCE: 4,
  BANDWIDTH: 8,
};

// Minimal ABI for the Botchain EscrowVault (read + fallback write entrypoints)
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

// Minimal ABI for ComputeRegistry provider lookup
const COMPUTE_REGISTRY_ABI = [
  'function authorityToProvider(address authority) view returns (address provider)',
  'function getProviderStatus(address provider) view returns (uint8)',
  'function getRegisteredProviders() view returns (address[])',
];

const COORDINATOR_ABI = [
  'function jobPolicy(address jobAddress) view returns (uint8)',
  'function jobDeadline(address jobAddress) view returns (uint256)',
  'function fallbackTimeout() view returns (uint256)',
  'event JobRouted(bytes32 indexed jobId, address indexed jobAddress, address indexed provider, uint64 taskType, uint8 policy)',
  'event FallbackRequired(bytes32 indexed jobId, address indexed jobAddress, address indexed fallbackProvider, uint64 taskType, uint256 deadline, uint8 policy)',
  'event FallbackBridged(bytes32 indexed jobId, address indexed jobAddress, uint64 indexed taskType, uint8 policy, uint256 amount, address bridgeDispatcher)',
];

export class BotchainClient {
  constructor(privateKey) {
    if (!privateKey) throw new Error('BOTCHAIN_PRIVATE_KEY required');
    this.provider = new ethers.providers.JsonRpcProvider(BOTCHAIN_TESTNET.rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.escrow = new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, ESCROW_VAULT_ABI, this.wallet);
    this.registry = new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, COMPUTE_REGISTRY_ABI, this.wallet);
    this.coordinator = BOTCHAIN_CONTRACTS.coordinator
      ? new ethers.Contract(BOTCHAIN_CONTRACTS.coordinator, COORDINATOR_ABI, this.wallet)
      : null;
    this.address = this.wallet.address;
    this.coordinatorListeners = [];
  }

  getCoordinator() {
    return this.coordinator;
  }

  async getJobPolicy(jobAddress) {
    if (!this.coordinator) return null;
    try {
      return Number(await this.coordinator.jobPolicy(jobAddress));
    } catch (e) {
      console.warn(`[botchain] jobPolicy failed: ${e.message}`);
      return null;
    }
  }

  onCoordinatorEvent(event, callback) {
    if (!this.coordinator) return;
    this.coordinator.on(event, callback);
    this.coordinatorListeners.push({ event, callback });
  }

  removeCoordinatorListeners() {
    if (!this.coordinator) return;
    for (const { event, callback } of this.coordinatorListeners) {
      try { this.coordinator.off(event, callback); } catch {}
    }
    this.coordinatorListeners = [];
  }

  async getPendingJobAddresses() {
    try {
      const jobIds = await this.escrow.getPendingJobs();
      const addresses = [];
      for (const jobId of jobIds) {
        try {
          const addr = await this.escrow.jobIdToAddress(jobId);
          addresses.push({ jobId, jobAddress: addr });
        } catch (e) {
          console.warn(`[botchain] jobIdToAddress failed for ${jobId}: ${e.message}`);
        }
      }
      return addresses;
    } catch (e) {
      console.error('[botchain] getPendingJobs failed:', e.message);
      return [];
    }
  }

  async getJob(jobAddress) {
    try {
      const job = await this.escrow.getJob(jobAddress);
      return {
        jobId: job.jobId,
        consumer: job.consumer,
        providerAuthority: job.providerAuthority,
        providerPeerId: job.providerPeerId,
        requestHash: job.requestHash,
        nonce: Number(job.nonce),
        taskType: Number(job.taskType),
        validUntil: Number(job.validUntil),
        quoteSignature: job.quoteSignature,
        amount: job.amount.toString(),
        paymentMint: job.paymentMint,
        providerFeeBps: Number(job.providerFeeBps),
        state: Number(job.state),
        createdAt: Number(job.createdAt),
      };
    } catch (e) {
      console.error(`[botchain] getJob(${jobAddress}) failed: ${e.message}`);
      return null;
    }
  }

  async getJobState(jobAddress) {
    try {
      return Number(await this.escrow.getJobState(jobAddress));
    } catch (e) {
      console.error(`[botchain] getJobState(${jobAddress}) failed: ${e.message}`);
      return null;
    }
  }

  async getRegisteredProviders() {
    try {
      return await this.registry.getRegisteredProviders();
    } catch (e) {
      console.warn('[botchain] getRegisteredProviders failed:', e.message);
      return [];
    }
  }

  async getProviderStatus(providerAddress) {
    try {
      return Number(await this.registry.getProviderStatus(providerAddress));
    } catch (e) {
      console.warn(`[botchain] getProviderStatus(${providerAddress}) failed: ${e.message}`);
      return null;
    }
  }

  async providerAck(jobAddress, requestHash) {
    const tx = await this.escrow.providerAck(jobAddress, requestHash);
    console.log(`[botchain] providerAck tx: ${tx.hash}`);
    return await tx.wait();
  }

  async providerComplete(jobAddress, responseHash, teeQuote = '0x') {
    const tx = await this.escrow.providerComplete(jobAddress, responseHash, teeQuote);
    console.log(`[botchain] providerComplete tx: ${tx.hash}`);
    return await tx.wait();
  }

  async consumerConfirm(jobAddress) {
    const tx = await this.escrow.consumerConfirm(jobAddress);
    console.log(`[botchain] consumerConfirm tx: ${tx.hash}`);
    return await tx.wait();
  }
}
