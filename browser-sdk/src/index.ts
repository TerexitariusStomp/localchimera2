/**
 * @localchimera/browser-sdk — Main entry point
 *
 * Run a tasker network node entirely in the browser. No download required.
 *
 * Usage:
 *   import { BrowserNode } from '@localchimera/browser-sdk';
 *
 *   const node = new BrowserNode(casperWalletProvider, publicKeyHex, accountHash);
 *   node.onStatusUpdate(status => console.log(status));
 *   await node.start();
 *
 * Heavy libraries (WebLLM, Helia, Wasmer) are dynamically imported
 * and only loaded when the corresponding task type is needed.
 */

export { BrowserNode, quickStart } from './browser-node';
export type { BrowserNodeStatus, BrowserCapabilities, LogEntry } from './browser-node';

export {
  GolemNetworkAdapter,
  MysteriumNetworkAdapter,
  AnyoneNetworkAdapter,
  BtfsNetworkAdapter,
  BttAiNetworkAdapter,
  createAllAdapters,
} from './network-adapters';
export type { NetworkAdapter, NetworkAdapterStatus } from './network-adapters';

export { RomaRouter, createRomaApiHandler } from './roma-router';
export type { RomaSubTask, RomaTaskType, RomaExecutionResult } from './roma-router';

export {
  CONTRACTS,
  getContractNamedKeys,
  queryDictionary,
  callEntryPointWithWallet,
  callEntryPoint,
  getDeployStatus,
  getAccountBalance,
  getRegisteredProviders,
} from './casper-client';
export type { ContractConfig } from './casper-client';
