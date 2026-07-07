import { useState, useEffect } from 'react';
import { Wallet, CircleDollarSign, Server, Loader2, RefreshCw } from 'lucide-react';
import { ethers } from 'ethers';
import { Button } from './ui';
import { CONTRACTS, getDepositBalance, getAccountBalance } from '../casper-client';
import { BOTCHAIN_CONTRACTS, BOTCHAIN_TESTNET_RPC } from '../botchain';
import { ComputeRegistryAbi } from '../abis/ComputeRegistry';
import { EscrowVaultAbi } from '../abis/EscrowVault';
import * as sdk from 'casper-js-sdk';

type WalletMode = 'casper' | 'botchain' | 'evm' | null;

interface EarningsData {
  totalEarned: string;
  jobsCompleted: number;
  escrowBalance: string;
  walletBalance: string;
}

export default function ConsoleEarnings({ walletMode, casperPublicKeyHex, accountHash, evmAddress }: {
  walletMode: WalletMode;
  casperProvider: any;
  casperPublicKeyHex: string;
  accountHash: string;
  evmAddress: string;
}) {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const connected = walletMode === 'casper' && !!casperPublicKeyHex || walletMode === 'botchain' && !!evmAddress;
  const displayAddress = walletMode === 'casper' ? accountHash : evmAddress;

  useEffect(() => {
    if (connected) fetchEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletMode, casperPublicKeyHex, evmAddress, accountHash]);

  async function fetchEarnings() {
    setLoading(true);
    setError('');
    setData(null);
    try {
      if (walletMode === 'botchain' && evmAddress) {
        const provider = new ethers.JsonRpcProvider(BOTCHAIN_TESTNET_RPC);
        const registry = new ethers.Contract(BOTCHAIN_CONTRACTS.computeRegistry, ComputeRegistryAbi, provider);
        const escrow = new ethers.Contract(BOTCHAIN_CONTRACTS.escrowVault, EscrowVaultAbi, provider);

        const providerAddr = await registry.getProviderByAuthority(evmAddress);
        let totalEarned = '0';
        let jobsCompleted = 0;
        if (providerAddr && providerAddr !== ethers.ZeroAddress) {
          const providerInfo = await registry.getProvider(providerAddr);
          totalEarned = providerInfo.totalEarned?.toString() || '0';
          jobsCompleted = Number(providerInfo.jobsCompleted?.toString() || '0');
        }

        const escrowBal = await escrow.getBalance(evmAddress);
        const walletBal = await provider.getBalance(evmAddress);

        setData({
          totalEarned: (Number(totalEarned) / 1e18).toFixed(6),
          jobsCompleted,
          escrowBalance: (Number(escrowBal) / 1e18).toFixed(6),
          walletBalance: (Number(walletBal) / 1e18).toFixed(6),
        });
      } else if (walletMode === 'casper' && casperPublicKeyHex) {
        const escrowBal = await getDepositBalance(CONTRACTS.escrowVault, accountHash);

        let walletBal = '0';
        try {
          const pubKey = sdk.PublicKey.fromHex(casperPublicKeyHex);
          walletBal = await getAccountBalance(pubKey);
        } catch {}

        setData({
          totalEarned: escrowBal ? (Number(escrowBal) / 1e9).toFixed(4) : '0',
          jobsCompleted: 0,
          escrowBalance: escrowBal ? (Number(escrowBal) / 1e9).toFixed(4) : '0',
          walletBalance: walletBal,
        });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch on-chain earnings');
    } finally {
      setLoading(false);
    }
  }

  const fmt = (v: string) => {
    const n = Number(v);
    if (isNaN(n)) return v;
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <div className="max-w-[800px]">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-[#111111]">Earnings</h1>
        <p className="text-[13px] text-[#6b7280]">Your on-chain earnings and payout balance.</p>
      </div>

      {!connected && (
        <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5 max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-5 h-5 text-[#111111]" />
            <h3 className="text-[16px] font-bold text-[#111111]">Connect wallet</h3>
          </div>
          <p className="text-[13px] text-[#6b7280]">Connect your wallet to view your on-chain earnings.</p>
        </div>
      )}

      {connected && (
        <>
          <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-[#111111]" />
                <h3 className="text-[16px] font-bold text-[#111111]">Paid out earnings</h3>
              </div>
              <Button onClick={fetchEarnings} disabled={loading} variant="ghost" className="text-[#6b7280] hover:text-[#111111]">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-[14px] text-[#6b7280] py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading on-chain data…
              </div>
            )}

            {error && !loading && (
              <div className="text-[13px] text-red-500 py-4">{error}</div>
            )}

            {data && !loading && (
              <div className="space-y-4">
                <div className="bg-emerald-50 rounded-[12px] p-4">
                  <div className="text-[12px] text-[#6b7280] mb-1">Total earned (paid out on-chain)</div>
                  <div className="text-[28px] font-bold text-emerald-600">
                    {fmt(data.totalEarned)} {walletMode === 'casper' ? 'CSPR' : 'BOT'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[#f0f0f0] rounded-[10px] p-3">
                    <div className="text-[12px] text-[#6b7280] mb-1">Jobs completed</div>
                    <div className="text-[18px] font-semibold text-[#111111]">{data.jobsCompleted.toLocaleString()}</div>
                  </div>
                  <div className="border border-[#f0f0f0] rounded-[10px] p-3">
                    <div className="text-[12px] text-[#6b7280] mb-1">Escrow deposit balance</div>
                    <div className="text-[18px] font-semibold text-[#111111]">{fmt(data.escrowBalance)} {walletMode === 'casper' ? 'CSPR' : 'BOT'}</div>
                  </div>
                </div>

                <div className="border border-[#f0f0f0] rounded-[10px] p-3">
                  <div className="text-[12px] text-[#6b7280] mb-1">Wallet balance</div>
                  <div className="text-[18px] font-semibold text-[#111111]">{data.walletBalance} {walletMode === 'casper' ? 'CSPR' : 'BOT'}</div>
                </div>

                <div className="flex items-center gap-2 text-[12px] text-[#6b7280] pt-2">
                  <Server className="w-3.5 h-3.5" />
                  <span>Connected: {displayAddress ? `${displayAddress.slice(0, 10)}…${displayAddress.slice(-8)}` : '—'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-4">
            <p className="text-[12px] text-[#6b7280]">
              Earnings are retrieved directly from the {walletMode === 'casper' ? 'Casper' : 'Botchain'} blockchain.
              {walletMode === 'botchain'
                ? ' Total earned reflects provider payouts recorded by the ComputeRegistry contract.'
                : ' Deposit balance is held in the EscrowVault contract on Casper Testnet.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
