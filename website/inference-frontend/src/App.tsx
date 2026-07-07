import { useState, useCallback, useEffect } from 'react';
import { useWeb3Auth } from './web3auth';
import { connectWallet, disconnectWallet, isWalletInstalled } from './casper-wallet';
import { switchToBotchain, switchToEthereum, BOTCHAIN_TESTNET } from './botchain';
import { Wallet, LayoutGrid, Home, Server, Rocket, Briefcase, CircleDollarSign, HardDrive, Star, Activity, CheckCircle, Sun, Moon, Globe, Plus } from 'lucide-react';
import { Button } from './components/ui';
import MarketTab from './components/MarketTab';
import CompletedTab from './components/CompletedTab';
import TaskerTab from './components/TaskerTab';
// ProviderNetworkTab merged into ConsoleProviders
import ReferralsTab from './components/ReferralsTab';
import BillingTab from './components/BillingTab';
import ConsoleDeploy from './components/ConsoleDeploy';
import ConsoleProviders from './components/ConsoleProviders';
import ConsoleEarnings from './components/ConsoleEarnings';
import BotchainTab from './components/BotchainTab';
import DomainRegistration from './components/DomainRegistration';
import { getDeployments, closeDeployment, type Deployment } from './lib/deployments';
import type { TxRecord } from './types';

type Page = 'home' | 'console-deploy' | 'console-providers' | 'earnings' | 'market' | 'completed' | 'tasker-manage' | 'tasker-confirm' | 'tasker-disputes' | 'referrals' | 'billing' | 'domains';

const navItems: { id: Page | string; label: string; icon: React.ReactNode; href?: string; external?: boolean; group?: string }[] = [
  { id: 'home', label: 'Console', icon: <LayoutGrid className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'domains', label: 'Domains', icon: <Globe className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'console-deploy', label: 'Deploy', icon: <Rocket className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'tasker-manage', label: 'Manage', icon: <HardDrive className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'tasker-confirm', label: 'Confirm & Rate', icon: <CheckCircle className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'tasker-disputes', label: 'Disputes', icon: <Activity className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'console-providers', label: 'Providers', icon: <Briefcase className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'earnings', label: 'Earnings', icon: <CircleDollarSign className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'market', label: 'Market', icon: <Activity className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'completed', label: 'Completed', icon: <CheckCircle className="h-[18px] w-[18px]" />, group: 'Console' },
  { id: 'referrals', label: 'Referrals', icon: <Star className="h-[18px] w-[18px]" />, group: 'Console'},
  { id: 'billing', label: 'Billing', icon: <CircleDollarSign className="h-[18px] w-[18px]" />, group: 'Console' },
];

const DEPLOY_FILTERS = ['all', 'active', 'pending', 'closed'] as const;

const deployStatusClass: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  closed: 'bg-slate-50 text-slate-500 border-slate-100',
};

