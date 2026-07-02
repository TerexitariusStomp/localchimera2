import { ethers, type Contract } from 'ethers';
import { createInstance, type FhevmInstance } from '@zama-fhe/relayer-sdk/web';
import { sepolia } from '@zama-fhe/sdk/chains';
import FHEInferenceMarket from '../abis/FHEInferenceMarket.json';

const CONTRACT_ADDRESS = '0x9c669A55cB11C027E1b0c59682409BB0A725C1C5';
const RPC_URL = 'https://sepolia.drpc.org';
const RELAYER_PROXY_URL = '/api/relayer/11155111';

let instancePromise: Promise<FhevmInstance> | null = null;

export function getFhevmInstance(): Promise<FhevmInstance> {
  if (!instancePromise) {
    instancePromise = createInstance({
      chainId: sepolia.id,
      network: RPC_URL,
      relayerUrl: RELAYER_PROXY_URL,
      aclContractAddress: sepolia.aclContractAddress,
      kmsContractAddress: sepolia.kmsContractAddress,
      inputVerifierContractAddress: sepolia.inputVerifierContractAddress,
      verifyingContractAddressDecryption: sepolia.verifyingContractAddressDecryption,
      verifyingContractAddressInputVerification: sepolia.verifyingContractAddressInputVerification,
      gatewayChainId: sepolia.gatewayChainId,
    });
  }
  return instancePromise;
}

export function getContract(signer: ethers.Signer): Contract {
  return new ethers.Contract(CONTRACT_ADDRESS, FHEInferenceMarket.abi, signer);
}

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export async function runFhevmInference(
  signer: ethers.Signer,
  prompt: string
): Promise<{ jobId: string; decrypted: string; txHashes: string[] }> {
  const provider = signer.provider;
  if (!provider) throw new Error('Signer has no provider');
  const userAddress = await signer.getAddress();
  const instance = await getFhevmInstance();

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

  const contract = getContract(signer);
  const txHashes: string[] = [];

  const createTx = await contract.createJob(handles, inputProof);
  await createTx.wait();
  txHashes.push(createTx.hash);

  const receipt = await provider.getTransactionReceipt(createTx.hash);
  const iface = contract.interface;
  let jobId: string | null = null;
  for (const log of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'JobCreated') {
        jobId = parsed.args.jobId as string;
      }
    } catch {}
  }
  if (!jobId) throw new Error('JobCreated event not found in transaction receipt');

  const assignTx = await contract.assignProvider(jobId, userAddress);
  await assignTx.wait();
  txHashes.push(assignTx.hash);

  const processTx = await contract.processJob(jobId);
  await processTx.wait();
  txHashes.push(processTx.hash);

  const resultHandles: string[] = await contract.getResult(jobId);
  if (!resultHandles.length) throw new Error('No result handles returned');

  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000) - 60;
  const durationDays = 1;
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [CONTRACT_ADDRESS],
    startTimestamp,
    durationDays
  );
  const signature = await signer.signTypedData(eip712.domain, eip712.types, eip712.message);

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

  const values = Array.isArray(decrypted) ? decrypted : (decrypted as any).values;
  const resultBytes = values.map((v: any) => Number(v));
  const resultString = new TextDecoder().decode(new Uint8Array(resultBytes));

  return { jobId, decrypted: resultString, txHashes };
}
