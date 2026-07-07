const ORDERS_KEY = 'domain_orders';
const CONTACTS_KEY = 'domain_contacts';

export async function getOrders(env) {
  const data = await env.DOMAIN_KV.get(ORDERS_KEY, 'json');
  return data || {};
}

export async function saveOrder(env, order) {
  const orders = await getOrders(env);
  const id = order.id || `dom-${Date.now()}`;
  orders[id] = { ...order, id, createdAt: Date.now() };
  await env.DOMAIN_KV.put(ORDERS_KEY, JSON.stringify(orders));
  return orders[id];
}

export async function getContacts(env) {
  const data = await env.DOMAIN_KV.get(CONTACTS_KEY, 'json');
  return data || {};
}

export async function saveContact(env, id, contact) {
  const contacts = await getContacts(env);
  contacts[id] = { ...contact, id, updatedAt: Date.now() };
  await env.DOMAIN_KV.put(CONTACTS_KEY, JSON.stringify(contacts));
  return contacts[id];
}

export async function getContact(env, id) {
  const contacts = await getContacts(env);
  return contacts[id] || null;
}
