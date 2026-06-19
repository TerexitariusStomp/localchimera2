import pkg from 'casper-js-sdk';
const sdk = pkg;
const { PrivateKey, KeyAlgorithm, CLValue, Args, DeployHeader, ExecutableDeployItem, Deploy } = sdk;

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const PROVIDER_PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBJLNm8sYi/pVIcbF2soCZTxr9wO3EGtlEtkA2X5bOQvoAcGBSuBBAAK
oUQDQgAE7jl1qDI712D51EeKgfIZ974LmOYjjwkjQ3mHFrpLpL/mbwQ7mz/zmBjf
Rm6VsWCs2wbZAkjyLfzmUUrmzvWIhQ==
-----END EC PRIVATE KEY-----`;

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function main() {
  const privateKey = PrivateKey.fromPem(PROVIDER_PEM, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;

  const consumer = 'e39ac4daa9a8fe88d9f074cecfd537d18eb0fbf1196c1b4dd85749bcc50723e9';
  const amount = '5000000000'; // 5 CSPR

  const wasmBytes = (await import('fs')).readFileSync('/tmp/transfer_session.wasm');
  const args = Args.fromMap({
    target: CLValue.newCLByteArray(hexToBytes(consumer)),
    amount: CLValue.newCLUInt512(amount),
  });

  const session = ExecutableDeployItem.newModuleBytes(wasmBytes, args);
  const payment = ExecutableDeployItem.standardPayment('5000000000');
  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(privateKey);

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'account_put_deploy',
      params: { deploy: Deploy.toJSON(deploy) }
    })
  });
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
