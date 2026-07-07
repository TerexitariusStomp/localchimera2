import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, StarRating } from './ui';
import { Send, Cpu, RefreshCw, Star } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary } from '../casper-client';

const AGREEMENT_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'approved', '2': 'rejected', '3': 'active', '4': 'terminated',
};

export default function ComputeMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx, view = 'tasker' }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void; view?: 'tasker' | 'provider';
}) {
  const canSign = !!provider && !!publicKeyHex;
  const isTasker = view === 'tasker';
  const isProvider = view === 'provider';
  const [loading, setLoading] = useState(false);
  const [namedKeys, setNamedKeys] = useState<Record<string, string>>({});
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [demands, setDemands] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!contractHash) return;
    setLoading(true);
    try {
      const keys = await getContractNamedKeys(contractHash);
      setNamedKeys(keys);

      if (accountHash) {
        const providersUref = keys['cm_providers'];
        if (providersUref) {
          const myHash = accountHash.replace('account-hash-', '');
          const status = await queryDictionary(providersUref, `${myHash}:status`);
          if (status !== null && status !== undefined) {
            setProvidersList([{
              address: accountHash,
              peerId: String(await queryDictionary(providersUref, `${myHash}:peer_id`) || ''),
              name: String(await queryDictionary(providersUref, `${myHash}:name`) || ''),
              cpuCores: String(await queryDictionary(providersUref, `${myHash}:cpu_cores`) || '0'),
              ramMb: String(await queryDictionary(providersUref, `${myHash}:ram_mb`) || '0'),
              hasGpu: Boolean(await queryDictionary(providersUref, `${myHash}:gpu`)),
              vramMb: String(await queryDictionary(providersUref, `${myHash}:vram`) || '0'),
              pricePerCpu: String(await queryDictionary(providersUref, `${myHash}:price_cpu`) || '0'),
              pricePerGpu: String(await queryDictionary(providersUref, `${myHash}:price_gpu`) || '0'),
              status: String(status) === '1' ? 'active' : 'paused',
              stake: String(await queryDictionary(providersUref, `${myHash}:stake`) || '0'),
            }]);
          }
        }
      }

      const demandsUref = keys['cm_demands'];
      if (demandsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `demand-${i}`;
          const status = await queryDictionary(demandsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            taskType: String(await queryDictionary(demandsUref, `${id}:task_type`) || ''),
            runtime: String(await queryDictionary(demandsUref, `${id}:runtime`) || ''),
            maxCost: String(await queryDictionary(demandsUref, `${id}:max_cost`) || '0'),
            duration: String(await queryDictionary(demandsUref, `${id}:duration`) || '0'),
            requiresGpu: Boolean(await queryDictionary(demandsUref, `${id}:gpu`)),
            minVram: String(await queryDictionary(demandsUref, `${id}:min_vram`) || '0'),
            status: String(status),
          });
        }
        setDemands(loaded);
      }

      const agreementsUref = keys['cm_agreements'];
      if (agreementsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `agreement-${i}`;
          const status = await queryDictionary(agreementsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            demandId: String(await queryDictionary(agreementsUref, `${id}:demand`) || ''),
            offerId: String(await queryDictionary(agreementsUref, `${id}:offer`) || ''),
            amount: String(await queryDictionary(agreementsUref, `${id}:amount`) || '0'),
            status: AGREEMENT_STATUS[String(status)] || String(status),
          });
        }
        setAgreements(loaded);
      }
    } catch (e) {
      console.error('Failed to load compute market data:', e);
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
          <h2 className="text-2xl font-bold flex items-center gap-2"><Cpu className="h-6 w-6 text-[#00e5ff]" />Compute Market</h2>
          <p className="text-muted-foreground text-sm font-mono">{contractHash}</p>
        </div>
        <button onClick={loadData} disabled={loading} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider registration is automatic when the node starts */}

        {/* Update Offer — provider only */}
        {isProvider && (<EntryPointCard title="Update Pricing" contract="ComputeMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [pricePerCpu, setPricePerCpu] = useState('0.01');
            const [pricePerGpu, setPricePerGpu] = useState('0.1');
            const cpuMotes = Math.floor(parseFloat(pricePerCpu || '0') * 1e9).toString();
            const gpuMotes = Math.floor(parseFloat(pricePerGpu || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('update_provider_offer', {
              price_per_cpu_sec: sdk.CLValue.newCLUInt512(cpuMotes),
              price_per_gpu_sec: sdk.CLValue.newCLUInt512(gpuMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Update your compute pricing.</div>
              <Input label="Price/CPU·s (CSPR)" value={pricePerCpu} onChange={setPricePerCpu} />
              <Input label="Price/GPU·s (CSPR)" value={pricePerGpu} onChange={setPricePerGpu} />
              <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update Pricing</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Create Demand — tasker only */}
        {isTasker && (<EntryPointCard title="Create Compute Demand" contract="ComputeMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [taskType, setTaskType] = useState('model-training');
            const [runtime, setRuntime] = useState('docker');
            const [maxCost, setMaxCost] = useState('100');
            const [duration, setDuration] = useState('3600');
            const [requiresGpu, setRequiresGpu] = useState(false);
            const [minVram, setMinVram] = useState('0');
            const maxCostMotes = Math.floor(parseFloat(maxCost || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('create_demand', {
              task_type: sdk.CLValue.newCLString(taskType),
              runtime: sdk.CLValue.newCLString(runtime),
              max_cost: sdk.CLValue.newCLUInt512(maxCostMotes),
              duration_sec: sdk.CLValue.newCLUint64(duration),
              requires_gpu: sdk.CLValue.newCLValueBool(requiresGpu),
              min_vram_mb: sdk.CLValue.newCLUint64(minVram),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Request compute resources. The router automatically matches you with a provider, generates an agreement, and pays out after completion if no dispute is raised.</div>
              <Input label="Task Type" value={taskType} onChange={setTaskType} />
              <Input label="Runtime" value={runtime} onChange={setRuntime} />
              <Input label="Max Cost (CSPR)" value={maxCost} onChange={setMaxCost} />
              <Input label="Duration (seconds)" value={duration} onChange={setDuration} />
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={requiresGpu} onChange={(e) => setRequiresGpu(e.target.checked)} className="rounded" />
                  Requires GPU
                </label>
                {requiresGpu && <Input label="Min VRAM (MB)" value={minVram} onChange={setMinVram} />}
              </div>
              <Button type="submit" disabled={!canSign || !taskType.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Create Demand</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Cancel Demand — tasker only */}
        {isTasker && (<EntryPointCard title="Cancel Demand" contract="ComputeMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [demandId, setDemandId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('cancel_demand', {
              demand_id: sdk.CLValue.newCLString(demandId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Cancel an open demand.</div>
              <Input label="Demand ID" value={demandId} onChange={setDemandId} />
              <Button type="submit" disabled={!canSign || !demandId.trim()} variant="danger" className="w-full">Cancel Demand</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Offers and agreements are automatically generated by the router when a demand is created */}

        {/* Rate Provider — consumer rates the compute provider after agreement is terminated */}
        {isTasker && (<EntryPointCard title="Rate Provider" contract="ComputeMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [agreementId, setAgreementId] = useState('');
            const [rating, setRating] = useState(0);
            const completedAgreements = agreements.filter(a => a.status === 'terminated');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_provider', {
              agreement_id: sdk.CLValue.newCLString(agreementId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the compute provider after agreement completion. Recorded on-chain.</div>
              {completedAgreements.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {completedAgreements.map(a => (
                    <button key={a.id} type="button" onClick={() => setAgreementId(a.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${agreementId === a.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {a.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Agreement ID" value={agreementId} onChange={setAgreementId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Provider Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !agreementId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Provider</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Rate Consumer — provider rates the consumer after agreement is completed */}
        {isProvider && (<EntryPointCard title="Rate Consumer" contract="ComputeMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [agreementId, setAgreementId] = useState('');
            const [rating, setRating] = useState(0);
            const completedAgreements = agreements.filter(a => a.status === 'terminated');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              agreement_id: sdk.CLValue.newCLString(agreementId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after compute agreement completion. Recorded on-chain.</div>
              {completedAgreements.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {completedAgreements.map(a => (
                    <button key={a.id} type="button" onClick={() => setAgreementId(a.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${agreementId === a.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {a.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Agreement ID" value={agreementId} onChange={setAgreementId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Consumer Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !agreementId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Consumer</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

      </div>
    </div>
  );
}
