import sdk from 'casper-js-sdk';

const RPC_URL = 'http://localhost:7778/rpc';
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

async function main() {
  const stateRootHash = await client.getStateRootHashLatest();
  console.log('stateRootHash:', stateRootHash.stateRootHash.toHex());
  
  const uref = sdk.URef.fromString('uref-b06584e6b0ad3bf7866374024eb9b5513a9f1bf83f90e410a4bf599cd7aea437-007');
  
  // Try queryGlobalState with dictionary key
  const key = sdk.Key.createDictionaryKey(uref, 'list');
  console.log('Dictionary key:', key.toString());
  
  const res = await client.queryGlobalState(key);
  console.log('Query result:', res);
  console.log('Parsed:', res?.storedValue?.clValue?.parsed);
}
main().catch(console.error);
