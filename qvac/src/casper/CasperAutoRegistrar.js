import { readFileSync, existsSync } from 'fs';
import { Logger } from '../core/Logger.js';

const sdk = await import('casper-js-sdk').catch(() => null);

const CHAIN_NAME = process.env.CASPER_CHAIN_NAME || 'casper-test';
const RPC_URL = process.env.CASPER_RPC_URL || 'https://node.testnet.casper.network/rpc';
const PAYMENT = process.env.CASPER_PAYMENT || '50000000000';

const CONTRACT_HASHES = {
  inferenceMarket: process.env.CASPER_INFERENCE_MARKET || '116a2fa615c47c6cf027b3c8238cee265cb5271cdc8398fa98452ccaaf11d8d9',
  storageMarket: process.env.CASPER_STORAGE_MARKET || '8b8b61ff8b5792c920e4dcda6a4a1357a01ccbec1339d7106fd1db67eeced49c',
  computeMarket: process.env.CASPER_COMPUTE_MARKET || 'ee722f68272a3f50d913b645474ccff5c5ba1281f2f14d6dae925480c1931bad',
  bandwidthMarket: process.env.CASPER_BANDWIDTH_MARKET || 'a69dc20172f48f6193b3aa9e653c663e91386ca923073fccc965eb0a1d5538ea',
};

const DEFAULT_STAKE_MOTES = '1000000000'; // 1 CSPR

