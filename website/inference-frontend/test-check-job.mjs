const RPC_URL = 'http://localhost:7778/rpc';

async function getLatestStateRootHash() {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_get_block', params: null }),
  }).then(r => r.json());
  return res.result?.block?.header?.state_root_hash || '';
}

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

async function queryDictionary(uref, key) {
  const stateRootHash = await getLatestStateRootHash();
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_dictionary_item',
      params: {
        state_root_hash: stateRootHash,
        dictionary_identifier: {
          URef: { seed_uref: uref, dictionary_item_key: key },
        },
      },
    }),
  }).then(r => r.json());
  if (res.error) console.log('Query error for', key, ':', res.error);
  return res.result?.stored_value?.CLValue?.parsed;
}

async function main() {
  const CONTRACT_HASH = 'a0b1506606317e11e4d8544cde243f8fcda2078c3f9340605665ccb998536ea2';
  const keys = await getContractNamedKeys(CONTRACT_HASH);
  const jobsUref = keys['jobs_dict'];
  const pendingUref = keys['pending_jobs'];
  console.log('jobs_dict uref:', jobsUref);
  console.log('pending_jobs uref:', pendingUref);
  
  // Try to find the job with different possible ID formats
  const accountHash = 'account-hash-e39ac4daa9a8fe88d9f074cecfd537d18eb0fbf1196c1b4dd85749bcc50723e9';
  const formats = [
    `job:${accountHash}:0`,
    `job:${accountHash.replace('account-hash-', '')}:0`,
  ];
  
  for (const jobId of formats) {
    console.log('Trying jobId:', jobId);
    const state = await queryDictionary(jobsUref, `${jobId}:state`);
    const consumer = await queryDictionary(jobsUref, `${jobId}:consumer`);
    console.log('  state:', state, 'consumer:', consumer);
  }
  
  // Also try to list pending jobs
  const pendingList = await queryDictionary(pendingUref, 'list');
  console.log('Pending list:', pendingList);
}
main().catch(console.error);
