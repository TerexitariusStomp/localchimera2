import { readFileSync } from 'fs';

let sdk;
try {
  sdk = await import('casper-js-sdk');
} catch (e) {
  console.warn('[casper] casper-js-sdk not installed; Casper fallback disabled:', e.message);
}

const DEFAULT_RPC_URL = process.env.CASPER_RPC_URL || 'https://node.testnet.casper.network/rpc';
const DEFAULT_CHAIN_NAME = process.env.CASPER_CHAIN_NAME || 'casper-test';

const TESTNET_CONTRACTS = {
  escrowVault: process.env.CASPER_ESCROW_VAULT || 'b8e8b7e087ec4ad7afcdc30460d39d5b6a8249875cd1e2da0716b89d710fda40',
  computeRegistry: process.env.CASPER_COMPUTE_REGISTRY || 'bb3044c3bbefc669c4c7c41a10cb645f5e160bfab62883b34e08d0a99b981d07',
  inferenceMarket: process.env.CASPER_INFERENCE_MARKET || '663812cfe4103b9d1584e3caccf7be9188e4c6c5f77851dacb64b8f308947f82',
  storageMarket: process.env.CASPER_STORAGE_MARKET || '1e884efc1a97e698149b91e5ffb7d1e8cda85598a4db75ac5b3be379418a2dca',
  computeMarket: process.env.CASPER_COMPUTE_MARKET || 'c1e96f072f632d681106d367cd34b4ec9d86258f10106c2cb9dcf23306c53af8',
  bandwidthMarket: process.env.CASPER_BANDWIDTH_MARKET || '4361a385408288194b54c7297e7f1754833f31a2ae88f3d1c5eabee4798897a1',
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
      URef: { seed_uref: dictUref, dictionary_item_key: dictKey },
    },
  });
  return dictRes.result?.stored_value?.CLValue?.parsed ?? null;
}

export class CasperClient {
  constructor(config = {}) {
    if (!sdk) throw new Error('casper-js-sdk not available');
    this.config = config;
    this.rpcUrl = config.rpcUrl || DEFAULT_RPC_URL;
    this.chainName = config.chainName || DEFAULT_CHAIN_NAME;
    this.contracts = config.contracts || TESTNET_CONTRACTS;
    this.providerKey = null;
    this.providerAccountHash = null;

    const pem = config.providerKeyPem || process.env.CASPER_PROVIDER_KEY_PEM;
    const pemPath = config.providerKeyPemPath || process.env.CASPER_PROVIDER_KEY_PEM_PATH;
    if (pem) {
      const cleanPem = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
      this.providerKey = sdk.PrivateKey.fromPem(cleanPem, sdk.KeyAlgorithm.SECP256K1);
      this.providerAccountHash = this.providerKey.publicKey.accountHash().toHex();
    } else if (pemPath) {
      const filePem = readFileSync(pemPath, 'utf8');
      this.providerKey = sdk.PrivateKey.fromPem(filePem, sdk.KeyAlgorithm.SECP256K1);
      this.providerAccountHash = this.providerKey.publicKey.accountHash().toHex();
    }
  }

  async getPendingJobs() {
    try {
      const pending = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'pending_jobs', 'list');
      if (!pending || !Array.isArray(pending) || pending.length === 0) return [];
      return pending;
    } catch (e) {
      console.error('[casper] getPendingJobs failed:', e.message);
      return [];
    }
  }

  async getJob(jobId) {
    try {
      const state = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:state`);
      const provider = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:provider`);
      const consumer = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:consumer`);
      const amount = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:amount`);
      const taskType = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:task_type`);
      const requestHash = await getDictionaryItem(this.rpcUrl, this.contracts.escrowVault, 'jobs_dict', `${jobId}:request_hash`);
      return {
        jobId,
        state: state !== null ? Number(state) : null,
        provider: toHex(provider),
        consumer: toHex(consumer),
        amount: amount !== null ? String(amount) : null,
        taskType: taskType !== null ? Number(taskType) : 0,
        requestHash: requestHash !== null ? String(requestHash) : null,
      };
    } catch (e) {
      console.error(`[casper] getJob(${jobId}) failed:`, e.message);
      return null;
    }
  }

  async providerAck(jobId) {
    return this.sendDeploy(this.contracts.escrowVault, 'provider_ack', {
      job_id: sdk.CLValue.newCLString(jobId),
    });
  }

  async providerComplete(jobId, responseHash) {
    return this.sendDeploy(this.contracts.escrowVault, 'provider_complete', {
      job_id: sdk.CLValue.newCLString(jobId),
      response_hash: sdk.CLValue.newCLString(responseHash),
    });
  }

  async claimPayment(jobId) {
    return this.sendDeploy(this.contracts.escrowVault, 'claim_payment', {
      job_id: sdk.CLValue.newCLString(jobId),
    });
  }

  async sendDeploy(contractHash, entryPoint, argsMap, payment = '5000000000') {
    if (!this.providerKey) throw new Error('Casper provider key not configured');
    const publicKey = this.providerKey.publicKey;
    const args = sdk.Args.fromMap(argsMap);
    const contractHashObj = sdk.ContractHash.newContract(contractHash);
    const storedContract = new sdk.StoredContractByHash(contractHashObj, entryPoint, args);
    const session = new sdk.ExecutableDeployItem();
    session.storedContractByHash = storedContract;
    const paymentItem = sdk.ExecutableDeployItem.standardPayment(payment);
    const header = sdk.DeployHeader.default();
    header.account = publicKey;
    header.chainName = this.chainName;
    const deploy = sdk.Deploy.makeDeploy(header, paymentItem, session);
    const transaction = sdk.Transaction.fromDeploy(deploy);
    transaction.sign(this.providerKey);
    const wrapper = transaction.getTransactionWrapper();
    const wrapperJSON = sdk.TransactionWrapper.toJSON(wrapper);
    const res = await rpcCall(this.rpcUrl, 'account_put_transaction', { transaction: wrapperJSON });
    if (res.error) throw new Error(`Transaction failed: ${res.error.message}`);
    return res.result?.transaction_hash || res.result?.deploy_hash;
  }
}

function toHex(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.length === 64 && /^[0-9a-f]+$/.test(val)) return val;
  try { return Buffer.from(val).toString('hex'); } catch { return String(val); }
}

export { STATE as CASPER_JOB_STATE };
