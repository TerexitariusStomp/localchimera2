/**
 * SDK auto-update checker.
 *
 * On load, checks the Chimera registry for the latest @localchimera/sdk version.
 * If a newer version is available, calls the onUpdateAvailable callback
 * so the consuming app can prompt the user or auto-update.
 *
 * In browser apps: fetches from https://new.localchimera.com/api/sdk-version
 * In Node apps: checks npm registry
 *
 * The app can also subscribe to update events via onUpdateAvailable.
 */

const SDK_VERSION = '1.0.8';
const REGISTRY_URL = 'https://new.localchimera.com/api/sdk-version';
const NPM_REGISTRY = 'https://registry.npmjs.org/@localchimera/sdk/latest';
const CHECK_INTERVAL_MS = 1000 * 60 * 60; // 1 hour

let lastCheck = 0;
let latestVersion = SDK_VERSION;
let listeners = new Set();

async function _fetchLatestVersion() {
  if (typeof window !== 'undefined') {
    // Browser — use Chimera registry
    try {
      const res = await fetch(REGISTRY_URL, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        return data.version || SDK_VERSION;
      }
    } catch {}
  } else {
    // Node — use npm registry
    try {
      const res = await fetch(NPM_REGISTRY, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        return data.version || SDK_VERSION;
      }
    } catch {}
  }
  return SDK_VERSION;
}

function _compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * Check for SDK updates. Called automatically on load and periodically.
 * @returns {Promise<{current: string, latest: string, updateAvailable: boolean}>}
 */
export async function checkForUpdates() {
  const now = Date.now();
  if (now - lastCheck < CHECK_INTERVAL_MS) {
    return { current: SDK_VERSION, latest: latestVersion, updateAvailable: _compareVersions(latestVersion, SDK_VERSION) > 0 };
  }
  lastCheck = now;
  latestVersion = await _fetchLatestVersion();
  const updateAvailable = _compareVersions(latestVersion, SDK_VERSION) > 0;
  if (updateAvailable) {
    listeners.forEach(fn => fn({ current: SDK_VERSION, latest: latestVersion }));
  }
  return { current: SDK_VERSION, latest: latestVersion, updateAvailable };
}

/**
 * Subscribe to update notifications.
 * @param {(info: {current: string, latest: string}) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onUpdateAvailable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Get the current SDK version.
 */
export function getSDKVersion() {
  return SDK_VERSION;
}

// Auto-check on load (non-blocking)
if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
  checkForUpdates().catch(() => {});
  // Periodic check
  if (typeof setInterval !== 'undefined') {
    setInterval(() => checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
  }
}
