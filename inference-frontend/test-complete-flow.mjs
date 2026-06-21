import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';
const ORDER_BOOK_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';
const ESCROW_HASH = '6482d6e9634eab3258c147facc165223fdc2757113590e9c8d468486849fcbb8';

const key = sdk.PrivateKey.fromPem(readFileSync('/tmp/casper-wallet/Account 1_secret_key.pem', 'utf-8'), sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

function accountHashToBytes(hashStr) {
  const bytes = new Uint8Array(32);
  const hex = hashStr.replace('account-hash-', '');
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

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

const accountHash = key.publicKey.accountHash().toPrefixedString();
const accountHashBytes = key.publicKey.accountHash().hashBytes;

console.log('Account hash:', accountHash);

// 1. Fill the order
console.log('\n1. Filling order:1...');
const fillHash = await send(ORDER_BOOK_HASH, 'fill_order', {
  order_id: sdk.CLValue.newCLString('order:1'),
  fill_quantity: sdk.CLValue.newCLUInt512('1'),
});
console.log('   Fill deploy:', fillHash);

// Wait for fill to execute
await new Promise(r => setTimeout(r, 60000));

// 2. Create escrow job
console.log('\n2. Creating escrow job...');
const jobHash = await send(ESCROW_HASH, 'create_job', {
  consumer: sdk.CLValue.newCLByteArray(accountHashBytes),
  provider: sdk.CLValue.newCLByteArray(accountHashBytes),
  amount: sdk.CLValue.newCLUInt512('1000000000'),
  provider_fee_bps: sdk.CLValue.newCLUint64(100),
  order_id: sdk.CLValue.newCLString('order:1'),
});
console.log('   Job deploy:', jobHash);

// Wait for job creation
await new Promise(r => setTimeout(r, 60000));

// 3. Provider ack
const jobId = `job:${accountHash.replace('account-hash-', '')}:0`;
console.log('\n3. Provider ack job:', jobId);
const ackHash = await send(ESCROW_HASH, 'provider_ack', {
  job_id: sdk.CLValue.newCLString(jobId),
});
console.log('   Ack deploy:', ackHash);

// Wait
await new Promise(r => setTimeout(r, 60000));

// 4. Provider complete
console.log('\n4. Provider complete job...');
const completeHash = await send(ESCROW_HASH, 'provider_complete', {
  job_id: sdk.CLValue.newCLString(jobId),
  response_hash: sdk.CLValue.newCLString('inference-result-hash-abc123'),
});
console.log('   Complete deploy:', completeHash);

// Wait
await new Promise(r => setTimeout(r, 60000));

// 5. Consumer confirm
console.log('\n5. Consumer confirm...');
const confirmHash = await send(ESCROW_HASH, 'consumer_confirm', {
  job_id: sdk.CLValue.newCLString(jobId),
  rating: sdk.CLValue.newCLUint64(8),
});
console.log('   Confirm deploy:', confirmHash);

// Wait
await new Promise(r => setTimeout(r, 60000));

// 6. Claim payment
console.log('\n6. Claim payment...');
const claimHash = await send(ESCROW_HASH, 'claim_payment', {
  job_id: sdk.CLValue.newCLString(jobId),
});
console.log('   Claim deploy:', claimHash);

console.log('\n=== Full flow complete ===');
