import { createHash } from 'crypto';
import { provisionGolem } from '../provision/golem.js';
import { provisionAkash } from '../provision/akash.js';
import { provisionBtfs } from '../provision/btfs.js';
import { provisionStorj } from '../provision/storj.js';
import { provisionMysterium } from '../provision/mysterium.js';
import { provisionAnyone } from '../provision/anyone.js';
import { provisionBttAi } from '../provision/btt-ai.js';
import { provisionCasper } from '../provision/casper.js';
import { upsertProvider } from '../db/providerRegistry.js';

// Canonical task types used by the coordinator and execution router.
// 0 = inference, 1 = storage, 2 = compute, 3 = bandwidth
export const TASK_TYPE = {
  INFERENCE: 0,
  STORAGE: 1,
  COMPUTE: 2,
  BANDWIDTH: 3,
};

/**
 * Execute a job via an external tasking network when no volunteer provider is available.
 *
 * @param {number} taskType - bit flag from the escrow/market contract
 * @param {object} job - parsed job details (requestHash, amount, etc.)
 * @param {object} config - runtime configuration from env
 * @returns {Promise<{success: boolean, result: string, responseHash: string, metadata: object}>}
 */
export async function executeViaTaskingNetwork(taskType, job, config = {}) {
  const typeName = taskTypeName(taskType);
  console.log(`[execution-router] fallback ${typeName} for ${job.jobId || job.jobAddress}`);

  try {
    const ctt = Number(taskType) || 0;
    if (ctt === TASK_TYPE.INFERENCE) {
      return await executeInference(job, config);
    }
    if (ctt === TASK_TYPE.COMPUTE) {
      return await executeCompute(job, config);
    }
    if (ctt === TASK_TYPE.STORAGE) {
      return await executeStorage(job, config);
    }
    if (ctt === TASK_TYPE.BANDWIDTH) {
      return await executeBandwidth(job, config);
    }
    throw new Error(`Unsupported task type: ${taskType}`);
  } catch (err) {
    console.error(`[execution-router] ${typeName} failed:`, err.message);
    return {
      success: false,
      result: '',
      responseHash: hash256(`fallback-error:${taskType}:${err.message}`),
      metadata: { error: err.message },
    };
  }
}

function needsGpu(config, job) {
  return config.requiresGpu || job.requiresGpu || process.env.FALLBACK_REQUIRES_GPU === 'true';
}

async function executeInference(job, config) {
  const prompt = decodeRequest(job.requestHash) || 'Hello';
  const defaultInference = needsGpu(config, job) ? 'akash' : 'btt-ai';
  const provider = (config.inferenceProvider || process.env.INFERENCE_PROVIDER || defaultInference).toLowerCase();
  const result = provider === 'akash'
    ? await provisionAkash({
        quantity: config.inferenceTokens || 512,
        recipient: job.consumer || config.fallbackRecipient,
        payload: prompt,
        workload: 'inference',
      })
    : await provisionBttAi({
        quantity: config.inferenceTokens || 512,
        recipient: job.consumer || config.fallbackRecipient,
        prompt,
        model: config.inferenceModel || 'llama-3.2-1b',
      });
  const network = provider === 'akash' ? 'Akash Network' : 'BTT AI';
  recordProvisionedProvider(result, network, 'Inference · GPU');
  return {
    success: true,
    result: result.output || result.endpoint || result.result || '',
    responseHash: hash256(`inference:${job.jobId || job.jobAddress}:${result.output || result.endpoint || result.result || ''}`),
    metadata: { network: network.toLowerCase(), provisionId: result.id },
  };
}

