const sdk = require('casper-js-sdk');
const fs = require('fs');

const RPC_URLS = [
  'https://node.mainnet.casper.network/rpc',
  'https://casper-mainnet.gateway.tatum.io',
];
const CHAIN_NAME = 'casper';
const PROTOCOL_MULTISIG_PUBKEY = '02038cc8406b93afa9404b47c836b7c83ce0a4e669c611b2712f3ba7fa9b79bb6f3a';
const NAMESILO_PROXY = 'https://e82fa512.new-localchimera.pages.dev/api/namesilo';

async function rpcCall(method, params, urlIdx = 0) {
  const res = await fetch(RPC_URLS[urlIdx], {
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
  const balRes = await rpcCall('query_balance', { purse_identifier: { main_purse_under_account_hash: accountHash } });
  const balance = balRes.result?.balance || '0';
  console.log('Balance:', (Number(balance) / 1e9).toFixed(4), 'CSPR');

  // Find cheapest domain
  const tlds = ['xyz', 'site', 'online', 'store', 'tech', 'cloud', 'app', 'dev'];
  const allDomains = tlds.map(t => `chimera2.${t}`);
  console.log('\nSearching for:', allDomains.join(', '));

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
  console.log('Payment:', amountCSPR, 'CSPR =', amountMotes, 'motes');

  // Build transfer deploy with gas_price=1 and longer TTL
  console.log('\nTransferring to multisig:', PROTOCOL_MULTISIG_PUBKEY);

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
  console.log('Gas price:', deployJSON.header.gas_price);
  console.log('TTL:', deployJSON.header.ttl);

  // Submit to both RPC nodes
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      const putRes = await rpcCall('account_put_deploy', { deploy: deployJSON }, i);
      if (putRes.error) {
        console.log(`Node ${i} submit error:`, putRes.error.message);
      } else {
        console.log(`Node ${i} submitted! Hash:`, putRes.result?.deploy_hash || deployHash);
      }
    } catch (e) {
      console.log(`Node ${i} error:`, e.message);
    }
  }

  // Wait for confirmation (up to 10 min)
  console.log('\nWaiting for confirmation...');
  let confirmed = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    for (let j = 0; j < RPC_URLS.length; j++) {
      const infoRes = await rpcCall('info_get_deploy', { deploy_hash: deployHash }, j);
      const execResults = infoRes.result?.execution_results || [];
      if (execResults.length > 0) {
        const result = execResults[0].result;
        if (result.Success) {
          console.log(`Deploy confirmed on node ${j}! Success`);
          confirmed = true;
          break;
        } else {
          console.log('Deploy failed:', JSON.stringify(result));
          return;
        }
      }
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
