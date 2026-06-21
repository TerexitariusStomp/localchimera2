import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'https://node.testnet.casper.network/rpc';
const CHAIN_NAME = 'casper-test';

const pem = readFileSync('/tmp/casper-keys/Account 1_secret_key.pem', 'utf-8');
const key = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

// Try build() instead of buildFor1_5()
const tx = new sdk.NativeTransferBuilder()
  .from(key.publicKey)
  .target(key.publicKey)
  .amount('1000')
  .id(Date.now())
  .chainName(CHAIN_NAME)
  .payment(100_000_000)
  .build();

console.log('Transaction type:', tx.constructor.name);
console.log('originDeployV1:', !!tx.originDeployV1);
console.log('originTransactionV1:', !!tx.originTransactionV1);

tx.sign(key);

(async () => {
  try {
    console.log('Sending transaction...');
    const result = await client.putTransaction(tx);
    console.log('Transaction hash:', result.transactionHash.toHex());
    
    // Wait for execution
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const info = await client.getTransaction(result.transactionHash.toHex());
        if (info.transaction?.executionInfo) {
          console.log('Transaction executed!');
          return;
        }
      } catch (e) {}
    }
    console.log('Transaction did not execute in time');
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Code:', e.statusCode);
  }
})();
