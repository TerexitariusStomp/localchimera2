import { useState, useCallback, useEffect } from 'react';
import { CONTRACTS } from './casper-client';
import { connectWallet, disconnectWallet, isWalletInstalled } from './casper-wallet';
import { Wallet } from 'lucide-react';
import { Button } from './components/ui';
import InferenceMarketTab from './components/InferenceMarketTab';
import StorageMarketTab from './components/StorageMarketTab';
import ComputeMarketTab from './components/ComputeMarketTab';
import BandwidthMarketTab from './components/BandwidthMarketTab';
import MarketTab from './components/MarketTab';
import MachinesTab from './components/MachinesTab';
import CompletedTab from './components/CompletedTab';
import TaskerTab from './components/TaskerTab';
import ProviderTab from './components/ProviderTab';
import StorageHub from './components/StorageHub';
import type { TxRecord } from './types';

type Page = 'market' | 'machines' | 'completed' | 'tasker' | 'provider' | 'storage';

export default function App() {
  const [provider, setProvider] = useState<any>(null);
  const [publicKeyHex, setPublicKeyHex] = useState('');
  const [accountHash, setAccountHash] = useState('');
  const [walletError, setWalletError] = useState('');
  const [walletDetected, setWalletDetected] = useState(false);
  const [page, setPage] = useState<Page>('tasker');

  useEffect(() => {
    // Poll for Casper Wallet since extensions inject asynchronously
    const check = () => setWalletDetected(isWalletInstalled());
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(async () => {
    setWalletError('');
    const res = await connectWallet();
    if (res.connected && res.provider) {
      setProvider(res.provider);
      setPublicKeyHex(res.publicKey);
      const pk = (await import('casper-js-sdk')).PublicKey.fromHex(res.publicKey);
      setAccountHash(pk.accountHash().toPrefixedString());
    } else {
      setWalletError('Could not connect to Casper Wallet. Make sure the extension is installed and unlocked.');
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setProvider(null); setPublicKeyHex(''); setAccountHash(''); setWalletError('');
  }, []);

  const updateTx = useCallback((_tx: TxRecord) => {}, []);

  const isConnected = !!provider && !!publicKeyHex;

  return (
    <div className="min-h-screen bg-[#030308] text-[#e8e2d8]">
      {/* Glass blur header matching localchimera.com */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#030308]/88 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/chimeralogo-header.png" alt="Chimera" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <h1 className="text-base font-bold tracking-wide text-[#e8e2d8]">Chimera</h1>
              <p className="text-[10px] text-[#7a7468] -mt-0.5">Casper Testnet</p>
            </div>
          </a>
          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {([
              { id: 'tasker', label: 'Tasker' },
              { id: 'provider', label: 'Provider' },
              { id: 'storage', label: 'Storage' },
              { id: 'market', label: 'Market' },
              { id: 'machines', label: 'Machines' },
              { id: 'completed', label: 'Completed' },
            ] as { id: Page; label: string }[]).map((tab) => (
              <button key={tab.id} onClick={() => setPage(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${page === tab.id ? 'bg-white/5 text-[#00e5ff]' : 'hover:bg-white/5 hover:text-[#00e5ff] text-[#7a7468]'}`}>
                {tab.label}
              </button>
            ))}
            <a href="/console.html"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 hover:text-[#00e5ff] text-[#7a7468]">
              Console
            </a>
            <a href="/rental.html"
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 hover:text-[#00e5ff] text-[#00e5ff]">
              Rent GPU
            </a>
          </nav>
          {/* Wallet controls */}
          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-[#7a7468]">{accountHash.replace('account-hash-', '').slice(0, 14)}...{accountHash.slice(-6)}</div>
                </div>
                <Button variant="outline" onClick={disconnect} className="text-[10px] h-7 px-2 border-white/10 hover:bg-white/5">Disconnect</Button>
              </>
            ) : (
              <>
                {walletError && <div className="text-[10px] text-red-400">{walletError}</div>}
                <Button onClick={connect} className="text-[10px] h-7 px-3 bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 hover:bg-[#00e5ff]/20"><Wallet className="h-3 w-3 mr-1" />Connect Casper Wallet</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Main Content — single active page */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {!walletDetected && !isConnected && (
          <div className="mb-6 text-sm text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-lg">
            <strong>Casper Wallet extension not detected.</strong>
            <a href="https://chromewebstore.google.com/detail/casper-wallet/" target="_blank" rel="noopener noreferrer" className="underline ml-1 text-[#00e5ff]">Install it here</a>.
          </div>
        )}

        {page === 'market' && (
          <MarketTab />
        )}

        {page === 'machines' && (
          <MachinesTab />
        )}

        {page === 'completed' && (
          <CompletedTab />
        )}

        {page === 'tasker' && (
          <TaskerTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} />
        )}

        {page === 'provider' && (
          <ProviderTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} />
        )}

        {page === 'storage' && (
          <StorageHub provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-[#7a7468]">
          Chimera · Decentralised LLM infrastructure · Casper Testnet
        </div>
      </footer>
    </div>
  );
}
