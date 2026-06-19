import pkg from 'casper-js-sdk';
const sdk = pkg;
const { PrivateKey, KeyAlgorithm, CLValue, Args, ContractHash, StoredContractByHash, ExecutableDeployItem, DeployHeader, Deploy } = sdk;

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const PROVIDER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEINi3dWcuJ2gZF+jxpCFZfvyJGLzV7KreMuo6i1dJxxtnoAcGBSuBBAAK
oUQDQgAE7QhfBq07dq3SY0fH3vO8d6rEg2wXg5p2Q2pNGOifCgA0W6DUGxJxB5F+
4wPNfB6b74Wj/WqGueeiw3pP+uRPdQ==
-----END EC PRIVATE KEY-----`;

const CONSUMER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIA6Hjhvhzz4rc5cKlR3fOtI42H8E1VOqpdpe6P/Nc7qvoAcGBSuBBAAK
oUQDQgAEJ9jdXMqmAORbNuWY2Q74wmtsZ++Bvf696PpYOZepHqWCFmTFZDzW+JYO
fZf7vQid4otudHLFJBWkiazcayJz9g==
-----END EC PRIVATE KEY-----`;

const CONTRACT_HASH = 'b3f8b9643cc190448139525491b3196df072e30c703610261336bb97202b5e27';
const JOB_ID = 'job:e39ac4daa9a8fe88d9f074cecfd537d18eb0fbf1196c1b4dd85749bcc50723e9:0';

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  return res.json();
}

function buildDeploy(publicKey, contractHash, entryPoint, argsMap, payment = '10000000000') {
  const args = Args.fromMap(argsMap);
  const contractHashObj = ContractHash.newContract(contractHash);
  const storedContract = new StoredContractByHash(contractHashObj, entryPoint, args);
  const session = new ExecutableDeployItem();
  session.storedContractByHash = storedContract;
  const paymentItem = ExecutableDeployItem.standardPayment(payment);
  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;
  return Deploy.makeDeploy(header, paymentItem, session);
}

async function sendDeploy(pem, entryPoint, argsMap) {
  const key = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const publicKey = key.publicKey;
  const deploy = buildDeploy(publicKey, CONTRACT_HASH, entryPoint, argsMap);
  deploy.sign(key);
  const deployJSON = Deploy.toJSON(deploy);
  const res = await rpcCall('account_put_deploy', { deploy: deployJSON });
  return res;
}

async function main() {
  console.log('Step 1: provider_complete...');
  const responseHash = '32542dba32a44f37b69eb410cc675fab4e032a0683741a692e82d673920fea60';
  const r1 = await sendDeploy(PROVIDER_PEM, 'provider_complete', {
    job_id: CLValue.newCLString(JOB_ID),
    response_hash: CLValue.newCLString(responseHash),
  });
  console.log('provider_complete:', JSON.stringify(r1, null, 2));

  if (r1.error) {
    console.error('provider_complete failed, aborting');
    return;
  }

  console.log('Waiting 20s for provider_complete to execute...');
  await new Promise(r => setTimeout(r, 20000));

  console.log('Step 2: consumer_confirm...');
  const r2 = await sendDeploy(CONSUMER_PEM, 'consumer_confirm', {
    job_id: CLValue.newCLString(JOB_ID),
    rating: CLValue.newCLUint64('5'),
  });
  console.log('consumer_confirm:', JSON.stringify(r2, null, 2));

  if (r2.error) {
    console.error('consumer_confirm failed, aborting');
    return;
  }

  console.log('Waiting 20s for consumer_confirm to execute...');
  await new Promise(r => setTimeout(r, 20000));

  console.log('Step 3: claim_payment...');
  const r3 = await sendDeploy(PROVIDER_PEM, 'claim_payment', {
    job_id: CLValue.newCLString(JOB_ID),
  });
  console.log('claim_payment:', JSON.stringify(r3, null, 2));
}

main().catch(console.error);
