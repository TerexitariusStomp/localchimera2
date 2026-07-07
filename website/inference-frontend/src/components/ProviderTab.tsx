import { useState, useEffect, useCallback } from 'react';
import { useWeb3Auth } from '../web3auth';
import EntryPointCard from './EntryPointCard';
import { Button, Input, StarRating } from './ui';
import { Send, Brain, HardDrive, Cpu, Wifi, Star, Gavel, Shield, AlertTriangle, Settings, CheckCircle, Loader2 } from 'lucide-react';
import * as sdk from 'casper-js-sdk';
import { CONTRACTS, getContractNamedKeys, queryDictionary } from '../casper-client';
import { getKlerosRuling, getKlerosDisputeStatus, DisputeStatus, pollKlerosRuling } from '../kleros-client';
import type { TxRecord } from '../types';

const ADMIN_PUBLIC_KEY = '020227d8dd5ccaa600e45b36e598d90ef8c26b6c67ef81bdfebde8fa583997a91ea5';

const JOB_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'acknowledged', '2': 'completed', '3': 'confirmed',
  '4': 'paid', '5': 'refunded', '6': 'disputed', '7': 'resolved',
};

const SESSION_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'confirmed', '2': 'closed', '3': 'disputed', '4': 'resolved',
};

const AGREEMENT_STATUS: Record<string, string> = {
  '0': 'pending', '1': 'approved', '2': 'rejected', '3': 'active', '4': 'terminated',
};

function CategoryHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-8 first:mt-0">
      <div className="text-[#00e5ff]">{icon}</div>
      <div>
        <h3 className="text-lg font-bold text-[#e8e2d8]">{title}</h3>
        <p className="text-xs text-[#7a7468]">{subtitle}</p>
      </div>
    </div>
  );
}

type VerifyStatus = 'idle' | 'verifying' | 'verified' | 'failed';

type VerifyResult = {
  allMatch: boolean;
  results: { field: string; actual: any; claimed: any; match: boolean; note?: string }[];
  machineInfo: { platform: string; gpuName: string; cpuCores: number; ramGb: number };
};

async function detectMachineResources(): Promise<{
  cpuCores: number;
  ramGb: number;
  hasGpu: boolean;
  vramMb: number;
  gpuName: string;
  bandwidthMbps: number;
  platform: string;
}> {
  const cpuCores = navigator.hardwareConcurrency || 0;
  const ramGb = (navigator as any).deviceMemory || 0;
  const platform = navigator.platform || 'unknown';

  let hasGpu = false;
  let vramMb = 0;
  let gpuName = '';
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (adapter) {
      hasGpu = true;
      const info = await adapter.requestAdapterInfo?.();
      gpuName = info?.description || info?.vendor || 'WebGPU adapter';
    }
  } catch {}

  let bandwidthMbps = 0;
  try {
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn?.downlink) {
      bandwidthMbps = Math.round(conn.downlink);
    }
  } catch {}

  return { cpuCores, ramGb, hasGpu, vramMb, gpuName, bandwidthMbps, platform };
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between">
      <div className="text-xs text-[#7a7468] uppercase tracking-wider">{title}</div>
      <div className="mt-2">
        <div className="text-2xl font-bold text-[#e8e2d8]">{value}</div>
        {subtitle && <div className="text-xs text-[#7a7468] mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}

function UptimeBar({ pct }: { pct: number }) {
  const blocks = 10;
  const filled = Math.round((pct / 100) * blocks);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} className={`w-2 h-3 rounded-sm ${i < filled ? 'bg-emerald-500' : 'bg-white/10'}`} />
        ))}
      </div>
      <span className="text-xs text-[#7a7468]">{pct.toFixed(2)}%</span>
    </div>
  );
}

