import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui';
import { depositWithWallet, withdrawWithWallet, getDepositBalance, getContractNamedKeys, queryDictionary } from '../casper-client';
import { CONTRACTS } from '../casper-client';
import { BOTCHAIN_CONTRACTS, BOTCHAIN_TESTNET_RPC, getSignerFromWeb3AuthWallet, switchToBotchain } from '../botchain';
import { EscrowVaultAbi } from '../abis/EscrowVault';
import { ComputeRegistryAbi } from '../abis/ComputeRegistry';
import { CheckCircle, Server } from 'lucide-react';

const CASPER_ESCROW = CONTRACTS.escrowVault;
const BOTCHAIN_ESCROW = BOTCHAIN_CONTRACTS.escrowVault;

type WalletMode = 'casper' | 'botchain' | 'evm' | null;

export default function BillingTab({ walletMode, casperProvider, casperPublicKeyHex, botchainWallet, evmAddress }: {
  walletMode: WalletMode;
  casperProvider: any;
  casperPublicKeyHex: string;
  botchainWallet: any;
  evmAddress: string;
}) {
  const [amount, setAmount] = useState('10');
  const [method, setMethod] = useState<'casper' | 'botchain'>(walletMode === 'botchain' ? 'botchain' : 'casper');
  const [target, setTarget] = useState(method === 'casper' ? CASPER_ESCROW : BOTCHAIN_ESCROW);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ txHash: string; network: string } | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [hasNode, setHasNode] = useState(false);
  const [nodeCheckLoading, setNodeCheckLoading] = useState(false);

  const connected = walletMode === 'casper' && !!casperProvider || walletMode === 'botchain' && !!botchainWallet;
  const DISCOUNT_RATE = 0.10;
  const walletAddress = walletMode === 'casper' ? casperPublicKeyHex : evmAddress;

  useEffect(() => {
    let cancelled = false;
    if (method === 'casper' && casperPublicKeyHex) {
      getDepositBalance(CASPER_ESCROW, casperPublicKeyHex.replace(/^account-hash-/, ''))
        .then(bal => { if (!cancelled) setBalance(bal); })
        .catch(() => { if (!cancelled) setBalance(null); });
    } else if (method === 'botchain' && evmAddress) {
      const provider = new ethers.JsonRpcProvider(BOTCHAIN_TESTNET_RPC);
      const contract = new ethers.Contract(BOTCHAIN_ESCROW, EscrowVaultAbi, provider);
      contract.getBalance(evmAddress)
        .then((bal: bigint) => { if (!cancelled) setBalance(bal.toString()); })
        .catch(() => { if (!cancelled) setBalance(null); });
    } else {
      setBalance(null);
    }
    return () => { cancelled = true; };
  }, [method, casperPublicKeyHex, evmAddress, success]);

  useEffect(() => {
    let cancelled = false;
    setNodeCheckLoading(true);
    async function checkNode() {
      try {
        if (walletMode === 'botchain' && evmAddress) {
          const provider = new ethers.JsonRpcProvider(BOTCHAIN_TESTNET_RPC);
          const registry = new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, ComputeRegistryAbi, provider);
          const providerAddr = await registry.getProviderByAuthority(evmAddress);
          if (providerAddr && providerAddr !== ethers.ZeroAddress) {
            const status = await registry.getProviderStatus(providerAddr);
            if (!cancelled) setHasNode(Number(status) === 1);
          } else {
            if (!cancelled) setHasNode(false);
          }
        } else if (walletMode === 'casper' && casperPublicKeyHex) {
          const accountHash = casperPublicKeyHex.replace(/^account-hash-/, '');
          const crKeys = await getContractNamedKeys(CONTRACTS.computeRegistry);
          const statusUref = crKeys['providers_status'];
          const listUref = crKeys['providers_list'];
          if (statusUref && listUref) {
            const list = await queryDictionary(listUref, 'list');
            const providerHashes: string[] = Array.isArray(list) ? list as string[] : [];
            const match = providerHashes.some((h: string) => h === accountHash || h === casperPublicKeyHex);
            if (match) {
              const status = await queryDictionary(statusUref, accountHash);
              if (!cancelled) setHasNode(String(status) === '1');
            } else {
              if (!cancelled) setHasNode(false);
            }
          } else {
            if (!cancelled) setHasNode(false);
          }
        } else {
          if (!cancelled) setHasNode(false);
        }
      } catch {
        if (!cancelled) setHasNode(false);
      } finally {
        if (!cancelled) setNodeCheckLoading(false);
      }
    }
    checkNode();
    return () => { cancelled = true; };
  }, [walletMode, casperPublicKeyHex, evmAddress]);

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!connected) {
      setError('Connect your wallet first to add funds.');
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setLoading(true);
    try {
      if (method === 'casper') {
        if (!casperProvider || !casperPublicKeyHex) {
          setError('Casper wallet is not connected.');
          setLoading(false);
          return;
        }
        const motes = BigInt(Math.round(value * 1e9)).toString();
        const result = await depositWithWallet(casperProvider, casperPublicKeyHex, CASPER_ESCROW, motes);
        if (result.error) throw new Error(result.error);
        setSuccess({ txHash: result.deployHash, network: 'Casper Testnet' });
        await fetch('/api/billing/fund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: 'casper', amount: value, walletAddress: casperPublicKeyHex, target: CASPER_ESCROW, txHash: result.deployHash }),
        });
      } else {
        if (!botchainWallet) {
          setError('Botchain wallet is not connected.');
          setLoading(false);
          return;
        }
        await switchToBotchain(botchainWallet);
        const signer = await getSignerFromWeb3AuthWallet(botchainWallet);
        const contract = new ethers.Contract(BOTCHAIN_ESCROW, EscrowVaultAbi, signer);
        const wei = ethers.parseEther(String(value));
        const tx = await contract.deposit({ value: wei });
        await tx.wait();
        setSuccess({ txHash: tx.hash, network: 'Botchain Testnet' });
        await fetch('/api/billing/fund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: 'botchain', amount: value, walletAddress: evmAddress, target: BOTCHAIN_ESCROW, txHash: tx.hash }),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add funds');
    }
    setLoading(false);
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    if (!connected) {
      setError('Connect your wallet first to withdraw funds.');
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Enter a valid amount to withdraw.');
      return;
    }
    setLoading(true);
    try {
      if (method === 'casper') {
        const motes = BigInt(Math.round(value * 1e9)).toString();
        const result = await withdrawWithWallet(casperProvider, casperPublicKeyHex, CASPER_ESCROW, motes);
        if (result.error) throw new Error(result.error);
        setSuccess({ txHash: result.deployHash, network: 'Casper Testnet' });
      } else {
        await switchToBotchain(botchainWallet);
        const signer = await getSignerFromWeb3AuthWallet(botchainWallet);
        const contract = new ethers.Contract(BOTCHAIN_ESCROW, EscrowVaultAbi, signer);
        const wei = ethers.parseEther(String(value));
        const tx = await contract.withdraw(wei);
        await tx.wait();
        setSuccess({ txHash: tx.hash, network: 'Botchain Testnet' });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw funds');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-[720px]">
      <div className="bg-white rounded-2xl shadow-sm p-6 text-slate-800">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Billing</h2>
        <p className="text-sm text-slate-500 mb-4">
          Add funds to your personal Chimera account. These funds are tied to your connected wallet and can only be used by you to pay for your own deployments, rentals, storage, and inference workloads. No one else can access or spend them.
        </p>
        {!walletAddress && (
          <p className="text-[13px] text-amber-600 mt-3">Connect your wallet to add funds to your account.</p>
        )}
        {walletAddress && (
          <p className="text-[13px] text-slate-500 mt-3">Connected wallet: <span className="font-mono text-[11px]">{walletAddress}</span></p>
        )}
        <div className="mt-4 p-3 rounded-[10px] bg-amber-50 border border-amber-100 text-[12px] text-amber-800">
          <strong>Personal funds only.</strong> Deposits are non-transferable and can only be spent by this wallet address. The protocol uses them exclusively to pay for workloads you create.
        </div>

        {connected && !nodeCheckLoading && (
          <div className={`mt-4 p-4 rounded-[10px] border ${hasNode ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2">
              {hasNode ? (
                <><CheckCircle className="w-5 h-5 text-emerald-600" /><span className="text-[13px] font-semibold text-emerald-700">Node running — 10% discount active</span></>
              ) : (
                <><Server className="w-5 h-5 text-slate-400" /><span className="text-[13px] font-semibold text-slate-600">No active node detected</span></>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-1.5">
              {hasNode
                ? 'Your wallet has an active provider node. You receive a 10% discount on all workload costs. Funds deposited are charged at the discounted rate when paying for deployments, inference, storage, and compute.'
                : 'Run a Chimera provider node to get a 10% discount on all workload costs. Register as a provider on the Casper or Botchain ComputeRegistry to activate your discount.'}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 text-slate-800">
        <h3 className="font-semibold text-slate-800 mb-4">Add funds</h3>
        <form onSubmit={handleAddFunds} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Target</label>
            <input
              type="text"
              value={target}
              readOnly
              className="w-full px-3 py-2 rounded-[10px] border border-[#e5e5e5] text-[13px] font-mono bg-[#f5f5f7]"
            />
            {balance !== null && (
              <p className="text-[11px] text-slate-500 mt-1">
                Your deposit balance: <span className="font-mono text-slate-700">{(Number(balance) / 1e9).toFixed(4)} {method === 'casper' ? 'CSPR' : 'BOT'}</span>
              </p>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              Funds are sent to the protocol {method === 'casper' ? 'Casper' : 'Botchain'} escrow account. The protocol pulls from this account to fund compute, storage, bandwidth, and inference deployments.
            </p>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Payment method</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setMethod('casper'); setTarget(CASPER_ESCROW); }}
                className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold border ${method === 'casper' ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#e5e5e5] text-slate-700 hover:bg-[#f5f5f7]'}`}
              >
                Casper (CSPR)
              </button>
              <button
                type="button"
                onClick={() => { setMethod('botchain'); setTarget(BOTCHAIN_ESCROW); }}
                className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold border ${method === 'botchain' ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#e5e5e5] text-slate-700 hover:bg-[#f5f5f7]'}`}
              >
                Botchain (BOT)
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Amount</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border border-[#e5e5e5] text-[13px]"
            />
            <p className="text-[11px] text-slate-500 mt-1">{method === 'casper' ? 'Amount in CSPR.' : 'Amount in BOT.'}</p>
          </div>
          <div className="flex items-center justify-between text-[13px] text-slate-600 bg-[#f5f5f7] rounded-[10px] px-4 py-3">
            <span>Total to add</span>
            <span className="font-semibold text-slate-800">{amount} {method === 'casper' ? 'CSPR' : 'BOT'}</span>
          </div>
          {hasNode && (
            <div className="flex items-center justify-between text-[13px] bg-emerald-50 rounded-[10px] px-4 py-3 border border-emerald-200">
              <span className="text-emerald-700">Effective cost (10% node discount)</span>
              <span className="font-semibold text-emerald-700">{(Number(amount) * (1 - DISCOUNT_RATE)).toFixed(4)} {method === 'casper' ? 'CSPR' : 'BOT'}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={loading || !connected} className="text-[13px] h-9 px-4 bg-[#111111] text-white hover:opacity-85">
              {loading ? 'Processing...' : 'Add funds'}
            </Button>
            <Button type="button" onClick={handleWithdraw} disabled={loading || !connected} className="text-[13px] h-9 px-4 border border-[#111111] text-[#111111] hover:bg-[#f5f5f7]">
              {loading ? 'Processing...' : 'Withdraw'}
            </Button>
          </div>
        </form>
        {error && <p className="text-[13px] text-red-500 mt-4">{error}</p>}
        {success && (
          <div className="mt-4 p-4 rounded-[10px] bg-green-50 text-green-800 text-[13px]">
            <p className="font-semibold mb-2">Transaction submitted on {success.network}</p>
            <p className="font-mono text-[11px] break-all">{success.txHash}</p>
          </div>
        )}
      </div>
    </div>
  );
}
