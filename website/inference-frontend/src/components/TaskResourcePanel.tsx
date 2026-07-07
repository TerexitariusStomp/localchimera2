import { useState, useEffect, useCallback } from 'react';
import { Brain, HardDrive, Cpu, Wifi, Send, CheckCircle, Loader2 } from 'lucide-react';
import { Button, Input, TextArea } from './ui';
import EntryPointCard from './EntryPointCard';
import { CONTRACTS, getContractNamedKeys, queryDictionary, callEntryPointWithWallet } from '../casper-client';
import * as sdk from 'casper-js-sdk';
import type { TxRecord } from '../types';

type Resource = 'inference' | 'storage' | 'compute' | 'bandwidth';

type Job = {
  id: string;
  state: number;
  status: string;
  requestHash?: string;
  responseHash?: string;
};

const JOB_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'acknowledged', '2': 'completed', '3': 'confirmed',
  '4': 'paid', '5': 'refunded', '6': 'disputed', '7': 'resolved',
};

const RESOURCES: { id: Resource; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'inference', label: 'Inference', description: 'AI model prompts, streaming, and private FHE inference.', icon: <Brain className="h-5 w-5" /> },
  { id: 'storage', label: 'Storage', description: 'Reserve space, store files, and retrieve data on demand.', icon: <HardDrive className="h-5 w-5" /> },
  { id: 'compute', label: 'Compute', description: 'Run shell, Python, Node.js, or Docker jobs with resource specs.', icon: <Cpu className="h-5 w-5" /> },
  { id: 'bandwidth', label: 'Bandwidth', description: 'Purchase proxy/relay sessions by duration and data allowance.', icon: <Wifi className="h-5 w-5" /> },
];

