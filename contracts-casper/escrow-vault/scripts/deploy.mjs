import { readFileSync } from 'fs';
import pkg from 'casper-js-sdk';

const sdk = pkg;
const { PrivateKey, PublicKey, KeyAlgorithm, CLValue, Args, DeployHeader, ExecutableDeployItem, Deploy } = sdk;

const WASM_PATH = '/home/user/CascadeProjects/localchimera/contracts-casper/target/wasm32-unknown-unknown/release/escrow_vault.wasm';
const RPC_URL = 'https://node.testnet.casper.network/rpc';
const CHAIN_NAME = 'casper-test';

const CONTRACTS = {
  computeRegistry: 'bed17bda7a3597725a5d19531faae67bd2f68f08be17d02ea36a6830be2fc152',
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
  console.log('Waiting for deploy to land and named keys to be written...');

  const contractName = 'escrow_vault';
  const hashKey = `${contractName}_hash`;
  let packageHash = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const stateRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'state_get_account_info',
        params: { public_key: publicKey.toHex() },
      }),
    }).then(r => r.json());
    const namedKeys = stateRes.result?.account?.named_keys || [];
    const found = namedKeys.find(k => k.name === hashKey);
    if (found) {
      packageHash = found.key.replace('hash-', '');
      break;
    }
  }

  if (packageHash) {
    console.log('Contract package hash (use this in the frontend):', packageHash);
  } else {
    console.log('Could not retrieve contract package hash automatically. Check the account named keys for', hashKey);
  }
  console.log('');
  console.log('Update casper-client.ts escrowVault with this new package hash.');
}

deploy().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
