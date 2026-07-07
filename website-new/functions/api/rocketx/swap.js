import { RocketXClient } from '../../lib/rocketx.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { fromTokenId, toTokenId, userAddress, destinationAddress, amount, slippage, fee, exchangeId, rateId, referrerAddress } = body || {};
  if (!fromTokenId || !toTokenId || !userAddress || !amount) {
    return new Response(JSON.stringify({ error: 'Missing fromTokenId, toTokenId, userAddress, or amount' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const client = RocketXClient.fromEnv(env);
  try {
    const swap = await client.buildSwap({
      fromTokenId,
      toTokenId,
      userAddress,
      destinationAddress,
      amount,
      slippage: slippage || 1,
      fee: fee || 0.6,
      disableEstimate: true,
      exchangeId,
      rateId,
      referrerAddress,
    });
    return new Response(JSON.stringify({ ok: true, swap }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
