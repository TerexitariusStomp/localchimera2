import { ok, badRequest, serverError } from '../../lib/respond.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { requestId, resourceType, quantity, payerAddress, amount, currency, txHash, imageTag, domain } = body;

    if (!requestId || !resourceType || !quantity || !payerAddress || !amount || !currency) {
      return badRequest('requestId, resourceType, quantity, payerAddress, amount, currency are required');
    }

    const order = {
      id: crypto.randomUUID(),
      requestId,
      resourceType,
      quantity: Number(quantity),
      payerAddress,
      amount,
      currency,
      txHash: txHash || null,
      imageTag: imageTag || null,
      domain: domain || null,
      status: 'pending_conversion',
      createdAt: new Date().toISOString(),
    };

    // Store in KV for now; later this will trigger the token conversion + provisioning worker.
    const key = `order:${order.id}`;
    await context.env?.DOMAIN_KV?.put(key, JSON.stringify(order));

    return ok({ order });
  } catch (e) {
    return serverError(`order resource error: ${e.message || String(e)}`);
  }
}
