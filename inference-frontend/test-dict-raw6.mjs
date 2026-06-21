const RPC_URL = 'http://localhost:7778/rpc';

async function main() {
  // Try query_global_state with dictionary key (no uref- prefix)
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'query_global_state',
      params: {
        key: 'dictionary-b06584e6b0ad3bf7866374024eb9b5513a9f1bf83f90e410a4bf599cd7aea437',
        path: ['list'],
      },
    }),
  }).then(r => r.json());
  console.log('query_global_state dictionary response:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
