import sdk from 'casper-js-sdk';
import { createHash } from 'crypto';

const RPC_URL = 'http://localhost:7778/rpc';

function blake2b256(data) {
  return createHash('blake2b512').update(data).digest().subarray(0, 32);
}

async function main() {
  // Dictionary key = hash(uref_bytes + dictionary_item_key_bytes)
  const urefHex = 'b06584e6b0ad3bf7866374024eb9b5513a9f1bf83f90e410a4bf599cd7aea437';
  const urefBytes = Buffer.from(urefHex, 'hex');
  const keyBytes = Buffer.from('list');
  const combined = Buffer.concat([urefBytes, keyBytes]);
  const hash = blake2b256(combined);
  const dictKey = 'dictionary-' + hash.toString('hex');
  console.log('Dictionary key:', dictKey);
  
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'query_global_state',
      params: { key: dictKey },
    }),
  }).then(r => r.json());
  console.log('Result:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
