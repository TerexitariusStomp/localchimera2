import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'https://node.testnet.casper.network/rpc';
const CHAIN_NAME = 'casper-test';

const pem = readFileSync('/tmp/casper-keys/Account 1_secret_key.pem', 'utf-8');
const key = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

// Use makeCsprTransferDeploy helper
const deploy = sdk.makeCsprTransferDeploy({
  senderPublicKeyHex: key.publicKey.toHex(),
  recipientPublicKeyHex: key.publicKey.toHex(),
  transferAmount: '1000',
  paymentAmount: '100000000',
  chainName: CHAIN_NAME,
});

deploy.sign(key);

(async () => {
  try {
    const result = await client.putDeploy(deploy);
    console.log('Transfer deploy hash:', result.deployHash.toHex());
    
    // Wait for execution
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const info = await client.getDeploy(result.deployHash.toHex());
        if (info.deploy?.executionResults && info.deploy.executionResults.length > 0) {
          console.log('Transfer executed!');
          const er = info.deploy.executionResults[0];
          console.log('Result:', er.result?.ExecutionResult ? 'Success/Failure' : 'Unknown');
          return;
        }
      } catch (e) {}
    }
    console.log('Transfer did not execute in time');
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
