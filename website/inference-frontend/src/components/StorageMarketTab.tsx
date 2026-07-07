import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, StarRating } from './ui';
import { Send, HardDrive, Shield, RefreshCw, Trash2, Star } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary } from '../casper-client';

const ADMIN_PUBLIC_KEY = '020227d8dd5ccaa600e45b36e598d90ef8c26b6c67ef81bdfebde8fa583997a91ea5';

export default function StorageMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx, view = 'tasker' }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void; view?: 'tasker' | 'provider';
}) {
  const canSign = !!provider && !!publicKeyHex;
  const isAdmin = publicKeyHex === ADMIN_PUBLIC_KEY;
  const isTasker = view === 'tasker';
  const isProvider = view === 'provider';
  const [loading, setLoading] = useState(false);
  const [namedKeys, setNamedKeys] = useState<Record<string, string>>({});
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!contractHash) return;
    setLoading(true);
    try {
      const keys = await getContractNamedKeys(contractHash);
      setNamedKeys(keys);

      if (accountHash) {
        const providersUref = keys['sm_providers'];
        if (providersUref) {
          const myHash = accountHash.replace('account-hash-', '');
          const status = await queryDictionary(providersUref, `${myHash}:status`);
          if (status !== null && status !== undefined) {
            setProvidersList([{
              address: accountHash,
              peerId: String(await queryDictionary(providersUref, `${myHash}:peer_id`) || ''),
              name: String(await queryDictionary(providersUref, `${myHash}:name`) || ''),
              capacity: String(await queryDictionary(providersUref, `${myHash}:capacity`) || '0'),
              price: String(await queryDictionary(providersUref, `${myHash}:price`) || '0'),
              used: String(await queryDictionary(providersUref, `${myHash}:used`) || '0'),
              status: String(status) === '1' ? 'active' : 'paused',
              stake: String(await queryDictionary(providersUref, `${myHash}:stake`) || '0'),
            }]);
          }
        }
      }

      const allocsUref = keys['sm_allocations'];
      if (allocsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `alloc-${i}`;
          const status = await queryDictionary(allocsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            dataShards: String(await queryDictionary(allocsUref, `${id}:data_shards`) || '0'),
            parityShards: String(await queryDictionary(allocsUref, `${id}:parity_shards`) || '0'),
            sizeMb: String(await queryDictionary(allocsUref, `${id}:size_mb`) || '0'),
            amount: String(await queryDictionary(allocsUref, `${id}:amount`) || '0'),
            status: String(status),
          });
        }
        setAllocations(loaded);
      }

      const filesUref = keys['sm_files'];
      if (filesUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `file-${i}`;
          const status = await queryDictionary(filesUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            fileHash: String(await queryDictionary(filesUref, `${id}:file_hash`) || ''),
            sizeMb: String(await queryDictionary(filesUref, `${id}:size_mb`) || '0'),
            provider: String(await queryDictionary(filesUref, `${id}:provider`) || ''),
            status: String(status),
          });
        }
        setFiles(loaded);
      }
    } catch (e) {
      console.error('Failed to load storage market data:', e);
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
          <h2 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="h-6 w-6 text-[#00e5ff]" />Storage Market</h2>
          <p className="text-muted-foreground text-sm font-mono">{contractHash}</p>
        </div>
        <button onClick={loadData} disabled={loading} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider registration is automatic when the node starts */}

        {/* Update Capacity — provider only */}
        {isProvider && (<EntryPointCard title="Update Capacity" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [capacity, setCapacity] = useState('10240');
            return <form onSubmit={(e) => { e.preventDefault(); submit('update_provider_capacity', {
              total_capacity_mb: sdk.CLValue.newCLUint64(capacity),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Update your total storage capacity.</div>
              <Input label="New Capacity (MB)" value={capacity} onChange={setCapacity} />
              <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Create Allocation — user-friendly: pick storage size + duration, redundancy auto-configured */}
        {isTasker && (<EntryPointCard title="Get Storage Space" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sizeGb, setSizeGb] = useState('1');
            const [durationDays, setDurationDays] = useState('30');
            const [redundancy, setRedundancy] = useState('standard');
            const [amount, setAmount] = useState('10');
            const sizeMb = Math.floor(parseFloat(sizeGb || '0') * 1024).toString();
            const expiryMs = String(Date.now() + parseInt(durationDays || '30') * 24 * 60 * 60 * 1000);
            const shardConfig: Record<string, { data: string; parity: string }> = {
              standard: { data: '3', parity: '1' },
              high: { data: '5', parity: '2' },
              minimal: { data: '2', parity: '1' },
            };
            const shards = shardConfig[redundancy] || shardConfig.standard;
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('create_allocation', {
              data_shards: sdk.CLValue.newCLUint64(shards.data),
              parity_shards: sdk.CLValue.newCLUint64(shards.parity),
              size_mb: sdk.CLValue.newCLUint64(sizeMb),
              expiry_ms: sdk.CLValue.newCLUint64(expiryMs),
              amount: sdk.CLValue.newCLUInt512(amountMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Reserve decentralized storage space. Files are split into encrypted shards and distributed across multiple providers.</div>
              <Input label="Storage Size (GB)" value={sizeGb} onChange={setSizeGb} />
              <Input label="Duration (days)" value={durationDays} onChange={setDurationDays} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Redundancy</label>
                <div className="flex gap-2">
                  {Object.entries(shardConfig).map(([key]) => (
                    <button key={key} type="button" onClick={() => setRedundancy(key)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${redundancy === key ? 'bg-[#00e5ff]/15 border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/5 border-white/10 text-[#7a7468] hover:bg-white/10'}`}>
                      {key === 'standard' ? 'Standard (3+1)' : key === 'high' ? 'High (5+2)' : 'Minimal (2+1)'}
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign} className="w-full"><HardDrive className="h-4 w-4 mr-1" />Reserve Storage</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Cancel Allocation */}
        {isTasker && (<EntryPointCard title="Cancel Allocation" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [allocId, setAllocId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('cancel_allocation', {
              alloc_id: sdk.CLValue.newCLString(allocId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Cancel an unfilled allocation to retrieve funds.</div>
              <Input label="Allocation ID" value={allocId} onChange={setAllocId} />
              <Button type="submit" disabled={!canSign || !allocId.trim()} variant="danger" className="w-full">Cancel Allocation</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Store File — simplified: pick allocation, upload file, provider auto-assigned */}
        {isTasker && (<EntryPointCard title="Store File" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [allocId, setAllocId] = useState('');
            const [fileHash, setFileHash] = useState('');
            const [sizeMb, setSizeMb] = useState('1');
            const amountMotes = Math.floor(parseFloat('1') * 1e9).toString();
            const activeAllocations = allocations.filter(a => a.status === '0' || a.status === '1');
            return <form onSubmit={(e) => { e.preventDefault(); submit('store_file', {
              alloc_id: sdk.CLValue.newCLString(allocId),
              file_hash: sdk.CLValue.newCLString(fileHash),
              size_mb: sdk.CLValue.newCLUint64(sizeMb),
              amount: sdk.CLValue.newCLUInt512(amountMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Upload a file to your storage allocation. The system automatically assigns suitable providers and handles shard distribution.</div>
              {activeAllocations.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {activeAllocations.map(a => (
                    <button key={a.id} type="button" onClick={() => setAllocId(a.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${allocId === a.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {a.id} ({a.sizeMb} MB)
                    </button>
                  ))}
                </div>
              )}
              <Input label="Allocation ID" value={allocId} onChange={setAllocId} placeholder="alloc-0" />
              <Input label="File Hash (IPFS/content hash)" value={fileHash} onChange={setFileHash} placeholder="Qm..." />
              <Input label="File Size (MB)" value={sizeMb} onChange={setSizeMb} />
              <Button type="submit" disabled={!canSign || !allocId.trim() || !fileHash.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Store File</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Remove File */}
        {isTasker && (<EntryPointCard title="Remove File" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('remove_file', {
              file_id: sdk.CLValue.newCLString(fileId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Remove a stored file.</div>
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <Button type="submit" disabled={!canSign || !fileId.trim()} variant="danger" className="w-full"><Trash2 className="h-4 w-4 mr-1" />Remove</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Rate Provider — consumer rates the storage provider after file is confirmed */}
        {isTasker && (<EntryPointCard title="Rate Provider" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            const [rating, setRating] = useState(0);
            const confirmedFiles = files.filter(f => f.status === '1');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_provider', {
              file_id: sdk.CLValue.newCLString(fileId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the storage provider after file confirmation. Recorded on-chain.</div>
              {confirmedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {confirmedFiles.map(f => (
                    <button key={f.id} type="button" onClick={() => setFileId(f.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${fileId === f.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {f.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Provider Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !fileId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Provider</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Rate Consumer — provider rates the consumer after payment is received */}
        {isProvider && (<EntryPointCard title="Rate Consumer" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            const [rating, setRating] = useState(0);
            const confirmedFiles = files.filter(f => f.status === '1');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              file_id: sdk.CLValue.newCLString(fileId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after storage payment. Recorded on-chain.</div>
              {confirmedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {confirmedFiles.map(f => (
                    <button key={f.id} type="button" onClick={() => setFileId(f.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${fileId === f.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {f.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Consumer Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !fileId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Consumer</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Admin only: Issue Challenge + Verify Challenge */}
        {isProvider && isAdmin && (
          <EntryPointCard title="Issue Challenge (Admin)" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [fileId, setFileId] = useState('');
              const [challengeHash, setChallengeHash] = useState('');
              return <form onSubmit={(e) => { e.preventDefault(); submit('issue_challenge', {
                file_id: sdk.CLValue.newCLString(fileId),
                challenge_hash: sdk.CLValue.newCLString(challengeHash),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Issue a storage proof challenge (admin only).</div>
                <Input label="File ID" value={fileId} onChange={setFileId} />
                <Input label="Challenge Hash" value={challengeHash} onChange={setChallengeHash} />
                <Button type="submit" disabled={!canSign || !fileId.trim()} variant="outline" className="w-full"><Shield className="h-4 w-4 mr-1" />Issue Challenge</Button>
              </form>;
            }}
          </EntryPointCard>
        )}

        {isProvider && isAdmin && (
          <EntryPointCard title="Verify Challenge (Admin)" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [challengeId, setChallengeId] = useState('');
              const [passed, setPassed] = useState(true);
              return <form onSubmit={(e) => { e.preventDefault(); submit('verify_challenge', {
                challenge_id: sdk.CLValue.newCLString(challengeId),
                passed: sdk.CLValue.newCLValueBool(passed),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Verify a challenge response (admin only).</div>
                <Input label="Challenge ID" value={challengeId} onChange={setChallengeId} />
                <div className="flex items-center gap-2">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} className="rounded" />
                    Challenge Passed
                  </label>
                </div>
                <Button type="submit" disabled={!canSign || !challengeId.trim()} variant="outline" className="w-full">Verify</Button>
              </form>;
            }}
          </EntryPointCard>
        )}
      </div>
    </div>
  );
}
