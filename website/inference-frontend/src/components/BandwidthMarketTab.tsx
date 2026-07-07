import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, StarRating } from './ui';
import { Wifi, RefreshCw, Gavel, AlertTriangle, Shield, Star } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary, callEntryPointWithWallet } from '../casper-client';

const ADMIN_PUBLIC_KEY = '020227d8dd5ccaa600e45b36e598d90ef8c26b6c67ef81bdfebde8fa583997a91ea5';

const SESSION_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'confirmed', '2': 'closed', '3': 'disputed', '4': 'resolved',
};

export default function BandwidthMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx, view = 'tasker' }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void; view?: 'tasker' | 'provider';
}) {
  const canSign = !!provider && !!publicKeyHex;
  const isAdmin = publicKeyHex === ADMIN_PUBLIC_KEY;
  const isTasker = view === 'tasker';
  const isProvider = view === 'provider';
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider registration is automatic when the node starts */}

        {/* Provider pricing is set automatically — highest-paying tasks get routed first */}

        {/* Create Session — user-friendly: pick duration + data, provider auto-assigned */}
        {isTasker && (<EntryPointCard title="Get Bandwidth" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [durationHours, setDurationHours] = useState('1');
            const [dataGb, setDataGb] = useState('1');
            const [amount, setAmount] = useState('10');
            const maxDuration = String(parseInt(durationHours || '0') * 3600);
            const maxData = String(Math.floor(parseFloat(dataGb || '0') * 1024));
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign) return;
              const result = await callEntryPointWithWallet(provider, publicKeyHex, contractHash, 'create_session', {
                consumer_pubkey: sdk.CLValue.newCLString(publicKeyHex),
                max_duration_sec: sdk.CLValue.newCLUint64(maxDuration),
                max_data_mb: sdk.CLValue.newCLUint64(maxData),
                amount: sdk.CLValue.newCLUInt512(amountMotes),
              });
              if (result.deployHash) {
                onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_session', contract: 'BandwidthMarket', status: result.error ? 'error' : 'pending', error: result.error });
              }
            };
            return <form onSubmit={handleSubmit} className="space-y-2">
              <div className="text-xs text-muted-foreground">Purchase bandwidth for a set duration and data allowance. The router automatically assigns the best available provider — higher-paying requests get routed first.</div>
              <Input label="Duration (hours)" value={durationHours} onChange={setDurationHours} />
              <Input label="Data Allowance (GB)" value={dataGb} onChange={setDataGb} />
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign} className="w-full"><Wifi className="h-4 w-4 mr-1" />Get Bandwidth</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Dispute Session — tasker only */}
        {isTasker && (<EntryPointCard title="Dispute Session" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
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
        )}

        {/* Rate Provider — consumer rates the bandwidth provider after session is closed */}
        {isTasker && (<EntryPointCard title="Rate Provider" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [rating, setRating] = useState(0);
            const closedSessions = sessions.filter(s => s.status === 'closed' || s.status === 'resolved');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_provider', {
              session_id: sdk.CLValue.newCLString(sessionId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the bandwidth provider after session completion. Recorded on-chain.</div>
              {closedSessions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {closedSessions.map(s => (
                    <button key={s.id} type="button" onClick={() => setSessionId(s.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${sessionId === s.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {s.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Provider Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !sessionId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Provider</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Rate Consumer — provider rates the consumer after session is closed */}
        {isProvider && (<EntryPointCard title="Rate Consumer" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [rating, setRating] = useState(0);
            const closedSessions = sessions.filter(s => s.status === 'closed' || s.status === 'resolved');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              session_id: sdk.CLValue.newCLString(sessionId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after bandwidth session completion. Recorded on-chain.</div>
              {closedSessions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {closedSessions.map(s => (
                    <button key={s.id} type="button" onClick={() => setSessionId(s.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${sessionId === s.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {s.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Consumer Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !sessionId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Consumer</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Admin only: Resolve Dispute */}
        {isProvider && isAdmin && (
          <EntryPointCard title="Resolve Dispute (Admin)" contract="BandwidthMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [sessionId, setSessionId] = useState('');
              const [consumerPct, setConsumerPct] = useState('50');
              return <form onSubmit={(e) => { e.preventDefault(); submit('resolve_dispute', {
                session_id: sdk.CLValue.newCLString(sessionId),
                consumer_pct: sdk.CLValue.newCLUint64(consumerPct),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Resolve a dispute with consumer payout percentage (admin only).</div>
                <Input label="Session ID" value={sessionId} onChange={setSessionId} />
                <Input label="Consumer Payout (%)" value={consumerPct} onChange={setConsumerPct} />
                <Button type="submit" disabled={!canSign || !sessionId.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Resolve</Button>
              </form>;
            }}
          </EntryPointCard>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-border">
          <h3 className="text-sm font-bold text-[#e8e2d8]">Sessions</h3>
          {sessions.map(s => (
            <div key={s.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-[#7a7468]">{s.id}</div>
                <div className="text-[10px] text-[#7a7468] mt-0.5">
                  Duration: {s.maxDuration}s | Data: {s.maxData}MB | Amount: {s.amount} motes
                </div>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded shrink-0 ml-2 ${
                s.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400' :
                s.status === 'confirmed' ? 'bg-[#00e5ff]/10 text-[#00e5ff]' :
                s.status === 'closed' ? 'bg-emerald-400/10 text-emerald-400' :
                s.status === 'disputed' ? 'bg-red-400/10 text-red-400' :
                'bg-white/5 text-[#7a7468]'
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
