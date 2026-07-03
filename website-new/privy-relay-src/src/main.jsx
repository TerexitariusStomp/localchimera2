import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';

const CHIMERA_PRIVY_APP_ID = 'cmqu05m41000h0djl70k738mx';
const CHIMERA_PRIVY_CONFIG = {
  appearance: {
    theme: 'dark',
    accentColor: '#8B5CF6',
    logo: 'https://new.localchimera.com/chimeralogo.png',
  },
  loginMethods: ['google', 'email', 'wallet'],
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
  },
};

function Relay() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parentOrigin = params.get('origin') || '*';

    const send = (id, data) => {
      try {
        window.parent.postMessage({ id, type: 'response', data }, parentOrigin);
      } catch (e) {
        console.error('[relay] postMessage failed:', e);
      }
    };

    const broadcast = (type, data) => {
      try {
        window.parent.postMessage({ type, data }, parentOrigin);
      } catch (e) {
        console.error('[relay] broadcast failed:', e);
      }
    };

    const handler = async (event) => {
      const { id, type, data } = event.data || {};
      if (!type) return;

      try {
        if (type === 'login') {
          await login(data);
          send(id, {
            success: true,
            walletAddress: user?.wallet?.address || null,
            authenticated,
          });
        } else if (type === 'logout') {
          await logout();
          send(id, { success: true });
        } else if (type === 'getStatus') {
          send(id, {
            ready,
            authenticated,
            walletAddress: user?.wallet?.address || null,
          });
        } else {
          send(id, { error: `Unknown relay type: ${type}` });
        }
      } catch (err) {
        send(id, { error: err.message || 'Relay action failed' });
      }
    };

    window.addEventListener('message', handler);
    broadcast('relay-ready', { ready, authenticated, walletAddress: user?.wallet?.address || null });

    return () => window.removeEventListener('message', handler);
  }, [login, logout, user, authenticated, ready]);

  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider appId={CHIMERA_PRIVY_APP_ID} config={CHIMERA_PRIVY_CONFIG}>
      <Relay />
    </PrivyProvider>
  </React.StrictMode>,
);
