import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, TextArea, StarRating } from './ui';
import { Send, Brain, RefreshCw, AlertTriangle, Gavel, Shield, Star } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary, callEntryPointWithWallet } from '../casper-client';

const ADMIN_PUBLIC_KEY = '020227d8dd5ccaa600e45b36e598d90ef8c26b6c67ef81bdfebde8fa583997a91ea5';

function publicKeyToAccountHashHex(publicKeyHex: string): string {
  try {
    const pk = sdk.PublicKey.fromHex(publicKeyHex);
    return pk.accountHash().toHex();
  } catch {
    return '';
  }
}

function accountHashToBytes(hashStr: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = hashStr.replace('account-hash-', '');
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

interface ModelInfo {
  id: string;
  name: string;
  pricePerToken: string;
  requiresGpu: boolean;
  minVram: string;
  maxContext: string;
}

interface ProviderInfo {
  address: string;
  peerId: string;
  name: string;
  hasGpu: boolean;
  vram: string;
  models: string;
  status: string;
  stake: string;
}

interface JobInfo {
  id: string;
  provider: string;
  modelId: string;
  maxTokens: string;
  requestHash: string;
  amount: string;
  status: string;
}

const JOB_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'acknowledged', '2': 'completed', '3': 'confirmed',
  '4': 'paid', '5': 'refunded', '6': 'disputed', '7': 'resolved',
};

