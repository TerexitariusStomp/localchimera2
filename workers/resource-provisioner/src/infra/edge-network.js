import fetch from 'node-fetch';

const API_KEY = process.env.EDGE_NETWORK_API_KEY;
const API_URL = process.env.EDGE_NETWORK_API_URL || 'https://api.edge.network';

async function edgeFetch(endpoint, options = {}) {
  if (!API_KEY) {
    throw new Error('EDGE_NETWORK_API_KEY is not configured');
  }
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Edge Network API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function pushToCDN({ cid, path, contentType }) {
  // Edge Network API: publish content to a CDN path.
  const result = await edgeFetch('/cdn/publish', {
    method: 'POST',
    body: JSON.stringify({ cid, path, contentType }),
  });
  return {
    success: true,
    url: result.url || `https://cdn.edge.network/${path}`,
    cid,
    path,
  };
}

export async function purgeCache(path) {
  await edgeFetch('/cdn/purge', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return { success: true };
}
