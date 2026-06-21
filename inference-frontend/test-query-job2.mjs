const RPC_URL = 'http://localhost:7778/rpc';
const CONTRACT_HASH = 'a0b1506606317e11e4d8544cde243f8fcda2078c3f9340605665ccb998536ea2';

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
  return res.result?.stored_value?.CLValue?.parsed;
}

async function main() {
  const keys = await getContractNamedKeys(CONTRACT_HASH);
  const jobsUref = keys['jobs_dict'];
  const pendingUref = keys['pending_jobs'];
  console.log('jobs_dict uref:', jobsUref);
  console.log('pending_jobs uref:', pendingUref);
  if (pendingUref) {
    const pendingList = await queryDictionary(pendingUref, 'list');
    console.log('Pending jobs:', pendingList);
    if (pendingList && pendingList.length > 0) {
      for (const jobId of pendingList) {
        const consumer = await queryDictionary(jobsUref, `${jobId}:consumer`);
        const provider = await queryDictionary(jobsUref, `${jobId}:provider`);
        const amount = await queryDictionary(jobsUref, `${jobId}:amount`);
        const state = await queryDictionary(jobsUref, `${jobId}:state`);
        const validUntil = await queryDictionary(jobsUref, `${jobId}:valid_until`);
        console.log(`Job ${jobId}: consumer=${consumer}, provider=${provider}, amount=${amount}, state=${state}, valid_until=${validUntil}`);
      }
    }
  }
}
main().catch(console.error);
