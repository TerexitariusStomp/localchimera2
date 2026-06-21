const RPC_URL = 'http://localhost:7778/rpc';

async function main() {
  const uref = 'uref-df233ef3bab1bc3893083ab10900448fdd5c25fe00f2a2c0c45225e8c54e5e3d-007';
  
  for (const suffix of ['status', 'filled', 'quantity', 'authority', 'expiry']) {
    const qres = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'query_global_state',
        params: { 
          key: uref,
          path: [`order:1:${suffix}`],
        },
      }),
    }).then(r => r.json());
    
    if (!qres.error) {
      const val = qres.result?.stored_value?.CLValue?.parsed;
      console.log(`order:1:${suffix} =`, val, '(type:', qres.result?.stored_value?.CLValue?.cl_type?.type || 'unknown', ')');
    } else {
      console.log(`order:1:${suffix} error:`, qres.error.message);
    }
  }
  
  // Also check order:0
  console.log('\n--- order:0 ---');
  for (const suffix of ['status', 'filled', 'quantity']) {
    const qres = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'query_global_state',
        params: { 
          key: uref,
          path: [`order:0:${suffix}`],
        },
      }),
    }).then(r => r.json());
    
    if (!qres.error) {
      const val = qres.result?.stored_value?.CLValue?.parsed;
      console.log(`order:0:${suffix} =`, val);
    } else {
      console.log(`order:0:${suffix} error:`, qres.error.message);
    }
  }
}
main().catch(console.error);
