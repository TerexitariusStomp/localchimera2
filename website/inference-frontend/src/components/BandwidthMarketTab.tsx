import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, Card, Badge } from './ui';
import { Send, Wifi, Users, RefreshCw, Pause, Play, Gavel, AlertTriangle, DollarSign } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary, callEntryPointWithWallet } from '../casper-client';

function accountHashToBytes(hashStr: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = hashStr.replace('account-hash-', '');
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

const SESSION_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'confirmed', '2': 'closed', '3': 'disputed', '4': 'resolved',
};

export default function BandwidthMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const canSign = !!provider && !!publicKeyHex;
  const [loading, setLoading] = useState(false);
  const [namedKeys, setNamedKeys] = useState<Record<string, string>>({});
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!contractHash) return;
    setLoading(true);
    try {
      const keys = await getContractNamedKeys(contractHash);
      setNamedKeys(keys);

      if (accountHash) {
        const providersUref = keys['bm_providers'];
        if (providersUref) {
          const myHash = accountHash.replace('account-hash-', '');
          const status = await queryDictionary(providersUref, `${myHash}:status`);
          if (status !== null && status !== undefined) {
            setProvidersList([{
              address: accountHash,
              peerId: String(await queryDictionary(providersUref, `${myHash}:peer_id`) || ''),
              name: String(await queryDictionary(providersUref, `${myHash}:name`) || ''),
              serviceType: String(await queryDictionary(providersUref, `${myHash}:service_type`) || ''),
              bandwidth: String(await queryDictionary(providersUref, `${myHash}:bandwidth`) || '0'),
              isRelay: Boolean(await queryDictionary(providersUref, `${myHash}:relay`)),
              orPort: String(await queryDictionary(providersUref, `${myHash}:or_port`) || '0'),
              dirPort: String(await queryDictionary(providersUref, `${myHash}:dir_port`) || '0'),
              pricePerHour: String(await queryDictionary(providersUref, `${myHash}:price_hour`) || '0'),
              pricePerGib: String(await queryDictionary(providersUref, `${myHash}:price_gib`) || '0'),
              status: String(status) === '1' ? 'active' : 'paused',
              stake: String(await queryDictionary(providersUref, `${myHash}:stake`) || '0'),
            }]);
          }
        }
      }

      const sessionsUref = keys['bm_sessions'];
      if (sessionsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `session-${i}`;
          const status = await queryDictionary(sessionsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            provider: String(await queryDictionary(sessionsUref, `${id}:provider`) || ''),
            maxDuration: String(await queryDictionary(sessionsUref, `${id}:max_duration`) || '0'),
            maxData: String(await queryDictionary(sessionsUref, `${id}:max_data`) || '0'),
            amount: String(await queryDictionary(sessionsUref, `${id}:amount`) || '0'),
            status: SESSION_STATUS[String(status)] || String(status),
          });
        }
        setSessions(loaded);
      }
    } catch (e) {
      console.error('Failed to load bandwidth market data:', e);
    } finally {
      setLoading(false);
    }
  }, [contractHash, accountHash]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Wifi className="h-6 w-6 text-[#00e5ff]" />Bandwidth Market</h2>
          <p className="text-muted-foreground text-sm font-mono">{contractHash}</p>
        </div>
        <button onClick={loadData} disabled={loading} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Providers */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><Users className="h-4 w-4" />Bandwidth Providers</h3>
        {providersList.length === 0 ? (
          <p className="text-xs text-muted-foreground">No bandwidth providers registered from this account.</p>
        ) : (
          <div className="space-y-2">
            {providersList.map((p) => (
              <div key={p.address} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="default">{p.serviceType}</Badge>
                  {p.isRelay && <Badge variant="warning">Relay</Badge>}
                </div>
                <div className="text-muted-foreground">{p.bandwidth} Mbps · {(Number(p.pricePerHour) / 1e9).toFixed(4)} CSPR/hr · {(Number(p.pricePerGib) / 1e9).toFixed(4)} CSPR/GiB</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Sessions */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><Wifi className="h-4 w-4" />Sessions</h3>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No bandwidth sessions created.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant={s.status === 'closed' ? 'success' : s.status === 'disputed' ? 'error' : 'warning'}>{s.status}</Badge>
                  <span className="font-mono">{s.id}</span>
                </div>
                <div className="text-muted-foreground">{s.maxDuration}s · {s.maxData} MB · {(Number(s.amount) / 1e9).toFixed(4)} CSPR</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider registration is automatic when the node starts */}

        {/* Update Price */}
        <EntryPointCard title="Update Pricing" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [pricePerHour, setPricePerHour] = useState('0.1');
            const [pricePerGib, setPricePerGib] = useState('0.05');
            const hourMotes = Math.floor(parseFloat(pricePerHour || '0') * 1e9).toString();
            const gibMotes = Math.floor(parseFloat(pricePerGib || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('update_provider_price', {
              price_per_hour: sdk.CLValue.newCLUInt512(hourMotes),
              price_per_gib: sdk.CLValue.newCLUInt512(gibMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Update your bandwidth pricing.</div>
              <Input label="Price/Hour (CSPR)" value={pricePerHour} onChange={setPricePerHour} />
              <Input label="Price/GiB (CSPR)" value={pricePerGib} onChange={setPricePerGib} />
              <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update Pricing</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Create Session */}
        <EntryPointCard title="Create Bandwidth Session" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [providerAddr, setProviderAddr] = useState('');
            const [consumerPubkey, setConsumerPubkey] = useState('');
            const [maxDuration, setMaxDuration] = useState('3600');
            const [maxData, setMaxData] = useState('1024');
            const [amount, setAmount] = useState('10');
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !providerAddr.trim()) return;
              const result = await callEntryPointWithWallet(provider, publicKeyHex, contractHash, 'create_session', {
                provider: sdk.CLValue.newCLByteArray(accountHashToBytes(providerAddr.replace('account-hash-', ''))),
                consumer_pubkey: sdk.CLValue.newCLString(consumerPubkey || publicKeyHex),
                max_duration_sec: sdk.CLValue.newCLUInt64(maxDuration),
                max_data_mb: sdk.CLValue.newCLUInt64(maxData),
                amount: sdk.CLValue.newCLUInt512(amountMotes),
              });
              if (result.deployHash) {
                onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_session', contract: 'BandwidthMarket', status: result.error ? 'error' : 'pending', error: result.error });
              }
            };
            return <form onSubmit={handleSubmit} className="space-y-2">
              <div className="text-xs text-muted-foreground">Open a bandwidth session with a provider.</div>
              <Input label="Provider Account Hash" value={providerAddr} onChange={setProviderAddr} placeholder="account-hash-..." />
              <Input label="Consumer Public Key" value={consumerPubkey} onChange={setConsumerPubkey} placeholder="(defaults to your key)" />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Max Duration (sec)" value={maxDuration} onChange={setMaxDuration} />
                <Input label="Max Data (MB)" value={maxData} onChange={setMaxData} />
              </div>
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign || !providerAddr.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Create Session</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Confirm Session */}
        <EntryPointCard title="Confirm Session" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('confirm_session', {
              session_id: sdk.CLValue.newCLString(sessionId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Provider confirms a bandwidth session.</div>
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <Button type="submit" disabled={!canSign || !sessionId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Confirm</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Close Session */}
        <EntryPointCard title="Close Session" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [actualDuration, setActualDuration] = useState('3600');
            const [actualData, setActualData] = useState('512');
            return <form onSubmit={(e) => { e.preventDefault(); submit('close_session', {
              session_id: sdk.CLValue.newCLString(sessionId),
              actual_duration_sec: sdk.CLValue.newCLUInt64(actualDuration),
              actual_data_mb: sdk.CLValue.newCLUInt64(actualData),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Close a session with actual usage data.</div>
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Actual Duration (sec)" value={actualDuration} onChange={setActualDuration} />
                <Input label="Actual Data (MB)" value={actualData} onChange={setActualData} />
              </div>
              <Button type="submit" disabled={!canSign || !sessionId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Close Session</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Claim Session Payment */}
        <EntryPointCard title="Claim Session Payment" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('claim_session_payment', {
              session_id: sdk.CLValue.newCLString(sessionId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Claim payment for a closed session (provider).</div>
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <Button type="submit" disabled={!canSign || !sessionId.trim()} className="w-full"><DollarSign className="h-4 w-4 mr-1" />Claim Payment</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Dispute Session */}
        <EntryPointCard title="Dispute Session" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [evidence, setEvidence] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('dispute_session', {
              session_id: sdk.CLValue.newCLString(sessionId),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Raise a dispute for a session.</div>
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !sessionId.trim()} variant="danger" className="w-full"><Gavel className="h-4 w-4 mr-1" />Dispute</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Resolve Dispute */}
        <EntryPointCard title="Resolve Dispute (Admin)" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [consumerPct, setConsumerPct] = useState('50');
            return <form onSubmit={(e) => { e.preventDefault(); submit('resolve_dispute', {
              session_id: sdk.CLValue.newCLString(sessionId),
              consumer_pct: sdk.CLValue.newCLUInt64(consumerPct),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Resolve a dispute with consumer payout percentage (owner only).</div>
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <Input label="Consumer Payout (%)" value={consumerPct} onChange={setConsumerPct} />
              <Button type="submit" disabled={!canSign || !sessionId.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Resolve</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Pause/Resume */}
        <EntryPointCard title="Pause Provider" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => (
            <form onSubmit={(e) => { e.preventDefault(); submit('pause_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Pause className="h-3 w-3" />Stop accepting sessions.</div>
              <Button type="submit" disabled={!canSign} variant="danger" className="w-full"><Pause className="h-4 w-4 mr-1" />Pause</Button>
            </form>
          )}
        </EntryPointCard>

        <EntryPointCard title="Resume Provider" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => (
            <form onSubmit={(e) => { e.preventDefault(); submit('resume_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Play className="h-3 w-3" />Resume accepting sessions.</div>
              <Button type="submit" disabled={!canSign} className="w-full"><Play className="h-4 w-4 mr-1" />Resume</Button>
            </form>
          )}
        </EntryPointCard>
      </div>
    </div>
  );
}
