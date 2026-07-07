const ORIGIN = 'https://ai-app-builder-etb.pages.dev';

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const search = url.search;
  const targetUrl = `${ORIGIN}${path}${search}`;

  const init = {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  };

  const response = await fetch(targetUrl, init);
  const newHeaders = new Headers(response.headers);
  newHeaders.delete('content-encoding');
  newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  newHeaders.set('Pragma', 'no-cache');
  newHeaders.set('Expires', '0');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
