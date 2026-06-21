import sdk from 'casper-js-sdk';
import { readFileSync } from 'fs';

const RPC_URL = 'https://node.testnet.casper.network/rpc';
const CHAIN_NAME = 'casper-test';

const pem = readFileSync('/tmp/casper-keys/Account 1_secret_key.pem', 'utf-8');
const key = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

// Build transfer as Transaction using NativeTransferBuilder
const txBuilder = new sdk.NativeTransferBuilder()
  .from(key.publicKey)
  .amount('1000')
  .target(key.publicKey)
  .id(1)
  .chainName(CHAIN_NAME)
  .payment('100000000');

// Try buildFor1_5 which returns Transaction
const tx = txBuilder.buildFor1_5();
console.log('Transaction type:', tx.constructor.name);
console.log('Transaction keys:', Object.keys(tx));

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
          console.log('Result:', info.transaction.executionInfo);
          return;
        }
      } catch (e) {}
    }
    console.log('Transaction did not execute in time');
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  }
})();
