import { ethers } from 'ethers';
import {
  TASK_TYPE_BOTCHAIN,
  TASK_POLICY,
  TASK_TYPE_NAME,
} from '@localchimera/browser-sdk/task-types';
import { ComputeRegistryAbi } from './abis/ComputeRegistry';
import { EscrowVaultAbi } from './abis/EscrowVault';
import { OrderBookAbi } from './abis/OrderBook';
import { ReputationAbi } from './abis/Reputation';
import { PaymentChannelAbi } from './abis/PaymentChannel';

export const BOTCHAIN_TESTNET_RPC = 'https://rpc.bohr.life';
export const BOTCHAIN_FALLBACK_RPC = 'https://rpc.botchain.ai';

export const BOTCHAIN_TESTNET = {
  id: 968,
  name: 'Botchain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: [BOTCHAIN_TESTNET_RPC] },
    public: { http: [BOTCHAIN_TESTNET_RPC] },
  },
  blockExplorers: {
    default: { name: 'BOTScan', url: 'https://scan.bohr.life' },
  },
};

export const ETHEREUM_MAINNET = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://ethereum.publicnode.com'] },
    public: { http: ['https://ethereum.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
};

function getEip1193Provider(wallet: any): any {
  if (wallet?.provider) return wallet.provider;
  if (wallet?.getEthereumProvider) return wallet.getEthereumProvider();
  if (wallet?.getProvider) return wallet.getProvider();
  return wallet;
}

export async function switchToBotchain(wallet: any): Promise<void> {
  const walletProvider = await getEip1193Provider(wallet);
  try {
    await walletProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${BOTCHAIN_TESTNET.id.toString(16)}` }],
    });
  } catch (switchError: any) {
    // 4902 means the chain is not added to the wallet
    if (switchError.code === 4902) {
      await walletProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${BOTCHAIN_TESTNET.id.toString(16)}`,
            chainName: BOTCHAIN_TESTNET.name,
            rpcUrls: [BOTCHAIN_TESTNET_RPC],
            nativeCurrency: BOTCHAIN_TESTNET.nativeCurrency,
            blockExplorerUrls: [BOTCHAIN_TESTNET.blockExplorers.default.url],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function switchToEthereum(wallet: any): Promise<void> {
  const walletProvider = await getEip1193Provider(wallet);
  try {
    await walletProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ETHEREUM_MAINNET.id.toString(16)}` }],
    });
  } catch (switchError: any) {
    // 4902 means the chain is not added to the wallet
    if (switchError.code === 4902) {
      await walletProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${ETHEREUM_MAINNET.id.toString(16)}`,
            chainName: ETHEREUM_MAINNET.name,
            rpcUrls: [ETHEREUM_MAINNET.rpcUrls.default.http[0]],
            nativeCurrency: ETHEREUM_MAINNET.nativeCurrency,
            blockExplorerUrls: [ETHEREUM_MAINNET.blockExplorers.default.url],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export const BOTCHAIN_CONTRACTS = {
  computeRegistry: '0x3737485f189d92a1455ed841fee4e8cc8a353e85',
  reputation: '0x24300d0ef11fb119c83974ba856e9da5da5da048',
  escrowVault: '0x82bb0e1f4cde3e1285fcd80464680e97833c8d54',
  orderBook: '0x1fec1aa9618b902aa6c08b34bdd2846b32636c99',
  paymentChannel: '0xabb4f2d31836c1cc84df441329799d0ecbd20a26',
};

export const BOTCHAIN_EXPLORER = 'https://scan.bohr.life';

export function getContracts(provider: ethers.Provider) {
  return {
    computeRegistry: new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, ComputeRegistryAbi, provider),
    escrowVault: new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, EscrowVaultAbi, provider),
    orderBook: new ethers.Contract(BOTCHAIN_CONTRACTS.orderBook, OrderBookAbi, provider),
    reputation: new ethers.Contract(BOTCHAIN_CONTRACTS.reputation, ReputationAbi, provider),
    paymentChannel: new ethers.Contract(BOTCHAIN_CONTRACTS.paymentChannel, PaymentChannelAbi, provider),
  };
}

export async function getSignerFromWeb3AuthWallet(wallet: any): Promise<ethers.Signer> {
  const walletProvider = await getEip1193Provider(wallet);
  const provider = new ethers.BrowserProvider(walletProvider, {
    name: BOTCHAIN_TESTNET.name,
    chainId: BOTCHAIN_TESTNET.id,
  });
  return provider.getSigner();
}

export function getContractsWithSigner(signer: ethers.Signer) {
  const provider = signer.provider;
  if (!provider) throw new Error('Signer has no provider');
  return {
    computeRegistry: new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, ComputeRegistryAbi, signer),
    escrowVault: new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, EscrowVaultAbi, signer),
    orderBook: new ethers.Contract(BOTCHAIN_CONTRACTS.orderBook, OrderBookAbi, signer),
    reputation: new ethers.Contract(BOTCHAIN_CONTRACTS.reputation, ReputationAbi, signer),
    paymentChannel: new ethers.Contract(BOTCHAIN_CONTRACTS.paymentChannel, PaymentChannelAbi, signer),
    read: getContracts(provider),
  };
}

export function botchainExplorerLink(address: string, type: 'address' | 'tx' = 'address') {
  return `${BOTCHAIN_EXPLORER}/${type === 'address' ? 'address' : 'tx'}/${address}`;
}

export const TASK_TYPE_COMPUTE = TASK_TYPE_BOTCHAIN.COMPUTE;
export const TASK_TYPE_STORAGE = TASK_TYPE_BOTCHAIN.STORAGE;
export const TASK_TYPE_INFERENCE = TASK_TYPE_BOTCHAIN.INFERENCE;
export const TASK_TYPE_BANDWIDTH = TASK_TYPE_BOTCHAIN.BANDWIDTH;

export { TASK_POLICY };

export function taskTypeName(flag: number): string {
  const names: string[] = [];
  if (flag & TASK_TYPE_BOTCHAIN.COMPUTE) names.push(TASK_TYPE_NAME[2]);
  if (flag & TASK_TYPE_BOTCHAIN.STORAGE) names.push(TASK_TYPE_NAME[1]);
  if (flag & TASK_TYPE_BOTCHAIN.INFERENCE) names.push(TASK_TYPE_NAME[0]);
  if (flag & TASK_TYPE_BOTCHAIN.BANDWIDTH) names.push(TASK_TYPE_NAME[3]);
  return names.join(', ') || 'none';
}

export const PROVIDER_STATUS = ['Unregistered', 'Active', 'Paused', 'Slashed'];
export const JOB_STATUS = ['Pending', 'Assigned', 'InProgress', 'ProviderDone', 'ConsumerConfirmWindow', 'Settled', 'Refunded', 'Disputed', 'DisputeConsumerWon', 'DisputeProviderWon'];
