import sdk from 'casper-js-sdk';

const RPC_URL = 'http://localhost:7778/rpc';
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));

async function main() {
  const stateRootHash = await client.getStateRootHashLatest();
  console.log('stateRootHash:', stateRootHash.toHex());
  
  const dictId = sdk.ParamDictionaryIdentifierURef.fromURef(
    sdk.URef.fromFormattedStr('uref-b06584e6b0ad3bf7866374024eb9b5513a9f1bf83f90e410a4bf599cd7aea437-007'),
    'list'
  );
  
  const res = await client.getDictionaryItemByIdentifier(stateRootHash, dictId);
  console.log('Dictionary result:', res);
  console.log('Parsed:', res?.dictionaryValue?.parsed);
}
main().catch(console.error);
