export const onRequest = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const targetOrigin = 'https://browser-templeearth.pages.dev';
  const proxyPaths = ['/example', '/css', '/js', '/privacy.html', '/ecovillage-locations', '/api/rpc'];
  const shouldProxy = proxyPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Serve the new local example page from Pages static files
  if (pathname === '/example' || pathname === '/example/') {
    return next();
  }

  // Proxy JSON-RPC calls to Casper testnet for the browser node example
  if (pathname === '/api/rpc' || pathname.startsWith('/api/rpc/')) {
    const rpcUrl = 'https://node.testnet.casper.network/rpc';
    const response = await fetch(rpcUrl, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: request.body,
    });
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.delete('content-encoding');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
  }

  // Pass through any non-proxy requests to static assets
  if (!shouldProxy) {
    return next();
  }

  let targetPath = pathname;
  if (targetPath.startsWith('/example')) {
    targetPath = targetPath.replace('/example', '') || '/';
  }
  const targetUrl = targetOrigin + targetPath + url.search;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  const newHeaders = new Headers(response.headers);
  newHeaders.delete('content-encoding');
  newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
