import { useState, useEffect } from 'react';
import { Button, Input } from './ui';
import { Plus, Server, Box, Cpu, Monitor, Hash, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

type DeployMode = 'vm' | 'container';
type VMStatus = 'pending' | 'provisioning' | 'running' | 'stopped' | 'error';
type ContainerStatus = 'pending' | 'provisioning' | 'running' | 'stopped' | 'error';

interface VMRequest {
  id: string;
  name: string;
  image: string;
  config: string;
  status: VMStatus;
  createdAt: string;
  provider?: string;
  ip?: string;
}

interface ContainerRequest {
  id: string;
  name: string;
  template?: string;
  configType: 'public' | 'my' | 'custom';
  port: number;
  protocol: string;
  hardware: string;
  status: ContainerStatus;
  createdAt: string;
  url?: string;
}

const VM_IMAGES = [
  { id: 'ubuntu-nvidia-595', name: 'Ubuntu 24.04 + Nvidia 595', desc: 'Encrypted Ubuntu 24.04 long term support with nvidia drivers 595' },
  { id: 'ubuntu-base', name: 'Ubuntu 22.04 Base', desc: 'Lightweight server image' },
  { id: 'pytorch', name: 'PyTorch + CUDA', desc: 'ML training image with CUDA toolkit' },
];

const VM_CONFIGS = [
  { id: 'h200-sm', name: 'NVIDIA H200 - Small', gpu: '1x NVIDIA-H200', cpu: '16 vCPU', ram: '175GB RAM', price: '$3.59/hr', stock: true },
  { id: 'h100-sm', name: 'NVIDIA H100 - Small', gpu: '1x NVIDIA-H100', cpu: '16 vCPU', ram: '128GB RAM', price: '$2.99/hr', stock: true },
  { id: 'rtx4090-sm', name: 'NVIDIA RTX 4090 - Small', gpu: '1x NVIDIA-GeForce-RTX-4090', cpu: '16 vCPU', ram: '64GB RAM', price: '$0.99/hr', stock: true },
  { id: 'rtx4090-md', name: 'NVIDIA RTX 4090 - Medium', gpu: '2x NVIDIA-GeForce-RTX-4090', cpu: '32 vCPU', ram: '128GB RAM', price: '$1.89/hr', stock: false },
];

const CONTAINER_TEMPLATES = [
  { id: 'minimax-m2-5', name: 'MiniMax-M2-5', desc: "MiniMax's latest multimodal model" },
  { id: 'kimi-k2', name: 'Kimi-K2-Thinking', desc: 'MoonshotAI\'s 1T parameter MoE reasoning model with 32B active...' },
  { id: 'glm-46-fp8', name: 'GLM-46-FP8', desc: 'GLM\'s 357B parameter MoE language model, FP8 quantized and...' },
  { id: 'gpt-oss-120b', name: 'GPT-OSS-120B', desc: 'OpenAI\'s 120B parameter Mixture-of-Experts language model wit...' },
];

const CONTAINER_CONFIGS = [
  { id: 'rtx4090-sm', name: 'NVIDIA RTX 4090 - Small', gpu: '1x NVIDIA-GeForce-RTX-4090', cpu: '28.75 vCPU', ram: '148GB RAM', price: '$0.59/hr', stock: true },
  { id: 'rtx4090-md', name: 'NVIDIA RTX 4090 - Medium', gpu: '2x NVIDIA-GeForce-RTX-4090', cpu: '57.5 vCPU', ram: '296GB RAM', price: '$1.09/hr', stock: false },
  { id: 'rtx4090-lg', name: 'NVIDIA RTX 4090 - Large', gpu: '4x NVIDIA-GeForce-RTX-4090', cpu: '115 vCPU', ram: '592GB RAM', price: '$1.99/hr', stock: false },
];

const GPU_CHIPS = ['All GPUs', 'NVIDIA-H200', 'NVIDIA-B200', 'NVIDIA-H100', 'NVIDIA-RTX6000B', 'NVIDIA-GeForce-RTX-4090'];

const API_PREFIX = import.meta.env.VITE_API_URL || '';

function SectionTitle({ number, title, required = false }: { number: number; title: string; required?: boolean }) {
  return (
    <h3 className="text-sm font-semibold text-[#e8e2d8] mb-3">
      {number}. {title.toUpperCase()} {required && <span className="text-[#00e5ff]">*</span>}
    </h3>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-[#0a0a10] p-4 ${className}`}>{children}</div>;
}

function Toggle({ options, value, onChange }: { options: { id: string; label: string; icon: React.ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-2 rounded-lg border border-white/10 p-1 bg-[#0a0a10]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${value === o.id ? 'bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20' : 'text-[#7a7468] hover:text-[#e8e2d8]'}`}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors border ${active ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-[#00e5ff]/20' : 'bg-[#0a0a10] text-[#7a7468] border-white/10 hover:text-[#e8e2d8]'}`}
    >
      {label}
    </button>
  );
}

function ConfigCard({ name, specs, price, stock, selected, onClick }: { name: string; specs: string; price: string; stock: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${selected ? 'border-[#00e5ff]/40 bg-[#00e5ff]/5' : 'border-white/10 bg-[#0a0a10] hover:border-white/20'}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-[#e8e2d8]">{name}</div>
        {stock ? <div className="text-sm font-semibold text-emerald-400">{price}</div> : <div className="text-sm text-amber-500">Out of Stock</div>}
      </div>
      <div className="text-xs text-[#7a7468] mt-1">{specs}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'running' ? 'text-emerald-400 bg-emerald-400/10' : status === 'error' ? 'text-red-400 bg-red-400/10' : 'text-[#00e5ff] bg-[#00e5ff]/10';
  return <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${color}`}>{status}</span>;
}

function CreateVM({ accountHash, onCreated }: { accountHash: string; onCreated: () => void }) {
  const [image, setImage] = useState(VM_IMAGES[0].id);
  const [serverType, setServerType] = useState('gpu');
  const [gpuFilter, setGpuFilter] = useState('All GPUs');
  const [config, setConfig] = useState('');
  const [keyName, setKeyName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [vmName, setVmName] = useState('');
  const [password, setPassword] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const filteredConfigs = VM_CONFIGS.filter((c) => gpuFilter === 'All GPUs' || c.gpu.includes(gpuFilter));

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !vmName.trim() || !password.trim()) return;
    setStarting(true);
    setError('');
    try {
      const res = await fetch(`${API_PREFIX}/api/vms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: accountHash || 'unknown',
          name: vmName.trim(),
          image,
          config,
          sshKeyName: keyName.trim() || undefined,
          sshPublicKey: publicKey.trim() || undefined,
          passwordHash: password.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create VM');
    } finally {
      setStarting(false);
    }
  };

  return (
    <form onSubmit={handleStart} className="space-y-6">
      <div className="rounded-lg border-l-2 border-[#00e5ff] bg-[#00e5ff]/5 p-3 text-xs text-[#7a7468]">
        This feature is in high demand and may be out of stock.
      </div>

      <section>
        <SectionTitle number={1} title="Select VM Image" required />
        <div className="space-y-2">
          {VM_IMAGES.map((img) => (
            <div
              key={img.id}
              onClick={() => setImage(img.id)}
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${image === img.id ? 'border-[#00e5ff]/40 bg-[#00e5ff]/5' : 'border-white/10 bg-[#0a0a10] hover:border-white/20'}`}
            >
              <div className="text-sm font-medium text-[#e8e2d8]">{img.name}</div>
              <div className="text-xs text-[#7a7468] mt-1">{img.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle number={2} title="Select VM Configuration" required />
        <Toggle
          value={serverType}
          onChange={setServerType}
          options={[
            { id: 'gpu', label: 'GPU Servers', icon: <Monitor className="h-3.5 w-3.5" /> },
            { id: 'cpu', label: 'CPU Servers', icon: <Cpu className="h-3.5 w-3.5" /> },
          ]}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {GPU_CHIPS.map((g) => (
            <Chip key={g} label={g} active={gpuFilter === g} onClick={() => setGpuFilter(g)} />
          ))}
        </div>
        <div className="text-xs text-[#7a7468] mt-3 mb-2">Available Configurations</div>
        <div className="space-y-2">
          {filteredConfigs.map((c) => (
            <ConfigCard
              key={c.id}
              name={c.name}
              specs={`${c.gpu} • ${c.cpu} • ${c.ram}`}
              price={c.price}
              stock={c.stock}
              selected={config === c.id}
              onClick={() => c.stock && setConfig(c.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle number={4} title="SSH Key for Access" />
        <Card>
          <div className="text-sm text-[#7a7468] mb-3">No SSH Keys Found</div>
          <Input label="Key Name" value={keyName} onChange={setKeyName} placeholder="e.g., MacBook Pro" />
          <div className="space-y-1 mt-2">
            <label className="text-sm font-medium text-[#e8e2d8]">Public Key</label>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="Paste your public SSH key here (ssh-rsa ...)"
              className="flex min-h-[80px] w-full rounded-md border border-white/10 bg-[#030308] px-3 py-2 text-xs font-mono text-[#e8e2d8] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00e5ff]"
            />
          </div>
          <div className="flex justify-end mt-3">
            <Button type="button" variant="outline" className="text-xs h-8 border-white/10 hover:bg-white/5">Add Key</Button>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle number={5} title="VM Name" required />
        <Input value={vmName} onChange={setVmName} placeholder="e.g., Training Server, Dev Environment" />
      </section>

      <section>
        <SectionTitle number={6} title="Password" required />
        <div className="text-xs text-[#7a7468] mb-2">This is the sudo password for the VM. Passwords are not saved nor recoverable.</div>
        <Input type="password" value={password} onChange={setPassword} placeholder="Sudo Password" />
      </section>

      <div className="rounded-lg border-l-2 border-[#00e5ff] bg-[#00e5ff]/5 p-3 text-xs text-[#7a7468]">
        This feature is currently in beta; unexpected issues, including potential data loss, may occur.
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4" />{error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onCreated} variant="outline" className="flex-1 h-10 border-white/10 hover:bg-white/5">Cancel</Button>
        <Button type="submit" disabled={!config || !vmName.trim() || !password.trim() || starting || !accountHash} className="flex-1 h-10 bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 hover:bg-[#00e5ff]/20">
          {starting ? 'Starting...' : 'Start VM'}
        </Button>
      </div>
    </form>
  );
}

function CreateContainer({ accountHash, onCreated }: { accountHash: string; onCreated: () => void }) {
  const [configType, setConfigType] = useState('public');
  const [template, setTemplate] = useState('');
  const [port, setPort] = useState('80');
  const [protocol, setProtocol] = useState('TCP');
  const [envs, setEnvs] = useState<{ key: string; value: string }[]>([]);
  const [serverType, setServerType] = useState('gpu');
  const [gpuFilter, setGpuFilter] = useState('All GPUs');
  const [hwConfig, setHwConfig] = useState('');
  const [fnName, setFnName] = useState('');
  const [scaling, setScaling] = useState({ min: '0', max: '10', concurrency: '', initial: '', target: '', scaleUp: '', scaleDown: '', zeroGrace: '', metric: '', targetValue: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addEnv = () => setEnvs([...envs, { key: '', value: '' }]);
  const updateEnv = (i: number, key: string, value: string) => {
    const next = [...envs];
    next[i] = { key, value };
    setEnvs(next);
  };
  const removeEnv = (i: number) => setEnvs(envs.filter((_, idx) => idx !== i));

  const filteredConfigs = CONTAINER_CONFIGS.filter((c) => gpuFilter === 'All GPUs' || c.gpu.includes(gpuFilter));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fnName.trim() || !hwConfig) return;
    setCreating(true);
    setError('');
    try {
      const envRecord: Record<string, string> = {};
      envs.forEach((e) => { if (e.key.trim()) envRecord[e.key.trim()] = e.value; });
      const res = await fetch(`${API_PREFIX}/api/containers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: accountHash || 'unknown',
          name: fnName.trim(),
          template: template || undefined,
          configType,
          port: Number(port || 80),
          protocol,
          envs: envRecord,
          hardware: hwConfig,
          scaling,
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create container');
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-6">
      <section>
        <SectionTitle number={1} title="Configuration Type" required />
        <div className="space-y-2">
          {[
            { id: 'public', name: 'Public Templates', desc: 'Curated configurations from the community', icon: <Box className="h-5 w-5" /> },
            { id: 'my', name: 'My Templates', desc: 'Your saved configurations', icon: <Hash className="h-5 w-5" /> },
            { id: 'custom', name: 'Custom Config', desc: 'Configure from scratch', icon: <Cpu className="h-5 w-5" /> },
          ].map((t) => (
            <div
              key={t.id}
              onClick={() => setConfigType(t.id)}
              className={`cursor-pointer rounded-lg border p-4 text-center transition-colors ${configType === t.id ? 'border-[#00e5ff]/40 bg-[#00e5ff]/5' : 'border-white/10 bg-[#0a0a10] hover:border-white/20'}`}
            >
              <div className="flex justify-center text-[#00e5ff] mb-2">{t.icon}</div>
              <div className="text-sm font-medium text-[#e8e2d8]">{t.name}</div>
              <div className="text-xs text-[#7a7468] mt-1">{t.desc}</div>
            </div>
          ))}
        </div>
        {configType === 'public' && (
          <div className="mt-4 space-y-2">
            <div className="text-xs text-[#7a7468] uppercase tracking-wider mb-1">Select Public Template</div>
            {CONTAINER_TEMPLATES.map((t) => (
              <div
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${template === t.id ? 'border-[#00e5ff]/40 bg-[#00e5ff]/5' : 'border-white/10 bg-[#0a0a10] hover:border-white/20'}`}
              >
                <div className="text-sm font-medium text-[#e8e2d8]">{t.name}</div>
                <div className="text-xs text-[#7a7468] mt-1">{t.desc}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="text-xs text-[#7a7468] uppercase tracking-wider mb-2">Exposed Port (Required)</div>
        <div className="flex gap-2">
          <Input value={port} onChange={setPort} className="w-24" />
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="h-9 rounded-md border border-white/10 bg-[#030308] px-3 text-xs text-[#e8e2d8]"
          >
            <option>TCP</option>
            <option>UDP</option>
          </select>
        </div>
        <div className="text-xs text-[#7a7468] uppercase tracking-wider mt-4 mb-2">Environment Variables</div>
        <Button type="button" onClick={addEnv} variant="outline" className="text-xs h-8 border-white/10 hover:bg-white/5"><Plus className="h-3 w-3 mr-1" />Add Environment Variable</Button>
        {envs.length > 0 && (
          <div className="mt-2 space-y-2">
            {envs.map((env, i) => (
              <div key={i} className="flex gap-2">
                <Input value={env.key} onChange={(v: string) => updateEnv(i, v, env.value)} placeholder="KEY" />
                <Input value={env.value} onChange={(v: string) => updateEnv(i, env.key, v)} placeholder="value" />
                <Button type="button" onClick={() => removeEnv(i)} variant="outline" className="shrink-0 h-9 px-2 border-white/10 hover:bg-white/5">×</Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle number={2} title="Select Container Hardware" />
        <Toggle
          value={serverType}
          onChange={setServerType}
          options={[
            { id: 'gpu', label: 'GPU Servers', icon: <Monitor className="h-3.5 w-3.5" /> },
            { id: 'cpu', label: 'CPU Servers', icon: <Cpu className="h-3.5 w-3.5" /> },
          ]}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {GPU_CHIPS.map((g) => (
            <Chip key={g} label={g} active={gpuFilter === g} onClick={() => setGpuFilter(g)} />
          ))}
        </div>
        <div className="text-xs text-[#7a7468] mt-3 mb-2">Available Configurations</div>
        <div className="space-y-2">
          {filteredConfigs.map((c) => (
            <ConfigCard
              key={c.id}
              name={c.name}
              specs={`${c.gpu} • ${c.cpu} • ${c.ram}`}
              price={c.price}
              stock={c.stock}
              selected={hwConfig === c.id}
              onClick={() => c.stock && setHwConfig(c.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle number={3} title="Function Name" required />
        <Input value={fnName} onChange={setFnName} placeholder="e.g., Training Server, Dev Environment" />
      </section>

      <section>
        <SectionTitle number={4} title="Scaling Configuration (Optional)" />
        <Card className="space-y-3">
          {[
            { key: 'min', label: 'Minimum Replicas', placeholder: '0' },
            { key: 'max', label: 'Maximum Replicas', placeholder: '10' },
            { key: 'concurrency', label: 'Container Concurrency', placeholder: 'e.g. 5' },
            { key: 'initial', label: 'Initial Replicas', placeholder: 'e.g. 2' },
            { key: 'target', label: 'Target Concurrency', placeholder: 'e.g. 8' },
            { key: 'scaleUp', label: 'Scale Up Delay', placeholder: 'e.g. 30s, 5m, 2h' },
            { key: 'scaleDown', label: 'Scale Down Delay', placeholder: 'e.g. 30s, 5m, 2h' },
            { key: 'zeroGrace', label: 'Zero Grace Period', placeholder: 'e.g. 30s, 5m, 2h' },
            { key: 'targetValue', label: 'Target Value', placeholder: 'e.g. 10' },
          ].map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-[#7a7468] uppercase tracking-wider">{f.label}</label>
              <Input
                value={scaling[f.key as keyof typeof scaling]}
                onChange={(v: string) => setScaling({ ...scaling, [f.key]: v })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#7a7468] uppercase tracking-wider">Scaling Metric</label>
            <select
              value={scaling.metric}
              onChange={(e) => setScaling({ ...scaling, metric: e.target.value })}
              className="h-9 w-full rounded-md border border-white/10 bg-[#030308] px-3 text-xs text-[#e8e2d8]"
            >
              <option value="">Select Scaling Metric</option>
              <option value="concurrency">Concurrency</option>
              <option value="cpu">CPU</option>
              <option value="gpu">GPU</option>
              <option value="requests">Requests per second</option>
            </select>
          </div>
        </Card>
      </section>

      <details className="group">
        <summary className="cursor-pointer text-sm text-[#7a7468] hover:text-[#e8e2d8]">Advanced Options</summary>
        <Card className="mt-2 space-y-2">
          <div className="text-xs text-[#7a7468]">Advanced options such as volumes, secrets, and health checks will be available here.</div>
        </Card>
      </details>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4" />{error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onCreated} variant="outline" className="flex-1 h-10 border-white/10 hover:bg-white/5">Cancel</Button>
        <Button type="submit" disabled={!fnName.trim() || !hwConfig || creating || !accountHash} className="flex-1 h-10 bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 hover:bg-[#00e5ff]/20">
          {creating ? 'Creating...' : 'Create Container'}
        </Button>
      </div>
    </form>
  );
}

export default function DeployTab({ accountHash }: { accountHash: string }) {
  const [mode, setMode] = useState<DeployMode>('vm');
  const [creating, setCreating] = useState(false);
  const [vms, setVms] = useState<VMRequest[]>([]);
  const [containers, setContainers] = useState<ContainerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!accountHash) return;
    setLoading(true);
    setError('');
    try {
      const [vmRes, containerRes] = await Promise.all([
        fetch(`${API_PREFIX}/api/vms?account=${encodeURIComponent(accountHash)}`),
        fetch(`${API_PREFIX}/api/containers?account=${encodeURIComponent(accountHash)}`),
      ]);
      if (!vmRes.ok || !containerRes.ok) throw new Error('Failed to load deployments');
      const vmData = await vmRes.json();
      const containerData = await containerRes.json();
      setVms(Array.isArray(vmData) ? vmData : []);
      setContainers(Array.isArray(containerData) ? containerData : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deployments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [accountHash]);

  const onCreated = () => {
    setCreating(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#00e5ff]/10 flex items-center justify-center text-[#00e5ff]">
            <Plus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#e8e2d8]">Deploy</h2>
            <p className="text-xs text-[#7a7468]">Create VMs and serverless containers on the Chimera network.</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-[#7a7468] hover:text-[#00e5ff] disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('vm')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'vm' ? 'bg-[#00e5ff]/15 border border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/[0.03] border border-white/10 text-[#7a7468] hover:bg-white/[0.06] hover:text-[#e8e2d8]'}`}
        >
          <Server className="h-4 w-4" /> VM
        </button>
        <button
          type="button"
          onClick={() => setMode('container')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'container' ? 'bg-[#00e5ff]/15 border border-[#00e5ff]/30 text-[#00e5ff]' : 'bg-white/[0.03] border border-white/10 text-[#7a7468] hover:bg-white/[0.06] hover:text-[#e8e2d8]'}`}
        >
          <Box className="h-4 w-4" /> Serverless
        </button>
      </div>

      {!accountHash && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
          Connect your Casper wallet to create and track deployments.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4" />{error}
        </div>
      )}

      {creating ? (
        <Card className="max-w-3xl mx-auto">
          {mode === 'vm' ? (
            <CreateVM accountHash={accountHash} onCreated={onCreated} />
          ) : (
            <CreateContainer accountHash={accountHash} onCreated={onCreated} />
          )}
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setCreating(true)} className="bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20 hover:bg-[#00e5ff]/20">
              <Plus className="h-4 w-4 mr-1" /> Create {mode === 'vm' ? 'VM' : 'Container'}
            </Button>
          </div>

          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#e8e2d8]">
              <CheckCircle className="h-4 w-4 text-[#00e5ff]" />{mode === 'vm' ? 'Your VMs' : 'Your Containers'}
            </div>
            {mode === 'vm' ? (
              vms.length === 0 ? (
                <div className="text-xs text-[#7a7468]">No VMs yet. Create one to get started.</div>
              ) : (
                <div className="space-y-2">
                  {vms.slice().reverse().map((vm) => (
                    <div key={vm.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0a10] p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#e8e2d8] truncate">{vm.name}</div>
                        <div className="text-xs text-[#7a7468] font-mono truncate">{vm.id} • {vm.image} • {vm.config}</div>
                        {vm.ip && <div className="text-xs text-[#00e5ff] mt-1">{vm.ip}</div>}
                      </div>
                      <StatusBadge status={vm.status} />
                    </div>
                  ))}
                </div>
              )
            ) : (
              containers.length === 0 ? (
                <div className="text-xs text-[#7a7468]">No containers yet. Create one to get started.</div>
              ) : (
                <div className="space-y-2">
                  {containers.slice().reverse().map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0a10] p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#e8e2d8] truncate">{c.name}</div>
                        <div className="text-xs text-[#7a7468] font-mono truncate">{c.id} • {c.hardware} • port {c.port}/{c.protocol}</div>
                        {c.url && <div className="text-xs text-[#00e5ff] mt-1">{c.url}</div>}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              )
            )}
          </Card>
        </>
      )}
    </div>
  );
}
