import { getOrders } from '../../lib/store.js';
import { ok, badRequest } from '../../lib/respond.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const userId = url.searchParams.get('userId');
  const orders = await getOrders(context.env);
  let list = Object.values(orders);
  if (userId) list = list.filter(o => o.userId === userId);
  list.sort((a, b) => b.createdAt - a.createdAt);
  return ok({ orders: list });
}
