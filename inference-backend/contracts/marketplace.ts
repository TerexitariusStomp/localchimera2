export {
  CasperMarketplaceClient,
  type CasperContractAddresses,
} from './casper-client.js';

export interface ContractAddresses {
  computeRegistry: string;
  orderBook: string;
  escrowVault: string;
  reputation: string;
}
