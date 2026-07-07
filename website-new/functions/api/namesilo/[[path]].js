const UPSTREAM = 'https://api.localchimera.com/api/namesilo';
const CASPER_MAINNET_RPCS = [
  'https://node.mainnet.casper.network/rpc',
  'https://casper-mainnet.gateway.tatum.io',
];
const PROTOCOL_MULTISIG_PUBKEY = '02038cc8406b93afa9404b47c836b7c83ce0a4e669c611b2712f3ba7fa9b79bb6f3a';
const PROTOCOL_MULTISIG_ACCOUNT_HASH = 'account-hash-' + PROTOCOL_MULTISIG_PUBKEY.slice(2);

async function verifyDeployOnChain(deployHash, expectedAmountCSPR) {
  if (!deployHash) return { valid: false, error: 'No deploy hash provided' };
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'info_get_deploy',
    params: { deploy_hash: deployHash },
  });
  for (const rpcUrl of CASPER_MAINNET_RPCS) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      if (data.error) continue;
      const deploy = data.result?.deploy;
      const execResults = data.result?.execution_results || [];
      if (!deploy) return { valid: false, error: 'Deploy not found' };

      // Check deploy is a transfer
      const session = deploy.session;
      if (session.Transfer) {
        // Verify target is the multisig
        const target = session.Transfer.target;
        if (target && target.AccountHash && target.AccountHash !== PROTOCOL_MULTISIG_ACCOUNT_HASH) {
          return { valid: false, error: 'Transfer target is not the protocol multisig' };
        }
        // Verify amount
        const amountMotes = session.Transfer.amount;
        const expectedMotes = Math.floor(parseFloat(expectedAmountCSPR) * 1e9).toString();
        if (amountMotes && BigInt(amountMotes) < BigInt(expectedMotes)) {
          return { valid: false, error: `Insufficient payment: ${amountMotes} < ${expectedMotes} motes` };
        }
      } else if (session.StoredVersionedContractByHash || session.StoredVersionedContractByName) {
        // Allow contract calls (escrow) as fallback
      } else {
        return { valid: false, error: 'Deploy is not a transfer or contract call' };
      }

      // Check execution result
      if (execResults.length === 0) {
        return { valid: false, error: 'Deploy not yet executed - wait for confirmation' };
      }
      const result = execResults[0].result;
      if (!result.Success) {
        return { valid: false, error: 'Deploy execution failed: ' + (result.Failure?.error_message || 'unknown') };
      }

      return { valid: true };
    } catch (e) {
      continue;
    }
  }
  return { valid: false, error: 'Could not verify deploy on any RPC node' };
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = `${UPSTREAM}${url.pathname.replace('/api/namesilo', '')}${url.search}`;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // For registerDomain POST requests, verify on-chain payment first
  if (request.method === 'POST' && url.pathname.includes('registerDomain')) {
    let reqBody;
    try {
      reqBody = await request.json();
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { deployHash, paymentMethod, paymentAmount } = reqBody;
    if (!deployHash) {
      return new Response(JSON.stringify({ success: false, error: 'Payment proof required: deployHash is missing. You must pay CSPR to the protocol multisig before registering a domain.' }), {
        status: 402, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const verification = await verifyDeployOnChain(deployHash, paymentAmount || '0');
    if (!verification.valid) {
      return new Response(JSON.stringify({ success: false, error: `Payment verification failed: ${verification.error}` }), {
        status: 402, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Payment verified - strip payment fields and forward to NameSilo
    const { deployHash: _dh, paymentMethod: _pm, paymentAmount: _pa, orderId: _oi, contact, domain, years } = reqBody;
    const forwardBody = JSON.stringify({ domain, years, contact });
    const init = {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: forwardBody,
    };

    try {
      const res = await fetch(targetUrl, init);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'NameSilo proxy returned non-JSON', raw: text.slice(0, 200) }), {
          status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const reply = data?.reply;
      if (!reply || String(reply.code) !== '300') {
        return new Response(JSON.stringify({ success: false, error: reply?.detail || 'NameSilo API error', code: reply?.code }), {
          status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response(JSON.stringify({ success: true, result: reply }), {
        status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message || 'Proxy request failed' }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  const init = {
    method: request.method,
    headers: { 'Accept': 'application/json' },
  };
  if (request.method === 'POST') {
    init.body = request.body;
    init.headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(targetUrl, init);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'NameSilo proxy returned non-JSON', raw: text.slice(0, 200) }), {
        status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const reply = data?.reply;
    if (!reply || String(reply.code) !== '300') {
      return new Response(JSON.stringify({ success: false, error: reply?.detail || 'NameSilo API error', code: reply?.code }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({ success: true, result: reply }), {
      status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message || 'Proxy request failed' }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
