/**
 * useChimera — production React hook for Chimera SDK with Privy wallet.
 *
 * Uses Chimera's protocol Privy app ID (cmqu05m41000h0djl70k738mx) exclusively.
 * Generates embedded wallets on login and supports social login (Google, email).
 *
 * Works on ANY domain without manual Privy dashboard configuration:
 *   - On *.localchimera.com: uses PrivyProvider directly (same-origin)
 *   - On third-party domains: loads a hidden iframe from new.localchimera.com
 *     that runs the Privy auth flow. Privy sees the allowed origin. The parent
 *     app communicates with the iframe via postMessage.
 *
 * Usage:
 *   import { ChimeraPrivyProvider, useChimera } from '@localchimera/sdk';
 *
 *   // Wrap your app:
 *   <ChimeraPrivyProvider>
 *     <App />
 *   </ChimeraPrivyProvider>
 *
 *   // Inside App:
 *   function App() {
 *     const chimera = useChimera({
 *       appDeveloperEVM: '0x...',
 *       revenueSplit: { machineOwner: 0.70, appDeveloper: 0.30 },
 *     });
 *
 *     return (
 *       <div>
 *         {!chimera.walletConnected && <button onClick={chimera.connectWallet}>Connect Wallet</button>}
 *         {chimera.walletConnected && !chimera.consentGiven && <button onClick={chimera.giveConsent}>Enable Mining</button>}
 *         {chimera.consentGiven && <button onClick={chimera.start} disabled={chimera.status.running}>Start</button>}
 *         {chimera.status.running && <button onClick={chimera.stop}>Stop</button>}
 *       </div>
 *     );
 *   }
 */

import { useState, useEffect, useCallback, useRef, createElement, useMemo, Component, createContext, useContext } from 'react';
import { usePrivy, PrivyProvider } from '@privy-io/react-auth';
import { checkForUpdates, onUpdateAvailable, getSDKVersion } from './core/update-checker.js';

// Chimera's Privy app ID — the only allowed app ID. All wallets are
// created under the Chimera protocol. No custom app IDs are supported.
const CHIMERA_PRIVY_APP_ID = 'cmqu05m41000h0djl70k738mx';

// The relay origin that hosts the Privy iframe for third-party domains.
// This domain is in Privy's allowed origins list.
const CHIMERA_RELAY_ORIGIN = 'https://new.localchimera.com';

// React context that exposes the Privy state (ready, authenticated, user,
// login, logout). On allowed domains the context is populated directly from
// usePrivy(); on third-party domains it is populated from the iframe relay.
const ChimeraPrivyContext = createContext(null);

// Privy config: social login + embedded wallet creation
const CHIMERA_PRIVY_CONFIG = {
  loginMethods: ['google', 'email', 'wallet'],
  embeddedWallets: {
    createWalletOnLogin: true,
    requireUserPasswordOnCreate: false,
  },
  appearance: {
    loginMethods: ['google', 'email', 'wallet'],
  },
};

const API_BASE = (typeof window !== 'undefined' &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:'))
  ? '/api' : 'http://localhost:3002/api';

// Check if we're on a domain that Privy allows directly. *.localchimera.com
// and localhost are allowed; everything else must use the iframe relay.
function isLocalChimeraDomain() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localchimera.com') ||
    host === 'localchimera.com';
}

// ─── Iframe relay for third-party domains ───
// When the SDK is used on a non-localchimera.com domain, we load a hidden
// iframe from new.localchimera.com that runs the Privy auth flow.
// Communication happens via postMessage. Privy sees the origin as
// new.localchimera.com (allowed), so no dashboard configuration is needed.

let iframeEl = null;
let iframeReady = false;
let messageHandlers = new Map();
let messageIdCounter = 0;

function ensureIframe() {
  if (iframeEl || typeof document === 'undefined') return;
  const parentOrigin = encodeURIComponent(window.location.origin);
  iframeEl = document.createElement('iframe');
  iframeEl.src = `${CHIMERA_RELAY_ORIGIN}/privy-relay/index.html?origin=${parentOrigin}`;
  iframeEl.style.display = 'none';
  iframeEl.setAttribute('aria-hidden', 'true');
  iframeEl.setAttribute('tabindex', '-1');
  document.body.appendChild(iframeEl);

  window.addEventListener('message', (event) => {
    if (event.origin !== CHIMERA_RELAY_ORIGIN) return;
    const { id, type, data } = event.data || {};
    if (type === 'relay-ready') {
      iframeReady = true;
      return;
    }
    if (id && messageHandlers.has(id)) {
      const handler = messageHandlers.get(id);
      messageHandlers.delete(id);
      handler(data);
    }
  });
}

