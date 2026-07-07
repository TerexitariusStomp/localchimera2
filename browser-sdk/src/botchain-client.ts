import { ethers } from 'ethers';
import { TASK_POLICY } from './task-types';
export { TASK_POLICY };

export const BOTCHAIN_TESTNET = {
  id: 968,
  name: 'Botchain Testnet',
  rpcUrl: 'https://rpc.bohr.life',
  explorer: 'https://scan.bohr.life',
  nativeCurrency: { name: 'Botchain BOT', symbol: 'BOT', decimals: 18 },
};

const envOrWindow = (key: string): string =>
  (typeof process !== 'undefined' && process.env?.[key]) ||
  (typeof window !== 'undefined' && (window as any)[key]) ||
  '';

export const BOTCHAIN_CONTRACTS = {
  computeRegistry: '0x3737485f189d92a1455ed841fee4e8cc8a353e85',
  escrowVault: '0x82bb0e1f4cde3e1285fcd80464680e97833c8d54',
  orderBook: '0x1fec1aa9618b902aa6c08b34bdd2846b32636c99',
  reputation: '0x24300d0ef11fb119c83974ba856e9da5da5da048',
  paymentChannel: '0xabb4f2d31836c1cc84df441329799d0ecbd20a26',
  coordinator: envOrWindow('BOTCHAIN_COORDINATOR_ADDRESS'),
  bridgeDispatcher: envOrWindow('BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS'),
};

export const CHIMERA_COORDINATOR_ABI = [
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

export const ESCROW_VAULT_ABI = [
  'function getPendingJobs() view returns (bytes32[] jobIds)',
  'function getJob(address jobAddress) view returns (tuple(bytes32 jobId, address consumer, address providerAuthority, bytes32 providerPeerId, bytes32 requestHash, uint64 nonce, uint64 taskType, uint64 validUntil, bytes quoteSignature, uint256 amount, address paymentMint, uint256 providerFeeBps, uint8 state, uint256 createdAt, uint256 providerAckedAt, uint256 providerCompletedAt, uint256 confirmWindowStart, uint256 refundedAt, uint256 settledAt, uint256 disputeId, bytes32 responseHash, bytes teeQuote, uint64 klerosDisputeId, uint64 klerosRuling))',
  'function getJobState(address jobAddress) view returns (uint8)',
  'function jobIdToAddress(bytes32 jobId) view returns (address)',
  'function providerAck(address jobAddress, bytes32 requestHash)',
  'function providerComplete(address jobAddress, bytes32 responseHash, bytes teeQuote)',
  'function consumerConfirm(address jobAddress)',
  'function autoRelease(address jobAddress)',
];

export const COMPUTE_REGISTRY_ABI = [
  'function authorityToProvider(address authority) view returns (address provider)',
  'function getProviderStatus(address provider) view returns (uint8)',
  'function registerProvider(bytes32 peerId, string name, uint256 stake)',
  'function minimumStake() view returns (uint256)',
];

export const JOB_STATE = {
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

export function getProviderFromWallet(rpcUrl: string, evmProvider: any): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl || BOTCHAIN_TESTNET.rpcUrl);
}

export async function getSignerFromWallet(rpcUrl: string, evmProvider: any, address?: string): Promise<ethers.Signer | null> {
  try {
    const browserProvider = new ethers.BrowserProvider(evmProvider, {
      name: BOTCHAIN_TESTNET.name,
      chainId: BOTCHAIN_TESTNET.id,
    });
    return await browserProvider.getSigner(address || 0);
  } catch {
    return null;
  }
}

export function getBotchainContracts(readProvider: ethers.Provider): {
  escrowVault: ethers.Contract;
  computeRegistry: ethers.Contract;
  orderBook: ethers.Contract;
  reputation: ethers.Contract;
} {
  return {
    escrowVault: new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, ESCROW_VAULT_ABI, readProvider),
    computeRegistry: new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, COMPUTE_REGISTRY_ABI, readProvider),
    orderBook: new ethers.Contract(BOTCHAIN_CONTRACTS.orderBook, ESCROW_VAULT_ABI, readProvider),
    reputation: new ethers.Contract(BOTCHAIN_CONTRACTS.reputation, ESCROW_VAULT_ABI, readProvider),
  };
}

export function getBotchainContractsWithSigner(signer: ethers.Signer): {
  escrowVault: ethers.Contract;
  computeRegistry: ethers.Contract;
  orderBook: ethers.Contract;
  reputation: ethers.Contract;
} {
  return {
    escrowVault: new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, ESCROW_VAULT_ABI, signer),
    computeRegistry: new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, COMPUTE_REGISTRY_ABI, signer),
    orderBook: new ethers.Contract(BOTCHAIN_CONTRACTS.orderBook, ESCROW_VAULT_ABI, signer),
    reputation: new ethers.Contract(BOTCHAIN_CONTRACTS.reputation, ESCROW_VAULT_ABI, signer),
  };
}

export async function switchToBotchain(evmProvider: any): Promise<void> {
  if (!evmProvider?.request) return;
  try {
    await evmProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x' + BOTCHAIN_TESTNET.id.toString(16) }],
    });
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      await evmProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x' + BOTCHAIN_TESTNET.id.toString(16),
            chainName: BOTCHAIN_TESTNET.name,
            rpcUrls: [BOTCHAIN_TESTNET.rpcUrl],
            nativeCurrency: BOTCHAIN_TESTNET.nativeCurrency,
            blockExplorerUrls: [BOTCHAIN_TESTNET.explorer],
          },
        ],
      });
    }
  }
}

export function botchainExplorerLink(type: 'tx' | 'address', hash: string): string {
  return `${BOTCHAIN_TESTNET.explorer}/${type === 'tx' ? 'tx' : 'address'}/${hash}`;
}
