import { ethers } from 'ethers';
import { createInstance } from '@zama-fhe/relayer-sdk/node';
import { mainnet } from '@zama-fhe/sdk/chains';
import { readFileSync } from 'fs';

const CONTRACT_ADDRESS = '0x960c7D0F53431941374Dc1DB4C62294ef48f42BD';
const RPC_URL = 'https://ethereum-rpc.publicnode.com';
const RELAYER_PROXY_URL = 'http://localhost:3002/v2';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY env var');
  process.exit(1);
}

const abi = JSON.parse(readFileSync(new URL('../src/abis/FHEInferenceMarket.json', import.meta.url), 'utf-8')).abi;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const userAddress = await signer.getAddress();
  const prompt = 'h';

  console.log('Tasker address:', userAddress);
  console.log('Prompt:', prompt);

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

  const input = instance.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
  const bytes = Array.from(new TextEncoder().encode(prompt));
  for (const b of bytes) {
    input.add8(b);
  }
  const encrypted = await input.encrypt();
  const handles = encrypted.handles.map((h) => {
    if (typeof h === 'string') return h;
    return ethers.hexlify(h);
  });
  const inputProof = ethers.hexlify(encrypted.inputProof);
  console.log('Encrypted', handles.length, 'bytes');

  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

  const coprocessorAbi = ['function verifyInput(bytes32 inputHandle, address callerAddress, bytes memory inputProof, uint8 inputType) external returns (bytes32 result)'];
  const coprocessor = new ethers.Contract(mainnet.inputVerifierContractAddress, coprocessorAbi, signer);
  console.log('Direct verifyInput test for first handle...');
  try {
    const directResult = await coprocessor.verifyInput.staticCall(handles[0], userAddress, inputProof, 2);
    console.log('Direct verifyInput result:', directResult);
  } catch (err) {
    console.error('Direct verifyInput reverted:', err.shortMessage || err.message);
  }

  console.log('Simulating createJob...');
  try {
    await contract.createJob.staticCall(handles, inputProof);
  } catch (err) {
    console.error('createJob staticCall reverted:', err);
    throw err;
  }

  const createTx = await contract.createJob(handles, inputProof);
  await createTx.wait();
  console.log('createJob tx:', createTx.hash);

  const receipt = await provider.getTransactionReceipt(createTx.hash);
  const iface = contract.interface;
  let jobId = null;
  for (const log of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'JobCreated') {
        jobId = parsed.args.jobId;
      }
    } catch {}
  }
  if (!jobId) throw new Error('JobCreated event not found');
  console.log('Job ID:', jobId);

  const assignTx = await contract.assignProvider(jobId, userAddress);
  await assignTx.wait();
  console.log('assignProvider tx:', assignTx.hash);

  const processTx = await contract.processJob(jobId);
  await processTx.wait();
  console.log('processJob tx:', processTx.hash);

  const resultHandles = await contract.getResult(jobId);
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

  const decryptedMap = Array.isArray(decrypted) ? Object.fromEntries(decrypted.map(d => [d.handle, d.value])) : decrypted;
  const resultBytes = resultHandles.map((handle) => Number(decryptedMap[handle]));
  const resultString = new TextDecoder().decode(new Uint8Array(resultBytes));
  const expected = prompt.split('').map((c) => String.fromCharCode(c.charCodeAt(0) + 1)).join('');
  console.log('Decrypted result:', resultString);
  console.log('Expected result:', expected);
  console.log('Match:', resultString === expected);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
