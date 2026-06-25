import { useState, useEffect, useCallback } from 'react';
import EntryPointCard from './EntryPointCard';
import { Button, Input, Card, Badge, TextArea } from './ui';
import { Send, Brain, Users, FileText, RefreshCw, Pause, Play, AlertTriangle, Gavel } from 'lucide-react';
import type { TxRecord } from '../types';
import * as sdk from 'casper-js-sdk';
import { getContractNamedKeys, queryDictionary, callEntryPointWithWallet } from '../casper-client';

function accountHashToBytes(hashStr: string): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = hashStr.replace('account-hash-', '');
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function publicKeyToAccountHashHex(publicKeyHex: string): string {
  try {
    const pk = sdk.PublicKey.fromHex(publicKeyHex);
    return pk.accountHash().toHex();
  } catch {
    return '';
  }
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

export default function InferenceMarketTab({ provider, publicKeyHex, contractHash, accountHash, onTx }: {
  provider: any; publicKeyHex: string; contractHash: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const canSign = !!provider && !!publicKeyHex;
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

      {/* Models Board */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Registered Models</h3>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">No models registered yet.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {models.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{m.id}</Badge>
                  <span className="font-medium">{m.name}</span>
                  {m.requiresGpu && <Badge variant="warning">GPU</Badge>}
                </div>
                <div className="text-muted-foreground">{(Number(m.pricePerToken) / 1e9).toFixed(6)} CSPR/token · {m.maxContext} ctx</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Providers Board */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><Users className="h-4 w-4" />Providers</h3>
        {providersList.length === 0 ? (
          <p className="text-xs text-muted-foreground">No providers registered from this account.</p>
        ) : (
          <div className="space-y-2">
            {providersList.map((p) => (
              <div key={p.address} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${p.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <span className="font-medium">{p.name}</span>
                  {p.hasGpu && <Badge variant="warning">GPU {p.vram}MB</Badge>}
                </div>
                <div className="text-muted-foreground">{p.models} · {(Number(p.stake) / 1e9).toFixed(4)} CSPR</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Jobs Board */}
      <Card className="p-4">
        <h3 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Recent Jobs</h3>
        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No jobs created yet.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between text-xs bg-muted p-2 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant={j.status === 'confirmed' || j.status === 'paid' ? 'success' : j.status === 'disputed' ? 'error' : 'warning'}>{j.status}</Badge>
                  <span className="font-mono">{j.id}</span>
                  <span className="text-muted-foreground">{j.modelId}</span>
                </div>
                <div className="text-muted-foreground">{(Number(j.amount) / 1e9).toFixed(4)} CSPR</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Register Model */}
        <EntryPointCard title="Register Model" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [modelId, setModelId] = useState('phi-3-mini');
            const [name, setName] = useState('Phi-3 Mini');
            const [pricePerToken, setPricePerToken] = useState('0.001');
            const [requiresGpu, setRequiresGpu] = useState(false);
            const [minVram, setMinVram] = useState('0');
            const [maxContext, setMaxContext] = useState('4096');
            const priceMotes = Math.floor(parseFloat(pricePerToken || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('register_model', {
              model_id: sdk.CLValue.newCLString(modelId),
              name: sdk.CLValue.newCLString(name),
              price_per_token: sdk.CLValue.newCLUInt512(priceMotes),
              requires_gpu: sdk.CLValue.newCLBool(requiresGpu),
              min_vram_mb: sdk.CLValue.newCLUInt64(minVram),
              max_context: sdk.CLValue.newCLUInt64(maxContext),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Register a new AI model for inference.</div>
              <Input label="Model ID" value={modelId} onChange={setModelId} />
              <Input label="Display Name" value={name} onChange={setName} />
              <Input label="Price per Token (CSPR)" value={pricePerToken} onChange={setPricePerToken} />
              <Input label="Max Context Length" value={maxContext} onChange={setMaxContext} />
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={requiresGpu} onChange={(e) => setRequiresGpu(e.target.checked)} className="rounded" />
                  Requires GPU
                </label>
                {requiresGpu && <Input label="Min VRAM (MB)" value={minVram} onChange={setMinVram} />}
              </div>
              <Button type="submit" disabled={!canSign || !modelId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Register Model</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Update Model Price */}
        <EntryPointCard title="Update Model Price" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [modelId, setModelId] = useState('');
            const [price, setPrice] = useState('0.001');
            const priceMotes = Math.floor(parseFloat(price || '0') * 1e9).toString();
            return <form onSubmit={(e) => { e.preventDefault(); submit('update_model_price', {
              model_id: sdk.CLValue.newCLString(modelId),
              price_per_token: sdk.CLValue.newCLUInt512(priceMotes),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Update the price per token for an existing model.</div>
              <Input label="Model ID" value={modelId} onChange={setModelId} placeholder="e.g. phi-3-mini" />
              <Input label="New Price per Token (CSPR)" value={price} onChange={setPrice} />
              <Button type="submit" disabled={!canSign || !modelId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Update Price</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Provider registration is automatic when the node starts */}

        {/* Create Job */}
        <EntryPointCard title="Create Inference Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [providerAddr, setProviderAddr] = useState('');
            const [modelId, setModelId] = useState('phi-3-mini');
            const [maxTokens, setMaxTokens] = useState('1024');
            const [requestHash, setRequestHash] = useState('');
            const [amount, setAmount] = useState('10');
            const amountMotes = Math.floor(parseFloat(amount || '0') * 1e9).toString();
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !providerAddr.trim()) return;
              const walletAccountHash = publicKeyToAccountHashHex(publicKeyHex);
              const result = await callEntryPointWithWallet(provider, publicKeyHex, contractHash, 'create_job', {
                provider: sdk.CLValue.newCLByteArray(accountHashToBytes(providerAddr.replace('account-hash-', ''))),
                model_id: sdk.CLValue.newCLString(modelId),
                max_tokens: sdk.CLValue.newCLUInt64(maxTokens),
                request_hash: sdk.CLValue.newCLString(requestHash),
                amount: sdk.CLValue.newCLUInt512(amountMotes),
              });
              if (result.deployHash) {
                onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: 'InferenceMarket', status: result.error ? 'error' : 'pending', error: result.error });
              }
            };
            return <form onSubmit={handleSubmit} className="space-y-2">
              <div className="text-xs text-muted-foreground">Request inference from a specific provider.</div>
              <Input label="Provider Account Hash" value={providerAddr} onChange={setProviderAddr} placeholder="account-hash-..." />
              <Input label="Model ID" value={modelId} onChange={setModelId} />
              <Input label="Max Tokens" value={maxTokens} onChange={setMaxTokens} />
              <Input label="Request Hash (IPFS/prompt hash)" value={requestHash} onChange={setRequestHash} />
              <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
              <Button type="submit" disabled={!canSign || !providerAddr.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Create Job</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Provider Ack */}
        <EntryPointCard title="Provider Acknowledge Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('provider_ack', {
              job_id: sdk.CLValue.newCLString(jobId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Acknowledge a job as a provider.</div>
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Acknowledge</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Provider Complete */}
        <EntryPointCard title="Provider Complete Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [responseHash, setResponseHash] = useState('');
            const [tokensGenerated, setTokensGenerated] = useState('1024');
            return <form onSubmit={(e) => { e.preventDefault(); submit('provider_complete', {
              job_id: sdk.CLValue.newCLString(jobId),
              response_hash: sdk.CLValue.newCLString(responseHash),
              tokens_generated: sdk.CLValue.newCLUInt64(tokensGenerated),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Submit inference results for a job.</div>
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Input label="Response Hash (IPFS/result hash)" value={responseHash} onChange={setResponseHash} />
              <Input label="Tokens Generated" value={tokensGenerated} onChange={setTokensGenerated} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Complete Job</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Consumer Confirm */}
        <EntryPointCard title="Consumer Confirm Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [rating, setRating] = useState('5');
            return <form onSubmit={(e) => { e.preventDefault(); submit('consumer_confirm', {
              job_id: sdk.CLValue.newCLString(jobId),
              rating: sdk.CLValue.newCLUInt64(rating),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Confirm job completion and rate the provider.</div>
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Input label="Rating (1-5)" value={rating} onChange={setRating} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Confirm & Rate</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Claim Payment */}
        <EntryPointCard title="Claim Payment" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('claim_payment', {
              job_id: sdk.CLValue.newCLString(jobId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Claim payment for a confirmed job (provider only).</div>
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} className="w-full"><Send className="h-4 w-4 mr-1" />Claim Payment</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Pause/Resume Provider */}
        <EntryPointCard title="Pause Provider" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            return <form onSubmit={(e) => { e.preventDefault(); submit('pause_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Pause className="h-3 w-3" />Temporarily stop accepting jobs.</div>
              <Button type="submit" disabled={!canSign} variant="danger" className="w-full"><Pause className="h-4 w-4 mr-1" />Pause</Button>
            </form>;
          }}
        </EntryPointCard>

        <EntryPointCard title="Resume Provider" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            return <form onSubmit={(e) => { e.preventDefault(); submit('resume_provider', {}); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Play className="h-3 w-3" />Resume accepting jobs.</div>
              <Button type="submit" disabled={!canSign} className="w-full"><Play className="h-4 w-4 mr-1" />Resume</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Dispute & Resolve */}
        <EntryPointCard title="Dispute Job" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [evidence, setEvidence] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('dispute_job', {
              job_id: sdk.CLValue.newCLString(jobId),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Raise a dispute for a job.</div>
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !jobId.trim()} variant="danger" className="w-full"><Gavel className="h-4 w-4 mr-1" />Dispute</Button>
            </form>;
          }}
        </EntryPointCard>

        {/* Set Protocol Fee */}
        <EntryPointCard title="Set Protocol Fee (Admin)" contract="InferenceMarket" contractHash={contractHash} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [feeBps, setFeeBps] = useState('250');
            return <form onSubmit={(e) => { e.preventDefault(); submit('set_protocol_fee_bps', {
              fee_bps: sdk.CLValue.newCLUInt64(feeBps),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground">Set protocol fee in basis points (owner only).</div>
              <Input label="Fee (BPS)" value={feeBps} onChange={setFeeBps} />
              <Button type="submit" disabled={!canSign} variant="outline" className="w-full"><Send className="h-4 w-4 mr-1" />Set Fee</Button>
            </form>;
          }}
        </EntryPointCard>
      </div>
    </div>
  );
}
