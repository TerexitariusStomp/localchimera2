import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig, useAccount, useSignMessage } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { http } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, ConnectKitButton } from 'connectkit';

const WALLET_CONNECT_PROJECT_ID = '403f10c4cf2104d36c5bbb71b261d44a';

const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected(),
    walletConnect({ projectId: WALLET_CONNECT_PROJECT_ID, metadata: { name: 'LocalChimera', description: 'Chimera mobile wallet connect', url: 'https://new-localchimera.pages.dev', icons: [] } }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    async function signAndConnect() {
      try {
        setStatus('Signing message...');
        const message = `Sign in to LocalChimera with ${address} at ${new Date().toISOString()}`;
        const signature = await signMessageAsync({ message });

        setStatus('Verifying signature...');
        const jwtRes = await fetch('/api/web3auth-jwt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, message, signature, chain: 'evm' }),
        });
        if (!jwtRes.ok) {
          const err = await jwtRes.json().catch(() => ({}));
          throw new Error(err.error || 'JWT endpoint error');
        }
        const { jwt, sub } = await jwtRes.json();
        if (!jwt || !sub) throw new Error('JWT response missing token');

        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (redirectUrl) {
          const url = new URL(redirectUrl);
          url.searchParams.set('jwt', jwt);
          url.searchParams.set('sub', sub);
          url.searchParams.set('address', address);
          url.searchParams.set('chain', 'evm');
          window.location.href = url.href;
          return;
        }
        const target = window.parent ?? window.opener ?? window;
        target.postMessage({ type: 'chimera-evm-jwt', jwt, sub, address }, '*');
        setStatus('Connected. MPC wallet ready.');
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${e.message || String(e)}`);
      }
    }
    signAndConnect();
    return () => { cancelled = true; };
  }, [isConnected, address, signMessageAsync]);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <ConnectKitButton />
      {status && <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>{status}</div>}
    </div>
  );
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <WalletConnect />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