function ConsoleHome({ walletId, onNavigate, onNavigateWithParams }: {
  walletId: string | null;
  onNavigate: (page: Page) => void;
  onNavigateWithParams: (page: Page, params?: string) => void;
}) {
  const [deployFilter, setDeployFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  useEffect(() => {
    setDeployments(getDeployments(walletId));
  }, [walletId]);

  const filteredDeployments = deployFilter === 'all' ? deployments : deployments.filter((d) => d.status === deployFilter);

  const handleClose = (id: string) => {
    if (!walletId) return;
    closeDeployment(walletId, id);
    setDeployments(getDeployments(walletId));
  };

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground mb-6">Welcome to Chimera Console!</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a href="/docs/" className="bg-card border border-border rounded-[14px] p-5 transition hover:border-primary/50">
          <div className="flex items-start gap-3.5 mb-2.5">
            <div className="w-10 h-10 rounded-[10px] border border-border flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground mb-1">Getting started with Chimera Console</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Learn how to deploy your first local AI node on any device in a few clicks.</p>
            </div>
          </div>
        </a>
        <button onClick={() => onNavigate('console-deploy')} className="text-left bg-card border border-border rounded-[14px] p-5 transition hover:border-primary/50">
          <div className="flex items-start gap-3.5 mb-2.5">
            <div className="w-10 h-10 rounded-[10px] border border-border flex items-center justify-center shrink-0">
              <LayoutGrid className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground mb-1">Explore the app marketplace</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Browse pre-built AI apps and templates like LLM Wiki, inference miners, and more.</p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-[18px] font-bold text-foreground">Your account</h2>
        <div className="flex items-center gap-2.5">
          <button onClick={() => onNavigate('billing')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold border border-border bg-card text-foreground hover:bg-secondary">+ Add Funds</button>
          <button onClick={() => onNavigate('console-deploy')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold bg-foreground text-background hover:opacity-85">
            <Rocket className="w-4 h-4" />Deploy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-muted-foreground font-medium">Available Balance</span>
            <div className="w-8 h-8 rounded-[10px] border border-border flex items-center justify-center"><CircleDollarSign className="w-4 h-4 text-muted-foreground" /></div>
          </div>
          <div className="text-[22px] font-bold tracking-[-0.01em] text-foreground">$0.00</div>
          <div className="text-[12px] text-muted-foreground mt-1">$0.00 used in deployments</div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-muted-foreground font-medium">Active Nodes</span>
            <div className="w-8 h-8 rounded-[10px] border border-border flex items-center justify-center"><Server className="w-4 h-4 text-muted-foreground" /></div>
          </div>
          <div className="text-[22px] font-bold tracking-[-0.01em] text-foreground">0</div>
          <div className="text-[12px] text-muted-foreground mt-1">0 pending providers</div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[13px] text-muted-foreground font-medium">Total Cost</span>
            <div className="w-8 h-8 rounded-[10px] border border-border flex items-center justify-center"><Activity className="w-4 h-4 text-muted-foreground" /></div>
          </div>
          <div className="text-[22px] font-bold tracking-[-0.01em] text-foreground">$0.00 / hour</div>
          <div className="text-[12px] text-muted-foreground mt-1">$0.00 / month</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-[18px] font-bold text-foreground">Your Deployments</h2>
        <Button onClick={() => onNavigate('console-deploy')} className="bg-foreground text-background hover:opacity-85">
          <Plus className="w-4 h-4" />New Deployment
        </Button>
      </div>

      <div className="flex gap-2 mb-5">
        {DEPLOY_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setDeployFilter(f)}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold border transition ${
              deployFilter === f
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-muted-foreground border-border hover:bg-secondary'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filteredDeployments.length === 0 ? (
        <div className="bg-card border border-border rounded-[14px] p-12 text-center">
          <div className="w-12 h-12 rounded-[14px] border border-border flex items-center justify-center mx-auto mb-4">
            <Server className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-[16px] font-semibold text-foreground mb-2">No {deployFilter !== 'all' ? deployFilter : ''} deployments</h3>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto mb-5 leading-relaxed">
            {walletId ? 'Deploy a container from the marketplace or the SDL builder.' : 'Connect your wallet to view your deployments.'}
          </p>
          <button onClick={() => onNavigate('console-deploy')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold bg-foreground text-background hover:opacity-85">
            <Rocket className="w-4 h-4" />Create Deployment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {filteredDeployments.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-[14px] p-5 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-[15px] font-bold text-foreground">{d.name}</h3>
                  <div className="text-[12px] text-muted-foreground mt-1">{d.id} · {d.image}</div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${deployStatusClass[d.status]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'active' ? 'bg-emerald-600' : d.status === 'pending' ? 'bg-amber-600' : 'bg-slate-400'}`} />
                  {d.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 py-4 border-t border-b border-border mb-4">
                <div className="text-center">
                  <div className="text-[14px] font-bold text-foreground">{d.cpu}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">CPU</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-foreground">{d.gpu}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">GPU</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-foreground">{d.memory}GB</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Memory</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-foreground">{d.storage}GB</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Storage</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-muted-foreground">
                  Created <strong className="text-foreground">{d.created}</strong> · {d.cost}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onNavigateWithParams('console-deploy', `image=${encodeURIComponent(d.image)}`)}
                    className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border border-border bg-card text-foreground hover:bg-secondary"
                  >
                    Redeploy
                  </button>
                  {d.status !== 'closed' && (
                    <button
                      onClick={() => handleClose(d.id)}
                      className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border border-border bg-card text-foreground hover:bg-secondary"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function App() {
  const { user, isAuthenticated, disconnect: logout, connect: web3authConnect, provider: evmWallet, address: evmAddress, isReady, initError } = useWeb3Auth();
  const [provider, setProvider] = useState<any>(null);
  const [publicKeyHex, setPublicKeyHex] = useState('');
  const [accountHash, setAccountHash] = useState('');
  const [walletError, setWalletError] = useState('');
  const [walletDetected, setWalletDetected] = useState(false);
  const [page, setPage] = useState<Page>(() => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.replace('#', '');
    return (navItems.find((n) => n.id === hash) ? hash : 'home') as Page;
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [walletMode, setWalletMode] = useState<'casper' | 'botchain' | 'evm' | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('chimera-theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chimera-theme', theme);
  }, [theme]);

  useEffect(() => {
    const check = () => setWalletDetected(isWalletInstalled());
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(async (mode: 'casper' | 'botchain' | 'evm') => {
    setWalletError('');
    setWalletMode(mode);
    if (mode === 'casper') {
      const res = await connectWallet();
      if (res.connected && res.provider) {
        setProvider(res.provider);
        setPublicKeyHex(res.publicKey);
        const pk = (await import('casper-js-sdk')).PublicKey.fromHex(res.publicKey);
        setAccountHash(pk.accountHash().toPrefixedString());
      } else {
        setWalletError('Could not connect to Casper Wallet. Make sure the extension is installed and unlocked.');
      }
    } else {
      if (!isReady) {
        setWalletError(initError || 'Wallet is not ready yet. Please wait a moment and try again.');
        return;
      }
      try {
        await web3authConnect();
        if (evmWallet) {
          if (mode === 'botchain') {
            await switchToBotchain(evmWallet);
          } else {
            await switchToEthereum(evmWallet);
          }
        }
      } catch (e: any) {
        setWalletError(e?.message || 'Web3Auth login failed');
      }
    }
  }, [web3authConnect, evmWallet, isReady, initError]);

  const disconnect = useCallback(async () => {
    if (walletMode === 'casper') {
      await disconnectWallet();
    } else if (walletMode === 'botchain' || walletMode === 'evm') {
      await logout();
    }
    setProvider(null); setPublicKeyHex(''); setAccountHash(''); setWalletError(''); setWalletMode(null);
  }, [walletMode, logout]);

  const updateTx = useCallback((_tx: TxRecord) => {}, []);

  const goToPage = useCallback((p: Page, params?: string) => {
    if (params) {
      const url = new URL(window.location.href);
      url.search = '?' + params;
      window.history.pushState({}, '', url.toString());
    } else {
      window.history.pushState({}, '', window.location.pathname);
    }
    setPage(p);
  }, []);

  const evmConnected = isAuthenticated && !!evmWallet && !!evmAddress;
  const isConnected = (!!provider && !!publicKeyHex) || (isAuthenticated && !!walletMode && walletMode !== 'casper');
  const walletId = walletMode === 'casper' ? accountHash : evmAddress || null;
  const walletLabel = walletMode === 'casper' ? accountHash.replace('account-hash-', '').slice(0, 14) + '...' + accountHash.slice(-6)
    : walletMode === 'botchain' || walletMode === 'evm' ? (evmAddress ? evmAddress.slice(0, 6) + '...' + evmAddress.slice(-4) : '')
    : '';
  const walletNetworkLabel = walletMode === 'casper' ? 'Casper' : walletMode === 'botchain' ? 'Botchain' : walletMode === 'evm' ? 'EVM' : '';

  const currentLabel = navItems.find((n) => n.id === page)?.label || 'Home';

  const handleNav = (item: typeof navItems[number]) => {
    if (item.href) {
      if (item.external) {
        window.open(item.href, '_blank', 'noopener');
      } else {
        window.location.href = item.href;
      }
      return;
    }
    setPage(item.id as Page);
    setMobileNavOpen(false);
  };

  const renderPage = () => {
    const consolePages: Page[] = ['home', 'console-deploy', 'console-providers', 'earnings'];
    const needsCasper = walletMode === 'casper' || (!walletMode && !isAuthenticated);
    if (needsCasper && !walletDetected && !isConnected && !consolePages.includes(page)) {
      return (
        <div className="mb-6 text-sm text-red-500 bg-red-500/5 border border-red-500/10 p-3 rounded-[10px]">
          <strong>Casper Wallet extension not detected.</strong>
          <a href="https://chromewebstore.google.com/detail/casper-wallet/" target="_blank" rel="noopener noreferrer" className="underline ml-1 text-foreground">Install it here</a>.
        </div>
      );
    }
    switch (page) {
      case 'home': return <ConsoleHome walletId={walletId} onNavigate={(p) => setPage(p)} onNavigateWithParams={(p, params) => goToPage(p, params)} />;
      case 'console-deploy': return <ConsoleDeploy walletId={walletId} walletMode={walletMode} provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} botchainWallet={evmWallet} evmAddress={evmAddress || ''} onTx={updateTx} onNavigate={(p) => setPage(p as Page)} onCreated={() => setPage('home')} />;
      case 'console-providers': return <ConsoleProviders />;
      case 'earnings': return <ConsoleEarnings walletMode={walletMode} casperProvider={provider} casperPublicKeyHex={publicKeyHex} accountHash={accountHash} evmAddress={evmAddress || ''} />;
      case 'market': return walletMode === 'botchain' ? <BotchainTab onTx={updateTx} /> : <MarketTab />;
      case 'completed': return walletMode === 'botchain' ? <BotchainTab onTx={updateTx} /> : <CompletedTab />;
      case 'tasker-manage': return walletMode === 'botchain' ? <BotchainTab onTx={updateTx} /> : <TaskerTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} fixedCategory="manage" />;
      case 'tasker-confirm': return walletMode === 'botchain' ? <BotchainTab onTx={updateTx} /> : <TaskerTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} fixedCategory="rate" />;
      case 'tasker-disputes': return walletMode === 'botchain' ? <BotchainTab onTx={updateTx} /> : <TaskerTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={updateTx} fixedCategory="disputes" />;
      case 'referrals': return <ReferralsTab />;
      case 'billing': return <BillingTab walletMode={walletMode} casperProvider={provider} casperPublicKeyHex={publicKeyHex} botchainWallet={evmWallet} evmAddress={evmAddress || ''} />;
      case 'domains': return <DomainRegistration walletMode={walletMode} provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} botchainWallet={evmWallet} evmAddress={evmAddress || ''} onTx={updateTx} />;
      default: return <ConsoleHome walletId={walletId} onNavigate={(p) => setPage(p)} onNavigateWithParams={(p, params) => goToPage(p, params)} />;
    }
  };

  const groups = ['Console'];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <button
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        className="fixed top-4 left-4 z-[300] w-10 h-10 rounded-[10px] border border-border bg-card flex items-center justify-center md:hidden"
        aria-label="Menu">☰</button>
      {mobileNavOpen && <div className="fixed inset-0 bg-black/25 z-[90] md:hidden" onClick={() => setMobileNavOpen(false)} />}

      <div className="flex min-h-screen">
        <aside className={`fixed inset-y-0 left-0 z-40 w-[240px] bg-card border-r border-border flex flex-col transition-transform duration-250 md:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <a href="/" className="h-16 flex items-center gap-3 px-5 border-b border-border">
            <div className="w-8 h-8 rounded-lg overflow-hidden"><img src="/chimeralogo-header.png" alt="Chimera" className="w-full h-full object-cover" /></div>
            <div className="font-extrabold text-lg tracking-[-0.02em] text-foreground">Chimera</div>
          </a>

          <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
            {groups.map((group) => (
              <div key={group} className="mb-2">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{group}</div>
                {navItems.filter((n) => n.group === group).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium transition text-left ${page === item.id ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <button onClick={() => setPage('console-deploy')} className="mx-4 mb-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold bg-foreground text-background hover:opacity-85">
            <Rocket className="w-4 h-4" />Deploy
          </button>

          <div className="p-4 border-t border-border">
            <div className="text-[11px] text-muted-foreground text-center">Chimera Console</div>
          </div>
        </aside>

        <div className="flex-1 md:ml-[240px] flex flex-col min-h-screen">
          <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
            <div className="flex items-center gap-4 ml-10 md:ml-0">
              <span className="text-[14px] text-muted-foreground">{currentLabel}</span>
            </div>
            <div className="flex items-center gap-3 relative">
              <a
                href="https://github.com/LocalChimera"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-[10px] border border-border bg-background flex items-center justify-center text-foreground hover:bg-secondary transition"
                aria-label="GitHub repo"
                title="GitHub repo"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.419-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="w-9 h-9 rounded-[10px] border border-border bg-background flex items-center justify-center text-foreground hover:bg-secondary transition"
                aria-label="Toggle theme"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              {isConnected ? (
                <>
                  <div className="text-right hidden sm:block leading-tight">
                    <div className="text-[10px] font-mono text-muted-foreground">{walletLabel}</div>
                    <div className="text-[9px] text-muted-foreground">{walletNetworkLabel}</div>
                  </div>
                  <Button variant="outline" onClick={disconnect} className="text-[10px] h-7 px-2 border-border hover:bg-secondary text-foreground">Disconnect</Button>
                </>
              ) : (
                <>
                  {walletError && <div className="text-[10px] text-red-500 hidden sm:block">{walletError}</div>}
                  <div className="relative">
                    <Button onClick={() => setWalletMenuOpen(!walletMenuOpen)} className="text-[10px] h-7 px-3 bg-foreground text-background hover:opacity-85"><Wallet className="h-3 w-3 mr-1" />Connect Wallet</Button>
                    {walletMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-[10px] shadow-lg z-50 overflow-hidden">
                        <button onClick={() => { setWalletMenuOpen(false); connect('casper'); }} className="w-full text-left px-3 py-2 text-[12px] text-foreground hover:bg-secondary flex items-center gap-2"><Wallet className="h-3 w-3" />Casper Wallet</button>
                        <button onClick={() => { setWalletMenuOpen(false); connect('botchain'); }} className="w-full text-left px-3 py-2 text-[12px] text-foreground hover:bg-secondary flex items-center gap-2"><Wallet className="h-3 w-3" />Botchain</button>
                        <button onClick={() => { setWalletMenuOpen(false); connect('evm'); }} className="w-full text-left px-3 py-2 text-[12px] text-foreground hover:bg-secondary flex items-center gap-2"><Wallet className="h-3 w-3" />EVM</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </header>

          <main className="flex-1 p-6 md:p-8 max-w-[1200px]">
            {renderPage()}
          </main>
        </div>
      </div>
    </div>
  );
}
