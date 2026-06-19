import pkg from 'casper-js-sdk';
const sdk = pkg;
const { PrivateKey, KeyAlgorithm, CLValue, Args, ExecutableDeployItem, DeployHeader, Deploy } = sdk;

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const CONSUMER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIA6Hjhvhzz4rc5cKlR3fOtI42H8E1VOqpdpe6P/Nc7qvoAcGBSuBBAAK
oUQDQgAEJ9jdXMqmAORbNuWY2Q74wmtsZ++Bvf696PpYOZepHqWCFmTFZDzW+JYO
fZf7vQid4otudHLFJBWkiazcayJz9g==
-----END EC PRIVATE KEY-----`;

const PROVIDER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBJLNm8sYi/pVIcbF2soCZTxr9wO3EGtlEtkA2X5bOQvoAcGBSuBBAAK
oUQDQgAE7jl1qDI712D51EeKgfIZ974LmOYjjwkjQ3mHFrpLpL/mbwQ7mz/zmBjf
Rm6VsWCs2wbZAkjyLfzmUUrmzvWIhQ==
-----END EC PRIVATE KEY-----`;

const CONTRACT_HASH = 'a2b36559e7da9f0a3fc10afc23eceb54022ab41649ad976c52802e37ad26700b';
const CONTRACT_PURSE = 'uref-6ec52bb818122d4c5a38609b7e4cc4e324d0e6f2350ef3216325bc3a5e23e3f1-007';

let JOBS_DICT = '';
let PENDING_DICT = '';

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function getStateRoot() {
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_get_state_root_hash', params: null })
  });
  return (await res.json()).result?.state_root_hash;
}

async function getNamedKeys() {
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'state_get_entity', params: { entity_identifier: { ContractHash: 'contract-' + CONTRACT_HASH } } })
  });
  return (await res.json()).result?.entity?.Contract?.contract?.named_keys || [];
}

async function queryDict(uref, key) {
  const stateRoot = await getStateRoot();
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'state_get_dictionary_item',
      params: { state_root_hash: stateRoot, dictionary_identifier: { URef: { seed_uref: uref, dictionary_item_key: key } } }
    })
  });
  return (await res.json()).result?.stored_value?.CLValue?.parsed;
}

async function submit(pem, entryPoint, argsMap) {
  const pk = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const args = Args.fromMap(argsMap);
  const hashObj = sdk.ContractHash.newContract(CONTRACT_HASH);
  const stored = new sdk.StoredContractByHash(hashObj, entryPoint, args);
  const session = new ExecutableDeployItem();
  session.storedContractByHash = stored;
  const payment = ExecutableDeployItem.standardPayment('10000000000');
  const header = DeployHeader.default();
  header.account = pk.publicKey;
  header.chainName = CHAIN_NAME;
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(pk);
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'account_put_deploy', params: { deploy: Deploy.toJSON(deploy) } })
  });
  const data = await res.json();
  if (data.error) return { hash: '', status: 'ERROR: ' + JSON.stringify(data.error) };
  await new Promise(r => setTimeout(r, 25000));
  const info = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_deploy', params: { deploy_hash: data.result.deploy_hash } })
  }).then(r => r.json());
  const exec = info.result?.execution_info?.execution_result?.Version2;
  return { hash: data.result.deploy_hash, status: exec?.error_message || 'SUCCESS' };
}

async function nativeTransfer(pem, amount, targetPurse) {
  const pk = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const payment = ExecutableDeployItem.standardPayment('10000000000');
  const header = DeployHeader.default();
  header.account = pk.publicKey;
  header.chainName = CHAIN_NAME;
  const item = sdk.TransferDeployItem.newTransfer(amount, sdk.URef.fromString(targetPurse));
  const session = new ExecutableDeployItem();
  session.transfer = item;
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(pk);
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'account_put_deploy', params: { deploy: Deploy.toJSON(deploy) } })
  });
  const data = await res.json();
  if (data.error) { console.log('Transfer ERROR:', data.error); return false; }
  await new Promise(r => setTimeout(r, 25000));
  const info = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_deploy', params: { deploy_hash: data.result.deploy_hash } })
  }).then(r => r.json());
  const exec = info.result?.execution_info?.execution_result?.Version2;
  console.log('Transfer:', exec?.error_message || 'SUCCESS');
  return !exec?.error_message;
}

async function queryBalance(purseUref) {
  const res = await fetch(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query_balance', params: { purse_identifier: { purse_uref: purseUref } } })
  }).then(r => r.json());
  return res.result?.balance;
}

