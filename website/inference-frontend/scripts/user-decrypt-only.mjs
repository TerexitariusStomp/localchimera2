import { ethers } from 'ethers';
import { createInstance } from '@zama-fhe/relayer-sdk/node';
import { mainnet } from '@zama-fhe/sdk/chains';
import { readFileSync } from 'fs';

const CONTRACT_ADDRESS = '0x960c7D0F53431941374Dc1DB4C62294ef48f42BD';
const RPC_URL = 'https://eth.drpc.org';
const RELAYER_PROXY_URL = 'http://localhost:4000/api/relayer/1';
const JOB_ID = process.env.JOB_ID || '0xe9f23c38b8954cce7da8dd5b31c6495c202a7f9f7ae7510e5c31e3cd74f960bb';

const privateKey = process.env.PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(privateKey, provider);
const userAddress = await signer.getAddress();

console.log('Tasker address:', userAddress);
console.log('Job ID:', JOB_ID);

const instance = await createInstance({
  chainId: mainnet.id,
  network: RPC_URL,
  relayerUrl: RELAYER_PROXY_URL,
  aclContractAddress: mainnet.aclContractAddress,
  kmsContractAddress: mainnet.kmsContractAddress,
  inputVerifierContractAddress: mainnet.inputVerifierContractAddress,
  verifyingContractAddressDecryption: mainnet.verifyingContractAddressDecryption,
  verifyingContractAddressInputVerification: mainnet.verifyingContractAddressInputVerification,
  gatewayChainId: mainnet.gatewayChainId,
});

const abi = JSON.parse(readFileSync('/home/user/CascadeProjects/localchimera/website/inference-frontend/src/abis/FHEInferenceMarket.json', 'utf-8')).abi;
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
const resultHandles = await contract.getResult(JOB_ID);
console.log('Result handles:', resultHandles.length);

const keypair = instance.generateKeypair();
const startTimestamp = Math.floor(Date.now() / 1000) - 60;
const durationDays = 1;
const eip712 = instance.createEIP712(
  keypair.publicKey,
  [CONTRACT_ADDRESS],
  startTimestamp,
  durationDays
);
const signature = await signer.signTypedData(
  eip712.domain,
  { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
  eip712.message
);

console.log('Starting userDecrypt at', new Date().toISOString());
const decrypted = await instance.userDecrypt(
  resultHandles.map((handle) => ({ handle, contractAddress: CONTRACT_ADDRESS })),
  keypair.privateKey,
  keypair.publicKey,
  signature,
  [CONTRACT_ADDRESS],
  userAddress,
  startTimestamp,
  durationDays
);
console.log('userDecrypt done at', new Date().toISOString());
console.log('Decrypted:', decrypted);
