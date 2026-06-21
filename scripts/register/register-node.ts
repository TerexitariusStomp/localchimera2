/**
 * Register a new Chimera-Fortytwo node on the Casper ComputeRegistry.
 *
 * Usage:
 *   CSPR_PEM_PATH=/path/to/key.pem npx tsx scripts/register/register-node.ts
 */

import { config } from '../../src/utils/config.js';
import { logger } from '../../src/utils/logger.js';
import {
  CasperMarketplaceClient,
  type ContractAddresses,
} from '../../src/contracts/marketplace.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadContractAddresses(): ContractAddresses {
  const path = join(__dirname, '../../config/chimera-testnet.json');
  const raw = readFileSync(path, 'utf-8');
  const json = JSON.parse(raw);
  return {
    computeRegistry: json.contracts.computeRegistry,
    orderBook: json.contracts.orderBook,
    escrowVault: json.contracts.escrowVault,
    reputation: json.contracts.reputation,
  };
}

async function main(): Promise<void> {
  logger.info('Registering node on Chimera Casper testnet...');

  const addresses = loadContractAddresses();
  const pemPath = process.env.CSPR_PEM_PATH || '/tmp/casper-keys/Account 1_secret_key.pem';
  const contracts = new CasperMarketplaceClient(pemPath, addresses);

  const myAddress = contracts.getAccountHash();
  const status = await contracts.getProviderStatus(myAddress);

  if (status !== undefined && status !== 0) {
    logger.info({ address: myAddress, status }, 'Provider already registered');
    return;
  }

  const peerId = `chimera-fortytwo-${config.name}-${Date.now()}`;
  const name = config.name;
  const taskTypes = 1; // Text generation task type bitmask
  const stake = config.stakeWei.toString();

  logger.info(
    { peerId, address: myAddress, stake },
    'Submitting registration deploy'
  );

  const deployHash = await contracts.registerProvider({
    qvacPeerId: peerId,
    name,
    taskTypes,
    stakeAmount: stake,
  });

  logger.info({ deployHash }, 'Provider registration deploy sent');
}

main().catch((err) => {
  logger.fatal(err);
  process.exit(1);
});
