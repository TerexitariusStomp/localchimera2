/**
 * Runtime endpoint for Web3Auth public configuration.
 *
 * The client ID is stored as a Cloudflare Pages secret (VITE_WEB3AUTH_CLIENT_ID)
 * and injected here so it never appears in the built frontend bundle.
 * The client secret (WEB3AUTH_CLIENT_SECRET) is kept server-side and is never
 * returned to the browser.
 */
export async function onRequest(context) {
  const clientId = context.env?.VITE_WEB3AUTH_CLIENT_ID;
  const verifier = context.env?.WEB3AUTH_CORE_KIT_VERIFIER;
  const googleClientId = context.env?.WEB3AUTH_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'Web3Auth client ID not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ clientId, verifier, googleClientId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
