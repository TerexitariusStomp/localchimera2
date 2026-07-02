/**
 * @chimera/sdk — Main entry point
 *
 * Tasking network provider SDK. Exports only the providers and orchestrator
 * needed to participate in decentralized compute, storage, bandwidth, and
 * inference networks. Self-contained — no external dependencies beyond React and Privy.
 *
 * React hook: import { useChimera } from '@chimera/sdk'
 */

export { ChimeraSDK } from './ChimeraSDK.js';
export { PrivacyContainer } from './runtime/PrivacyContainer.js';
export { useChimera, ChimeraPrivyProvider } from './useChimera.js';
export { ChimeraButton } from './ChimeraButton.jsx';
export { checkForUpdates, onUpdateAvailable, getSDKVersion } from './core/update-checker.js';
export { ResourceMonitor } from './core/resource-monitor.js';
export {
  BttAiMinerProvider,
  GolemProvider,
  AnyoneProtocolProvider,
  MysteriumProvider,
  CasperProvider,
  BtfsStorageProvider,
} from './miners/index.js';
export { BtfsClient } from './storage/index.js';
