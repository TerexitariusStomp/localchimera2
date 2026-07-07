import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { Button, Input, Card, Badge } from './ui';
import { Wallet, RefreshCw, Cpu, HardDrive, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import { useWeb3Auth } from '../web3auth';
import {
  BOTCHAIN_TESTNET,
  BOTCHAIN_CONTRACTS,
  getContracts,
  getContractsWithSigner,
  getSignerFromWeb3AuthWallet,
  switchToBotchain,
  botchainExplorerLink,
  TASK_TYPE_INFERENCE,
  TASK_TYPE_COMPUTE,
  PROVIDER_STATUS,
  JOB_STATUS,
} from '../botchain';
import type { TxRecord } from '../types';

export default function BotchainTab({ onTx }: { onTx: (tx: TxRecord) => void }) {
  const { user, isAuthenticated, connect, provider } = useWeb3Auth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [balance, setBalance] = useState<string>('0');
  const [chainId, setChainId] = useState<number | null>(null);
  const evmWallet = provider;

  // Provider registration state
  const [peerId, setPeerId] = useState('bot-provider-1');
  const [providerName, setProviderName] = useState('Botchain Provider');
  const [taskType, setTaskType] = useState<string>(String(TASK_TYPE_INFERENCE));
  const [stakeAmount, setStakeAmount] = useState('1');
  const [minStake, setMinStake] = useState<string>('0');
  const [providerAddress, setProviderAddress] = useState<string>('');
  const [providerStatus, setProviderStatus] = useState<number | null>(null);

  // Job state
  const [jobAddress, setJobAddress] = useState('');
  const [jobId, setJobId] = useState('');
  const [jobState, setJobState] = useState<number | null>(null);

  const refreshReadState = useCallback(async () => {
    if (!evmWallet) return;
    try {
      const provider = new ethers.BrowserProvider(evmWallet as any, {
        name: BOTCHAIN_TESTNET.name,
        chainId: BOTCHAIN_TESTNET.id,
      });
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      const address = await (await provider.getSigner()).getAddress();
      const bal = await provider.getBalance(address);
      setBalance(ethers.formatEther(bal));

      const read = getContracts(provider);
      const ms = await read.computeRegistry.minimumStake();
      setMinStake(ethers.formatEther(ms));

      if (address) {
        const pAddr = await read.computeRegistry.authorityToProvider(address);
        setProviderAddress(pAddr);
        if (pAddr && pAddr !== ethers.ZeroAddress) {
          const status = await read.computeRegistry.getProviderStatus(pAddr);
          setProviderStatus(Number(status));
        } else {
          setProviderStatus(null);
        }
      }
    } catch (err: any) {
      console.error('[botchain] read state error:', err);
    }
  }, [evmWallet]);

  useEffect(() => {
    refreshReadState();
  }, [refreshReadState]);

  const handleLogin = async () => {
    setError('');
    try {
      await connect();
    } catch (err: any) {
      setError(err.message || 'Web3Auth login failed');
    }
  };

  const handleSwitchNetwork = async () => {
    if (!evmWallet) { setError('Connect wallet first'); return; }
    setLoading(true); setError('');
    try {
      await switchToBotchain(evmWallet);
      await refreshReadState();
    } catch (err: any) {
      setError(err.message || 'Network switch failed');
    } finally {
      setLoading(false);
    }
  };

  const recordTx = (id: string, status: 'success' | 'error', entryPoint: string, contract: string, errorMsg?: string) => {
    onTx({ id, deployHash: id, entryPoint, contract, status, error: errorMsg });
  };

  const registerProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evmWallet) { setError('Connect Web3Auth wallet first'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await switchToBotchain(evmWallet);
      const signer = await getSignerFromWeb3AuthWallet(evmWallet);
      const contracts = getContractsWithSigner(signer);
      const signerAddress = await signer.getAddress();
      const stakeWei = ethers.parseEther(stakeAmount);
      const peerHash = ethers.encodeBytes32String(peerId.slice(0, 31));
      const tier = { modelId: 'default', pricePerRequest: ethers.parseEther('0.001'), minTPS: 1, maxContextTokens: 4096 };
      const tx = await contracts.computeRegistry.registerProvider(
        peerHash,
        providerName,
        Number(taskType),
        [tier],
        stakeWei,
        { value: stakeWei }
      );
      const receipt = await tx.wait();
      const pAddr = await contracts.read.computeRegistry.authorityToProvider(signerAddress);
      setProviderAddress(pAddr);
      setSuccess(`Provider registered at ${pAddr}`);
      recordTx(receipt?.hash || tx.hash, 'success', 'registerProvider', 'ComputeRegistry');
      await refreshReadState();
    } catch (err: any) {
      setError(err.message || 'Provider registration failed');
      recordTx(Date.now().toString(), 'error', 'registerProvider', 'ComputeRegistry', err.message);
    } finally {
      setLoading(false);
    }
  };

  const createJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evmWallet) { setError('Connect Web3Auth wallet first'); return; }
    if (!providerAddress || providerAddress === ethers.ZeroAddress) { setError('Register a provider first'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await switchToBotchain(evmWallet);
      const signer = await getSignerFromWeb3AuthWallet(evmWallet);
      const contracts = getContractsWithSigner(signer);
      const amount = ethers.parseEther('0.1');
      const validUntil = Math.floor(Date.now() / 1000) + 3600;
      const tx = await contracts.escrowVault.createJob(
        providerAddress,
        ethers.encodeBytes32String('request-1'),
        1,
        TASK_TYPE_INFERENCE,
        validUntil,
        '0x',
        amount,
        ethers.ZeroAddress,
        { value: amount }
      );
      const receipt = await tx.wait();
      const signerAddress = await signer.getAddress();
      const jobAddr = await contracts.escrowVault.consumerJobs(signerAddress, 0);
      setJobAddress(jobAddr);
      const jId = await contracts.escrowVault.jobs(jobAddr).then((j: any) => j.jobId);
      setJobId(jId);
      setSuccess(`Job created at ${jobAddr}`);
      recordTx(receipt?.hash || tx.hash, 'success', 'createJob', 'EscrowVault');
      await refreshReadState();
    } catch (err: any) {
      setError(err.message || 'Job creation failed');
      recordTx(Date.now().toString(), 'error', 'createJob', 'EscrowVault', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadJob = async () => {
    if (!evmWallet || !jobAddress) return;
    setLoading(true); setError('');
    try {
      const provider = new ethers.BrowserProvider(evmWallet.provider as any, {
        name: BOTCHAIN_TESTNET.name,
        chainId: BOTCHAIN_TESTNET.id,
      });
      const read = getContracts(provider);
      const job = await read.escrowVault.jobs(jobAddress);
      setJobState(Number(job.state));
      setJobId(job.jobId);
      setSuccess(`Job state: ${JOB_STATUS[Number(job.state)] || job.state}`);
    } catch (err: any) {
      setError(err.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Botchain Testnet</h2>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-4">
            Connect your EVM wallet via Web3Auth to interact with the Botchain testnet marketplace contracts.
          </div>
          <Button onClick={handleLogin} className="w-full"><Wallet className="h-4 w-4 mr-2" />Connect with Web3Auth</Button>
        </Card>
      </div>
    );
  }

  const isWrongChain = chainId !== null && chainId !== BOTCHAIN_TESTNET.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Botchain Testnet</h2>
        <Badge variant={isWrongChain ? 'error' : 'success'}>{isWrongChain ? `Chain ${chainId}` : BOTCHAIN_TESTNET.name}</Badge>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" />Wallet</h3>
          <button onClick={refreshReadState} className="text-xs text-[#00e5ff] hover:underline flex items-center gap-1"><RefreshCw className="h-3 w-3" />Refresh</button>
        </div>
        {evmWallet ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Address: <span className="font-mono text-[#e8e2d8]">{evmWallet.address}</span></div>
            <div>Balance: <span className="font-mono text-[#e8e2d8]">{balance} BOT</span></div>
            <div>Minimum Stake: <span className="font-mono text-[#e8e2d8]">{minStake} BOT</span></div>
            {isWrongChain && (
              <div className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Switch to Botchain Testnet (chain {BOTCHAIN_TESTNET.id}).
                <button onClick={handleSwitchNetwork} className="underline text-[#00e5ff] ml-1">Switch</button>
              </div>
            )}
            <a href={botchainExplorerLink(evmWallet.address)} target="_blank" rel="noopener noreferrer" className="text-[#00e5ff] hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />View on BOTScan</a>
          </div>
        ) : (
          <div className="text-sm text-amber-400">Web3Auth connected but no EVM account found. <button onClick={handleLogin} className="underline text-[#00e5ff]">Connect wallet</button></div>
        )}
      </Card>

      {error && <div className="text-sm text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-lg">{error}</div>}
      {success && <div className="text-sm text-green-400 bg-green-500/5 border border-green-500/10 p-3 rounded-lg flex items-center gap-2"><CheckCircle className="h-4 w-4" />{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Cpu className="h-4 w-4" />Register Provider</h3>
          <form onSubmit={registerProvider} className="space-y-3">
            <Input label="Name" value={providerName} onChange={setProviderName} />
            <Input label="Peer ID" value={peerId} onChange={setPeerId} />
            <Input label="Stake (BOT)" value={stakeAmount} onChange={setStakeAmount} type="number" />
            <div>
              <label className="text-sm font-medium">Task Type</label>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-[#e8e2d8]">
                <option value={TASK_TYPE_INFERENCE}>Inference</option>
                <option value={TASK_TYPE_COMPUTE}>Compute</option>
              </select>
            </div>
            <Button type="submit" disabled={!evmWallet || loading || isWrongChain} className="w-full">
              {loading ? 'Registering...' : 'Register Provider'}
            </Button>
          </form>
          {providerAddress && providerAddress !== ethers.ZeroAddress && (
            <div className="mt-3 text-xs text-muted-foreground">
              Provider address: <span className="font-mono text-[#e8e2d8]">{providerAddress}</span>
              {providerStatus !== null && <span className="ml-2">({PROVIDER_STATUS[providerStatus] || providerStatus})</span>}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><HardDrive className="h-4 w-4" />Create Inference Job</h3>
          <form onSubmit={createJob} className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Creates a 0.1 BOT escrow job against the registered provider. Request hash is auto-generated.
            </div>
            <Button type="submit" disabled={!evmWallet || loading || isWrongChain || !providerAddress || providerAddress === ethers.ZeroAddress} className="w-full">
              {loading ? 'Creating...' : 'Create Job'}
            </Button>
          </form>
          {jobAddress && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>Job address: <span className="font-mono text-[#e8e2d8]">{jobAddress}</span></div>
              <div>Job ID: <span className="font-mono text-[#e8e2d8]">{jobId}</span></div>
              {jobState !== null && <div>State: <span className="font-mono text-[#e8e2d8]">{JOB_STATUS[jobState] || jobState}</span></div>}
              <button onClick={loadJob} className="text-[#00e5ff] hover:underline">Load state</button>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Deployed Contracts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
          {Object.entries(BOTCHAIN_CONTRACTS).map(([name, addr]) => (
            <a key={name} href={botchainExplorerLink(addr)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#00e5ff]">
              <span className="capitalize w-28">{name}:</span>
              <span className="font-mono text-[#e8e2d8]">{addr.slice(0, 10)}...{addr.slice(-6)}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