async function main() {
  const consumerPk = PrivateKey.fromPem(CONSUMER_PEM, KeyAlgorithm.SECP256K1);
  const providerPk = PrivateKey.fromPem(PROVIDER_PEM, KeyAlgorithm.SECP256K1);
  const consumerHash = consumerPk.publicKey.accountHash().toHex();
  const providerHash = providerPk.publicKey.accountHash().toHex();
  const AMOUNT = '2500000000';

  console.log('=== FULL PIPELINE TEST ===');
  console.log('Consumer:', consumerHash);
  console.log('Provider:', providerHash);
  console.log('Contract:', CONTRACT_HASH);

  // Get dictionary URefs dynamically
  const keys = await getNamedKeys();
  for (const k of keys) {
    if (k.name === 'jobs_dict') JOBS_DICT = k.key;
    if (k.name === 'pending_jobs') PENDING_DICT = k.key;
  }
  console.log('jobs_dict:', JOBS_DICT);
  console.log('pending_jobs:', PENDING_DICT);
  console.log();

  // Step 0: Fund provider
  console.log('--- Step 0: Fund provider for gas ---');
  await nativeTransfer(CONSUMER_PEM, '15000000000', 'uref-8570fed7c444db9f0a5f29dd2deb7d132210e4a2d6009a4cdf6520d8d9432040-007');

  // Step 1: Deposit to escrow
  console.log('--- Step 1: Consumer deposits to escrow ---');
  await nativeTransfer(CONSUMER_PEM, AMOUNT, CONTRACT_PURSE);
  const beforeBalance = await queryBalance(CONTRACT_PURSE);
  console.log('Contract purse balance:', beforeBalance, 'motes');

  // Step 2: Create job
  console.log('--- Step 2: create_job ---');
  let r = await submit(CONSUMER_PEM, 'create_job', {
    consumer: CLValue.newCLByteArray(hexToBytes(consumerHash)),
    provider: CLValue.newCLByteArray(hexToBytes(providerHash)),
    amount: CLValue.newCLUInt512(AMOUNT),
    provider_fee_bps: CLValue.newCLUint64('100'),
    order_id: CLValue.newCLString('inference-job-1'),
  });
  console.log('create_job:', r.status, '| hash:', r.hash);
  if (r.status !== 'SUCCESS') return;

  // Find the latest job from pending list
  const pendingList = await queryDict(PENDING_DICT, 'list') || [];
  const ourJobs = pendingList.filter(id => id.startsWith(`job:${consumerHash}`));
  const jobId = ourJobs[ourJobs.length - 1];
  console.log('Latest job ID:', jobId);

  // Verify initial state
  let state = await queryDict(JOBS_DICT, `${jobId}:state`);
  let jobAmount = await queryDict(JOBS_DICT, `${jobId}:amount`);
  let jobProvider = await queryDict(JOBS_DICT, `${jobId}:provider`);
  let jobConsumer = await queryDict(JOBS_DICT, `${jobId}:consumer`);
  console.log('Initial state:', state, '| amount:', jobAmount);
  console.log('Consumer:', jobConsumer, '| Provider:', jobProvider);

  // Step 3: Provider ack
  console.log('\n--- Step 3: provider_ack ---');
  r = await submit(PROVIDER_PEM, 'provider_ack', { job_id: CLValue.newCLString(jobId) });
  console.log('provider_ack:', r.status, '| hash:', r.hash);
  if (r.status !== 'SUCCESS') return;
  state = await queryDict(JOBS_DICT, `${jobId}:state`);
  console.log('State after ack:', state);

  // Step 4: Provider completes (inference)
  console.log('\n--- Step 4: provider_complete (inference done) ---');
  r = await submit(PROVIDER_PEM, 'provider_complete', {
    job_id: CLValue.newCLString(jobId),
    response_hash: CLValue.newCLString('QmInferenceResultHash123'),
  });
  console.log('provider_complete:', r.status, '| hash:', r.hash);
  if (r.status !== 'SUCCESS') return;
  state = await queryDict(JOBS_DICT, `${jobId}:state`);
  let response = await queryDict(JOBS_DICT, `${jobId}:response_hash`);
  console.log('State after complete:', state, '| response_hash:', response);

  // Step 5: Consumer confirms
  console.log('\n--- Step 5: consumer_confirm ---');
  r = await submit(CONSUMER_PEM, 'consumer_confirm', {
    job_id: CLValue.newCLString(jobId),
    rating: CLValue.newCLUint64('8'),
  });
  console.log('consumer_confirm:', r.status, '| hash:', r.hash);
  if (r.status !== 'SUCCESS') return;
  state = await queryDict(JOBS_DICT, `${jobId}:state`);
  let rating = await queryDict(JOBS_DICT, `${jobId}:rating`);
  console.log('State after confirm:', state, '| rating:', rating);

  // Step 6: Provider claims payment
  console.log('\n--- Step 6: claim_payment ---');
  const providerBalanceBefore = await queryBalance('uref-8570fed7c444db9f0a5f29dd2deb7d132210e4a2d6009a4cdf6520d8d9432040-007');
  console.log('Provider balance before claim:', providerBalanceBefore, 'motes');

  r = await submit(PROVIDER_PEM, 'claim_payment', { job_id: CLValue.newCLString(jobId) });
  console.log('claim_payment:', r.status, '| hash:', r.hash);
  if (r.status !== 'SUCCESS') return;
  state = await queryDict(JOBS_DICT, `${jobId}:state`);
  console.log('State after claim:', state);

  // Final balances
  const afterBalance = await queryBalance(CONTRACT_PURSE);
  const providerBalanceAfter = await queryBalance('uref-8570fed7c444db9f0a5f29dd2deb7d132210e4a2d6009a4cdf6520d8d9432040-007');
  console.log('\n--- Final Balances ---');
  console.log('Contract purse balance after:', afterBalance, 'motes');
  console.log('Provider balance after:', providerBalanceAfter, 'motes');
  const received = Number(providerBalanceAfter) - Number(providerBalanceBefore);
  console.log('Provider received:', received, 'motes (', (received/1e9).toFixed(4), 'CSPR )');

  console.log('\n=== FULL PIPELINE COMPLETED SUCCESSFULLY ===');
  console.log('Job lifecycle: pending -> assigned -> provider_done -> consumer_confirm -> settled');
}

main().catch(console.error);
