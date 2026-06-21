import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';
const ORDER_BOOK = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

const key = sdk.PrivateKey.fromPem(readFileSync('/tmp/casper-wallet/Account 1_secret_key.pem', 'utf-8'), sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

const args = sdk.Args.fromMap({
  order_type: sdk.CLValue.newCLUint64('0'),
  price: sdk.CLValue.newCLUInt512('1000000000000000000'),
  amount: sdk.CLValue.newCLUint64('1'),
  task_type: sdk.CLValue.newCLString('phi-3-mini'),
  deadline: sdk.CLValue.newCLUint64('3600'),
});

const contractHashObj = sdk.ContractHash.newContract(ORDER_BOOK);
const storedContract = new sdk.StoredContractByHash(contractHashObj, 'place_order', args);
const session = new sdk.ExecutableDeployItem();
session.storedContractByHash = storedContract;
const paymentItem = sdk.ExecutableDeployItem.standardPayment('10000000000');
const header = sdk.DeployHeader.default();
header.account = key.publicKey;
header.chainName = CHAIN_NAME;
const deploy = sdk.Deploy.makeDeploy(header, paymentItem, session);
deploy.sign(key);

const result = await client.putDeploy(deploy);
console.log('Place order deploy hash:', result.deployHash.toHex());
