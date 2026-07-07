const sdk = require('casper-js-sdk');
const fs = require('fs');

const VALIDATOR_RPC = 'http://135.181.72.181:7777/rpc';
const PUBLIC_RPC = 'https://node.mainnet.casper.network/rpc';
const CHAIN_NAME = 'casper';
const PROTOCOL_MULTISIG_PUBKEY = '02038cc8406b93afa9404b47c836b7c83ce0a4e669c611b2712f3ba7fa9b79bb6f3a';
const NAMESILO_PROXY = 'https://e82fa512.new-localchimera.pages.dev/api/namesilo';

async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

async function main() {
  const pem = fs.readFileSync('/tmp/casper_keys_8/Account 10_secret_key.pem', 'utf8');
  const pk = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
  const pubKeyHex = pk.publicKey.toHex();
  const accountHash = pk.publicKey.accountHash().toPrefixedString();
  console.log('Public key:', pubKeyHex);

  // Check balance
  const balRes = await rpcCall(PUBLIC_RPC, 'query_balance', { purse_identifier: { main_purse_under_account_hash: accountHash } });
  const balance = balRes.result?.balance || '0';
  console.log('Balance:', (Number(balance) / 1e9).toFixed(4), 'CSPR');

  // Find cheapest domain
  const tlds = ['xyz', 'site', 'online', 'store', 'tech', 'cloud', 'app', 'dev'];
  const allDomains = tlds.map(t => `chimera2.${t}`);
  const checkRes = await fetch(`${NAMESILO_PROXY}/checkRegisterAvailability?domains=${allDomains.join(',')}`);
  const checkData = await checkRes.json();
  if (!checkData.success) { console.error('Check failed:', checkData.error); return; }
  const avail = checkData.result?.available || [];
  const availArr = Array.isArray(avail) ? avail : [avail];
  if (availArr.length === 0) { console.error('No domains available'); return; }
  availArr.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const cheapest = availArr[0];
  console.log('Cheapest:', cheapest.domain, '- $' + cheapest.price);

  const priceUSD = parseFloat(cheapest.price);
  const amountCSPR = Math.ceil(priceUSD * 20);
  const amountMotes = String(Math.floor(amountCSPR * 1e9));
  console.log('Payment:', amountCSPR, 'CSPR');

  // Build transfer deploy
  const deploy = sdk.makeCsprTransferDeploy({
    senderPublicKeyHex: pubKeyHex,
    recipientPublicKeyHex: PROTOCOL_MULTISIG_PUBKEY,
    transferAmount: amountMotes,
    chainName: CHAIN_NAME,
    memo: Date.now(),
    gasPrice: 1,
    paymentAmount: '10000000000',
  });
  deploy.sign(pk);
  const deployJSON = sdk.Deploy.toJSON(deploy);
  const deployHash = deployJSON.hash;
  console.log('Deploy hash:', deployHash);

  // Try submitting to validator node first
  console.log('\nSubmitting to validator node:', VALIDATOR_RPC);
  try {
    const vputRes = await rpcCall(VALIDATOR_RPC, 'account_put_deploy', { deploy: deployJSON });
    if (vputRes.error) {
      console.log('Validator submit error:', vputRes.error.message);
    } else {
      console.log('Validator submitted! Hash:', vputRes.result?.deploy_hash || deployHash);
    }
  } catch (e) {
    console.log('Validator error:', e.message);
  }

  // Also submit to public node
  console.log('Submitting to public node...');
  try {
    const pputRes = await rpcCall(PUBLIC_RPC, 'account_put_deploy', { deploy: deployJSON });
    if (pputRes.error) {
      console.log('Public submit error:', pputRes.error.message);
    } else {
      console.log('Public submitted! Hash:', pputRes.result?.deploy_hash || deployHash);
    }
  } catch (e) {
    console.log('Public error:', e.message);
  }

  // Wait for confirmation - check both nodes
  console.log('\nWaiting for confirmation...');
  let confirmed = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    for (const url of [VALIDATOR_RPC, PUBLIC_RPC]) {
      try {
        const infoRes = await rpcCall(url, 'info_get_deploy', { deploy_hash: deployHash });
        const execResults = infoRes.result?.execution_results || [];
        if (execResults.length > 0) {
          const result = execResults[0].result;
          if (result.Success) {
            console.log(`Confirmed on ${url.includes('135') ? 'validator' : 'public'}! Success`);
            confirmed = true;
            break;
          } else {
            console.log('Deploy failed:', JSON.stringify(result));
            return;
          }
        }
      } catch (e) { /* try next */ }
    }
    if (confirmed) break;
    if (i % 6 === 5) console.log(`  Attempt ${i+1}/60: pending...`);
  }

  if (!confirmed) { console.error('Not confirmed after 10 min'); return; }

  // Register domain
  console.log('\nRegistering:', cheapest.domain);
  const regRes = await fetch(`${NAMESILO_PROXY}/registerDomain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain: cheapest.domain,
      years: 1,
      deployHash,
      paymentMethod: 'casper',
      paymentAmount: String(amountCSPR),
      orderId: `DOMAIN:${cheapest.domain}:${Date.now()}`,
      contact: {
        fn: 'Chimera', ln: 'Network',
        email: 'admin@localchimera.com', phone: '5555555555',
        ad: '123 Main St', city: 'San Francisco', st: 'CA',
        country: 'US', zp: '94101',
      },
    }),
  });
  const regData = await regRes.json();
  console.log('Registration:', JSON.stringify(regData, null, 2));
}

main().catch(e => console.error('Fatal:', e));
