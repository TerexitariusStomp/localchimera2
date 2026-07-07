const CASPER_RPC_URLS = {
  testnet: 'https://node.testnet.casper.network/rpc',
  mainnet: 'https://rpc.mainnet.casper.network/rpc',
};

async function tryRpc(urls, body) {
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (response.ok) return response;
    } catch (e) { /* try next */ }
  }
  return null;
}

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const network = url.searchParams.get('network') || env.CASPER_NETWORK || 'testnet';
  
  let response;
  if (network === 'mainnet') {
    const body = await request.text();
    response = await tryRpc([
      'https://node.mainnet.casper.network/rpc',
      'https://casper-mainnet.gateway.tatum.io',
    ], body);
  } else {
    const rpcUrl = CASPER_RPC_URLS.testnet;
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request.body,
    });
  }

  if (!response) {
    return new Response(JSON.stringify({ error: 'All RPC endpoints unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.delete('content-encoding');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
