const RPC_URL = 'http://localhost:7778/rpc';

async function main() {
  // Try AccountNamedKey approach
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'state_get_dictionary_item',
      params: {
        dictionary_identifier: {
          AccountNamedKey: {
            account_hash: 'account-hash-e39ac4daa9a8fe88d9f074cecfd537d18eb0fbf1196c1b4dd85749bcc50723e9',
            key_name: 'pending_jobs',
            dictionary_item_key: 'list',
          },
        },
      },
    }),
  }).then(r => r.json());
  console.log('AccountNamedKey response:', JSON.stringify(res, null, 2));
}
main().catch(console.error);
