import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/base';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';

const CHAIN_HEX = '0x' + (968).toString(16);

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: CHAIN_HEX,
  rpcTarget: 'https://rpc.bohr.life',
  displayName: 'Botchain Testnet',
  blockExplorerUrl: 'https://scan.bohr.life',
  ticker: 'BOT',
  tickerName: 'Botchain',
  decimals: 18,
};

const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

const web3AuthOptions = {
  clientId: import.meta.env.VITE_WEB3AUTH_CLIENT_ID || 'YOUR_WEB3AUTH_CLIENT_ID',
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  chainConfig,
  privateKeyProvider,
  uiConfig: {
    appName: 'Chimera Desktop',
    mode: 'dark',
    theme: { primary: '#00e5ff' },
  },
};

interface Web3AuthContextType {
  web3auth: Web3Auth | null;
  provider: any | null;
  isReady: boolean;
  isAuthenticated: boolean;
  user: any | null;
  address: string | null;
  loginError: string | null;
  connect: () => Promise<any>;
  disconnect: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  web3auth: null,
  provider: null,
  isReady: false,
  isAuthenticated: false,
  user: null,
  address: null,
  loginError: null,
  connect: async () => {},
  disconnect: async () => {},
});

export const Web3AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [web3auth] = useState(() => new Web3Auth(web3AuthOptions));
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [provider, setProvider] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cancelled = false;
    const init = async () => {
      try {
        await web3auth.initModal();
        if (cancelled) return;
        setIsReady(true);
        if (web3auth.connected) {
          const p = web3auth.provider;
          setProvider(p);
          setIsAuthenticated(true);
          try {
            const accounts = await p?.request({ method: 'eth_accounts' });
            if (accounts?.[0]) setAddress(accounts[0]);
          } catch (e) {}
          try {
            const userInfo = await web3auth.getUserInfo();
            setUser(userInfo);
          } catch (e) {}
        }
      } catch (e: any) {
        console.error('[Web3AuthProvider] init failed', e);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [web3auth]);

  const connect = useCallback(async () => {
    setLoginError(null);
    try {
      const p = await web3auth.connect();
      setProvider(p);
      setIsAuthenticated(true);
      try {
        const accounts = await p?.request({ method: 'eth_accounts' });
        if (accounts?.[0]) setAddress(accounts[0]);
      } catch (e) {}
      try {
        const userInfo = await web3auth.getUserInfo();
        setUser(userInfo);
      } catch (e) {}
      return p;
    } catch (e: any) {
      setLoginError(e.message || 'Web3Auth login failed');
      throw e;
    }
  }, [web3auth]);

  const disconnect = useCallback(async () => {
    try {
      await web3auth.logout();
    } catch (e) {}
    setProvider(null);
    setIsAuthenticated(false);
    setUser(null);
    setAddress(null);
  }, [web3auth]);

  const value = useMemo(() => ({
    web3auth,
    provider,
    isReady,
    isAuthenticated,
    user,
    address,
    loginError,
    connect,
    disconnect,
  }), [web3auth, provider, isReady, isAuthenticated, user, address, loginError, connect, disconnect]);

  return <Web3AuthContext.Provider value={value}>{children}</Web3AuthContext.Provider>;
};

export const useWeb3Auth = () => useContext(Web3AuthContext);
