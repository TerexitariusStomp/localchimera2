import { RocketXClient, ROCKETX_QUOTE_PARAMS } from '../../lib/rocketx.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { targetNetwork, amount, slippage, excludedExchanges } = body || {};
  if (!targetNetwork || !amount) {
    return new Response(JSON.stringify({ error: 'Missing targetNetwork or amount' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const qp = ROCKETX_QUOTE_PARAMS[targetNetwork];
  if (!qp) {
    return new Response(JSON.stringify({ error: 'Unsupported targetNetwork' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const client = RocketXClient.fromEnv(env);
  try {
    const quote = await client.getQuotation({
      fromNetwork: 'Casper',
      toNetwork: qp.toNetwork,
      toToken: qp.toToken,
      amount,
      slippage: slippage || '1',
      excludedExchanges: excludedExchanges || '',
    });
    return new Response(JSON.stringify({ ok: true, quote }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
