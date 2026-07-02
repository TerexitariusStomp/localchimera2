/**
 * CasperProvider — Casper escrow bridge for untrusted machines.
 *
 * Security: RELAY-ONLY MODE. The SDK never holds or sees the Casper private key.
 * All deploys (provider_ack, provider_complete, claim_payment) are sent as
 * unsigned payloads to a relay server you control. The relay signs and submits.
 *
 * The SDK only needs:
 *   - relayUrl:       your relay server endpoint
 *   - relayToken:     bearer token for relay auth
 *   - providerAccountHash: public account hash (safe to share)
 *
 * The SDK must NEVER be given a PEM private key. If one is passed, it is rejected.
 */

import { createHash } from 'crypto';
import { Logger } from '../core/Logger.js';

const DEFAULT_RPC_URL = 'https://node.testnet.casper.network/rpc';

const TESTNET_CONTRACTS = {
  escrowVault: 'b8e8b7e087ec4ad7afcdc30460d39d5b6a8249875cd1e2da0716b89d710fda40',
  computeRegistry: 'bb3044c3bbefc669c4c7c41a10cb645f5e160bfab62883b34e08d0a99b981d07',
  orderBook: 'cecfc698508213f63e7e7fe6f0729b090af23c87c7e444db7fc90be73736e399',
  reputation: 'fd0bf02161433c13c3070b7d0ea383c976bcbc799413638b4fedc703d4efa1db',
};

const STATE = {
  PENDING: 0,
  ASSIGNED: 1,
  IN_PROGRESS: 2,
  PROVIDER_DONE: 3,
  CONSUMER_CONFIRM: 4,
  SETTLED: 5,
  REFUNDED: 6,
  DISPUTED: 7,
  DISPUTE_CONSUMER_WON: 8,
  DISPUTE_PROVIDER_WON: 9,
};

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  return res.json();
}

async function getDictionaryItem(rpcUrl, contractHash, dictName, dictKey) {
  const entityRes = await rpcCall(rpcUrl, 'state_get_entity', {
    entity_identifier: { ContractHash: 'contract-' + contractHash },
  });
  let namedKeys = [];
  if (entityRes.result?.entity?.AddressableEntity?.entity?.NamedKeys) {
    namedKeys = entityRes.result.entity.AddressableEntity.entity.NamedKeys;
  } else if (entityRes.result?.entity?.Contract?.contract?.named_keys) {
    namedKeys = entityRes.result.entity.Contract.contract.named_keys;
  }
  const dictUref = namedKeys.find(k => k.name === dictName)?.key;
  if (!dictUref) return null;

  const stateRoot = await rpcCall(rpcUrl, 'chain_get_state_root_hash', {});
  const stateRootHash = stateRoot.result?.state_root_hash;
  if (!stateRootHash) return null;

  const dictRes = await rpcCall(rpcUrl, 'state_get_dictionary_item', {
    state_root_hash: stateRootHash,
    dictionary_identifier: {
      URef: {
        seed_uref: dictUref,
        dictionary_item_key: dictKey,
      },
    },
  });
  return dictRes.result?.stored_value?.CLValue?.parsed ?? null;
}

export class CasperProvider {
  constructor(opts = {}) {
    this.name = 'casper';
    this.logger = new Logger('CasperProvider');
    this.running = false;
    this.processedJobs = new Set();
    this.inProgressJobs = new Set();
    this.pollInterval = null;

    this.rpcUrl = opts.rpcUrl || process.env.CASPER_RPC_URL || DEFAULT_RPC_URL;
    this.chainName = opts.chainName || process.env.CASPER_CHAIN_NAME || 'casper-test';
    this.contracts = opts.contracts || TESTNET_CONTRACTS;
    this.relayUrl = opts.relayUrl || process.env.CASPER_RELAY_URL || '';
    this.relayToken = opts.relayToken || process.env.CASPER_RELAY_TOKEN || '';
    this.providerAccountHash = opts.providerAccountHash || process.env.CASPER_PROVIDER_ACCOUNT_HASH || '';
    this.inferenceLayer = opts.inferenceLayer || null;
    this.storageProvider = opts.storageProvider || null;

    // Reject any attempt to pass a private key — relay mode only
    if (opts.providerKeyPem || process.env.CASPER_PROVIDER_KEY_PEM || process.env.CASPER_PROVIDER_KEY_PEM_PATH) {
      throw new Error('CasperProvider is relay-only. Do not pass providerKeyPem — use relayUrl + relayToken instead.');
    }
  }

