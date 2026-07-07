import 'dotenv/config';
import { RequestNetwork } from '@requestnetwork/request-client.js';
import { EthereumPrivateKeySignatureProvider } from '@requestnetwork/epk-signature';
import { pollPendingOrders, updateOrderStatus } from './kv-store.js';
import { verifyPayment } from './payment-detector.js';
import { provisionResource } from './provision/index.js';
import { recordDeployment, startScalingController } from './scaling-controller.js';
import { JobDispatcher } from './dispatcher/job-dispatcher.js';

const RPC_URL = process.env.RPC_URL || 'https://sepolia.gateway.request.network/';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || '30000');

if (!PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY env var is required');
}

const signatureProvider = new EthereumPrivateKeySignatureProvider({
  method: 'private-key',
  key: PRIVATE_KEY,
});

const requestNetwork = new RequestNetwork({
  nodeConnectionConfig: { baseURL: RPC_URL },
  signatureProvider,
});

async function processOrder(order) {
  console.log(`[provisioner] processing order ${order.id}`);

  try {
    // 1. Verify payment via Request Network
    const paymentStatus = await verifyPayment(requestNetwork, order.requestId);
    if (!paymentStatus.paid) {
      console.log(`[provisioner] order ${order.id} not paid yet`);
      return;
    }

    await updateOrderStatus(order.id, 'payment_confirmed', { txHash: paymentStatus.txHash });

    // 2. Provision the resource
    // On-chain bridging and token conversion are handled by the ChimeraBridgeDispatcher (Li.Fi),
    // so the worker no longer swaps via CoW Protocol.
    const provision = await provisionResource(order.resourceType, {
      quantity: order.quantity,
      recipient: order.payerAddress,
      network: order.network,
      imageTag: order.imageTag,
      domain: order.domain,
    });

    await updateOrderStatus(order.id, 'provisioned', {
      provisionTxHash: provision.txHash,
      provisionId: provision.id,
    });

    // 4. Register the deployment for scaling via Streamr
    await recordDeployment(provision.id, {
      resourceType: order.resourceType,
      quantity: order.quantity,
      recipient: order.payerAddress,
      instances: [{ id: provision.id, createdAt: new Date().toISOString() }],
      desiredCount: 1,
      cpuUtilization: 0,
      queueDepth: 0,
    });

    console.log(`[provisioner] order ${order.id} provisioned`);
  } catch (err) {
    console.error(`[provisioner] failed order ${order.id}:`, err.message);
    await updateOrderStatus(order.id, 'failed', { error: err.message });
  }
}

async function main() {
  console.log('[provisioner] worker started');

  // Start scaling controller in the background.
  startScalingController().catch((err) => {
    console.error('[provisioner] scaling controller error:', err);
  });

  // Start escrow fallback dispatcher (volunteer -> tasking network).
  const dispatcher = new JobDispatcher({
    fallbackRecipient: process.env.FALLBACK_RECIPIENT || PRIVATE_KEY,
    inferenceTokens: Number(process.env.FALLBACK_INFERENCE_TOKENS || '512'),
    inferenceModel: process.env.FALLBACK_INFERENCE_MODEL || 'llama-3.2-1b',
    computeHours: Number(process.env.FALLBACK_COMPUTE_HOURS || '1'),
    golemImageTag: process.env.FALLBACK_GOLEM_IMAGE_TAG || 'golem/alpine:latest',
    storageGb: Number(process.env.FALLBACK_STORAGE_GB || '1'),
    bandwidthHours: Number(process.env.FALLBACK_BANDWIDTH_HOURS || '1'),
    bandwidthGb: Number(process.env.FALLBACK_BANDWIDTH_GB || '1'),
  });
  dispatcher.start().catch((err) => {
    console.error('[provisioner] dispatcher error:', err);
  });

  while (true) {
    try {
      const orders = await pollPendingOrders();
      for (const order of orders) {
        await processOrder(order);
      }
    } catch (err) {
      console.error('[provisioner] poll error:', err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error('[provisioner] fatal:', err);
  process.exit(1);
});
