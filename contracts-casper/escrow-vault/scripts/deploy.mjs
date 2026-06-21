import { readFileSync } from 'fs';
import pkg from 'casper-js-sdk';

const sdk = pkg;
const { PrivateKey, PublicKey, KeyAlgorithm, CLValue, Args, DeployHeader, ExecutableDeployItem, Deploy } = sdk;

const WASM_PATH = '/home/user/CascadeProjects/chimera-fortytwo-node/contracts-casper/target/wasm32-unknown-unknown/release/escrow_vault.wasm';
const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const CONTRACTS = {
  computeRegistry: 'f8c969bfa7553a23deab0f77fb43210d4810156a977e0cc2695b23182e5b41d0',
  reputation: 'fd0bf02161433c13c3070b7d0ea383c976bcbc799413638b4fedc703d4efa1db',
};

function accountHashToBytes(hashStr) {
  const hex = hashStr.replace('account-hash-', '');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function deploy() {
  const pem = process.env.CASPER_PRIVATE_KEY_PEM;
  if (!pem) {
    console.error('Set CASPER_PRIVATE_KEY_PEM env var to your private key PEM string');
    process.exit(1);
  }

  const privateKey = PrivateKey.fromPem(pem, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;
  const accountHash = publicKey.accountHash().toHex();

  console.log('Deploying from account:', accountHash);

  const wasmBytes = readFileSync(WASM_PATH);
  console.log('WASM size:', wasmBytes.length, 'bytes');

  const args = Args.fromMap({
    compute_registry: CLValue.newCLByteArray(accountHashToBytes(CONTRACTS.computeRegistry)),
    reputation: CLValue.newCLByteArray(accountHashToBytes(CONTRACTS.reputation)),
    owner: CLValue.newCLByteArray(accountHashToBytes(accountHash)),
    protocol_fee_recipient: CLValue.newCLByteArray(accountHashToBytes(accountHash)),
  });

  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;
  header.timestamp = Date.now();
  header.ttl = '30m';

  const session = ExecutableDeployItem.newModuleBytes(wasmBytes, args);
  const payment = ExecutableDeployItem.standardPayment('50000000000');
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(privateKey);

  const deployJSON = Deploy.toJSON(deploy);

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'account_put_deploy', params: { deploy: deployJSON } }),
  }).then(r => r.json());

  if (res.error) {
    console.error('Deploy failed:', res.error);
    process.exit(1);
  }

  console.log('Deploy submitted! Hash:', res.result.deploy_hash);
  console.log('Contract will be at:', 'contract-' + res.result.deploy_hash);
  console.log('');
  console.log('Update frontend and bridge with this new contract hash.');
}

deploy().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