async function executeCompute(job, config) {
  const code = decodeRequest(job.requestHash) || 'echo "chimera compute"';
  const defaultCompute = needsGpu(config, job) ? 'akash' : 'golem';
  const provider = (config.computeProvider || process.env.COMPUTE_PROVIDER || defaultCompute).toLowerCase();
  const result = provider === 'akash'
    ? await provisionAkash({
        quantity: config.computeHours || 1,
        recipient: job.consumer || config.fallbackRecipient,
        payload: code,
        workload: 'compute',
      })
    : await provisionGolem({
        quantity: config.computeHours || 1,
        recipient: job.consumer || config.fallbackRecipient,
        imageTag: config.golemImageTag || 'golem/alpine:latest',
        code,
      });
  const network = provider === 'akash' ? 'Akash Network' : 'Golem Network';
  recordProvisionedProvider(result, network, 'Compute');
  return {
    success: true,
    result: JSON.stringify(result),
    responseHash: hash256(`compute:${job.jobId || job.jobAddress}:${result.id || result.rentalId || ''}`),
    metadata: { network: network.toLowerCase(), provisionId: result.id },
  };
}

async function executeStorage(job, config) {
  const payload = decodeRequest(job.requestHash) || '';
  const provider = (config.storageProvider || process.env.STORAGE_PROVIDER || 'storj').toLowerCase();
  const result = provider === 'btfs'
    ? await provisionBtfs({
        quantity: config.storageGb || 1,
        recipient: job.consumer || config.fallbackRecipient,
        data: payload,
      })
    : await provisionStorj({
        quantity: config.storageGb || 1,
        recipient: job.consumer || config.fallbackRecipient,
        data: payload,
      });
  const network = provider === 'storj' ? 'Storj Network' : 'BTFS';
  recordProvisionedProvider(result, network, 'Storage');
  return {
    success: true,
    result: result.cid || result.objectKey || result.id || '',
    responseHash: hash256(`storage:${job.jobId || job.jobAddress}:${result.cid || result.objectKey || result.id || ''}`),
    metadata: { network: network.toLowerCase(), provisionId: result.id },
  };
}

async function executeBandwidth(job, config) {
  const duration = config.bandwidthHours || 1;
  const dataGb = config.bandwidthGb || 1;
  const provider = (config.bandwidthProvider || process.env.BANDWIDTH_PROVIDER || 'mysterium').toLowerCase();
  const result = provider === 'anyone'
    ? await provisionAnyone({
        quantity: dataGb,
        recipient: job.consumer || config.fallbackRecipient,
        duration,
      })
    : await provisionMysterium({
        quantity: dataGb,
        recipient: job.consumer || config.fallbackRecipient,
        duration,
      });
  const network = provider === 'anyone' ? 'Anyone Protocol' : 'Mysterium Network';
  recordProvisionedProvider(result, network, 'Bandwidth');
  return {
    success: true,
    result: result.endpoint || result.id || '',
    responseHash: hash256(`bandwidth:${job.jobId || job.jobAddress}:${result.endpoint || result.id || ''}`),
    metadata: { network: network.toLowerCase(), provisionId: result.id },
  };
}

function decodeRequest(requestHash) {
  if (!requestHash) return null;
  const str = String(requestHash);
  // Try hex decode if it looks like a hex string
  if (/^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0 && str.length > 4) {
    try {
      const buf = Buffer.from(str, 'hex');
      const decoded = buf.toString('utf8').replace(/\0/g, '').trim();
      if (decoded) return decoded;
    } catch {}
  }
  return str;
}

function recordProvisionedProvider(result, networkName, resourceType) {
  try {
    upsertProvider({
      provider_id: result.id || result.providerId || result.deploymentId || 'unknown',
      provider_name: result.providerName || result.endpoint || result.id || result.deploymentId || 'unknown',
      network_name: networkName,
      resource_type: resourceType,
      status: result.status || 'provisioned',
      location: result.endpoint || result.apiUrl || result.gateway || null,
      specs: JSON.stringify(result),
      raw_json: result,
    });
  } catch (err) {
    console.warn(`[execution-router] provider registry write failed: ${err.message}`);
  }
}

function taskTypeName(taskType) {
  const ctt = Number(taskType) || 0;
  switch (ctt) {
    case TASK_TYPE.INFERENCE: return 'inference';
    case TASK_TYPE.STORAGE: return 'storage';
    case TASK_TYPE.COMPUTE: return 'compute';
    case TASK_TYPE.BANDWIDTH: return 'bandwidth';
    default: return 'unknown';
  }
}

function hash256(input) {
  return '0x' + createHash('sha256').update(String(input)).digest('hex');
}
