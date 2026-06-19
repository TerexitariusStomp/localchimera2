import pkg from 'casper-js-sdk';
const sdk = pkg;
const { PrivateKey, KeyAlgorithm, ExecutableDeployItem, DeployHeader, Deploy } = sdk;

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const CONSUMER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIA6Hjhvhzz4rc5cKlR3fOtI42H8E1VOqpdpe6P/Nc7qvoAcGBSuBBAAK
oUQDQgAEJ9jdXMqmAORbNuWY2Q74wmtsZ++Bvf696PpYOZepHqWCFmTFZDzW+JYO
fZf7vQid4otudHLFJBWkiazcayJz9g==
-----END EC PRIVATE KEY-----`;

const PROVIDER_PURSE = 'uref-8570fed7c444db9f0a5f29dd2deb7d132210e4a2d6009a4cdf6520d8d9432040-007';

async function main() {
  const privateKey = PrivateKey.fromPem(CONSUMER_PEM, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;

  const payment = ExecutableDeployItem.standardPayment('10000000000');
  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;

  const transferDeployItem = sdk.TransferDeployItem.newTransfer(
    '15000000000',
    sdk.URef.fromString(PROVIDER_PURSE)
  );
  const session = new ExecutableDeployItem();
  session.transfer = transferDeployItem;

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
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
