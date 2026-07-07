import { publishTelemetry } from './infra/streamr.js';
import { provisionResource } from './provision/index.js';

// State snapshots can be stored on BTFS for durability.
// This module keeps in-memory state; a real deployment reads the latest BTFS snapshot
// or reconstructs current state from the Streamr event stream.

const MIN_INSTANCES = Number(process.env.MIN_INSTANCES || '1');
const MAX_INSTANCES = Number(process.env.MAX_INSTANCES || '10');
const SCALE_UP_THRESHOLD = Number(process.env.SCALE_UP_THRESHOLD || '0.8');
const SCALE_DOWN_THRESHOLD = Number(process.env.SCALE_DOWN_THRESHOLD || '0.2');
const SCALE_INTERVAL_MS = Number(process.env.SCALE_INTERVAL_MS || '60000');

// In-memory deployment registry. In production, hydrate this from BTFS or Streamr.
const deploymentState = new Map();

export async function recordDeployment(deploymentId, state) {
  deploymentState.set(deploymentId, state);
  await publishTelemetry({ deploymentId, event: 'state-update', state });
}

export async function evaluateScaling(deploymentId) {
  const state = deploymentState.get(deploymentId);
  if (!state) return;

  const { instances = [], cpuUtilization = 0, queueDepth = 0 } = state;
  const currentCount = instances.length;
  let desiredCount = currentCount;

  if (cpuUtilization > SCALE_UP_THRESHOLD || queueDepth > 0) {
    desiredCount = Math.min(currentCount + 1, MAX_INSTANCES);
  } else if (cpuUtilization < SCALE_DOWN_THRESHOLD && currentCount > MIN_INSTANCES) {
    desiredCount = Math.max(currentCount - 1, MIN_INSTANCES);
  }

  if (desiredCount !== currentCount) {
    await publishTelemetry({
      deploymentId,
      event: 'scale',
      from: currentCount,
      to: desiredCount,
      cpuUtilization,
      queueDepth,
    });
    await scaleDeployment(deploymentId, desiredCount, state);
  }
}

async function scaleDeployment(deploymentId, desiredCount, state) {
  const current = state.instances || [];
  const diff = desiredCount - current.length;

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      const provision = await provisionResource(state.resourceType, {
        quantity: state.quantity,
        recipient: state.recipient,
        deploymentId: `${deploymentId}-${Date.now()}-${i}`,
      });
      current.push({ id: provision.id, createdAt: new Date().toISOString() });
    }
  } else if (diff < 0) {
    const toRemove = current.splice(diff);
    for (const instance of toRemove) {
      await publishTelemetry({ deploymentId, event: 'scale-down', instanceId: instance.id });
    }
  }

  await recordDeployment(deploymentId, { ...state, instances: current, desiredCount });
}

export async function startScalingController() {
  console.log('[scaling] controller started');
  while (true) {
    try {
      for (const deploymentId of deploymentState.keys()) {
        await evaluateScaling(deploymentId);
      }
    } catch (err) {
      console.error('[scaling] error:', err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, SCALE_INTERVAL_MS));
  }
}
