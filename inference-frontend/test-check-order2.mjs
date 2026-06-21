const RPC_URL = 'http://localhost:7778/rpc';
const ORDER_BOOK_HASH = 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399';

async function main() {
  // Get contract named keys
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_entity',
      params: { entity_identifier: { ContractHash: 'contract-' + ORDER_BOOK_HASH } },
    }),
  }).then(r => r.json());
  const keys = res.result?.entity?.Contract?.contract?.named_keys || [];
  const map = {};
  for (const k of keys) map[k.name] = k.key;
  console.log('Named keys:', Object.keys(map));
  
  const ordersUref = map['orders_dict'];
  console.log('orders_dict:', ordersUref);
  
  // Try query_global_state directly with dictionary key
  if (ordersUref) {
    const urefHex = ordersUref.replace('uref-', '').replace('-007', '');
    console.log('uref hex:', urefHex);
    
    // Dictionary key = dictionary-<hash(uref_bytes + key_bytes)>
    const { createHash } = await import('crypto');
    const urefBytes = Buffer.from(urefHex, 'hex');
    
    for (const suffix of ['status', 'filled', 'quantity', 'authority']) {
      const keyBytes = Buffer.from(`order:1:${suffix}`);
      const combined = Buffer.concat([urefBytes, keyBytes]);
      const hash = createHash('blake2b512').update(combined).digest().subarray(0, 32);
      const dictKey = 'dictionary-' + hash.toString('hex');
      
      const qres = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'query_global_state',
          params: { key: dictKey },
        }),
      }).then(r => r.json());
      
      if (!qres.error) {
        const parsed = qres.result?.stored_value?.CLValue?.parsed;
        console.log(`order:1:${suffix} =`, parsed);
      } else {
        console.log(`order:1:${suffix} error:`, qres.error.message);
      }
    }
  }
}
main().catch(console.error);