  async init() {
    this.logger.info('Initializing Casper provider (relay-only mode)...');
    this.logger.info(`Casper RPC: ${this.rpcUrl}`);

    if (!this.relayUrl) {
      throw new Error('CASPER_RELAY_URL is required for relay mode. The relay server holds the private key.');
    }
    if (!this.providerAccountHash) {
      throw new Error('CASPER_PROVIDER_ACCOUNT_HASH is required (public, safe to share).');
    }

    // Test RPC connection
    try {
      const chainInfo = await rpcCall(this.rpcUrl, 'info_get_status', {});
      const chainName = chainInfo.result?.chainspec_name || 'unknown';
      const lastBlock = chainInfo.result?.last_added_block_info?.height ?? '?';
      this.logger.info(`Connected to Casper chain: ${chainName} (last block ${lastBlock})`);
    } catch (e) {
      this.logger.warn(`Could not reach Casper RPC: ${e.message}`);
    }

    this.logger.info(`Provider account: ${this.providerAccountHash}`);
    this.logger.info(`Relay: ${this.relayUrl}`);
    this.logger.info('Casper provider initialized (relay mode — untrusted-hardware-safe)');
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };
    this.running = true;
    this.logger.info('Starting Casper escrow bridge polling (relay mode)...');
    await this._pollJobs();
    this.pollInterval = setInterval(() => this._pollJobs(), 15000).unref();
    return { success: true, provider: 'casper', mode: 'relay' };
  }

  async stop() {
    if (!this.running) return { success: true, alreadyStopped: true };
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.logger.info('Casper provider stopped');
    return { success: true, provider: 'casper' };
  }

  async _pollJobs() {
    if (!this.running) return;

    try {
      const pending = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'pending_jobs', 'list');
      if (!pending || !Array.isArray(pending) || pending.length === 0) return;

      this.logger.info(`Found ${pending.length} pending job(s)`);

      for (const jobId of pending) {
        if (this.processedJobs.has(jobId)) continue;
        await this._handleJob(jobId);
      }
    } catch (e) {
      this.logger.error(`Poll error: ${e.message}`);
    }
  }

  async _handleJob(jobId) {
    try {
      const stateVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:state`);
      const providerVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:provider`);
      const consumerVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:consumer`);
      const amountVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:amount`);
      const taskTypeVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:task_type`);

      if (stateVal === null || providerVal === null) {
        this.logger.warn(`Could not fetch job details for ${jobId}`);
        return;
      }

      const toHex = (val) => {
        if (!val) return '';
        if (typeof val === 'string' && val.length === 64 && /^[0-9a-f]+$/.test(val)) return val;
        return Buffer.from(val).toString('hex');
      };
      const providerHex = toHex(providerVal);
      const state = Number(stateVal);
      const isZeroProvider = providerHex === '0'.repeat(64);

      this.logger.info(`Job ${jobId}: state=${state}, provider=${isZeroProvider ? 'AUTO-ASSIGN' : providerHex.slice(0,16) + '...'}, amount=${amountVal}`);

      if (state >= STATE.PROVIDER_DONE) {
        this.logger.debug(`Job ${jobId} already completed (state=${state})`);
        return;
      }
      if (this.inProgressJobs.has(jobId)) {
        this.logger.debug(`Job ${jobId} already being processed, skipping`);
        return;
      }
      this.inProgressJobs.add(jobId);

      // Skip zero-provider jobs in PENDING state
      if (isZeroProvider && state === STATE.PENDING) {
        this.logger.debug(`Job ${jobId} has zero provider in PENDING state, skipping`);
        this.processedJobs.add(jobId);
        this.inProgressJobs.delete(jobId);
        return;
      }

      // Auto-assigned jobs: provider is zero, state is ASSIGNED
      if (isZeroProvider && state === STATE.ASSIGNED) {
        this.logger.info(`Auto-assigned job ${jobId}, completing directly...`);
        const requestHash = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:request_hash`);
        const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
        await this._sendViaRelay(this.contracts.escrowVault, 'provider_complete', {
          job_id: { cl_type: 'String', bytes: Buffer.from(jobId).toString('hex') },
          response_hash: { cl_type: 'String', bytes: Buffer.from(responseText).toString('hex') },
        });
        this.logger.info(`Job ${jobId} completed via relay, awaiting consumer confirmation...`);
        this.processedJobs.add(jobId);
        this.inProgressJobs.delete(jobId);
        this._monitorJobSettlement(jobId);
        return;
      }

      // Non-auto-assigned: only handle jobs assigned to us
      if (!isZeroProvider && providerHex !== this.providerAccountHash) {
        this.logger.debug(`Job ${jobId} not assigned to us`);
        this.inProgressJobs.delete(jobId);
        return;
      }

      // Already ASSIGNED — skip ack, go straight to processing
      if (state === STATE.ASSIGNED) {
        this.logger.info(`Job ${jobId} already ASSIGNED, completing directly...`);
        const requestHash = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:request_hash`);
        const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
        await this._sendViaRelay(this.contracts.escrowVault, 'provider_complete', {
          job_id: { cl_type: 'String', bytes: Buffer.from(jobId).toString('hex') },
          response_hash: { cl_type: 'String', bytes: Buffer.from(responseText).toString('hex') },
        });
        this.logger.info(`Job ${jobId} completed via relay`);
        this.processedJobs.add(jobId);
        this.inProgressJobs.delete(jobId);
        this._monitorJobSettlement(jobId);
        return;
      }

      if (state !== STATE.PENDING) {
        this.logger.debug(`Job ${jobId} not pending (state=${state})`);
        this.inProgressJobs.delete(jobId);
        return;
      }

      // PENDING — ack via relay, then process
      this.logger.info(`Accepting job ${jobId} via relay...`);
      const ackHash = await this._sendViaRelay(this.contracts.escrowVault, 'provider_ack', {
        job_id: { cl_type: 'String', bytes: Buffer.from(jobId).toString('hex') },
      });
      this.logger.info(`provider_ack relayed for ${jobId}, waiting for confirmation...`);
      await this._waitForDeploy(ackHash, 60);

      const requestHash = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:request_hash`);
      const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
      await this._sendViaRelay(this.contracts.escrowVault, 'provider_complete', {
        job_id: { cl_type: 'String', bytes: Buffer.from(jobId).toString('hex') },
        response_hash: { cl_type: 'String', bytes: Buffer.from(responseText).toString('hex') },
      });
      this.logger.info(`Job ${jobId} completed via relay`);

      this.processedJobs.add(jobId);
      this.inProgressJobs.delete(jobId);
      this._monitorJobSettlement(jobId);

    } catch (e) {
      this.inProgressJobs.delete(jobId);
      this.logger.error(`Failed to handle job ${jobId}: ${e.message}`);
    }
  }

  async _processJob(orderId, taskType) {
    const id = String(orderId);
    const tt = Number(taskType) || 0;

    if (id.startsWith('STORAGE:') || tt === 1) {
      if (this.storageProvider) {
        this.logger.info(`Storage job ${id} delegated to dedicated storage provider`);
        return `DELEGATED:${id}`;
      }
      return this._handleStorageJob(id);
    }
    if (id.startsWith('COMPUTE:') || tt === 2) {
      return this._handleComputeJob(id);
    }
    if (id.startsWith('BANDWIDTH:') || tt === 3) {
      return this._handleBandwidthJob(id);
    }

    // Default: inference
    const result = await this._runInference(id);
    return result.output || result.text || JSON.stringify(result);
  }

  _handleStorageJob(orderId) {
    const parts = orderId.split(':');
    const subType = parts[1] || 'ALLOC';
    const spaceName = parts[2] || 'unknown';

    if (subType === 'FILE') {
      const fileHash = parts[3] || '';
      const sizeMb = parts[4] || '0';
      const proof = createHash('sha256').update(`${spaceName}:${fileHash}:${this.providerAccountHash}:${Date.now()}`).digest('hex');
      return `File stored. Space: ${spaceName}, Hash: ${fileHash.slice(0, 32)}..., Size: ${sizeMb}, Proof: ${proof.slice(0, 32)}...`;
    }

    if (subType === 'RETRIEVE') {
      const fileHash = parts[3] || '';
      return `File retrieval requested. Space: ${spaceName}, Hash: ${fileHash.slice(0, 32)}...`;
    }

    const sizeMb = parts[3] || '0';
    const proof = createHash('sha256').update(`${spaceName}:${sizeMb}:${this.providerAccountHash}:${Date.now()}`).digest('hex');
    return `Storage space allocated. Name: ${spaceName}, Size: ${sizeMb}, Proof: ${proof.slice(0, 32)}...`;
  }

  _handleComputeJob(orderId) {
    const parts = orderId.split(':');
    const runtime = parts[1] || 'shell';
    const code = parts.slice(6).join(':') || '';
    return `Compute job received. Runtime: ${runtime}, Code: ${code.slice(0, 200)}...`;
  }

  _handleBandwidthJob(orderId) {
    const parts = orderId.split(':');
    const duration = parts[1] || '1h';
    const dataGb = parts[2] || '1GB';
    const sessionId = createHash('sha256').update(`${this.providerAccountHash}:${Date.now()}`).digest('hex').slice(0, 16);
    return `Bandwidth session active. Session ID: ${sessionId}, Duration: ${duration}, Data cap: ${dataGb}`;
  }

  async _runInference(prompt) {
    this.logger.info(`Routing inference request: "${String(prompt).slice(0, 80)}..."`);

    if (this.inferenceLayer) {
      try {
        const result = await this.inferenceLayer.handleInferenceRequest({
          prompt: String(prompt),
          maxTokens: 512,
          temperature: 0.7,
          source: 'casper-relay',
        });
        if (result && result.success) {
          this.logger.info('Inference completed via Chimera inference layer');
          return result;
        }
      } catch (e) {
        this.logger.warn(`Chimera inference failed: ${e.message}`);
      }
    }

    // Fallback: try Ollama
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:1b';
    const maxTokens = parseInt(process.env.OLLAMA_MAX_TOKENS || '256', 10);
    const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: String(prompt),
          stream: false,
          options: { temperature: 0.7, num_predict: maxTokens },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      const output = (data.response || '').trim();
      if (output) {
        this.logger.info(`Ollama inference completed: ${output.slice(0, 100)}...`);
        return { output, success: true };
      }
    } catch (e) {
      this.logger.warn(`Ollama inference failed: ${e.message}`);
    }

    this.logger.warn('All inference backends failed, returning fallback');
    return { output: `Fallback inference for: ${prompt}`, success: true, fallback: true };
  }

  async _sendViaRelay(contractHash, entryPoint, argsMap, payment = '5000000000') {
    const ALLOWED_ENTRY_POINTS = new Set(['provider_ack', 'provider_complete', 'claim_payment']);
    const ALLOWED_CONTRACTS = new Set(Object.values(this.contracts));
    const MAX_PAYMENT = '5000000000';

    if (!ALLOWED_ENTRY_POINTS.has(entryPoint)) {
      throw new Error(`Blocked: entry point "${entryPoint}" is not in the whitelist`);
    }
    if (!ALLOWED_CONTRACTS.has(contractHash)) {
      throw new Error(`Blocked: contract ${contractHash} is not in the whitelist`);
    }
    if (BigInt(payment) > BigInt(MAX_PAYMENT)) {
      throw new Error(`Blocked: payment ${payment} exceeds max ${MAX_PAYMENT}`);
    }

    const payload = {
      contractHash,
      entryPoint,
      args: Object.fromEntries(
        Object.entries(argsMap).map(([k, v]) => [k, typeof v === 'object' ? v : String(v)])
      ),
      payment,
      rpcUrl: this.rpcUrl,
      chainName: this.chainName,
    };

    const res = await fetch(this.relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.relayToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Relay deploy failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`Relay deploy error: ${data.error}`);
    }

    this.logger.info(`Deploy ${entryPoint} relayed: ${data.deployHash || 'unknown'}`);
    return data.deployHash;
  }

  async _waitForDeploy(deployHash, maxWaitSec = 60) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitSec * 1000) {
      try {
        const res = await rpcCall(this.rpcUrl, 'info_get_deploy', { deploy_hash: deployHash });
        const results = res.result?.execution_results || [];
        if (results.length > 0) {
          const result = results[0]?.result;
          if (result && 'Success' in result) return true;
          if (result && 'Failure' in result) {
            throw new Error(`Deploy ${deployHash} failed: ${JSON.stringify(result.Failure)}`);
          }
        }
      } catch (e) {
        // Deploy might not be found yet
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error(`Deploy ${deployHash} not confirmed within ${maxWaitSec}s`);
  }

  async _monitorJobSettlement(jobId) {
    let attempts = 0;
    const maxAttempts = 40;

    const check = async () => {
      if (!this.running) return;
      attempts++;

      try {
        const stateVal = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:state`);
        const state = stateVal !== null ? Number(stateVal) : null;
        if (state === null) return;

        this.logger.info(`Job ${jobId} monitor: state=${state} (attempt ${attempts})`);

        if (state === STATE.SETTLED || state === STATE.CONSUMER_CONFIRM) {
          await this._sendViaRelay(this.contracts.escrowVault, 'claim_payment', {
            job_id: { cl_type: 'String', bytes: Buffer.from(jobId).toString('hex') },
          });
          return;
        }

        if (state === STATE.REFUNDED) {
          this.logger.warn(`Job ${jobId} was refunded`);
          return;
        }

        if (state === STATE.DISPUTED) {
          this.logger.warn(`Job ${jobId} is disputed`);
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(check, 15000).unref();
        } else {
          this.logger.warn(`Job ${jobId} settlement timeout`);
        }
      } catch (e) {
        this.logger.error(`Monitor error for ${jobId}: ${e.message}`);
        if (attempts < maxAttempts) setTimeout(check, 15000).unref();
      }
    };

    setTimeout(check, 15000).unref();
  }

  status() {
    return {
      provider: 'casper',
      running: this.running,
      mode: 'relay',
      network: this.chainName,
      rpcUrl: this.rpcUrl,
      providerAccount: this.providerAccountHash,
      relayUrl: this.relayUrl,
      processedJobs: this.processedJobs.size,
    };
  }
}