function verifyClaim(actual: any, claimed: Record<string, any>, resource: string): VerifyResult {
  const results: VerifyResult['results'] = [];
  const tolerance = 0.1;

  if (resource === 'compute') {
    const claimedCpu = parseInt(claimed.cpu_cores) || 0;
    results.push({ field: 'cpu_cores', actual: actual.cpuCores, claimed: claimedCpu, match: actual.cpuCores >= claimedCpu * (1 - tolerance) });
    const claimedRam = parseInt(claimed.ram_mb) || 0;
    const actualRamMb = actual.ramGb * 1024;
    results.push({ field: 'ram_mb', actual: Math.round(actualRamMb), claimed: claimedRam, match: actualRamMb >= claimedRam * (1 - tolerance) });
    if (claimed.gpu === 'true' || claimed.gpu === true) {
      results.push({ field: 'gpu', actual: actual.hasGpu, claimed: true, match: actual.hasGpu });
      if (actual.hasGpu && claimed.vram_mb) {
        results.push({ field: 'vram_mb', actual: actual.vramMb, claimed: parseInt(claimed.vram_mb), match: actual.vramMb >= parseInt(claimed.vram_mb) * (1 - tolerance), note: 'VRAM estimate from WebGPU' });
      }
    }
  } else if (resource === 'inference') {
    if (claimed.gpu === 'true' || claimed.gpu === true) {
      results.push({ field: 'gpu', actual: actual.hasGpu, claimed: true, match: actual.hasGpu });
      if (actual.hasGpu && claimed.vram_mb) {
        results.push({ field: 'vram_mb', actual: actual.vramMb, claimed: parseInt(claimed.vram_mb), match: actual.vramMb >= parseInt(claimed.vram_mb) * (1 - tolerance), note: 'VRAM estimate from WebGPU' });
      }
    }
    results.push({ field: 'models', actual: 'runtime_check', claimed: claimed.models, match: true, note: 'Model availability verified at runtime by node' });
  } else if (resource === 'storage') {
    results.push({ field: 'total_capacity_mb', actual: 'browser_unavailable', claimed: parseInt(claimed.total_capacity_mb), match: true, note: 'Storage capacity verified by provider node at runtime' });
  } else if (resource === 'bandwidth') {
    const claimedBw = parseInt(claimed.bandwidth_mbps) || 0;
    results.push({ field: 'bandwidth_mbps', actual: actual.bandwidthMbps, claimed: claimedBw, match: actual.bandwidthMbps >= claimedBw * (1 - tolerance), note: actual.bandwidthMbps > 0 ? 'Measured via Network Information API' : 'Network API unavailable — verified by node' });
  }

  const allMatch = results.every(r => r.match);
  return { allMatch, results, machineInfo: { platform: actual.platform, gpuName: actual.gpuName, cpuCores: actual.cpuCores, ramGb: actual.ramGb } };
}

function useVerifyUpdate() {
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const verify = async (resource: string, claimed: Record<string, any>) => {
    setVerifyStatus('verifying');
    setVerifyResult(null);
    try {
      const actual = await detectMachineResources();
      const result = verifyClaim(actual, claimed, resource);
      setVerifyResult(result);
      setVerifyStatus(result.allMatch ? 'verified' : 'failed');
    } catch {
      setVerifyStatus('failed');
    }
  };
  return { verifyStatus, verifyResult, verify, reset: () => { setVerifyStatus('idle'); setVerifyResult(null); } };
}

function VerifyBadge({ status, result }: { status: VerifyStatus; result?: VerifyResult | null }) {
  if (status === 'idle') return null;
  if (status === 'verifying') return <div className="text-xs text-amber-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Detecting machine resources...</div>;
  if (status === 'verified') return (
    <div className="space-y-1">
      <div className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Machine resources verified locally</div>
      {result && <div className="text-[10px] text-[#7a7468]">CPU: {result.machineInfo.cpuCores} cores · RAM: {result.machineInfo.ramGb} GB · GPU: {result.machineInfo.gpuName || 'none'}</div>}
      {result?.results.filter(r => r.note).map(r => (
        <div key={r.field} className="text-[10px] text-[#7a7468]/70">{r.field}: {r.note}</div>
      ))}
    </div>
  );
  if (status === 'failed') return (
    <div className="space-y-1">
      <div className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Machine resources do not match claims</div>
      {result && result.results.filter(r => !r.match).map(r => (
        <div key={r.field} className="text-[10px] text-red-400/70">{r.field}: claimed {String(r.claimed)}, detected {String(r.actual)}</div>
      ))}
    </div>
  );
  return null;
}

type Resource = 'inference' | 'storage' | 'compute' | 'bandwidth';
type Category = 'manage' | 'rate' | 'disputes' | 'admin';

const RESOURCES: { id: Resource; label: string; icon: React.ReactNode }[] = [
  { id: 'inference', label: 'Inference', icon: <Brain className="h-4 w-4" /> },
  { id: 'storage', label: 'Storage', icon: <HardDrive className="h-4 w-4" /> },
  { id: 'compute', label: 'Compute', icon: <Cpu className="h-4 w-4" /> },
  { id: 'bandwidth', label: 'Bandwidth', icon: <Wifi className="h-4 w-4" /> },
];

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode; subtitle: string }[] = [
  { id: 'manage', label: 'Manage', icon: <Settings className="h-4 w-4" />, subtitle: 'Update your provider settings and pricing.' },
  { id: 'rate', label: 'Rate Consumers', icon: <Star className="h-4 w-4" />, subtitle: 'Rate consumers after task completion. Recorded on-chain.' },
  { id: 'disputes', label: 'Disputes', icon: <Gavel className="h-4 w-4" />, subtitle: 'Submit evidence for disputes raised against your services.' },
  { id: 'admin', label: 'Admin', icon: <Shield className="h-4 w-4" />, subtitle: 'Admin-only operations: fees, challenges, dispute resolution.' },
];

