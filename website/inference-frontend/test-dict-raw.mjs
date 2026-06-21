const RPC_URL = 'http://localhost:7778/rpc';

async function getLatestStateRootHash() {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_get_block', params: null }),
  }).then(r => r.json());
  return res.result?.block?.header?.state_root_hash || '';
}

async function main() {
  const stateRootHash = await getLatestStateRootHash();
  console.log('state_root_hash:', stateRootHash);
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_dictionary_item',
      params: {
        state_root_hash: stateRootHash,
        dictionary_identifier: {
          URef: { seed_uref: 'uref-b06584e6b0ad3bf7866374024eb9b5513a9f1bf83f90e410a4bf599cd7aea437-007', dictionary_item_key: 'list' },
        },
      },
    }),
  }).then(r => r.json());
  console.log('Full response:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
