import NetworkHealthTab from './NetworkHealthTab';
import ProviderTab from './ProviderTab';
import type { TxRecord } from '../types';

export default function ProviderNetworkTab({ provider, publicKeyHex, accountHash, onTx }: {
  provider: any;
  publicKeyHex: string;
  accountHash: string;
  onTx: (tx: TxRecord) => void;
}) {
  return (
    <div className="space-y-6">
      <NetworkHealthTab accountHash={accountHash} />
      <ProviderTab provider={provider} publicKeyHex={publicKeyHex} accountHash={accountHash} onTx={onTx} />
    </div>
  );
}
