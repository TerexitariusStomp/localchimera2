import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

function WalletConnect() {
  const { publicKey, signMessage, connected } = useWallet();
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!connected || !publicKey || !signMessage) return;
    let cancelled = false;
    async function signAndConnect() {
      try {
        const address = publicKey.toString();
        setStatus('Signing message...');
        const message = `Sign in to LocalChimera with ${address} at ${new Date().toISOString()}`;
        const encodedMessage = new TextEncoder().encode(message);
        const signature = await signMessage(encodedMessage);

        setStatus('Verifying signature...');
        const jwtRes = await fetch('/api/web3auth-jwt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, message, signature: btoa(String.fromCharCode(...signature)), chain: 'solana' }),
        });
        if (!jwtRes.ok) {
          const err = await jwtRes.json().catch(() => ({}));
          throw new Error(err.error || 'JWT endpoint error');
        }
        const { jwt, sub } = await jwtRes.json();
        if (!jwt || !sub) throw new Error('JWT response missing token');

        const target = window.parent ?? window.opener ?? window;
        target.postMessage({ type: 'chimera-solana-jwt', jwt, sub, address }, '*');
        setStatus('Connected. MPC wallet ready.');
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${e.message || String(e)}`);
      }
    }
    signAndConnect();
    return () => { cancelled = true; };
  }, [connected, publicKey, signMessage]);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <WalletMultiButton />
      {status && <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>{status}</div>}
    </div>
  );
}

function App() {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = clusterApiUrl(network);
  const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnect />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
