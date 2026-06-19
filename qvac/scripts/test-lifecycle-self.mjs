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

const CONTRACT_HASH = '0a8ec17ba7e8e2992b2d726675cc0c91850a9fac28667b288a34e7cee4239e5d';
const CONTRACT_PURSE = 'uref-33418da0d442412e7513ee1660493282efdb47a3fd95a5ec7420ef7b5b18654f-007';

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function callEntryPoint(pem, entryPoint, argsMap) {
  const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;

  const args = Args.fromMap(argsMap);
  const contractHashObj = sdk.ContractHash.newContract(CONTRACT_HASH);
  const storedContract = new sdk.StoredContractByHash(contractHashObj, entryPoint, args);
  const session = new ExecutableDeployItem();
  session.storedContractByHash = storedContract;
  const payment = ExecutableDeployItem.standardPayment('10000000000');
  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(privateKey);

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'account_put_deploy',
      params: { deploy: Deploy.toJSON(deploy) }
    })
  });
  const data = await res.json();
  if (data.error) {
    console.error(`${entryPoint} submit failed:`, data.error);
    return null;
  }
  console.log(`${entryPoint} deploy hash:`, data.result.deploy_hash);

  await new Promise(r => setTimeout(r, 25000));

  const infoRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'info_get_deploy',
      params: { deploy_hash: data.result.deploy_hash }
    })
  });
  const info = await infoRes.json();
  const exec = info.result?.execution_info?.execution_result?.Version2;
  const status = exec?.error_message || 'SUCCESS';
  console.log(`${entryPoint} execution:`, status);
  return status;
}

async function main() {
  const privateKey = PrivateKey.fromPem(CONSUMER_PEM, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;
  const accountHashHex = publicKey.accountHash().toHex();

  console.log('=== Testing job lifecycle (self-provider) ===');
  console.log('Account hash:', accountHashHex);

  // Step 0: Transfer to contract purse
  const transferPayment = ExecutableDeployItem.standardPayment('10000000000');
  const transferHeader = DeployHeader.default();
  transferHeader.account = publicKey;
  transferHeader.chainName = CHAIN_NAME;
  const transferDeployItem = sdk.TransferDeployItem.newTransfer(
    '2500000000',
    sdk.URef.fromString(CONTRACT_PURSE)
  );
  const transferSession = new ExecutableDeployItem();
  transferSession.transfer = transferDeployItem;
  const transferDeploy = Deploy.makeDeploy(transferHeader, transferPayment, transferSession);
  transferDeploy.sign(privateKey);

  const transferRes = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'account_put_deploy',
      params: { deploy: Deploy.toJSON(transferDeploy) }
    })
  });
  const transferData = await transferRes.json();
  console.log('Transfer result:', transferData.error ? 'ERROR: ' + JSON.stringify(transferData.error) : 'submitted');
  await new Promise(r => setTimeout(r, 25000));

  // Step 1: create_job
  let status = await callEntryPoint(CONSUMER_PEM, 'create_job', {
    consumer: CLValue.newCLByteArray(hexToBytes(accountHashHex)),
    provider: CLValue.newCLByteArray(hexToBytes(accountHashHex)),
    amount: CLValue.newCLUInt512('2500000000'),
    provider_fee_bps: CLValue.newCLUint64('100'),
    order_id: CLValue.newCLString('test-job-self'),
  });
  if (status !== 'SUCCESS') return;

  const jobId = `job:${accountHashHex}:0`;
  console.log('Job ID:', jobId);

  // Step 2: provider_ack (self)
  status = await callEntryPoint(CONSUMER_PEM, 'provider_ack', {
    job_id: CLValue.newCLString(jobId),
  });
  if (status !== 'SUCCESS') return;

  // Step 3: provider_complete (self)
  status = await callEntryPoint(CONSUMER_PEM, 'provider_complete', {
    job_id: CLValue.newCLString(jobId),
    response_hash: CLValue.newCLString('response-hash-123'),
  });
  if (status !== 'SUCCESS') return;

  // Step 4: consumer_confirm (self)
  status = await callEntryPoint(CONSUMER_PEM, 'consumer_confirm', {
    job_id: CLValue.newCLString(jobId),
    rating: CLValue.newCLUint64('5'),
  });
  if (status !== 'SUCCESS') return;

  // Step 5: claim_payment (self)
  status = await callEntryPoint(CONSUMER_PEM, 'claim_payment', {
    job_id: CLValue.newCLString(jobId),
  });
  if (status !== 'SUCCESS') return;

  console.log('=== Full lifecycle completed successfully ===');
}

main().catch(console.error);