export default function InferenceMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx, view = 'tasker' }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void; view?: 'tasker' | 'provider';
}) {
  const canSign = !!provider && !!publicKeyHex;
  const isAdmin = publicKeyHex === ADMIN_PUBLIC_KEY;
  const isTasker = view === 'tasker';
  const isProvider = view === 'provider';
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providersList, setProvidersList] = useState<ProviderInfo[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [namedKeys, setNamedKeys] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!contractHash) return;
    setLoading(true);
    try {
      const keys = await getContractNamedKeys(contractHash);
      setNamedKeys(keys);
      // Load models
      const modelsUref = keys['im_models'];
      if (modelsUref) {
        const loaded: ModelInfo[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `model-${i}`;
          const name = await queryDictionary(modelsUref, `${id}:name`);
          if (!name) continue;
          loaded.push({
            id,
            name: String(name),
            pricePerToken: String(await queryDictionary(modelsUref, `${id}:price`) || '0'),
            requiresGpu: Boolean(await queryDictionary(modelsUref, `${id}:gpu`)),
            minVram: String(await queryDictionary(modelsUref, `${id}:min_vram`) || '0'),
            maxContext: String(await queryDictionary(modelsUref, `${id}:max_ctx`) || '0'),
          });
        }
        setModels(loaded);
      }
      // Load providers
      const providersUref = keys['im_providers'];
      if (providersUref && accountHash) {
        const myHash = accountHash.replace('account-hash-', '');
        const status = await queryDictionary(providersUref, `${myHash}:status`);
        if (status !== null && status !== undefined) {
          setProvidersList([{
            address: accountHash,
            peerId: String(await queryDictionary(providersUref, `${myHash}:peer_id`) || ''),
            name: String(await queryDictionary(providersUref, `${myHash}:name`) || ''),
            hasGpu: Boolean(await queryDictionary(providersUref, `${myHash}:gpu`)),
            vram: String(await queryDictionary(providersUref, `${myHash}:vram`) || '0'),
            models: String(await queryDictionary(providersUref, `${myHash}:models`) || ''),
            status: String(status) === '1' ? 'active' : String(status) === '2' ? 'paused' : 'unknown',
            stake: String(await queryDictionary(providersUref, `${myHash}:stake`) || '0'),
          }]);
        }
      }
      // Load jobs
      const jobsUref = keys['im_jobs'];
      if (jobsUref) {
        const loaded: JobInfo[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `job-${i}`;
          const status = await queryDictionary(jobsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({
            id,
            provider: String(await queryDictionary(jobsUref, `${id}:provider`) || ''),
            modelId: String(await queryDictionary(jobsUref, `${id}:model`) || ''),
            maxTokens: String(await queryDictionary(jobsUref, `${id}:max_tokens`) || '0'),
            requestHash: String(await queryDictionary(jobsUref, `${id}:request`) || ''),
            amount: String(await queryDictionary(jobsUref, `${id}:amount`) || '0'),
            status: JOB_STATUS[String(status)] || String(status),
          });
        }
        setJobs(loaded);
      }
    } catch (e) {
      console.error('Failed to load inference market data:', e);
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
          <h2 className="text-2xl font-bold flex items-center gap-2"><Brain className="h-6 w-6 text-[#00e5ff]" />Inference Market</h2>
          <p className="text-muted-foreground text-sm font-mono">{contractHash}</p>
        </div>
        <button onClick={loadData} disabled={loading} className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Create Job — simplified: only funds + optional min tokens, router auto-assigns provider/model */}
        {isTasker && (<EntryPointCard title="Request Inference" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [amount, setAmount] = useState('10');
            const [minTokens, setMinTokens] = useState('256');
            const [promptText, setPromptText] = useState('');
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !promptText.trim()) return;
              const result = await callEntryPointWithWallet(provider, publicKeyHex, contractHash, 'create_job', {
                prompt: sdk.CLValue.newCLString(promptText),
                min_tokens: sdk.CLValue.newCLUint64(minTokens || '0'),
                amount: sdk.CLValue.newCLUInt512(amountMotes),
              });
              if (result.deployHash) {
                onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: 'InferenceMarket', status: result.error ? 'error' : 'pending', error: result.error });
              }
            };
            return <form onSubmit={handleSubmit} className="space-y-2">
              <div className="text-xs text-muted-foreground">Submit a prompt for inference. The router automatically assigns an available provider and model.</div>
              <TextArea label="Prompt" value={promptText} onChange={setPromptText} placeholder="Enter your inference prompt..." rows={4} />
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Input label="Min Tokens (optional)" value={minTokens} onChange={setMinTokens} />
              <Button type="submit" disabled={!canSign || !promptText.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Request Inference</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Confirm & Rate Provider — consumer confirms job and rates provider */}
        {isTasker && (<EntryPointCard title="Confirm & Rate Provider" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [rating, setRating] = useState(0);
            const pendingJobs = jobs.filter(j => j.status === 'completed');
            return <form onSubmit={(e) => { e.preventDefault(); submit('consumer_confirm', {
              job_id: sdk.CLValue.newCLString(jobId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Confirm job completion and rate the provider. Payment auto-releases after 1 hour if no dispute is raised.</div>
              {pendingJobs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pendingJobs.map(j => (
                    <button key={j.id} type="button" onClick={() => setJobId(j.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${jobId === j.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {j.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Provider Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !jobId.trim() || rating === 0} className="w-full"><Send className="h-4 w-4 mr-1" />Confirm & Rate</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Rate Consumer — provider rates the consumer after job is confirmed/paid */}
        {isProvider && (<EntryPointCard title="Rate Consumer" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [rating, setRating] = useState(0);
            const completedJobs = jobs.filter(j => j.status === 'confirmed' || j.status === 'paid' || j.status === 'resolved');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              job_id: sdk.CLValue.newCLString(jobId),
              rating: sdk.CLValue.newCLUint64(String(rating)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after job completion. Recorded on-chain.</div>
              {completedJobs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {completedJobs.map(j => (
                    <button key={j.id} type="button" onClick={() => setJobId(j.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${jobId === j.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {j.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Consumer Rating</label>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <Button type="submit" disabled={!canSign || !jobId.trim() || rating === 0} className="w-full"><Star className="h-4 w-4 mr-1" />Rate Consumer</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Dispute Job — consumer can dispute within 1 hour */}
        {isTasker && (<EntryPointCard title="Dispute Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [evidence, setEvidence] = useState('');
            const disputableJobs = jobs.filter(j => j.status === 'completed' || j.status === 'confirmed');
            return <form onSubmit={(e) => { e.preventDefault(); submit('dispute_job', {
              job_id: sdk.CLValue.newCLString(jobId),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Raise a dispute within 1 hour of completion to prevent automatic payout.</div>
              {disputableJobs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {disputableJobs.map(j => (
                    <button key={j.id} type="button" onClick={() => setJobId(j.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${jobId === j.id ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {j.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} variant="danger" className="w-full"><Gavel className="h-4 w-4 mr-1" />Dispute</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* Admin only: Set Protocol Fee */}
        {isProvider && isAdmin && (
          <EntryPointCard title="Set Protocol Fee (Admin)" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [feeBps, setFeeBps] = useState('250');
              return <form onSubmit={(e) => { e.preventDefault(); submit('set_protocol_fee_bps', {
                fee_bps: sdk.CLValue.newCLUint64(feeBps),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Set protocol fee in basis points (admin only).</div>
                <Input label="Fee (BPS)" value={feeBps} onChange={setFeeBps} />
                <Button type="submit" disabled={!canSign} variant="outline" className="w-full"><Send className="h-4 w-4 mr-1" />Set Fee</Button>
              </form>;
            }}
          </EntryPointCard>
        )}
      </div>
    </div>
  );
}
