const RPC_URL = 'http://localhost:7778/rpc';

async function main() {
  const uref = 'uref-df233ef3bab1bc3893083ab10900448fdd5c25fe00f2a2c0c45225e8c54e5e3d-007';
  
  for (const key of ['order:0:status', 'order:1:status', 'list']) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'state_get_dictionary_item',
        params: {
          dictionary_identifier: {
            URef: { seed_uref: uref, dictionary_item_key: key },
          },
        },
      }),
    }).then(r => r.json());
    
    if (!res.error) {
      console.log(`${key} =`, res.result?.stored_value?.CLValue?.parsed, 'type:', JSON.stringify(res.result?.stored_value?.CLValue?.cl_type));
    } else {
      console.log(`${key} error:`, res.error.message);
    }
  }
}
main().catch(console.error);
