import { importSPKI, exportJWK } from 'jose';

export async function onRequest(context) {
  const publicKeyPem = context.env?.WEB3AUTH_JWT_PUBLIC_KEY;
  if (!publicKeyPem) {
    return new Response(JSON.stringify({ error: 'Web3Auth JWT public key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    const jwk = await exportJWK(publicKey);
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'web3auth-jwt-key-1' }] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to convert public key to JWK', details: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
