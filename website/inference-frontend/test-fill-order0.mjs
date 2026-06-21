import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';
const ORDER_BOOK_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

const key = sdk.PrivateKey.fromPem(readFileSync('/tmp/casper-wallet/Account 1_secret_key.pem', 'utf-8'), sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

for (const orderId of ['order:0', 'order:1', 'order:2']) {
  try {
    const args = sdk.Args.fromMap({
      order_id: sdk.CLValue.newCLString(orderId),
      fill_quantity: sdk.CLValue.newCLUInt512('1'),
    });
    const contractHashObj = sdk.ContractHash.newContract(ORDER_BOOK_HASH);
    const storedContract = new sdk.StoredContractByHash(contractHashObj, 'fill_order', args);
    const session = new sdk.ExecutableDeployItem();
    session.storedContractByHash = storedContract;
    const paymentItem = sdk.ExecutableDeployItem.standardPayment('10000000000');
    const header = sdk.DeployHeader.default();
    header.account = key.publicKey;
    header.chainName = CHAIN_NAME;
    const deploy = sdk.Deploy.makeDeploy(header, paymentItem, session);
    deploy.sign(key);
    const result = await client.putDeploy(deploy);
    console.log(`Fill ${orderId} deploy hash:`, result.deployHash.toHex());
    break; // Stop after first successful submission
  } catch (err) {
    console.log(`Fill ${orderId} failed:`, err.message);
  }
}
