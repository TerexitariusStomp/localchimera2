/**
 * Web3Auth helper functions used by the SDK and available as standalone exports.
 *
 * These helpers do not depend on React or wallet UI adapters, so they can be
 * imported in lightweight browser/Node.js tests and scripts.
 */

async function getConnectWeb3AuthMpc() {
  const { connectWeb3AuthMpc } = await import('@localchimera/browser-sdk');
  return connectWeb3AuthMpc;
}

const API_BASE = (() => {
  if (typeof import.meta !== 'undefined' && (import.meta.env?.API_BASE || import.meta.env?.VITE_API_BASE)) {
    return import.meta.env.API_BASE || import.meta.env.VITE_API_BASE;
  }
  if (typeof process !== 'undefined' && (process.env?.API_BASE || process.env?.VITE_API_BASE)) {
    return process.env.API_BASE || process.env.VITE_API_BASE;
  }
  if (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    return '/api';
  }
  return 'http://localhost:3002/api';
})();

export async function fetchWeb3AuthConfig() {
  try {
    const res = await fetch(`${API_BASE}/web3auth-config`);
    if (res.ok) {
      const data = await res.json();
      if (data.clientId && data.clientId !== 'YOUR_WEB3AUTH_CLIENT_ID') {
        return { clientId: data.clientId, verifier: data.verifier };
      }
    }
  } catch (e) {
    console.warn('[web3auth-helpers] could not load Web3Auth config', e);
  }
  return {
    clientId: 'BFb9PwlIn0cgDq0dNSLgw9vsIVAqZ-XiUkACB5_Rktla5N6J9oJ1UeeSOILLSaAGJPYUMChG0DwP7RAzd3ZXhZA',
    verifier: 'new-localchimera',
  };
}

export async function fetchWalletJwt({ walletAddress, message, signature, chain }) {
  const res = await fetch(`${API_BASE}/web3auth-jwt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, message, signature, chain }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'JWT endpoint error');
  }
  return res.json();
}

export async function createMpcWalletFromJwt({ clientId, verifier, verifierId, idToken, baseUrl }) {
  const connectWeb3AuthMpc = await getConnectWeb3AuthMpc();
  return await connectWeb3AuthMpc({ clientId, verifier, verifierId, idToken, baseUrl });
}
