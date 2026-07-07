import { Web3Auth } from '@web3auth/modal';
import { Web3Auth as Web3AuthSFA } from '@web3auth/single-factor-auth';
import { Auth } from '@web3auth/auth';
import { Web3AuthMPCCoreKit } from '@web3auth/mpc-core-kit';
import { tssLib } from '@toruslabs/tss-dkls-lib';
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { keccak_256 } from '@noble/hashes/sha3.js';

const BOTCHAIN_TESTNET = {
  id: 968,
  name: 'Botchain Testnet',
  rpcUrls: { default: { http: ['https://rpc.bohr.life'] } },
  nativeCurrency: { name: 'Botchain BOT', symbol: 'BOT', decimals: 18 },
  blockExplorers: { default: { name: 'Botchain Explorer', url: 'https://scan.bohr.life' } },
};

const CHAIN_HEX = '0x' + BOTCHAIN_TESTNET.id.toString(16);

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: CHAIN_HEX,
  rpcTarget: BOTCHAIN_TESTNET.rpcUrls.default.http[0],
  displayName: BOTCHAIN_TESTNET.name,
  blockExplorerUrl: BOTCHAIN_TESTNET.blockExplorers?.default?.url || '',
  ticker: BOTCHAIN_TESTNET.nativeCurrency.symbol,
  tickerName: BOTCHAIN_TESTNET.nativeCurrency.name,
  decimals: BOTCHAIN_TESTNET.nativeCurrency.decimals,
};

const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

const DEFAULT_CLIENT_ID = 'YOUR_WEB3AUTH_CLIENT_ID';

export interface Web3AuthConfig {
  clientId?: string;
  appName?: string;
  appUrl?: string;
}

export interface Web3AuthCoreKitConfig {
  clientId?: string;
  verifier: string;
  verifierId: string;
  idToken: string;
}

export interface Web3AuthSocialConfig {
  clientId?: string;
  origin?: string;
  originData?: Record<string, string>;
  authConnection?: string;
  redirectUrl?: string;
}

export interface Web3AuthMpcConfig {
  clientId?: string;
  verifier: string;
  verifierId: string;
  idToken: string;
  baseUrl?: string;
}

export interface Web3AuthWallet {
  provider: any;
  address: string;
  user: any;
}

function publicKeyToEthAddress(pubKey: Uint8Array): string {
  const key = pubKey.slice(1); // remove 0x04 prefix for uncompressed key
  const hash = keccak_256(key);
  const addressBytes = hash.slice(-20);
  return '0x' + Array.from(addressBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a configured Web3Auth modal instance for Botchain testnet.
 * The caller is responsible for calling `initModal()` and `connect()`.
 */
export function createWeb3Auth(config: Web3AuthConfig = {}): Web3Auth {
  return new Web3Auth({
    clientId: config.clientId || DEFAULT_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    chainConfig,
    privateKeyProvider,
    uiConfig: {
      appName: config.appName || 'Chimera Browser Node',
      appUrl: config.appUrl || 'https://new.localchimera.com',
      mode: 'dark',
      theme: { primary: '#00e5ff' },
    },
  });
}

/**
 * Connect Web3Auth and return the EVM provider + address.
 * This is a convenience helper for apps that do not need a React context.
 */
export async function connectWeb3Auth(config: Web3AuthConfig = {}): Promise<Web3AuthWallet> {
  const web3auth = createWeb3Auth(config);
  await web3auth.initModal();
  const provider = await web3auth.connect();
  if (!provider) throw new Error('Web3Auth connection was cancelled');
  const accounts = await provider.request({ method: 'eth_accounts' });
  const address = accounts?.[0] || '';
  const user = await web3auth.getUserInfo().catch(() => null);
  return { provider, address, user };
}

export function createWeb3AuthCoreKit(config: Web3AuthConfig = {}): Web3AuthSFA {
  return new Web3AuthSFA({
    clientId: config.clientId || DEFAULT_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    privateKeyProvider,
  });
}

export async function connectWeb3AuthCoreKit(config: Web3AuthCoreKitConfig): Promise<Web3AuthWallet> {
  const sfa = createWeb3AuthCoreKit(config);
  await sfa.init();
  const provider = await sfa.connect({
    verifier: config.verifier,
    verifierId: config.verifierId,
    idToken: config.idToken,
  });
  if (!provider) throw new Error('Web3Auth Core Kit connection failed');
  const accounts = await provider.request({ method: 'eth_accounts' });
  const address = accounts?.[0] || '';
  const user = await sfa.getUserInfo().catch(() => null);
  return { provider, address, user };
}

export async function connectWeb3AuthSocial(config: Web3AuthSocialConfig = {}): Promise<Web3AuthWallet> {
  const clientId = config.clientId || DEFAULT_CLIENT_ID;
  const origin = config.origin || (typeof window !== 'undefined' ? window.location.origin : 'https://new.localchimera.com');
  const redirectUrl = config.redirectUrl || `${origin}/`;

  const auth = new Auth({
    clientId,
    network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    redirectUrl,
    originData: config.originData,
    uxMode: 'popup',
  });

  await auth.init();

  const result = await auth.login({
    authConnection: config.authConnection || 'google',
  });

  if (!result?.privKey) throw new Error('Web3Auth social login failed');

  const provider = new EthereumPrivateKeyProvider({ config: { chainConfig } });
  await provider.setupProvider(result.privKey);

  const accounts = await provider.request({ method: 'eth_accounts' });
  const address = accounts?.[0] || '';
  const user = await auth.getUserInfo().catch(() => null);
  return { provider, address, user };
}

export async function connectWeb3AuthMpc(config: Web3AuthMpcConfig): Promise<Web3AuthWallet> {
  if (typeof window === 'undefined') throw new Error('MPC Core Kit requires a browser environment');
  const baseUrl = config.baseUrl || `${window.location.origin}/serviceworker`;
  const coreKit = new Web3AuthMPCCoreKit({
    web3AuthClientId: config.clientId || DEFAULT_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    tssLib,
    storage: window.localStorage,
    baseUrl,
    uxMode: 'popup',
  });
  await coreKit.init();
  await coreKit.loginWithJWT({
    verifier: config.verifier,
    verifierId: config.verifierId,
    idToken: config.idToken,
  });
  const pubKey = coreKit.getPubKey();
  const address = publicKeyToEthAddress(pubKey);
  const user = coreKit.getUserInfo();
  return { provider: null, address, user };
}

export { Web3Auth } from '@web3auth/modal';
export { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/base';
export { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
