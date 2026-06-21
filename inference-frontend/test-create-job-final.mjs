import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';
const CONTRACT_HASH = '6482d6e9634eab3258c147facc165223fdc2757113590e9c8d468486849fcbb8';

const key = sdk.PrivateKey.fromPem(readFileSync('/tmp/casper-wallet/Account 1_secret_key.pem', 'utf-8'), sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

const accountHashBytes = key.publicKey.accountHash().hashBytes;
const consumer = sdk.CLValue.newCLByteArray(accountHashBytes);
const provider = sdk.CLValue.newCLByteArray(accountHashBytes);

const args = sdk.Args.fromMap({
  consumer,
  provider,
  amount: sdk.CLValue.newCLUInt512('1000000000'),
  provider_fee_bps: sdk.CLValue.newCLUint64(100),
  order_id: sdk.CLValue.newCLString('order-3'),
});

const contractHashObj = sdk.ContractHash.newContract(CONTRACT_HASH);
const storedContract = new sdk.StoredContractByHash(contractHashObj, 'create_job', args);
const session = new sdk.ExecutableDeployItem();
session.storedContractByHash = storedContract;
const paymentItem = sdk.ExecutableDeployItem.standardPayment('10000000000');
const header = sdk.DeployHeader.default();
header.account = key.publicKey;
header.chainName = CHAIN_NAME;
const deploy = sdk.Deploy.makeDeploy(header, paymentItem, session);
deploy.sign(key);

const result = await client.putDeploy(deploy);
console.log('Deploy hash:', result.deployHash.toHex());