export class CasperAutoRegistrar {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('CasperAutoRegistrar');
    this.client = null;
    this.privateKey = null;
    this.registered = new Set();
  }

  async initialize() {
    if (!sdk) {
      this.logger.warn('casper-js-sdk not installed — Casper auto-registration disabled');
      return false;
    }

    const casperConfig = this.config?.miners?.casper?.config || {};
    const pemPath = casperConfig.providerKeyPem || process.env.CSPR_PEM_PATH || '';
    if (!pemPath || !existsSync(pemPath)) {
      this.logger.warn('No Casper PEM key configured — auto-registration disabled. Set miners.casper.config.providerKeyPem in config.json or CSPR_PEM_PATH env var.');
      return false;
    }

    try {
      const pem = readFileSync(pemPath, 'utf-8');
      this.privateKey = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
      this.client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));
      this.logger.info(`Casper auto-registrar initialized — account: ${this.privateKey.publicKey.accountHash().toPrefixedString()}`);
      return true;
    } catch (e) {
      this.logger.error(`Failed to initialize Casper auto-registrar: ${e.message}`);
      return false;
    }
  }

  getAccountHash() {
    return this.privateKey?.publicKey?.accountHash()?.toPrefixedString() || '';
  }

  async _sendDeploy(session) {
    const payment = sdk.ExecutableDeployItem.standardPayment(PAYMENT);
    const header = sdk.DeployHeader.default();
    header.account = this.privateKey.publicKey;
    header.chainName = CHAIN_NAME;
    header.timestamp = new Date();
    const deploy = sdk.Deploy.makeDeploy(header, payment, session);
    deploy.sign(this.privateKey);
    const result = await this.client.putDeploy(deploy);
    return result.deployHash;
  }

  async _callContract(contractHash, entryPoint, args) {
    const hashHex = contractHash.replace('contract-', '').replace('hash-', '');
    const session = new sdk.ExecutableDeployItem();
    session.storedContractByHash = {
      hash: Buffer.from(hashHex, 'hex'),
      entryPoint,
      args,
    };
    return this._sendDeploy(session);
  }

  async _checkAlreadyRegistered(contractHash, dictKeyPrefix) {
    try {
      const result = await this.client.queryLatestGlobalState(contractHash, [`${dictKeyPrefix}.status`]);
      return result?.storedValue?.clValue?.parsed !== undefined;
    } catch {
      return false;
    }
  }

  async registerAll({ peerId, nodeName, deviceProfile } = {}) {
    if (!this.client || !this.privateKey) {
      this.logger.warn('Casper auto-registrar not initialized — skipping registration');
      return { registered: [], errors: ['Not initialized'] };
    }

    const pid = peerId || this.config?.node?.id || 'chimera-node';
    const name = nodeName || this.config?.node?.name || 'Chimera Node';
    const profile = deviceProfile || {};

    const results = [];
    const errors = [];

    // ─── Inference Market ───
    try {
      const already = await this._checkAlreadyRegistered(CONTRACT_HASHES.inferenceMarket, `im_providers`);
      if (already) {
        this.logger.info('[inference] Already registered, skipping');
        results.push({ contract: 'inferenceMarket', status: 'already_registered' });
      } else {
        const args = sdk.Args.fromMap({
          peer_id: sdk.CLValue.newCLString(pid),
          name: sdk.CLValue.newCLString(name),
          has_gpu: sdk.CLValue.newCLBool(!!profile.hasGpu),
          vram_mb: sdk.CLValue.newCLUInt64(String(profile.vramMb || 0)),
          supported_models: sdk.CLValue.newCLList((profile.models || ['llama-3.2-1b-instruct']).map(m => sdk.CLValue.newCLString(m))),
          stake_amount: sdk.CLValue.newCLUInt512(DEFAULT_STAKE_MOTES),
        });
        const hash = await this._callContract(CONTRACT_HASHES.inferenceMarket, 'register_provider', args);
        this.logger.info(`[inference] Registered provider — deploy: ${hash}`);
        results.push({ contract: 'inferenceMarket', deployHash: hash, status: 'registered' });
      }
    } catch (e) {
      this.logger.error(`[inference] Registration failed: ${e.message}`);
      errors.push({ contract: 'inferenceMarket', error: e.message });
    }

    // ─── Storage Market ───
    try {
      const already = await this._checkAlreadyRegistered(CONTRACT_HASHES.storageMarket, `sm_providers`);
      if (already) {
        this.logger.info('[storage] Already registered, skipping');
        results.push({ contract: 'storageMarket', status: 'already_registered' });
      } else {
        const args = sdk.Args.fromMap({
          peer_id: sdk.CLValue.newCLString(pid),
          name: sdk.CLValue.newCLString(name),
          total_capacity_mb: sdk.CLValue.newCLUInt64(String(profile.storageMb || 10240)),
          price_per_mb_month: sdk.CLValue.newCLUInt512('1000000'),
          min_storage_mb: sdk.CLValue.newCLUInt64('1'),
          max_storage_mb: sdk.CLValue.newCLUInt64(String(profile.storageMb || 10240)),
          stake_amount: sdk.CLValue.newCLUInt512(DEFAULT_STAKE_MOTES),
        });
        const hash = await this._callContract(CONTRACT_HASHES.storageMarket, 'register_provider', args);
        this.logger.info(`[storage] Registered provider — deploy: ${hash}`);
        results.push({ contract: 'storageMarket', deployHash: hash, status: 'registered' });
      }
    } catch (e) {
      this.logger.error(`[storage] Registration failed: ${e.message}`);
      errors.push({ contract: 'storageMarket', error: e.message });
    }

    // ─── Compute Market ───
    try {
      const already = await this._checkAlreadyRegistered(CONTRACT_HASHES.computeMarket, `cm_providers`);
      if (already) {
        this.logger.info('[compute] Already registered, skipping');
        results.push({ contract: 'computeMarket', status: 'already_registered' });
      } else {
        const args = sdk.Args.fromMap({
          peer_id: sdk.CLValue.newCLString(pid),
          name: sdk.CLValue.newCLString(name),
          runtime_types: sdk.CLValue.newCLList(['wasm', 'docker'].map(t => sdk.CLValue.newCLString(t))),
          cpu_cores: sdk.CLValue.newCLUInt64(String(profile.cpuCores || 4)),
          ram_mb: sdk.CLValue.newCLUInt64(String(profile.ramMb || 4096)),
          has_gpu: sdk.CLValue.newCLBool(!!profile.hasGpu),
          vram_mb: sdk.CLValue.newCLUInt64(String(profile.vramMb || 0)),
          price_per_cpu_sec: sdk.CLValue.newCLUInt512('100000'),
          price_per_gpu_sec: sdk.CLValue.newCLUInt512('500000'),
          stake_amount: sdk.CLValue.newCLUInt512(DEFAULT_STAKE_MOTES),
        });
        const hash = await this._callContract(CONTRACT_HASHES.computeMarket, 'register_provider', args);
        this.logger.info(`[compute] Registered provider — deploy: ${hash}`);
        results.push({ contract: 'computeMarket', deployHash: hash, status: 'registered' });
      }
    } catch (e) {
      this.logger.error(`[compute] Registration failed: ${e.message}`);
      errors.push({ contract: 'computeMarket', error: e.message });
    }

    // ─── Bandwidth Market ───
    try {
      const already = await this._checkAlreadyRegistered(CONTRACT_HASHES.bandwidthMarket, `bm_providers`);
      if (already) {
        this.logger.info('[bandwidth] Already registered, skipping');
        results.push({ contract: 'bandwidthMarket', status: 'already_registered' });
      } else {
        const args = sdk.Args.fromMap({
          peer_id: sdk.CLValue.newCLString(pid),
          name: sdk.CLValue.newCLString(name),
          service_type: sdk.CLValue.newCLString('proxy'),
          bandwidth_mbps: sdk.CLValue.newCLUInt64(String(profile.bandwidthMbps || 100)),
          is_relay: sdk.CLValue.newCLBool(false),
          or_port: sdk.CLValue.newCLUInt64('9001'),
          dir_port: sdk.CLValue.newCLUInt64('9030'),
          price_per_hour: sdk.CLValue.newCLUInt512('100000000'),
          price_per_gib: sdk.CLValue.newCLUInt512('50000000'),
          stake_amount: sdk.CLValue.newCLUInt512(DEFAULT_STAKE_MOTES),
        });
        const hash = await this._callContract(CONTRACT_HASHES.bandwidthMarket, 'register_provider', args);
        this.logger.info(`[bandwidth] Registered provider — deploy: ${hash}`);
        results.push({ contract: 'bandwidthMarket', deployHash: hash, status: 'registered' });
      }
    } catch (e) {
      this.logger.error(`[bandwidth] Registration failed: ${e.message}`);
      errors.push({ contract: 'bandwidthMarket', error: e.message });
    }

    this.logger.info(`Auto-registration complete — ${results.length} succeeded, ${errors.length} failed`);
    return { registered: results, errors };
  }
}