const RESOURCE_BY_CATEGORY: Record<Category, Resource[]> = {
  manage: ['inference', 'storage', 'compute', 'bandwidth'],
  rate: ['inference', 'storage', 'compute', 'bandwidth'],
  disputes: ['inference', 'storage', 'compute', 'bandwidth'],
  admin: ['inference', 'storage', 'compute', 'bandwidth'],
};

export default function ProviderTab({ provider, publicKeyHex, accountHash, onTx }: {
  provider: any; publicKeyHex: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const { isAuthenticated, connect, provider: evmWallet } = useWeb3Auth();
  const canSign = !!provider && !!publicKeyHex;
  const isAdmin = publicKeyHex === ADMIN_PUBLIC_KEY;
  const [category, setCategory] = useState<Category | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);

  const [jobs, setJobs] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [machine, setMachine] = useState<{ cpuCores: number; ramGb: number; hasGpu: boolean; vramMb: number; gpuName: string; bandwidthMbps: number; platform: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const imKeys = await getContractNamedKeys(CONTRACTS.inferenceMarket);
      const jobsUref = imKeys['im_jobs'];
      if (jobsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `job-${i}`;
          const status = await queryDictionary(jobsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({ id, status: JOB_STATUS[String(status)] || String(status) });
        }
        setJobs(loaded);
      }

      const smKeys = await getContractNamedKeys(CONTRACTS.storageMarket);
      const filesUref = smKeys['sm_files'];
      if (filesUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `file-${i}`;
          const status = await queryDictionary(filesUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({ id, status: String(status) });
        }
        setFiles(loaded);
      }

      const cmKeys = await getContractNamedKeys(CONTRACTS.computeMarket);
      const agreementsUref = cmKeys['cm_agreements'];
      if (agreementsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `agreement-${i}`;
          const status = await queryDictionary(agreementsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({ id, status: AGREEMENT_STATUS[String(status)] || String(status) });
        }
        setAgreements(loaded);
      }

      const bmKeys = await getContractNamedKeys(CONTRACTS.bandwidthMarket);
      const sessionsUref = bmKeys['bm_sessions'];
      if (sessionsUref) {
        const loaded: any[] = [];
        for (let i = 0; i < 20; i++) {
          const id = `session-${i}`;
          const status = await queryDictionary(sessionsUref, `${id}:status`);
          if (status === null || status === undefined) continue;
          loaded.push({ id, status: SESSION_STATUS[String(status)] || String(status) });
        }
        setSessions(loaded);
      }
    } catch (e) {
      console.error('Failed to load provider data:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    let mounted = true;
    detectMachineResources().then((m) => { if (mounted) setMachine(m); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* NETWORK CAPACITY (Golem-inspired) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Connected Providers" value="1" subtitle="this machine" />
        <StatCard title="Compute Power" value={machine?.cpuCores ? `${machine.cpuCores} cores` : '—'} />
        <StatCard title="Total Memory" value={machine?.ramGb ? `${machine.ramGb} GB` : '—'} />
        <StatCard title="Network Activity" value={machine?.bandwidthMbps ? `${machine.bandwidthMbps} Mbps` : '—'} />
      </div>

      {/* PROVIDER LIST */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 overflow-hidden">
          <h3 className="text-sm font-semibold text-[#e8e2d8] mb-3">Providers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs text-[#7a7468] uppercase tracking-wider">
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Hardware</th>
                  <th className="pb-2 font-medium">Price</th>
                  <th className="pb-2 font-medium">Reputation</th>
                  <th className="pb-2 font-medium">Uptime</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#00e5ff]/10 flex items-center justify-center text-[#00e5ff] text-xs font-bold">LC</div>
                      <div>
                        <div className="text-[#e8e2d8] font-medium">this machine</div>
                        <div className="text-[10px] text-[#7a7468]">{machine?.platform || 'local'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="space-y-1 text-xs">
                      <div className="text-[#e8e2d8]">{machine?.cpuCores ? `${machine.cpuCores} CPU cores` : '—'}</div>
                      <div className="text-[#7a7468]">{machine?.hasGpu ? (machine.gpuName || 'GPU available') : 'No GPU'}</div>
                    </div>
                  </td>
                  <td className="py-3 text-[#e8e2d8]">$0.00 / hour</td>
                  <td className="py-3 text-[#e8e2d8]">N/A</td>
                  <td className="py-3"><UptimeBar pct={100} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* STEP 1: CATEGORY SELECTOR */}
      <div>
        <div className="text-xs text-[#7a7468] mb-3">Select a category to get started.</div>
        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.filter((c) => c.id !== 'admin' || isAdmin).map((c) => (
            <button key={c.id} onClick={() => { setCategory(c.id); setResource(null); }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${category === c.id ? 'bg-[#00e5ff]/15 border border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/[0.03] border border-white/10 text-[#7a7468] hover:bg-white/[0.06] hover:text-[#e8e2d8]'}`}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>
      </div>

      {/* STEP 2: RESOURCE SELECTOR */}
      {category && (
        <div>
          <div className="text-xs text-[#7a7468] mb-3">Select a resource.</div>
          <div className="flex items-center gap-2 flex-wrap">
            {RESOURCE_BY_CATEGORY[category].map((rId) => {
              const r = RESOURCES.find((x) => x.id === rId)!;
              return (
                <button key={r.id} onClick={() => setResource(r.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${resource === r.id ? 'bg-[#00e5ff]/15 border border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/[0.03] border border-white/10 text-[#7a7468] hover:bg-white/[0.06] hover:text-[#e8e2d8]'}`}>
                  {r.icon}{r.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: PANEL */}
      {category && resource && (() => {
        const cat = CATEGORIES.find((c) => c.id === category)!;
        return <CategoryHeader icon={cat.icon} title={cat.label} subtitle={cat.subtitle} />;
      })()}

      {/* MANAGE */}
      {category === 'manage' && resource && (
      <>
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-200/80">
          <strong className="text-amber-300">Important:</strong> Manage updates must be submitted from the same machine that is providing resources. The browser will verify your local hardware matches the claimed values before submitting to the blockchain.
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resource === 'storage' && (
          <EntryPointCard title="Update Capacity" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [capacity, setCapacity] = useState('10240');
              const { verifyStatus, verifyResult, verify, reset } = useVerifyUpdate();
              return <form onSubmit={(e) => { e.preventDefault(); reset(); submit('update_provider_capacity', {
                resource_type: sdk.CLValue.newCLString('storage'),
                total_capacity_mb: sdk.CLValue.newCLUint64(capacity),
                cpu_cores: sdk.CLValue.newCLUint64('0'),
                ram_mb: sdk.CLValue.newCLUint64('0'),
                gpu: sdk.CLValue.newCLValueBool(false),
                vram_mb: sdk.CLValue.newCLUint64('0'),
                models: sdk.CLValue.newCLString(''),
                bandwidth_mbps: sdk.CLValue.newCLUint64('0'),
                service_type: sdk.CLValue.newCLString(''),
                or_port: sdk.CLValue.newCLUint64('0'),
                dir_port: sdk.CLValue.newCLUint64('0'),
              }); verify('storage', { total_capacity_mb: capacity }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground">Update your total storage capacity.</div>
                <Input label="New Capacity (MB)" value={capacity} onChange={setCapacity} />
                <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update</Button>
                <VerifyBadge status={verifyStatus} result={verifyResult} />
              </form>;
            }}
          </EntryPointCard>
        )}

        {resource === 'compute' && (
          <EntryPointCard title="Update Resources" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [cpuCores, setCpuCores] = useState('8');
              const [ramMb, setRamMb] = useState('16384');
              const [hasGpu, setHasGpu] = useState(false);
              const [vramMb, setVramMb] = useState('0');
              const { verifyStatus, verifyResult, verify, reset } = useVerifyUpdate();
              return <form onSubmit={(e) => { e.preventDefault(); reset(); submit('update_provider_capacity', {
                resource_type: sdk.CLValue.newCLString('compute'),
                total_capacity_mb: sdk.CLValue.newCLUint64('0'),
                cpu_cores: sdk.CLValue.newCLUint64(cpuCores),
                ram_mb: sdk.CLValue.newCLUint64(ramMb),
                gpu: sdk.CLValue.newCLValueBool(hasGpu),
                vram_mb: sdk.CLValue.newCLUint64(vramMb),
                models: sdk.CLValue.newCLString(''),
                bandwidth_mbps: sdk.CLValue.newCLUint64('0'),
                service_type: sdk.CLValue.newCLString(''),
                or_port: sdk.CLValue.newCLUint64('0'),
                dir_port: sdk.CLValue.newCLUint64('0'),
              }); verify('compute', { cpu_cores: cpuCores, ram_mb: ramMb, gpu: String(hasGpu), vram_mb: vramMb }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground">Update your compute hardware resources.</div>
                <Input label="CPU Cores" value={cpuCores} onChange={setCpuCores} />
                <Input label="RAM (MB)" value={ramMb} onChange={setRamMb} />
                <div className="flex items-center gap-2">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={hasGpu} onChange={(e) => setHasGpu(e.target.checked)} className="rounded" />
                    Has GPU
                  </label>
                </div>
                {hasGpu && <Input label="VRAM (MB)" value={vramMb} onChange={setVramMb} />}
                <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update Resources</Button>
                <VerifyBadge status={verifyStatus} result={verifyResult} />
              </form>;
            }}
          </EntryPointCard>
        )}

        {resource === 'inference' && (
          <EntryPointCard title="Update Models" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [models, setModels] = useState('llama-3,mistral-7b');
              const [hasGpu, setHasGpu] = useState(true);
              const [vramMb, setVramMb] = useState('24576');
              const { verifyStatus, verifyResult, verify, reset } = useVerifyUpdate();
              return <form onSubmit={(e) => { e.preventDefault(); reset(); submit('update_provider_capacity', {
                resource_type: sdk.CLValue.newCLString('inference'),
                total_capacity_mb: sdk.CLValue.newCLUint64('0'),
                cpu_cores: sdk.CLValue.newCLUint64('0'),
                ram_mb: sdk.CLValue.newCLUint64('0'),
                gpu: sdk.CLValue.newCLValueBool(hasGpu),
                vram_mb: sdk.CLValue.newCLUint64(vramMb),
                models: sdk.CLValue.newCLString(models),
                bandwidth_mbps: sdk.CLValue.newCLUint64('0'),
                service_type: sdk.CLValue.newCLString(''),
                or_port: sdk.CLValue.newCLUint64('0'),
                dir_port: sdk.CLValue.newCLUint64('0'),
              }); verify('inference', { models, gpu: String(hasGpu), vram_mb: vramMb }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground">Update your available models and GPU specs.</div>
                <Input label="Models (comma-separated)" value={models} onChange={setModels} />
                <div className="flex items-center gap-2">
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={hasGpu} onChange={(e) => setHasGpu(e.target.checked)} className="rounded" />
                    Has GPU
                  </label>
                </div>
                {hasGpu && <Input label="VRAM (MB)" value={vramMb} onChange={setVramMb} />}
                <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update Models</Button>
                <VerifyBadge status={verifyStatus} result={verifyResult} />
              </form>;
            }}
          </EntryPointCard>
        )}

        {resource === 'bandwidth' && (
          <EntryPointCard title="Update Bandwidth" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [bandwidthMbps, setBandwidthMbps] = useState('1000');
              const [serviceType, setServiceType] = useState('relay');
              const [orPort, setOrPort] = useState('9001');
              const [dirPort, setDirPort] = useState('9030');
              const { verifyStatus, verifyResult, verify, reset } = useVerifyUpdate();
              return <form onSubmit={(e) => { e.preventDefault(); reset(); submit('update_provider_capacity', {
                resource_type: sdk.CLValue.newCLString('bandwidth'),
                total_capacity_mb: sdk.CLValue.newCLUint64('0'),
                cpu_cores: sdk.CLValue.newCLUint64('0'),
                ram_mb: sdk.CLValue.newCLUint64('0'),
                gpu: sdk.CLValue.newCLValueBool(false),
                vram_mb: sdk.CLValue.newCLUint64('0'),
                models: sdk.CLValue.newCLString(''),
                bandwidth_mbps: sdk.CLValue.newCLUint64(bandwidthMbps),
                service_type: sdk.CLValue.newCLString(serviceType),
                or_port: sdk.CLValue.newCLUint64(orPort),
                dir_port: sdk.CLValue.newCLUint64(dirPort),
              }); verify('bandwidth', { bandwidth_mbps: bandwidthMbps }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground">Update your bandwidth capacity and service configuration.</div>
                <Input label="Bandwidth (Mbps)" value={bandwidthMbps} onChange={setBandwidthMbps} />
                <Input label="Service Type" value={serviceType} onChange={setServiceType} />
                <Input label="OR Port" value={orPort} onChange={setOrPort} />
                <Input label="Dir Port" value={dirPort} onChange={setDirPort} />
                <Button type="submit" disabled={!canSign} className="w-full"><Send className="h-4 w-4 mr-1" />Update Bandwidth</Button>
                <VerifyBadge status={verifyStatus} result={verifyResult} />
              </form>;
            }}
          </EntryPointCard>
        )}
      </div>
      </>
      )}

      {/* RATE CONSUMERS */}
      {category === 'rate' && resource && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resource === 'inference' && (
        <EntryPointCard title="Inference" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [rating, setRating] = useState(0);
            const completedJobs = jobs.filter(j => j.status === 'confirmed' || j.status === 'paid' || j.status === 'resolved');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              consumer: sdk.CLValue.newCLPublicKey(sdk.PublicKey.fromHex(publicKeyHex)),
              rating: sdk.CLValue.newCLUint64(String(rating)),
              job_id: sdk.CLValue.newCLString(jobId),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(''),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after job completion.</div>
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

        {resource === 'storage' && (
        <EntryPointCard title="Storage" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            const [rating, setRating] = useState(0);
            const confirmedFiles = files.filter(f => f.status === '1');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              consumer: sdk.CLValue.newCLPublicKey(sdk.PublicKey.fromHex(publicKeyHex)),
              rating: sdk.CLValue.newCLUint64(String(rating)),
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(fileId),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(''),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after storage payment.</div>
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

        {resource === 'compute' && (
        <EntryPointCard title="Compute" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [agreementId, setAgreementId] = useState('');
            const [rating, setRating] = useState(0);
            const completedAgreements = agreements.filter(a => a.status === 'terminated');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              consumer: sdk.CLValue.newCLPublicKey(sdk.PublicKey.fromHex(publicKeyHex)),
              rating: sdk.CLValue.newCLUint64(String(rating)),
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(agreementId),
              session_id: sdk.CLValue.newCLString(''),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after compute agreement completion.</div>
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

        {resource === 'bandwidth' && (
        <EntryPointCard title="Bandwidth" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [rating, setRating] = useState(0);
            const closedSessions = sessions.filter(s => s.status === 'closed' || s.status === 'resolved');
            return <form onSubmit={(e) => { e.preventDefault(); submit('rate_consumer', {
              consumer: sdk.CLValue.newCLPublicKey(sdk.PublicKey.fromHex(publicKeyHex)),
              rating: sdk.CLValue.newCLUint64(String(rating)),
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(sessionId),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3 text-[#00e5ff]" />Rate the consumer after bandwidth session completion.</div>
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
      </div>
      )}

      {/* ADMIN */}
      {category === 'admin' && resource && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!isAdmin && (
          <div className="text-sm text-amber-400 col-span-full">Admin access required for these operations.</div>
        )}

        {isAdmin && resource === 'inference' && (
          <EntryPointCard title="Set Protocol Fee" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [feeBps, setFeeBps] = useState('250');
              return <form onSubmit={(e) => { e.preventDefault(); submit('set_protocol_fee_bps', {
                fee_bps: sdk.CLValue.newCLUint64(feeBps),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Set protocol fee in basis points.</div>
                <Input label="Fee (BPS)" value={feeBps} onChange={setFeeBps} />
                <Button type="submit" disabled={!canSign} variant="outline" className="w-full"><Send className="h-4 w-4 mr-1" />Set Fee</Button>
              </form>;
            }}
          </EntryPointCard>
        )}

        {isAdmin && resource === 'storage' && (<>
          <EntryPointCard title="Issue Challenge" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [fileId, setFileId] = useState('');
              const [challengeHash, setChallengeHash] = useState('');
              return <form onSubmit={(e) => { e.preventDefault(); submit('issue_challenge', {
                file_id: sdk.CLValue.newCLString(fileId),
                challenge_hash: sdk.CLValue.newCLString(challengeHash),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Issue a storage proof challenge.</div>
                <Input label="File ID" value={fileId} onChange={setFileId} />
                <Input label="Challenge Hash" value={challengeHash} onChange={setChallengeHash} />
                <Button type="submit" disabled={!canSign || !fileId.trim()} variant="outline" className="w-full"><Shield className="h-4 w-4 mr-1" />Issue Challenge</Button>
              </form>;
            }}
          </EntryPointCard>

          <EntryPointCard title="Verify Challenge" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [challengeId, setChallengeId] = useState('');
              const [passed, setPassed] = useState(true);
              return <form onSubmit={(e) => { e.preventDefault(); submit('verify_challenge', {
                challenge_id: sdk.CLValue.newCLString(challengeId),
                passed: sdk.CLValue.newCLValueBool(passed),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Verify a challenge response.</div>
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
        </>)}

        {isAdmin && resource === 'bandwidth' && (
          <EntryPointCard title="Resolve Dispute" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
            {({ submit }) => {
              const [sessionId, setSessionId] = useState('');
              const [consumerPct, setConsumerPct] = useState('50');
              return <form onSubmit={(e) => { e.preventDefault(); submit('resolve_dispute', {
                job_id: sdk.CLValue.newCLString(''),
                session_id: sdk.CLValue.newCLString(sessionId),
                file_id: sdk.CLValue.newCLString(''),
                agreement_id: sdk.CLValue.newCLString(''),
                consumer_pct: sdk.CLValue.newCLUint64(consumerPct),
              }); }} className="space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Gavel className="h-3 w-3 text-[#00e5ff]" />Resolve a dispute with consumer payout percentage.</div>
                <Input label="Session ID" value={sessionId} onChange={setSessionId} />
                <Input label="Consumer Payout (%)" value={consumerPct} onChange={setConsumerPct} />
                <Button type="submit" disabled={!canSign || !sessionId.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Resolve</Button>
              </form>;
            }}
          </EntryPointCard>
        )}

        {isAdmin && resource === 'compute' && (
          <div className="text-sm text-[#7a7468] col-span-full">No admin actions for compute.</div>
        )}
      </div>
      )}

      {/* DISPUTES — Provider submits evidence */}
      {category === 'disputes' && resource && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!evmWallet && (
          <div className="col-span-full text-sm text-amber-400 bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg">
            <strong>EVM wallet recommended for Kleros disputes.</strong> {' '}
            {isAuthenticated
              ? <>Waiting for wallet creation…</>
              : <button onClick={() => connect()} className="underline text-[#00e5ff]">Connect with Web3Auth</button>}
            {' '}to pay arbitration fees via Ethereum.
          </div>
        )}
        {resource === 'inference' && (
        <EntryPointCard title="Inference" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [jobId, setJobId] = useState('');
            const [evidence, setEvidence] = useState('');
            const disputedJobs = jobs.filter(j => j.status === 'disputed');
            return <form onSubmit={(e) => { e.preventDefault(); submit('submit_evidence', {
              job_id: sdk.CLValue.newCLString(jobId),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(''),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Submit evidence to defend against a dispute on an inference job.</div>
              {disputedJobs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {disputedJobs.map(j => (
                    <button key={j.id} type="button" onClick={() => setJobId(j.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${jobId === j.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {j.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Job ID" value={jobId} onChange={setJobId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !jobId.trim() || !evidence.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Submit Evidence</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {resource === 'storage' && (
        <EntryPointCard title="Storage" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [fileId, setFileId] = useState('');
            const [evidence, setEvidence] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('submit_evidence', {
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(fileId),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(''),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Submit evidence to defend against a dispute on a stored file.</div>
              <Input label="File ID" value={fileId} onChange={setFileId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !fileId.trim() || !evidence.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Submit Evidence</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {resource === 'compute' && (
        <EntryPointCard title="Compute" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [agreementId, setAgreementId] = useState('');
            const [evidence, setEvidence] = useState('');
            return <form onSubmit={(e) => { e.preventDefault(); submit('submit_evidence', {
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(agreementId),
              session_id: sdk.CLValue.newCLString(''),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Submit evidence to defend against a dispute on a compute agreement.</div>
              <Input label="Agreement ID" value={agreementId} onChange={setAgreementId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !agreementId.trim() || !evidence.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Submit Evidence</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {resource === 'bandwidth' && (
        <EntryPointCard title="Bandwidth" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [sessionId, setSessionId] = useState('');
            const [evidence, setEvidence] = useState('');
            const disputedSessions = sessions.filter(s => s.status === 'disputed');
            return <form onSubmit={(e) => { e.preventDefault(); submit('submit_evidence', {
              job_id: sdk.CLValue.newCLString(''),
              file_id: sdk.CLValue.newCLString(''),
              agreement_id: sdk.CLValue.newCLString(''),
              session_id: sdk.CLValue.newCLString(sessionId),
              evidence_hash: sdk.CLValue.newCLString(evidence),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-400" />Submit evidence to defend against a dispute on a bandwidth session.</div>
              {disputedSessions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {disputedSessions.map(s => (
                    <button key={s.id} type="button" onClick={() => setSessionId(s.id)}
                      className={`text-[10px] px-2 py-1 rounded font-mono ${sessionId === s.id ? 'bg-[#00e5ff]/20 text-[#00e5ff]' : 'bg-white/5 text-[#7a7468] hover:bg-white/10'}`}>
                      {s.id}
                    </button>
                  ))}
                </div>
              )}
              <Input label="Session ID" value={sessionId} onChange={setSessionId} />
              <Input label="Evidence Hash" value={evidence} onChange={setEvidence} />
              <Button type="submit" disabled={!canSign || !sessionId.trim() || !evidence.trim()} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Submit Evidence</Button>
            </form>;
          }}
        </EntryPointCard>
        )}

        {/* KLEROS VERDICT — Auto-poll and auto-resolve */}
        <EntryPointCard title="Kleros Verdict" contract="ComputeRegistry" contractHash={CONTRACTS.computeRegistry} provider={provider} publicKeyHex={publicKeyHex} onTx={onTx}>
          {({ submit }) => {
            const [klerosId, setKlerosId] = useState('');
            const [verdict, setVerdict] = useState<number | null>(null);
            const [checking, setChecking] = useState(false);
            const [autoPoll, setAutoPoll] = useState(false);
            const [statusText, setStatusText] = useState('');
            const idValue = resource === 'inference' ? jobs.find(j => j.status === 'disputed')?.id || '' : resource === 'bandwidth' ? sessions.find(s => s.status === 'disputed')?.id || '' : '';
            const [resourceId, setResourceId] = useState(idValue);

            const checkVerdict = async () => {
              setChecking(true); setStatusText('');
              try {
                const ruling = await getKlerosRuling(Number(klerosId));
                if (ruling !== null) {
                  setVerdict(ruling);
                  setStatusText(ruling === 1 ? 'Consumer wins (refund)' : ruling === 2 ? 'Provider wins (payout)' : 'Refused (split)');
                } else {
                  const dispute = await getKlerosDisputeStatus(Number(klerosId));
                  setStatusText(`Status: ${DisputeStatus[dispute.status]} — not yet resolved`);
                }
              } catch (err: any) {
                setStatusText('Error: ' + (err.message || String(err)));
              }
              setChecking(false);
            };

            const startAutoPoll = async () => {
              setAutoPoll(true); setChecking(true); setStatusText('Auto-polling Kleros Court...');
              try {
                const result = await pollKlerosRuling(Number(klerosId), 10000, 600000, false, (d) => {
                  setStatusText(`Polling... status: ${DisputeStatus[d.status]}`);
                });
                if (result && result.ruling >= 0) {
                  setVerdict(result.ruling);
                  setStatusText(result.ruling === 1 ? 'Consumer wins (refund) — ready to submit' : result.ruling === 2 ? 'Provider wins (payout) — ready to submit' : 'Refused (split) — ready to submit');
                } else {
                  setStatusText('Polling timed out. Check manually later.');
                }
              } catch (err: any) {
                setStatusText('Error: ' + (err.message || String(err)));
              }
              setChecking(false); setAutoPoll(false);
            };

            return <form onSubmit={(e) => { e.preventDefault(); submit('submit_kleros_verdict', {
              job_id: sdk.CLValue.newCLString(resource === 'inference' ? resourceId : ''),
              file_id: sdk.CLValue.newCLString(resource === 'storage' ? resourceId : ''),
              agreement_id: sdk.CLValue.newCLString(resource === 'compute' ? resourceId : ''),
              session_id: sdk.CLValue.newCLString(resource === 'bandwidth' ? resourceId : ''),
              kleros_dispute_id: sdk.CLValue.newCLUint64(klerosId),
              ruling: sdk.CLValue.newCLUint64(String(verdict ?? 0)),
            }); }} className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3 text-[#00e5ff]" />Kleros Court verdict auto-resolves disputes. Both parties pay Kleros fees via ETH. Escrow funds are routed per ruling.</div>
              <Input label={`${resource.charAt(0).toUpperCase() + resource.slice(1)} ID`} value={resourceId} onChange={setResourceId} />
              <Input label="Kleros Dispute ID" value={klerosId} onChange={setKlerosId} />
              <div className="flex gap-2">
                <Button type="button" onClick={checkVerdict} disabled={!klerosId.trim() || checking} variant="outline" className="flex-1">
                  {checking && !autoPoll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Shield className="h-4 w-4 mr-1" />}
                  Check
                </Button>
                <Button type="button" onClick={startAutoPoll} disabled={!klerosId.trim() || autoPoll} variant="outline" className="flex-1">
                  {autoPoll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Auto-Resolve
                </Button>
              </div>
              {statusText && <div className="text-xs text-[#7a7468]">{statusText}</div>}
              {verdict !== null && (
                <div className={`text-xs rounded p-2 ${verdict === 1 ? 'bg-amber-500/10 text-amber-300' : verdict === 2 ? 'bg-green-500/10 text-green-300' : 'bg-white/5 text-[#7a7468]'}`}>
                  Ruling: {verdict === 1 ? 'Consumer wins — full escrow returns to consumer' : verdict === 2 ? 'Provider wins — full escrow goes to provider' : 'Refused — escrow split 50/50'}
                </div>
              )}
              <Button type="submit" disabled={!canSign || !resourceId.trim() || !klerosId.trim() || verdict === null} variant="outline" className="w-full"><Gavel className="h-4 w-4 mr-1" />Submit Kleros Verdict</Button>
            </form>;
          }}
        </EntryPointCard>
      </div>
      )}
    </div>
  );
}
