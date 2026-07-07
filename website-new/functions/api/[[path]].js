const ORIGIN = 'https://ai-app-builder-etb.pages.dev';

export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const search = url.search;
  const targetUrl = `${ORIGIN}/apps${path}${search}`;

  const init = {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  };

  const response = await fetch(targetUrl, init);
  const newHeaders = new Headers(response.headers);
  newHeaders.delete('content-encoding');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
