import { useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3Auth } from '../web3auth';
import { Button, TextArea } from './ui';
import { Send, Lock } from 'lucide-react';
import { runFhevmInference } from '../fhe/fhevm';
import type { TxRecord } from '../types';

export default function FHEVMPanel({ onTx }: { onTx: (tx: TxRecord) => void }) {
  const { isAuthenticated, connect, provider: evmWallet } = useWeb3Auth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [output, setOutput] = useState('');
  const [address, setAddress] = useState('');
  const [prompt, setPrompt] = useState('');

  const connected = isAuthenticated && !!evmWallet;

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    if (!connected) {
      setError('No EVM wallet connected. Connect via Web3Auth.');
      return;
    }
    setLoading(true);
    setError('');
    setOutput('');
    setJobId('');
    setStatus('Connecting wallet...');
    try {
      const walletProvider = evmWallet as any;
      if (!walletProvider) throw new Error('Wallet provider not available');
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      setAddress(userAddress);
      setStatus('Encrypting prompt with Zama FHE and submitting on-chain...');
      const result = await runFhevmInference(signer, prompt.trim());
      setJobId(result.jobId);
      setOutput(result.decrypted);
      setStatus('Complete');
      onTx({
        id: Date.now().toString(),
        deployHash: result.txHashes[0],
        entryPoint: 'createJob',
        contract: 'FHEInferenceMarket',
        status: 'success',
        error: '',
      });
    } catch (err: any) {
      setError(err.message || 'fhEVM inference failed');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          Connect an EVM wallet via Web3Auth to run on-chain fhEVM inference on Sepolia.
        </div>
        <Button type="button" onClick={() => connect()} className="w-full">
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleRun} className="space-y-2">
      <div className="text-xs text-muted-foreground flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <Lock className="h-3 w-3 text-[#00e5ff]" />
          On-chain Zama FHE on Sepolia. Each prompt byte is encrypted; the contract runs a homomorphic +1 shift; only your wallet can decrypt the result.
        </div>
        <div className="text-rose-400">
          Costs ~3 Sepolia ETH transactions per run (createJob, assignProvider, processJob) in addition to any worker payment you set separately. Ensure your wallet is funded on Sepolia.
        </div>
      </div>
      <TextArea label="Prompt" value={prompt} onChange={setPrompt} placeholder="Enter a short prompt for fhEVM inference..." rows={3} />
      <Button type="submit" disabled={!prompt.trim() || loading || !evmWallet} className="w-full">
        <Send className="h-4 w-4 mr-1" />
        {loading ? 'Running fhEVM inference...' : 'Run fhEVM Inference'}
      </Button>
      {status && <div className="text-xs text-[#00e5ff]">{status}</div>}
      {error && <div className="text-xs text-rose-400">Error: {error}</div>}
      {address && <div className="text-[10px] text-[#7a7468] font-mono">Wallet: {address}</div>}
      {jobId && <div className="text-[10px] text-[#7a7468] font-mono">Job ID: {jobId}</div>}
      {output && (
        <div className="space-y-1">
          <div className="text-[10px] text-[#00e5ff] font-semibold">Decrypted fhEVM Result</div>
          <div className="min-h-[80px] max-h-[200px] overflow-y-auto text-xs text-[#e8e2d8] whitespace-pre-wrap break-words font-mono bg-black/30 border border-white/10 rounded-lg p-3">
            {output}
          </div>
        </div>
      )}
    </form>
  );
}
