import pkg from 'casper-js-sdk';
const sdk = pkg;
const { PrivateKey, KeyAlgorithm, CLValue, Args, DeployHeader, ExecutableDeployItem, Deploy } = sdk;

const RPC_URL = 'http://localhost:7778/rpc';
const CHAIN_NAME = 'casper-test';

const PEM = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIA6Hjhvhzz4rc5cKlR3fOtI42H8E1VOqpdpe6P/Nc7qvoAcGBSuBBAAK
oUQDQgAEJ9jdXMqmAORbNuWY2Q74wmtsZ++Bvf696PpYOZepHqWCFmTFZDzW+JYO
fZf7vQid4otudHLFJBWkiazcayJz9g==
-----END EC PRIVATE KEY-----`;

const CONTRACT_HASH = '91b76e645851ae323063d38bcb23351a9bc89e46825f7e9a1df3adff4cdee833';

function hexToBytes(hex) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

const { URef } = sdk;

async function main() {
  const privateKey = PrivateKey.fromPem(PEM, KeyAlgorithm.SECP256K1);
  const publicKey = privateKey.publicKey;
  const accountHashHex = publicKey.accountHash().toHex();
  
  console.log('Account hash:', accountHashHex);
  console.log('Contract hash:', CONTRACT_HASH);
  
  const CONTRACT_PURSE = 'uref-56a8e55765ee82e21f9f8454d5e39968f7866ba135c526af06b15bb86c93a48f-007';

  const argsMap = {
    consumer: CLValue.newCLByteArray(hexToBytes(accountHashHex)),
    provider: CLValue.newCLByteArray(hexToBytes('f227d4fb7c50164d363c5461ad0044ef8f3b8ad5ee7072b87384e101a2a4263d')),
    amount: CLValue.newCLUInt512('1000'),
    provider_fee_bps: CLValue.newCLUint64('100'),
    order_id: CLValue.newCLString('test-job-5'),
    contract_purse: CLValue.newCLUref(URef.fromString(CONTRACT_PURSE)),
    contract_hash: CLValue.newCLByteArray(hexToBytes(CONTRACT_HASH)),
  };
  
  const args = Args.fromMap(argsMap);
  const contractHashObj = sdk.ContractHash.newContract(CONTRACT_HASH);
  const storedContract = new sdk.StoredContractByHash(contractHashObj, 'create_job', args);
  const session = new ExecutableDeployItem();
  session.storedContractByHash = storedContract;
  const payment = ExecutableDeployItem.standardPayment('10000000000');
  const header = DeployHeader.default();
  header.account = publicKey;
  header.chainName = CHAIN_NAME;
  const deploy = Deploy.makeDeploy(header, payment, session);
  deploy.sign(privateKey);
  
  const deployResult = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'account_put_deploy',
      params: { deploy: Deploy.toJSON(deploy) }
    })
  });
  const deployData = await deployResult.json();
  console.log('Deploy result:', JSON.stringify(deployData, null, 2));
}

main().catch(console.error);
