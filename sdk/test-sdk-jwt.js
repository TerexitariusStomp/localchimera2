/**
 * End-to-end test for the SDK's JWT fetching helper.
 *
 * Generates EVM and Solana wallets, signs the expected message, and uses the
 * SDK's exported fetchWalletJwt to obtain a valid JWT from the backend.
 */

import { Wallet } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519.js';
import bs58 from 'bs58';

const API_BASE = process.env.API_BASE || 'https://162f2483.new-localchimera.pages.dev/api';
process.env.API_BASE = API_BASE;

const { fetchWalletJwt } = await import('./dist/web3auth-helpers.js');

async function testEvmJwt() {
  const wallet = Wallet.createRandom();
  const walletAddress = wallet.address;
  const message = `Sign in to LocalChimera with ${walletAddress} at ${new Date().toISOString()}`;
  const signature = await wallet.signMessage(message);

  const { jwt, sub } = await fetchWalletJwt({ walletAddress, message, signature, chain: 'evm' });
  if (!jwt) throw new Error('No JWT returned for EVM');
  if (sub.toLowerCase() !== walletAddress.toLowerCase()) throw new Error(`EVM sub mismatch: ${sub}`);
  console.log('SDK EVM JWT issued:', jwt.slice(0, 20) + '...');
  return { jwt, sub };
}

async function testSolanaJwt() {
  const privKey = ed25519.utils.randomSecretKey();
  const pubKey = ed25519.getPublicKey(privKey);
  const walletAddress = bs58.encode(pubKey);
  const message = `Sign in to LocalChimera with ${walletAddress} at ${new Date().toISOString()}`;
  const encoded = new TextEncoder().encode(message);
  const signed = ed25519.sign(encoded, privKey);
  const signature = Buffer.from(signed).toString('base64');

  const { jwt, sub } = await fetchWalletJwt({ walletAddress, message, signature, chain: 'solana' });
  if (!jwt) throw new Error('No JWT returned for Solana');
  if (sub !== walletAddress) throw new Error(`Solana sub mismatch: ${sub}`);
  console.log('SDK Solana JWT issued:', jwt.slice(0, 20) + '...');
  return { jwt, sub };
}

async function main() {
  console.log('Testing SDK JWT helper against:', API_BASE);
  await testEvmJwt();
  await testSolanaJwt();
  console.log('All SDK JWT helper tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
