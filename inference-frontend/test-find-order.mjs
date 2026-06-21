const RPC_URL = 'http://localhost:7778/rpc';
const CONTRACT_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

async function main() {
  // Get named keys
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_entity',
      params: { entity_identifier: { ContractHash: 'contract-' + CONTRACT_HASH } },
    }),
  }).then(r => r.json());
  
  const keys = res.result?.entity?.Contract?.contract?.named_keys || [];
  const map = {};
  for (const k of keys) map[k.name] = k.key;
  console.log('Named keys:', Object.keys(map));
  
  const counterUref = map['order_counter'];
  console.log('order_counter uref:', counterUref);
  
  if (counterUref) {
    // Query global state for counter value
    const urefHex = counterUref.replace('uref-', '').replace(/-...$/, '');
    const qres = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'query_global_state',
        params: { key: counterUref },
      }),
    }).then(r => r.json());
    console.log('Counter value:', qres.result?.stored_value?.CLValue?.parsed);
  }
}
main().catch(console.error);
