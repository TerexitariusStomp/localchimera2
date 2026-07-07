import { ok, badRequest, serverError } from '../../lib/respond.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const payerAddress = url.searchParams.get('payerAddress');
    if (!payerAddress) return badRequest('payerAddress is required');

    const kv = context.env?.DOMAIN_KV;
    if (!kv) return ok({ orders: [] });

    const list = await kv.list({ prefix: 'order:' });
    const orders = [];
    for (const key of list.keys) {
      const value = await kv.get(key.name);
      if (value) {
        const order = JSON.parse(value);
        if (order.payerAddress?.toLowerCase() === payerAddress.toLowerCase()) {
          orders.push(order);
        }
      }
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return ok({ orders });
  } catch (e) {
    return serverError(`list orders error: ${e.message || String(e)}`);
  }
}
