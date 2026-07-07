import { getPublicKey, sign } from '@noble/secp256k1/index.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexToBytes(hex) {
  const cleaned = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64ToBytes(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function findSecretBytes(clientId, clientSecret) {
  const candidates = [];
  if (/^[0-9a-fA-F]+$/.test(clientSecret) && clientSecret.length >= 64) {
    candidates.push(hexToBytes(clientSecret.padStart(64, '0')));
  }
  try { candidates.push(base64ToBytes(clientSecret)); } catch (e) {}
  try {
    const decoded = base64ToBytes(clientSecret);
    candidates.push(hexToBytes(decoded.reduce((h, b) => h + b.toString(16).padStart(2, '0'), '')));
  } catch (e) {}

  for (const bytes of candidates) {
    try {
      const publicKey = getPublicKey(bytes, true);
      if (base64urlEncode(publicKey) === clientId) return bytes;
    } catch (e) {}
  }
  return null;
}

export async function onRequest(context) {
  const clientId = context.env?.VITE_WEB3AUTH_CLIENT_ID;
  const clientSecret = context.env?.WEB3AUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Web3Auth credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(context.request.url);
  const origin = searchParams.get('origin') || context.request.headers.get('Origin') || 'https://new.localchimera.com';

  const secretBuf = findSecretBytes(clientId, clientSecret);
  if (!secretBuf) {
    const isHex = /^[0-9a-fA-F]+$/.test(clientSecret);
    const isBase64 = /^[A-Za-z0-9+/=_-]+$/.test(clientSecret) && clientSecret.length % 4 === 0;
    const hasJwtDots = (clientSecret.match(/\./g) || []).length === 2;
    return new Response(JSON.stringify({
      error: 'Client secret does not match client ID',
      debug: {
        clientIdLength: clientId.length,
        secretLength: clientSecret.length,
        isHex,
        isBase64,
        hasJwtDots,
      },
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const originHash = keccak_256(new TextEncoder().encode(origin));
  const signature = sign(originHash, secretBuf);
  const finalSig = base64urlEncode(signature.toCompactRawBytes());

  return new Response(JSON.stringify({ originData: { [origin]: finalSig } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