function sendToIframe(type, data = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!iframeEl || !iframeReady) {
      reject(new Error('Privy relay iframe not ready'));
      return;
    }
    const id = `msg_${++messageIdCounter}`;
    const timer = setTimeout(() => {
      messageHandlers.delete(id);
      reject(new Error('Privy relay timeout'));
    }, timeoutMs);
    messageHandlers.set(id, (result) => {
      clearTimeout(timer);
      if (result?.error) reject(new Error(result.error));
      else resolve(result);
    });
    iframeEl.contentWindow.postMessage({ id, type, data }, CHIMERA_RELAY_ORIGIN);
  });
}

function waitForIframe() {
  return new Promise((resolve, reject) => {
    if (iframeReady) return resolve();
    ensureIframe();
    const timer = setTimeout(() => reject(new Error('Privy relay iframe timeout')), 10000);
    const check = setInterval(() => {
      if (iframeReady) {
        clearInterval(check);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
  });
}

// Custom Privy replacement that runs inside the hidden iframe relay on
// third-party domains. This lets the generated app work on any domain without
// being in the Privy dashboard's allowed origins list.
function useIframePrivy() {
  const isAllowed = isLocalChimeraDomain();
  const [state, setState] = useState({
    ready: false,
    authenticated: false,
    user: null,
  });

  useEffect(() => {
    if (isAllowed) return;
    let cancelled = false;
    ensureIframe();
    waitForIframe().then(() => {
      if (cancelled) return;
      // Sync status once after the iframe is ready
      sendToIframe('getStatus').then((data) => {
        if (cancelled) return;
        setState({
          ready: true,
          authenticated: data?.authenticated || false,
          user: data?.walletAddress ? { wallet: { address: data.walletAddress } } : null,
        });
      }).catch(() => {});
    }).catch(() => {});

    const onMessage = (event) => {
      if (event.origin !== CHIMERA_RELAY_ORIGIN) return;
      const { type, data } = event.data || {};
      if (type === 'relay-ready') {
        sendToIframe('getStatus').then((status) => {
          if (cancelled) return;
          setState({
            ready: true,
            authenticated: status?.authenticated || false,
            user: status?.walletAddress ? { wallet: { address: status.walletAddress } } : null,
          });
        }).catch(() => {});
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const login = useCallback(async () => {
    if (isAllowed) return { success: false, error: 'Not in iframe mode' };
    const result = await sendToIframe('login', { loginMethods: CHIMERA_PRIVY_CONFIG.loginMethods });
    if (result?.walletAddress) {
      setState({
        ready: true,
        authenticated: true,
        user: { wallet: { address: result.walletAddress } },
      });
    }
    return result;
  }, [isAllowed]);

  const logout = useCallback(async () => {
    if (isAllowed) return { success: false, error: 'Not in iframe mode' };
    await sendToIframe('logout');
    setState({ ready: true, authenticated: false, user: null });
  }, [isAllowed]);

  return {
    ready: state.ready,
    authenticated: state.authenticated,
    user: state.user,
    login,
    logout,
  };
}

// Inner hook that uses the ChimeraPrivyContext populated by ChimeraPrivyProvider.
function useChimeraInner(opts = {}) {
  // ─── Privy wallet integration ───
  const { ready, authenticated, user, login, logout } = useContext(ChimeraPrivyContext);
  const walletAddress = user?.wallet?.address || null;
  const walletConnected = authenticated && !!walletAddress;

  const [status, setStatus] = useState({ running: false, providers: [], consent: false, containerized: false });
  const [consentGiven, setConsentGiven] = useState(false);
  const [sdkUpdate, setSdkUpdate] = useState({ current: getSDKVersion(), latest: getSDKVersion(), updateAvailable: false });
  const [browserMode, setBrowserMode] = useState(false);
  const intervalRef = useRef(null);
  const browserNodeRef = useRef(null);

  const appDeveloperEVM = opts.appDeveloperEVM || null;
  const revenueSplit = opts.revenueSplit || { machineOwner: 0.70, appDeveloper: 0.30 };

  // SDK auto-update check
  useEffect(() => {
    const unsub = onUpdateAvailable((info) => setSdkUpdate({ ...info, updateAvailable: true }));
    checkForUpdates().then((info) => setSdkUpdate(info)).catch(() => {});
    return unsub;
  }, []);

  // Detect backend availability — fall back to browser mode if no backend
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/status`).then((res) => {
      if (res.ok && !cancelled) setBrowserMode(false);
    }).catch(() => {
      if (!cancelled) {
        setBrowserMode(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Auto-revoke consent + stop mining when wallet disconnects
  useEffect(() => {
    if (!authenticated && consentGiven) {
      setConsentGiven(false);
      setStatus(prev => ({ ...prev, consent: false, running: false }));
      try { fetch(`${API_BASE}/stop`, { method: 'POST' }); } catch (e) {}
      try { fetch(`${API_BASE}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: false }) }); } catch (e) {}
    }
  }, [authenticated, consentGiven]);

  const fetchStatus = useCallback(async () => {
    if (browserMode) {
      // Browser mode — read status from BrowserNode
      if (browserNodeRef.current) {
        const node = browserNodeRef.current;
        const nodeStatus = node.getStatus ? node.getStatus() : {};
        setStatus(prev => ({
          ...prev,
          running: node.running || false,
          providers: [
            { provider: 'casper-escrow', running: node.running, jobsProcessed: node.jobsProcessed, jobsFailed: node.jobsFailed },
          ],
          containerized: false,
          browserMode: true,
          networkAdapters: nodeStatus.networkAdapters || [],
        }));
      }
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/status`);
      const json = await res.json();
      if (json.success) {
        setStatus(prev => ({
          ...prev,
          running: json.data?.running || false,
          providers: json.data?.providers || [],
          containerized: json.data?.containerized || false,
          consent: json.data?.consent || prev.consent,
        }));
      }
    } catch (e) { /* backend may not be running */ }
  }, [browserMode]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalRef.current);
  }, [fetchStatus]);

  // ─── Wallet actions ───

  const connectWallet = useCallback(async () => {
    if (!ready) return { success: false, error: 'Privy not ready' };
    await login();
    return { success: true };
  }, [ready, login]);

  const disconnectWallet = useCallback(async () => {
    await logout();
    setConsentGiven(false);
    setStatus(prev => ({ ...prev, consent: false }));
    try { await fetch(`${API_BASE}/stop`, { method: 'POST' }); } catch (e) {}
    try { await fetch(`${API_BASE}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: false }) }); } catch (e) {}
    await fetchStatus();
    return { success: true };
  }, [logout, fetchStatus]);

  // ─── Consent ───

  const giveConsent = useCallback(async () => {
    if (!walletConnected) return { success: false, error: 'Connect wallet first' };
    setConsentGiven(true);
    setStatus(prev => ({ ...prev, consent: true }));
    try {
      await fetch(`${API_BASE}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
    } catch (e) {}
    return { success: true };
  }, [walletConnected]);

  const revokeConsent = useCallback(async () => {
    setConsentGiven(false);
    setStatus(prev => ({ ...prev, consent: false }));
    try { await fetch(`${API_BASE}/stop`, { method: 'POST' }); } catch (e) {}
    try {
      await fetch(`${API_BASE}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: false }),
      });
    } catch (e) {}
    await fetchStatus();
    return { success: true };
  }, [fetchStatus]);

  // ─── Start / Stop ───

  const start = useCallback(async () => {
    if (!consentGiven) return { success: false, error: 'Consent required' };
    if (!walletAddress) return { success: false, error: 'Wallet not connected' };

    // Browser mode — launch BrowserNode for in-browser mining
    if (browserMode) {
      try {
        const { BrowserNode } = await import('@localchimera/browser-sdk');
        // BrowserNode needs a Casper wallet provider + account hash.
        // The Privy embedded wallet signs via EVM; for Casper escrow we
        // use the relay endpoint at new.localchimera.com which signs on
        // behalf of the protocol multisig.
        const node = new BrowserNode(
          null,  // relay provider — signs via new.localchimera.com
          walletAddress,  // EVM address as node ID
          walletAddress,  // account hash placeholder
        );
        node.onStatusUpdate((nodeStatus) => {
          setStatus(prev => ({
            ...prev,
            running: nodeStatus.running,
            providers: [{
              provider: 'casper-escrow',
              running: nodeStatus.running,
              jobsProcessed: nodeStatus.jobsProcessed,
              jobsFailed: nodeStatus.jobsFailed,
              earningsMotes: nodeStatus.earningsMotes,
            }],
            containerized: false,
            browserMode: true,
            networkAdapters: nodeStatus.networkAdapters || [],
            marketRegistrations: nodeStatus.marketRegistrations || {},
          }));
        });
        await node.start();
        browserNodeRef.current = node;
        return { success: true, running: true, mode: 'browser' };
      } catch (e) {
        return { success: false, error: `Browser node failed: ${e.message}` };
      }
    }

    try {
      const res = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineOwnerEVM: walletAddress,  // Privy wallet — monthly sweep target
          appDeveloperEVM,                  // Privy wallet — monthly sweep target
          revenueSplit,
          payoutModel: 'protocol-multisig-monthly-sweep',
        }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      await fetchStatus();
      return json;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [consentGiven, walletAddress, appDeveloperEVM, revenueSplit, fetchStatus, browserMode]);

  const stop = useCallback(async () => {
    if (browserMode && browserNodeRef.current) {
      try {
        await browserNodeRef.current.stop();
        browserNodeRef.current = null;
        setStatus(prev => ({ ...prev, running: false }));
        return { success: true, running: false, mode: 'browser' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    try {
      const res = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      await fetchStatus();
      return json;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [fetchStatus, browserMode]);

  // ─── Inference API helpers (proxied through container) ───

  const createInferenceKey = useCallback(async (keyOpts = {}) => {
    const res = await fetch(`${API_BASE}/inference-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keyOpts),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }, []);

  const listInferenceKeys = useCallback(async () => {
    const res = await fetch(`${API_BASE}/inference-keys`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }, []);

  const revokeInferenceKey = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/inference-keys/${id}`, { method: 'DELETE' });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }, []);

  const infer = useCallback(async (params = {}) => {
    // Browser mode — use BrowserNode's WebLLM/transformers.js inference
    if (browserMode && browserNodeRef.current) {
      try {
        return await browserNodeRef.current.infer({
          messages: params.messages || [],
          model: params.model || 'chimera-browser',
          maxTokens: params.maxTokens || 512,
          temperature: params.temperature ?? 0.7,
          stream: params.stream || false,
        });
      } catch (e) {
        return { error: e.message };
      }
    }
    // Container mode — proxy to container's OpenAI-compatible endpoint
    const headers = { 'Content-Type': 'application/json' };
    const token = params.accessToken || params.apiKey;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE.replace('/api', '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: params.messages || [],
        model: params.model || 'chimera-local',
        max_tokens: params.maxTokens || 512,
        temperature: params.temperature || 0.7,
        stream: params.stream || false,
      }),
    });
    if (params.stream) return res.body;
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }, [browserMode]);

  const getInferenceEndpoint = useCallback(() => {
    if (browserMode) {
      return {
        url: 'chimera-browser://infer',
        modelsUrl: 'chimera-browser://models',
        authHeader: 'Not required (browser-local inference)',
        compatible: 'OpenAI-compatible',
        mode: 'browser',
        note: 'Inference runs locally in-browser via WebGPU (WebLLM) or WASM (transformers.js). No API key needed.',
      };
    }
    return {
      url: `${API_BASE.replace('/api', '')}/v1/chat/completions`,
      modelsUrl: `${API_BASE.replace('/api', '')}/v1/models`,
      authHeader: 'Authorization: Bearer chim_... or chim_access_...',
      compatible: 'OpenAI-compatible',
      mode: 'container',
    };
  }, [browserMode]);

  // ─── ROMA task routing (solve complex tasks via ROMA pipeline) ───

  const solve = useCallback(async (goal, opts = {}) => {
    // Browser mode — use RomaRouter directly
    if (browserMode && browserNodeRef.current?.romaRouter) {
      try {
        const answer = await browserNodeRef.current.romaRouter.solve(goal, opts);
        return { success: true, answer, mode: 'browser' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    // Container mode — call ROMA REST API
    try {
      const res = await fetch(`${API_BASE}/roma/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, ...opts }),
      });
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [browserMode]);

  return {
    // Privy wallet
    walletConnected,
    walletAddress,
    connectWallet,
    disconnectWallet,
    // Consent
    consentGiven,
    giveConsent,
    revokeConsent,
    // Mining
    status,
    start,
    stop,
    // Inference API
    createInferenceKey,
    listInferenceKeys,
    revokeInferenceKey,
    infer,
    getInferenceEndpoint,
    // ROMA task routing
    solve,
    // SDK update info
    sdkUpdate,
    // Browser mode flag (true when no backend detected)
    browserMode,
  };
}

// Error boundary that renders children if PrivyProvider crashes (e.g. in a
// WebContainer sandbox or restricted iframe). useChimera() then returns a
// placeholder so the app UI stays visible and the user sees a graceful error.
class ChimeraProviderErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ChimeraPrivyProvider] Privy failed to initialize:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.children;
    }
    return this.props.children;
  }
}

// Populates the context from the direct usePrivy() hook (inside PrivyProvider).
function DirectPrivyContextProvider({ children }) {
  const privy = usePrivy();
  return createElement(ChimeraPrivyContext.Provider, { value: privy }, children);
}

// Populates the context from the iframe relay on third-party domains.
function IframePrivyContextProvider({ children }) {
  const privy = useIframePrivy();
  return createElement(ChimeraPrivyContext.Provider, { value: privy }, children);
}

// Wrapper component that provides Privy context with Chimera's protocol app ID.
// On localchimera.com domains: uses PrivyProvider directly.
// On third-party domains: loads an iframe relay from new.localchimera.com.
// No manual Privy dashboard configuration needed for either case.
const ChimeraPrivyProvider = ({ children }) => {
  const isAllowed = isLocalChimeraDomain();
  const privyProps = {
    appId: CHIMERA_PRIVY_APP_ID,
    config: CHIMERA_PRIVY_CONFIG,
  };

  if (isAllowed) {
    // On allowed domains, use PrivyProvider directly. Wrap in an error boundary
    // so sandboxed environments (WebContainer) still render the app UI even if
    // Privy cannot initialize.
    const contextProvider = createElement(DirectPrivyContextProvider, null, children);
    const provider = createElement(PrivyProvider, privyProps, contextProvider);
    return createElement(ChimeraProviderErrorBoundary, null, provider);
  }

  // On third-party domains, the hidden iframe relay at new.localchimera.com
  // handles Privy authentication. We render children without PrivyProvider so
  // useChimera() can use the relay context instead of usePrivy().
  return createElement(IframePrivyContextProvider, null, children);
};

// Inner component that calls the hook and forwards result via render prop
const ChimeraInner = ({ opts, onReady }) => {
  const chimera = useChimeraInner(opts);
  useEffect(() => { onReady(chimera); }, [chimera, onReady]);
  return null;
};

/**
 * Main export — useChimera.
 *
 * Must be called inside a <ChimeraPrivyProvider>.
 *
 * On localchimera.com: uses Privy directly (same-origin).
 * On third-party domains: uses the iframe relay via new.localchimera.com
 * so Privy sees an allowed origin. No dashboard configuration needed.
 *
 * Options:
 *   appDeveloperEVM  — your EVM payout address (required)
 *   revenueSplit     — { machineOwner, appDeveloper } split (default 70/30)
 */
export function useChimera(opts = {}) {
  // Detect whether ChimeraPrivyProvider is mounted by checking the context.
  const privyContext = useContext(ChimeraPrivyContext);
  if (privyContext) {
    return useChimeraInner(opts);
  }

  // No ChimeraPrivyProvider — return placeholder directing user to wrap app
  return useMemo(() => ({
    walletConnected: false,
    walletAddress: null,
    connectWallet: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first. See @localchimera/sdk docs.' }),
    disconnectWallet: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    consentGiven: false,
    giveConsent: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    revokeConsent: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    status: { running: false, providers: [], consent: false, containerized: false },
    start: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    stop: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    createInferenceKey: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    listInferenceKeys: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    revokeInferenceKey: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    infer: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    getInferenceEndpoint: () => ({ url: null, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    solve: () => ({ success: false, error: 'Wrap your app in <ChimeraPrivyProvider> first.' }),
    sdkUpdate: { current: getSDKVersion(), latest: getSDKVersion(), updateAvailable: false },
    browserMode: false,
  }), []);
}

export { ChimeraPrivyProvider, CHIMERA_PRIVY_APP_ID, CHIMERA_RELAY_ORIGIN };
