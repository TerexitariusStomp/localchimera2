/**
 * Casper native marketplace client for Chimera-Fortytwo node.
 *
 * NOTE: Uses casper-js-sdk v5. Uses `any` for SDK types pending full type alignment.
 */

import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

const sdk: any = require('casper-js-sdk');

const CHAIN_NAME = process.env.CASPER_CHAIN_NAME || 'casper-test';
const RPC_URL = process.env.CASPER_RPC_URL || 'https://node.testnet.casper.network/rpc';
const PAYMENT = process.env.CASPER_PAYMENT || '50000000000';

export interface CasperContractAddresses {
  computeRegistry: string;
  orderBook: string;
  escrowVault: string;
  reputation: string;
}

export class CasperMarketplaceClient {
  private client: any;
  private privateKey: any;
  private addresses: CasperContractAddresses;

  constructor(pemPath: string, addresses: CasperContractAddresses) {
    const pem = readFileSync(pemPath, 'utf-8');
    this.privateKey = sdk.PrivateKey.fromPem(pem, sdk.KeyAlgorithm.SECP256K1);
    this.client = new sdk.RpcClient(new sdk.HttpHandler(RPC_URL));
    this.addresses = addresses;
  }

  getAccountHash(): string {
    return this.privateKey.publicKey.accountHash().toString();
  }

  private async sendDeploy(session: any): Promise<string> {
    const payment = sdk.ExecutableDeployItem.standardPayment(PAYMENT);
    const header = sdk.DeployHeader.default();
    header.account = this.privateKey.publicKey;
    header.chainName = CHAIN_NAME;
    header.timestamp = new Date() as any;

    const deploy = sdk.Deploy.makeDeploy(header, payment, session);
    deploy.sign(this.privateKey);

    const result = await this.client.putDeploy(deploy);
    logger.info({ deployHash: result.deployHash }, 'deploy sent');
    return result.deployHash;
  }

  private async callContract(
    contractHash: string,
    entryPoint: string,
    args: any,
  ): Promise<string> {
    const hashHex = contractHash.replace('contract-', '').replace('hash-', '');
    const session = new sdk.ExecutableDeployItem();
    session.storedContractByHash = {
      hash: Buffer.from(hashHex, 'hex'),
      entryPoint,
      args,
    };
    return this.sendDeploy(session);
  }

  async registerProvider(params: {
    qvacPeerId: string;
    name: string;
    taskTypes: number;
    stakeAmount: string;
  }): Promise<string> {
    const args = sdk.Args.fromMap({
      qvac_peer_id: sdk.CLValue.newCLString(params.qvacPeerId),
      name: sdk.CLValue.newCLString(params.name),
      task_types: sdk.CLValue.newCLUInt32(params.taskTypes),
      stake_amount: sdk.CLValue.newCLUInt512(params.stakeAmount),
    });
    return this.callContract(this.addresses.computeRegistry, 'register_provider', args);
  }

  async providerComplete(jobId: string, responseHash: string): Promise<string> {
    const args = sdk.Args.fromMap({
      job_id: sdk.CLValue.newCLString(jobId),
      response_hash: sdk.CLValue.newCLString(responseHash),
    });
    return this.callContract(this.addresses.escrowVault, 'provider_complete', args);
  }

  async consumerConfirm(jobId: string): Promise<string> {
    const args = sdk.Args.fromMap({
      job_id: sdk.CLValue.newCLString(jobId),
    });
    return this.callContract(this.addresses.escrowVault, 'consumer_confirm', args);
  }

  async getProviderStatus(providerAddress: string): Promise<number | undefined> {
    try {
      const dictKey = providerAddress.replace('account-hash-', '');
      const path = `providers_status.${dictKey}`;
      const result = await this.client.queryLatestGlobalState(this.addresses.computeRegistry, [path]);
      return result?.storedValue?.clValue?.parsed;
    } catch (e) {
      logger.warn({ error: (e as Error).message }, 'failed to read provider status');
      return undefined;
    }
  }

  async getJobState(jobId: string): Promise<number | undefined> {
    try {
      const path = `jobs_dict.${jobId}:state`;
      const result = await this.client.queryLatestGlobalState(this.addresses.escrowVault, [path]);
      return result?.storedValue?.clValue?.parsed;
    } catch (e) {
      logger.warn({ error: (e as Error).message }, 'failed to read job state');
      return undefined;
    }
  }

  async getScore(_address: string): Promise<number> {
    // TODO: implement reputation score lookup via Casper dictionary
    return 0;
  }
}
