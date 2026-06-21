import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const pem = readFileSync('/tmp/casper-keys/Account 1_secret_key.pem', 'utf-8');
const key = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);

const args = sdk.Args.fromMap({
  owner: sdk.CLValue.newCLByteArray(key.publicKey.accountHash().hashBytes),
});

const session = sdk.ExecutableDeployItem.newModuleBytes(new Uint8Array([0x00, 0x61, 0x73, 0x6d]), args);
const payment = sdk.ExecutableDeployItem.standardPayment('10000000000');

const header = sdk.DeployHeader.default();
header.account = key.publicKey;
header.chainName = 'casper-test';

const deploy = sdk.Deploy.makeDeploy(header, payment, session);
deploy.sign(key);

console.log('deploy hash:', deploy.hash.toHex());

// Send via SDK's putDeploy
const client = new sdk.RpcClient(new sdk.HttpHandler('http://65.109.89.88:7777/rpc'));
const result = await client.putDeploy(deploy);
console.log('putDeploy result:', JSON.stringify(result, null, 2));
