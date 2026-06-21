const RPC_URL = 'http://localhost:7778/rpc';
const CONTRACT_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

async function main() {
  // Get contract named keys
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
  
  const ordersUref = map['orders_dict'];
  console.log('orders_dict:', ordersUref);
  
  // Use query_global_state directly
  if (ordersUref) {
    for (const suffix of ['status', 'filled', 'quantity', 'authority', 'expiry']) {
      const qres = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'query_global_state',
          params: { key: ordersUref, path: [`order:1:${suffix}`] },
        }),
      }).then(r => r.json());
      
      if (!qres.error) {
        console.log(`order:1:${suffix} =`, qres.result?.stored_value?.CLValue?.parsed);
      } else {
        console.log(`order:1:${suffix} error:`, qres.error.message);
      }
    }
  }
}
main().catch(console.error);
