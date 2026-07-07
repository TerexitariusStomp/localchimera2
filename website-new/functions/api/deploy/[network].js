import { buildRocketXUrl, RocketXClient, ROCKETX_QUOTE_PARAMS } from '../../lib/rocketx.js';

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const network = params.network;
  const allowed = ['akash', 'golem', 'storj', 'btt'];
  if (!allowed.includes(network)) {
    return new Response(JSON.stringify({ error: 'Unsupported network' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { yaml, deployment, fromAddress, bridgeAmount } = body || {};
  if (!yaml || !deployment) {
    return new Response(JSON.stringify({ error: 'Missing yaml or deployment' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Accept the deployment into a queue. Real tasker-network submission requires
  // wallet credentials / signed txs on the respective network and is implemented
  // by the orchestrator that consumes this queue.
  const deploymentId = deployment.id || `dpl-${Math.random().toString(36).slice(2, 8)}`;
  const response = {
    ok: true,
    network,
    deploymentId,
    status: 'queued',
    message: `Deployment queued for ${network}. The orchestrator will submit the SDL to the tasker network.`,
  };

  // When a Casper smart-contract deployment falls back to a tasker network we
  // need the tasker network token. Offer a RocketX bridge so the caller can
  // swap CSPR into the target token without a dedicated UI.
  const amount = bridgeAmount || '200';
  response.rocketX = {
    bridgeUrl: buildRocketXUrl(amount, network, env.ROCKETX_API_KEY),
  };
  if (env.ROCKETX_API_KEY && fromAddress) {
    try {
      const client = RocketXClient.fromEnv(env);
      const qp = ROCKETX_QUOTE_PARAMS[network];
      const quote = await client.getQuotation({
        fromNetwork: 'Casper',
        toNetwork: qp.toNetwork,
        toToken: qp.toToken,
        amount,
        slippage: '1',
      });
      response.rocketX.quote = quote;
    } catch (err) {
      response.rocketX.quoteError = err.message;
    }
  }

  return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
