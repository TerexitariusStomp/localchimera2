import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';
const ESCROW = '6482d6e9634eab3258c147facc165223fdc2757113590e9c8d468486849fcbb8';

const key = sdk.PrivateKey.fromPem(readFileSync('/tmp/casper-wallet/Account 1_secret_key.pem', 'utf-8'), sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

const accountHashBytes = key.publicKey.accountHash().hashBytes;

async function send(contractHash, entryPoint, argsMap, payment = '10000000000') {
  const args = sdk.Args.fromMap(argsMap);
  const contractHashObj = sdk.ContractHash.newContract(contractHash);
  const storedContract = new sdk.StoredContractByHash(contractHashObj, entryPoint, args);
  const session = new sdk.ExecutableDeployItem();
  session.storedContractByHash = storedContract;
  const paymentItem = sdk.ExecutableDeployItem.standardPayment(payment);
  const header = sdk.DeployHeader.default();
  header.account = key.publicKey;
  header.chainName = CHAIN_NAME;
  const deploy = sdk.Deploy.makeDeploy(header, paymentItem, session);
  deploy.sign(key);
  const result = await client.putDeploy(deploy);
  return result.deployHash.toHex();
}

// 1. Create job
console.log('1. Creating escrow job...');
const jobHash = await send(ESCROW, 'create_job', {
  consumer: sdk.CLValue.newCLByteArray(accountHashBytes),
  provider: sdk.CLValue.newCLByteArray(accountHashBytes),
  amount: sdk.CLValue.newCLUInt512('1000000000'),
  provider_fee_bps: sdk.CLValue.newCLUint64(100),
  order_id: sdk.CLValue.newCLString('order:2'),
});
console.log('   Job deploy:', jobHash);

await new Promise(r => setTimeout(r, 60000));

// 2. Provider ack
const jobId = `job:${key.publicKey.accountHash().toPrefixedString().replace('account-hash-', '')}:0`;
console.log('2. Provider ack job:', jobId);
const ackHash = await send(ESCROW, 'provider_ack', { job_id: sdk.CLValue.newCLString(jobId) });
console.log('   Ack deploy:', ackHash);

await new Promise(r => setTimeout(r, 60000));

// 3. Provider complete
console.log('3. Provider complete...');
const completeHash = await send(ESCROW, 'provider_complete', {
  job_id: sdk.CLValue.newCLString(jobId),
  response_hash: sdk.CLValue.newCLString('inference-result-hash-abc123'),
});
console.log('   Complete deploy:', completeHash);

await new Promise(r => setTimeout(r, 60000));

// 4. Consumer confirm
console.log('4. Consumer confirm...');
const confirmHash = await send(ESCROW, 'consumer_confirm', {
  job_id: sdk.CLValue.newCLString(jobId),
  rating: sdk.CLValue.newCLUint64(8),
});
console.log('   Confirm deploy:', confirmHash);

await new Promise(r => setTimeout(r, 60000));

// 5. Claim payment
console.log('5. Claim payment...');
const claimHash = await send(ESCROW, 'claim_payment', { job_id: sdk.CLValue.newCLString(jobId) });
console.log('   Claim deploy:', claimHash);

console.log('\n=== Full flow complete ===');
console.log('Job ID:', jobId);
