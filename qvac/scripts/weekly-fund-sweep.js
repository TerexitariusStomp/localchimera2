#!/usr/bin/env node

/**
 * Weekly Fund Sweep Script
 *
 * Collects funds from all network protocol multisigs (Nostr, Bittensor, Solana, Arbitrum)
 * into the EVM collection multisig. This is Step 1 of the two-sweep architecture.
 *
 * Usage:
 *   node scripts/weekly-fund-sweep.js
 *   node scripts/weekly-fund-sweep.js --dry-run
 *   node scripts/weekly-fund-sweep.js --deny <sweep-id>
 */

import { Logger } from '../src/core/Logger.js';
import { MultisigManager } from '../src/core/MultisigManager.js';

const logger = new Logger('WeeklyFundSweep');

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const denyIndex = args.indexOf('--deny');
const denySweepId = denyIndex !== -1 ? args[denyIndex + 1] : null;

async function main() {
  logger.info('========================================');
  logger.info('Weekly Fund Sweep Starting');
  logger.info('========================================');

  // Load config
  let config;
  try {
    const configModule = await import('../config.json', { assert: { type: 'json' } });
    config = configModule.default;
  } catch (error) {
    logger.error('Failed to load config.json:', error.message);
    process.exit(1);
  }

  // Extract EVM address from config
  const evmAddress = config.evmAddress;

  if (!evmAddress) {
    logger.error('No EVM address found in config. Cannot proceed with sweep.');
    logger.info('Please configure an EVM wallet address in config.json');
    process.exit(1);
  }

  // Initialize multisig manager with EVM collection multisig
  const multisigManager = new MultisigManager({
    evmMultisigAddress: config.multisig?.evmMultisigAddress || evmAddress
  });
  await multisigManager.initialize();

  // Handle denial request
  if (denySweepId) {
    logger.info(`Processing denial for sweep: ${denySweepId}`);
    try {
      await multisigManager.denySweep(denySweepId);
      logger.info(`Sweep ${denySweepId} has been denied successfully`);
    } catch (error) {
      logger.error(`Failed to deny sweep: ${error.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Display current multisig status
  const status = multisigManager.getStatus();
  logger.info('Protocol Multisig Status:');
  logger.info(`  EVM Collection: ${status.evmCollectionMultisig || 'not configured'}`);
  for (const [network, ms] of Object.entries(status.protocolMultisigs)) {
    logger.info(`    ${network}: ${ms.address} (${ms.threshold}-of-3)`);
  }

  if (isDryRun) {
    logger.info('');
    logger.info('DRY RUN MODE - No transactions will be executed');
    logger.info('');
  }

  // Collect balances from all networks (including direct deposit chains)
  const networks = ['nostr', 'bittensor', 'solana', 'arbitrum'];
  const balances = await collectBalances(networks, multisigManager, isDryRun);

  // Initiate collection sweeps for each network with balance
  logger.info('');
  logger.info('Initiating collection sweeps to EVM multisig (2-day denial window)...');
  logger.info('');

  for (const [network, balance] of Object.entries(balances)) {
    if (balance > 0) {
      await initiateCollectionSweep(network, balance, multisigManager, isDryRun);
    }
  }

  // Display pending sweeps
  const pendingSweeps = multisigManager.getPendingSweeps();
  if (pendingSweeps.length > 0) {
    logger.info('');
    logger.info('Pending Collection Sweeps:');
    for (const sweep of pendingSweeps) {
      const scheduledDate = new Date(sweep.scheduledAt);
      logger.info(`  ${sweep.id}:`);
      logger.info(`    Network: ${sweep.network}`);
      logger.info(`    Amount: ${sweep.amount}`);
      logger.info(`    Target: EVM collection multisig`);
      logger.info(`    Scheduled: ${scheduledDate.toISOString()}`);
      logger.info(`    Deny command: node scripts/weekly-fund-sweep.js --deny ${sweep.id}`);
    }
  }

  logger.info('');
  logger.info('Weekly Collection Sweep Complete');
  logger.info('Funds will be available in EVM multisig for monthly distribution');
  logger.info('========================================');
}

/**
 * Collect balances from network multisigs
 */
async function collectBalances(networks, multisigManager, isDryRun) {
  const balances = {};

  for (const network of networks) {
    const multisig = multisigManager.getMultisig(network);
    if (!multisig) {
      logger.warn(`No multisig found for ${network}`);
      continue;
    }

    // In production, query the actual blockchain for balance
    // For now, simulate balance detection
    const simulatedBalance = isDryRun ? 0.001 : await queryBalance(network, multisig.address);
    balances[network] = simulatedBalance;

    if (simulatedBalance > 0) {
      logger.info(`${network}: Balance detected (${simulatedBalance})`);
    } else {
      logger.info(`${network}: No balance to sweep`);
    }
  }

  return balances;
}

/**
 * Query balance from network (simulated)
 */
async function queryBalance(network, address) {
  // In production, this would query:
  // - Nostr: Cashu mint for token balance
  // - Bittensor: Substrate RPC for TAO balance
  
  // Simulate balance check
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return random small balance for demonstration
  const randomBalance = Math.random() > 0.5 ? parseFloat((Math.random() * 0.01).toFixed(6)) : 0;
  return randomBalance;
}

/**
 * Initiate a collection sweep from network to EVM multisig
 */
async function initiateCollectionSweep(network, amount, multisigManager, isDryRun) {
  if (isDryRun) {
    logger.info(`[DRY RUN] Would collect ${amount} from ${network} to EVM multisig`);
    return;
  }

  try {
    const sweepId = await multisigManager.initiateCollectionSweep(network, amount);
    logger.info(`Collection sweep initiated: ${sweepId}`);
    logger.info(`  Amount: ${amount} ${getNetworkToken(network)}`);
    logger.info(`  Target: EVM collection multisig`);
    logger.info(`  Deny window: 2 days`);
  } catch (error) {
    logger.error(`Failed to initiate collection sweep for ${network}: ${error.message}`);
  }
}

function getNetworkToken(network) {
  const tokens = {
    nostr: 'sats',
    bittensor: 'TAO',
    solana: 'SOL'
  };
  return tokens[network] || 'tokens';
}

// Run main
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