export default function TaskResourcePanel({
  provider,
  publicKeyHex,
  accountHash,
  onTx,
  fixedResource,
}: {
  provider: any;
  publicKeyHex: string;
  accountHash: string;
  onTx: (tx: TxRecord) => void;
  fixedResource?: Resource;
}) {
  const [selected, setSelected] = useState<Resource | null>(fixedResource || null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const canSign = !!provider && !!publicKeyHex;

  const loadData = useCallback(async () => {
    if (!accountHash) return;
    setLoading(true);
    try {
      const imKeys = await getContractNamedKeys(CONTRACTS.inferenceMarket);
      const jobsUref = imKeys['jobs_dict'] || '';
      const loaded: Job[] = [];
      if (jobsUref) {
        const ahStr = accountHash.replace('account-hash-', '');
        const pendingUref = imKeys['pending_jobs'] || '';
        let jobIds: string[] = [];
        if (pendingUref) {
          const pendingList = await queryDictionary(pendingUref, 'list');
          if (Array.isArray(pendingList)) jobIds = pendingList as string[];
        }
        for (const jobId of jobIds) {
          if (!jobId.includes(ahStr)) continue;
          const state = await queryDictionary(jobsUref, `${jobId}:state`);
          if (state === null || state === undefined) continue;
          const responseHash = await queryDictionary(jobsUref, `${jobId}:response_hash`);
          const requestHash = await queryDictionary(jobsUref, `${jobId}:request_hash`);
          loaded.push({
            id: jobId,
            state: Number(state),
            status: JOB_STATUS[String(state)] || String(state),
            requestHash: requestHash || '',
            responseHash: responseHash || '',
          });
        }
      }
      setJobs(loaded);
    } catch (e) {
      console.error('Failed to load task resources', e);
    } finally {
      setLoading(false);
    }
  }, [accountHash]);

  useEffect(() => {
    if (accountHash) loadData();
    const id = accountHash ? setInterval(loadData, 15000) : undefined;
    return () => { if (id) clearInterval(id); };
  }, [loadData, accountHash]);

  const submitJob = async (contractHash: string, contractLabel: string, orderId: string, amountCspr: string) => {
    if (!canSign) return;
    const amountMotes = Math.floor(parseFloat(amountCspr || '0') * 1e9).toString();
    const consumerHash = sdk.PublicKey.fromHex(publicKeyHex).accountHash();
    const zeroHash = new Uint8Array(32);
    const result = await callEntryPointWithWallet(provider, publicKeyHex, contractHash, 'create_job', {
      consumer: sdk.CLValue.newCLByteArray(consumerHash.toBytes()),
      provider: sdk.CLValue.newCLByteArray(zeroHash),
      amount: sdk.CLValue.newCLUInt512(amountMotes),
      provider_fee_bps: sdk.CLValue.newCLUint64('0'),
      order_id: sdk.CLValue.newCLString(orderId),
    });
    if (result.error) {
      onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: contractLabel, status: 'error', error: result.error });
      alert(`${contractLabel} deploy failed: ${result.error}`);
      return;
    }
    if (result.deployHash) {
      onTx({ id: Date.now().toString(), deployHash: result.deployHash, entryPoint: 'create_job', contract: contractLabel, status: 'pending' });
    }
    loadData();
  };

  const filteredJobs = (prefix: string) => jobs.filter(j => j.requestHash?.startsWith(prefix));

  return (
    <div className="space-y-6">
      {!fixedResource && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {RESOURCES.map((r) => {
            const active = selected === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(active ? null : r.id)}
                className={`text-left rounded-2xl border p-5 transition-all ${active ? 'bg-primary/10 border-primary/40 shadow-[0_0_20px_rgba(0,229,255,0.12)]' : 'bg-card border-border hover:border-primary/30 hover:bg-secondary'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {r.icon}
                </div>
                <h4 className="font-semibold text-foreground mb-1">{r.label}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                {active && <div className="mt-3 text-[11px] font-medium text-primary">Selected</div>}
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing task history...
        </div>
      )}

      {!canSign && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Connect your Casper wallet to request resources.</p>
        </div>
      )}

      {selected === 'inference' && (
        <EntryPointCard title="Request Inference" contract="EscrowVault" contractHash={CONTRACTS.escrowVault} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [amount, setAmount] = useState('10');
            const [promptText, setPromptText] = useState('');
            const [aiResult, setAiResult] = useState<string | null>(null);
            const [aiLoading, setAiLoading] = useState(false);
            const [aiProgress, setAiProgress] = useState('');
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !promptText.trim()) return;
              setAiResult(null);
              setAiLoading(true);
              setAiProgress('Submitting to Casper testnet...');
              await submitJob(CONTRACTS.escrowVault, 'EscrowVault', promptText.trim(), amount);
              setAiProgress('Loading in-browser AI model (WebLLM)...');
              try {
                const webllm = await import('@mlc-ai/web-llm');
                const modelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
                setAiProgress('Loading model (first run downloads ~1GB)...');
                const engine = await webllm.CreateMLCEngine(modelId, {
                  initProgressCallback: (p: any) => {
                    if (p.progress !== undefined) {
                      setAiProgress(`Model loading: ${Math.round(p.progress * 100)}%`);
                    }
                  },
                });
                setAiProgress('Running inference...');
                const completion = await engine.chat.completions.create({
                  messages: [{ role: 'user', content: promptText.trim().slice(0, 500) }],
                  max_tokens: 256,
                  temperature: 0.7,
                  stream: false,
                });
                const output = completion.choices?.[0]?.message?.content || 'No response generated';
                setAiResult(output);
              } catch (aiErr: any) {
                setAiResult(`AI inference failed: ${aiErr.message}. Job was submitted to testnet.`);
              } finally {
                setAiLoading(false);
                setAiProgress('');
              }
              setPromptText('');
            };
            const completed = filteredJobs('').filter(j => j.state >= 3 && j.responseHash && !j.requestHash?.startsWith('STORAGE:') && !j.requestHash?.startsWith('COMPUTE:') && !j.requestHash?.startsWith('BANDWIDTH:'));
            const pending = filteredJobs('').filter(j => j.state < 3 && !j.requestHash?.startsWith('STORAGE:') && !j.requestHash?.startsWith('COMPUTE:') && !j.requestHash?.startsWith('BANDWIDTH:'));
            return (
              <div className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="text-xs text-muted-foreground">Submit a prompt — it creates an EscrowVault job on Casper testnet and runs AI inference in your browser via WebLLM.</div>
                  <TextArea label="Prompt" value={promptText} onChange={setPromptText} placeholder="Enter your inference prompt..." rows={4} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
                    <div className="flex items-end">
                      <Button type="submit" disabled={!canSign || !promptText.trim() || aiLoading} className="w-full"><Send className="h-4 w-4 mr-1.5" />{aiLoading ? 'Processing...' : 'Request'}</Button>
                    </div>
                  </div>
                </form>
                {aiLoading && (
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/10 rounded-lg p-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {aiProgress || 'Loading...'}
                  </div>
                )}
                {aiResult && (
                  <div className="bg-muted rounded-lg p-4 space-y-2 border border-primary/20">
                    <div className="text-xs font-semibold text-primary flex items-center gap-1"><Brain className="h-3 w-3" /> In-Browser AI Response</div>
                    <div className="text-sm text-foreground break-words whitespace-pre-wrap">{aiResult}</div>
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-muted-foreground">Pending</div>
                    {pending.slice(0, 3).map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 mr-2">{j.id}</span>
                        <span className="text-primary shrink-0">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </EntryPointCard>
      )}

      {selected === 'storage' && (
        <EntryPointCard title="Reserve Storage" contract="EscrowVault" contractHash={CONTRACTS.escrowVault} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [amount, setAmount] = useState('10');
            const [spaceName, setSpaceName] = useState('');
            const [sizeMb, setSizeMb] = useState('100');
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !spaceName.trim()) return;
              await submitJob(CONTRACTS.escrowVault, 'EscrowVault', `STORAGE:ALLOC:${spaceName.trim()}:${sizeMb}MB`, amount);
              setSpaceName('');
            };
            const completed = filteredJobs('STORAGE:ALLOC:');
            const pending = jobs.filter(j => j.state < 3 && j.requestHash?.startsWith('STORAGE:ALLOC:'));
            return (
              <div className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="text-xs text-muted-foreground">Reserve a named storage space on a provider. You can store files into it afterwards.</div>
                  <Input label="Space Name" value={spaceName} onChange={setSpaceName} placeholder="e.g. dataset-v2" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Size (MB)" value={sizeMb} onChange={setSizeMb} />
                    <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
                  </div>
                  <Button type="submit" disabled={!canSign || !spaceName.trim()} className="w-full"><HardDrive className="h-4 w-4 mr-1.5" />Reserve Storage</Button>
                </form>
                {completed.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-primary flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Allocated Spaces</div>
                    {completed.slice(-3).reverse().map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="break-words flex-1 mr-2">{j.requestHash}</span>
                        <span className="text-[10px] text-muted-foreground">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-muted-foreground">Pending Reservations</div>
                    {pending.slice(0, 3).map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 mr-2">{j.requestHash || j.id}</span>
                        <span className="text-primary shrink-0">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </EntryPointCard>
      )}

      {selected === 'compute' && (
        <EntryPointCard title="Run Compute Job" contract="EscrowVault" contractHash={CONTRACTS.escrowVault} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [amount, setAmount] = useState('10');
            const [code, setCode] = useState('');
            const [runtime, setRuntime] = useState('shell');
            const [cpuCores, setCpuCores] = useState('2');
            const [ramMb, setRamMb] = useState('512');
            const [gpu, setGpu] = useState(false);
            const [timeoutSec, setTimeoutSec] = useState('30');
            const [submitting, setSubmitting] = useState(false);
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign || !code.trim()) return;
              setSubmitting(true);
              const orderId = `COMPUTE:${runtime}:${cpuCores}:${ramMb}:${gpu ? '1' : '0'}:${timeoutSec}:${code.trim()}`;
              await submitJob(CONTRACTS.escrowVault, 'EscrowVault', orderId, amount);
              setSubmitting(false);
              setCode('');
            };
            const computeJobs = filteredJobs('COMPUTE:');
            const queued = computeJobs.filter(j => j.state === 0 || j.state === 1);
            const running = computeJobs.filter(j => j.state === 2);
            const completed = computeJobs.filter(j => j.state >= 3 && j.responseHash);
            return (
              <div className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="text-xs text-muted-foreground">Submit a compute job with resource constraints. The provider executes it asynchronously.</div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Runtime</label>
                    <select value={runtime} onChange={(e) => setRuntime(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <option value="shell">Shell Script</option>
                      <option value="python3">Python 3</option>
                      <option value="node">Node.js</option>
                      <option value="docker">Docker Container</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="CPU Cores" value={cpuCores} onChange={setCpuCores} />
                    <Input label="RAM (MB)" value={ramMb} onChange={setRamMb} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Timeout (sec)" value={timeoutSec} onChange={setTimeoutSec} />
                    <div className="space-y-1">
                      <label className="text-sm font-medium">GPU Required</label>
                      <button type="button" onClick={() => setGpu(!gpu)} className={`flex h-9 w-full items-center justify-center rounded-md border text-sm ${gpu ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-transparent text-muted-foreground'}`}>
                        {gpu ? 'GPU ON' : 'No GPU'}
                      </button>
                    </div>
                  </div>
                  <TextArea label="Code / Script" value={code} onChange={setCode} placeholder="e.g. python3 -c 'print(sum(range(100)))'" rows={4} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
                    <div className="flex items-end">
                      <Button type="submit" disabled={!canSign || !code.trim() || submitting} className="w-full"><Cpu className="h-4 w-4 mr-1.5" />{submitting ? 'Submitting...' : 'Run Job'}</Button>
                    </div>
                  </div>
                </form>
                {queued.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-yellow-400 flex items-center gap-1">Job Queue ({queued.length})</div>
                    {queued.slice(0, 3).map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 mr-2">{j.id}</span>
                        <span className="text-yellow-400 text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {running.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-primary flex items-center gap-1">Running ({running.length})</div>
                    {running.slice(0, 3).map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 mr-2">{j.id}</span>
                        <span className="text-primary text-[10px] px-1.5 py-0.5 rounded bg-primary/10">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {completed.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-green-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Completed ({completed.length})</div>
                    {completed.slice(-3).reverse().map(j => (
                      <div key={j.id} className="bg-muted rounded-lg p-3 space-y-1">
                        <div className="text-[10px] text-muted-foreground">Output</div>
                        <div className="text-xs text-foreground break-words font-mono">{j.responseHash}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </EntryPointCard>
      )}

      {selected === 'bandwidth' && (
        <EntryPointCard title="Get Bandwidth" contract="EscrowVault" contractHash={CONTRACTS.escrowVault} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {() => {
            const [amount, setAmount] = useState('10');
            const [durationHours, setDurationHours] = useState('1');
            const [dataGb, setDataGb] = useState('1');
            const handleSubmit = async (e: any) => {
              e.preventDefault();
              if (!canSign) return;
              await submitJob(CONTRACTS.escrowVault, 'EscrowVault', `BANDWIDTH:${durationHours}h:${dataGb}GB`, amount);
            };
            const completed = filteredJobs('BANDWIDTH:');
            const pending = jobs.filter(j => j.state < 3 && j.requestHash?.startsWith('BANDWIDTH:'));
            return (
              <div className="space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="text-xs text-muted-foreground">Purchase a bandwidth proxy/relay session. Connection details are returned on completion.</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Duration (hours)" value={durationHours} onChange={setDurationHours} />
                    <Input label="Data Allowance (GB)" value={dataGb} onChange={setDataGb} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Funds (CSPR)" value={amount} onChange={setAmount} />
                    <div className="flex items-end">
                      <Button type="submit" disabled={!canSign} className="w-full"><Wifi className="h-4 w-4 mr-1.5" />Get Bandwidth</Button>
                    </div>
                  </div>
                </form>
                {completed.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-primary flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Sessions</div>
                    {completed.slice(-3).reverse().map(j => (
                      <div key={j.id} className="bg-muted rounded-lg p-3 space-y-1">
                        <div className="text-[10px] text-muted-foreground">Session Details</div>
                        <div className="text-xs text-foreground break-words">{j.responseHash}</div>
                      </div>
                    ))}
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-border">
                    <div className="text-xs font-semibold text-muted-foreground">Pending Sessions</div>
                    {pending.slice(0, 3).map(j => (
                      <div key={j.id} className="flex items-center justify-between text-xs bg-muted rounded p-2">
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1 mr-2">{j.id}</span>
                        <span className="text-primary shrink-0">{j.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </EntryPointCard>
      )}
    </div>
  );
}
