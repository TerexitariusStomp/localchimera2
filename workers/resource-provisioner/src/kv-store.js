import fetch from 'node-fetch';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;

async function kvFetch(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`KV error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

export async function pollPendingOrders() {
  const data = await kvFetch('/keys?prefix=order:');
  const orders = [];
  for (const key of data.result || []) {
    const valueData = await kvFetch(`/values/${key.name}`);
    const value = valueData.result;
    if (value) {
      const order = JSON.parse(value);
      if (order.status === 'pending_conversion') {
        orders.push(order);
      }
    }
  }
  return orders;
}

export async function updateOrderStatus(orderId, status, meta = {}) {
  const key = `order:${orderId}`;
  const valueData = await kvFetch(`/values/${key}`);
  const order = JSON.parse(valueData.result);
  const updated = { ...order, status, ...meta, updatedAt: new Date().toISOString() };
  await kvFetch(`/values/${key}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  });
  return updated;
}
