/**
 * @localchimera/sdk — Browser-safe entry point
 *
 * This entry is used by bundlers when targeting the browser. It exports only
 * the components that do not depend on Node.js built-in modules (child_process,
 * fs, Docker, etc.). The full SDK with container/tasking providers is available
 * via the default Node entry point.
 */

export { useChimera, ChimeraWeb3AuthProvider } from './useChimera.js';
export { ChimeraButton } from './ChimeraButton.js';
export { checkForUpdates, onUpdateAvailable, getSDKVersion } from './core/update-checker.js';
