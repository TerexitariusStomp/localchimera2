const RPC_URL = 'http://localhost:7778/rpc';

async function main() {
  // Try ContractNamedKey approach
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_dictionary_item',
      params: {
        dictionary_identifier: {
          ContractNamedKey: {
            contract_addr: 'contract-a0b1506606317e11e4d8544cde243f8fcda2078c3f9340605665ccb998536ea2',
            key_name: 'pending_jobs',
            dictionary_item_key: 'list',
          },
        },
      },
    }),
  }).then(r => r.json());
  console.log('ContractNamedKey response:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
