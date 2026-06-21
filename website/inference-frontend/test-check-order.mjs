import sdk from 'casper-js-sdk';

const RPC_URL = 'http://localhost:7778/rpc';
const client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));
const ORDER_BOOK_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

async function getContractNamedKeys(contractHash) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_entity',
      params: { entity_identifier: { ContractHash: 'contract-' + contractHash } },
    }),
  }).then(r => r.json());
  const keys = res.result?.entity?.Contract?.contract?.named_keys || [];
  const map = {};
  for (const k of keys) map[k.name] = k.key;
  return map;
}

async function main() {
  const keys = await getContractNamedKeys(ORDER_BOOK_HASH);
  console.log('Named keys:', Object.keys(keys));
  const ordersUref = keys['orders_dict'];
  console.log('orders_dict uref:', ordersUref);
  
  if (ordersUref) {
    const stateRoot = await client.getStateRootHashLatest();
    const dictId = new sdk.ParamDictionaryIdentifierURef('order:1:status', sdk.URef.fromString(ordersUref));
    const res = await client.getDictionaryItemByIdentifier(stateRoot.stateRootHash, dictId);
    console.log('Order:1 status:', res?.dictionaryValue?.parsed);
    console.log('Type:', res?.dictionaryValue?.clValue?.clType);
    
    // Also check filled
    const dictId2 = new sdk.ParamDictionaryIdentifierURef('order:1:filled', sdk.URef.fromString(ordersUref));
    const res2 = await client.getDictionaryItemByIdentifier(stateRoot.stateRootHash, dictId2);
    console.log('Order:1 filled:', res2?.dictionaryValue?.parsed);
    
    // Check quantity
    const dictId3 = new sdk.ParamDictionaryIdentifierURef('order:1:quantity', sdk.URef.fromString(ordersUref));
    const res3 = await client.getDictionaryItemByIdentifier(stateRoot.stateRootHash, dictId3);
    console.log('Order:1 quantity:', res3?.dictionaryValue?.parsed);
  }
}
main().catch(console.error);
