/**
 * Chimera-Fortytwo Node Main Entry Point
 *
 * Orchestrates:
 * 1. Smart contract connection (ComputeRegistry, EscrowVault, etc.)
 * 2. Coordinator WebSocket client
 * 3. Inference backend
 * 4. Swarm consensus manager
 * 5. Job lifecycle (receive -> infer -> optionally swarm -> submit -> settle)
 */

import { config, networkConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import {
  CasperMarketplaceClient,
  type ContractAddresses,
} from '../contracts/marketplace.js';
import { CoordinatorClient } from '../coordinator/client.js';
import { createInferenceBackend } from './inference.js';
import { SwarmManager } from '../consensus/swarm.js';
import {
  InferenceRequest,
  JobPayload,
  JobResult,
} from '../types/index.js';
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
    computeRegistry: json.computeRegistry,
    orderBook: json.orderBook,
    escrowVault: json.escrowVault,
    reputation: json.reputation,
  };
}

async function main(): Promise<void> {
  logger.info({ nodeName: config.name, region: config.region }, 'Starting Chimera-Fortytwo node');

  // ─── Load Contracts ───────────────────────────────────────────────────────
  const addresses = loadContractAddresses();
  const pemPath = process.env.CSPR_PEM_PATH || '/tmp/casper-keys/Account 1_secret_key.pem';
  const contracts = new CasperMarketplaceClient(pemPath, addresses);

  // Verify provider registration
  const myAddress = contracts.getAccountHash();
  const status = await contracts.getProviderStatus(myAddress);
  if (status !== 1) { // STATUS_ACTIVE = 1
    logger.error(
      { address: myAddress, status },
      'Node not registered or not active on ComputeRegistry. Run `npm run register` first.'
    );
    process.exit(1);
  }

  logger.info(
    { address: myAddress, status },
    'Provider verified on ComputeRegistry'
  );

  // ─── Initialize Backend ────────────────────────────────────────────────────
  const inferenceBackend = createInferenceBackend(config);
  await inferenceBackend.initialize();

  // ─── Initialize Swarm Manager ────────────────────────────────────────────
  const swarm = new SwarmManager({
    nodeId: myAddress,
    config,
    contracts,
  });

  // ─── Initialize Coordinator Client ─────────────────────────────────────────
  const coordinator = new CoordinatorClient({
    wsUrl: networkConfig.coordinatorWsUrl,
    authToken: await generateAuthToken(myAddress),
    publisherId: myAddress,
    heartbeatIntervalMs: 10000,
  });

  // ─── Event Handlers ──────────────────────────────────────────────────────

  coordinator.on('job', async (job: JobPayload) => {
    try {
      await handleJob(job, inferenceBackend, swarm, coordinator, contracts);
    } catch (err) {
      logger.error({ err, jobId: job.jobId }, 'Job handler failed');
    }
  });

  coordinator.on('result:ack', (ack) => {
    if (ack.accepted && ack.earnings) {
      logger.info(
        { jobId: ack.jobId, earnings: ack.earnings.amount, txId: ack.settlementTxId },
        'Job settled on-chain'
      );
    } else if (!ack.accepted) {
      logger.warn({ jobId: ack.jobId, retryAfterMs: ack.retryAfterMs }, 'Result rejected');
    }
  });

  // Heartbeat enrichment
  coordinator.on('heartbeat:ack', () => {
    // noop; coordinator handles heartbeat submission
  });

  // ─── Start ───────────────────────────────────────────────────────────────
  coordinator.connect();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down node...');
    coordinator.disconnect();
    await inferenceBackend.teardown();
    // Casper client is stateless; no disconnect needed
    process.exit(0);
  });
}

async function handleJob(
  job: JobPayload,
  backend: Awaited<ReturnType<typeof createInferenceBackend>>,
  swarm: SwarmManager,
  coordinator: CoordinatorClient,
  contracts: CasperMarketplaceClient
): Promise<void> {
  logger.info({ jobId: job.jobId, modelId: job.modelId }, 'Handling job');

  const request: InferenceRequest = {
    jobId: job.jobId,
    modelId: job.modelId,
    prompt: String(job.input),
    params: job.params,
    deadline: job.deadline,
  };

  // Check if swarm consensus is requested (e.g., via job metadata)
  const useSwarm = false; // TODO: derive from job metadata or coordinator flag

  let result: { output: string; usage: JobResult['usage'] };

  if (useSwarm) {
    // In a real scenario, we would gather peer responses first via swarm consensus
    // For now, run local inference via swarm manager
    const localResult = await swarm.runInference(request);
    result = { output: localResult.output, usage: localResult.usage };
  } else {
    const localResult = await backend.run(request);
    result = { output: localResult.output, usage: localResult.usage };
  }

  // Submit result hash to EscrowVault
  const resultHash = hashResult(result.output);
  try {
    await contracts.providerComplete(job.jobId, resultHash);
    logger.info({ jobId: job.jobId, resultHash }, 'ProviderComplete submitted on-chain');
  } catch (err) {
    logger.error({ err, jobId: job.jobId }, 'Failed to submit providerComplete');
  }

  // Submit full result to coordinator
  const jobResult: JobResult = {
    jobId: job.jobId,
    output: result.output,
    usage: result.usage,
  };
  coordinator.submitResult(jobResult);
}

async function generateAuthToken(_address: string): Promise<string> {
  // In production, sign a SIWE message or JWT with the node's wallet.
  // For testnet, a simple timestamp-based token.
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `chimera-testnet-${timestamp}`;
  return Buffer.from(signature).toString('base64');
}

function hashResult(output: string): string {
  // Simple hash for testnet; production uses keccak256 or sha256
  let h = 0;
  for (let i = 0; i < output.length; i++) {
    h = ((h << 5) - h + output.charCodeAt(i)) | 0;
  }
  return `0x${Math.abs(h).toString(16).padStart(64, '0')}`;
}

main().catch((err) => {
  logger.fatal(err);
  process.exit(1);
});
