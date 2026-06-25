import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, Card, Badge } from './ui';
import { Send, HardDrive, Users, FileText, Shield, RefreshCw, Pause, Play, Trash2, CheckCircle } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary } from '../casper-client';

function accountHashToBytes(hashStr: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = hashStr.replace('account-hash-', '');
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export default function StorageMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const canSign = !!provider && !!publicKeyHex;
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

      {/* Providers */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><Users className="h-4 w-4" />Storage Providers</h3>
        {providersList.length === 0 ? (
          <p className="text-xs text-muted-foreground">No storage providers registered from this account.</p>
        ) : (
          <div className="space-y-2">
            {providersList.map((p) => (
              <div key={p.address} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="font-medium">{p.name}</span>
                </div>
                <div className="text-muted-foreground">{p.capacity} MB · {(Number(p.price) / 1e9).toFixed(4)} CSPR/MB · {(Number(p.stake) / 1e9).toFixed(2)} CSPR staked</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Allocations */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Allocations</h3>
        {allocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No allocations created.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {allocations.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{a.id}</Badge>
                  <span>{a.sizeMb} MB · {a.dataShards}+{a.parityShards}</span>
                </div>
                <div className="text-muted-foreground">{(Number(a.amount) / 1e9).toFixed(4)} CSPR</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Files */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><HardDrive className="h-4 w-4" />Stored Files</h3>
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No files stored.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant={f.status === '1' ? 'success' : 'warning'}>{f.status === '1' ? 'confirmed' : 'pending'}</Badge>
                  <span className="font-mono">{f.fileHash.slice(0, 20)}...</span>
                </div>
                <div className="text-muted-foreground">{f.sizeMb} MB</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider registration is automatic when the node starts */}

        {/* Update Capacity */}
        <EntryPointCard title="Update Capacity" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [capacity, setCapacity] = useState('10240');
            return <form onSubmit={(e) => { e.preventDefault(); submit('update_provider_capacity', {
              total_capacity_mb: sdk.CLValue.newCLUInt64(capacity),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Update your total storage capacity.</div>
              <Input label="New Capacity (MB)" value={capacity} onChange={setCapacity} />
              <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Create Allocation */}
        <EntryPointCard title="Create Allocation" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [dataShards, setDataShards] = useState('3');
            const [parityShards, setParityShards] = useState('1');
            const [sizeMb, setSizeMb] = useState('100');
            const [expiryMs, setExpiryMs] = useState(String(Date.now() + 30 * 24 * 60 * 60 * 1000));
            const [amount, setAmount] = useState('10');
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('create_allocation', {
              data_shards: sdk.CLValue.newCLUInt64(dataShards),
              parity_shards: sdk.CLValue.newCLUInt64(parityShards),
              size_mb: sdk.CLValue.newCLUInt64(sizeMb),
              expiry_ms: sdk.CLValue.newCLUInt64(expiryMs),
              amount: sdk.CLValue.newCLUInt512(amountMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Create a storage allocation with erasure coding.</div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Data Shards" value={dataShards} onChange={setDataShards} />
                <Input label="Parity Shards" value={parityShards} onChange={setParityShards} />
              </div>
              <Input label="Size (MB)" value={sizeMb} onChange={setSizeMb} />
              <Input label="Expiry (timestamp ms)" value={expiryMs} onChange={setExpiryMs} />
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Create Allocation</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Cancel Allocation */}
        <EntryPointCard title="Cancel Allocation" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
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

        {/* Store File */}
        <EntryPointCard title="Store File" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [allocId, setAllocId] = useState('');
            const [fileHash, setFileHash] = useState('');
            const [sizeMb, setSizeMb] = useState('1');
            const [providerAddr, setProviderAddr] = useState('');
            const [amount, setAmount] = useState('1');
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('store_file', {
              alloc_id: sdk.CLValue.newCLString(allocId),
              file_hash: sdk.CLValue.newCLString(fileHash),
              size_mb: sdk.CLValue.newCLUInt64(sizeMb),
              provider: sdk.CLValue.newCLByteArray(accountHashToBytes(providerAddr.replace('account-hash-', ''))),
              amount: sdk.CLValue.newCLUInt512(amountMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Store a file with a specific provider.</div>
              <Input label="Allocation ID" value={allocId} onChange={setAllocId} />
              <Input label="File Hash (IPFS/content hash)" value={fileHash} onChange={setFileHash} />
              <Input label="Size (MB)" value={sizeMb} onChange={setSizeMb} />
              <Input label="Provider Account Hash" value={providerAddr} onChange={setProviderAddr} placeholder="account-hash-..." />
              <Input label="Payment (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign || !allocId.trim() || !fileHash.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Store File</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Confirm Storage */}
        <EntryPointCard title="Confirm Storage" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('confirm_storage', {
              file_id: sdk.CLValue.newCLString(fileId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" />Provider confirms file is stored.</div>
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <Button type="submit" disabled={!canSign || !fileId.trim()} className="w-full"><CheckCircle className="h-4 w-4 mr-1" />Confirm</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Remove File */}
        <EntryPointCard title="Remove File" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
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

        {/* Issue Challenge */}
        <EntryPointCard title="Issue Challenge" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            const [challengeHash, setChallengeHash] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('issue_challenge', {
              file_id: sdk.CLValue.newCLString(fileId),
              challenge_hash: sdk.CLValue.newCLString(challengeHash),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />Issue a storage proof challenge.</div>
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <Input label="Challenge Hash" value={challengeHash} onChange={setChallengeHash} />
              <Button type="submit" disabled={!canSign || !fileId.trim()} className="w-full"><Shield className="h-4 w-4 mr-1" />Issue Challenge</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Respond Challenge */}
        <EntryPointCard title="Respond to Challenge" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [challengeId, setChallengeId] = useState('');
            const [responseHash, setResponseHash] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('respond_challenge', {
              challenge_id: sdk.CLValue.newCLString(challengeId),
              response_hash: sdk.CLValue.newCLString(responseHash),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Provider responds to a storage challenge.</div>
              <Input label="Challenge ID" value={challengeId} onChange={setChallengeId} />
              <Input label="Response Hash" value={responseHash} onChange={setResponseHash} />
              <Button type="submit" disabled={!canSign || !challengeId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Respond</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Verify Challenge */}
        <EntryPointCard title="Verify Challenge" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [challengeId, setChallengeId] = useState('');
            const [passed, setPassed] = useState(true);
            return <form onSubmit={(e) => { e.preventDefault(); submit('verify_challenge', {
              challenge_id: sdk.CLValue.newCLString(challengeId),
              passed: sdk.CLValue.newCLBool(passed),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Verify a challenge response (admin/verifier).</div>
              <Input label="Challenge ID" value={challengeId} onChange={setChallengeId} />
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} className="rounded" />
                  Challenge Passed
                </label>
              </div>
              <Button type="submit" disabled={!canSign || !challengeId.trim()} className="w-full"><CheckCircle className="h-4 w-4 mr-1" />Verify</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Claim Storage Payment */}
        <EntryPointCard title="Claim Storage Payment" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('claim_storage_payment', {
              file_id: sdk.CLValue.newCLString(fileId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Claim payment for confirmed storage (provider).</div>
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <Button type="submit" disabled={!canSign || !fileId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Claim Payment</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Pause/Resume */}
        <EntryPointCard title="Pause Provider" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => (
            <form onSubmit={(e) => { e.preventDefault(); submit('pause_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Pause className="h-3 w-3" />Stop accepting storage requests.</div>
              <Button type="submit" disabled={!canSign} variant="danger" className="w-full"><Pause className="h-4 w-4 mr-1" />Pause</Button>
            </form>
          )}
        </EntryPointCard>

        <EntryPointCard title="Resume Provider" contract="StorageMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => (
            <form onSubmit={(e) => { e.preventDefault(); submit('resume_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Play className="h-3 w-3" />Resume accepting storage.</div>
              <Button type="submit" disabled={!canSign} className="w-full"><Play className="h-4 w-4 mr-1" />Resume</Button>
            </form>
          )}
        </EntryPointCard>
      </div>
    </div>
  );
}
