import { useState } from 'react';
import { Monitor, Cpu } from 'lucide-react';
import { Button } from './ui';

const RENTAL_TEMPLATES = [
  { name: 'Ubuntu Server 24.04 LTS', desc: 'A professional, feature-rich Ubuntu 24.04 LTS development environment.' },
  { name: 'Ubuntu Server 22.04 LTS', desc: 'Debian-based Linux operating system based on free and open-source software.' },
  { name: 'Minecraft Server', desc: 'Base Minecraft server image with easy mod support.' },
  { name: 'Docker-in-Docker + Systemd', desc: 'Deploy containers that support Docker-in-Docker and systemd.' },
  { name: 'Jupyter Notebook', desc: 'Base image for Jupyter Notebook stacks.' },
  { name: 'PyTorch', desc: 'GPU-ready PyTorch environment for training and inference.' },
  { name: 'Ollama', desc: 'The easiest way to get up and running with large language models.' },
  { name: 'Stable Diffusion WebUI', desc: 'Pre-configured AUTOMATIC1111 WebUI for Stable Diffusion image generation.' },
  { name: 'ComfyUI', desc: 'A powerful and modular stable diffusion GUI for node-based workflows.' },
  { name: 'FastChat', desc: 'An open platform for training, serving, and evaluating large language model chatbots.' },
];

const CONFIGS = [
  { name: 'NVIDIA RTX 4090 - Small', spec: '1x RTX 4090 · 28.75 vCPU · 128GB RAM', gpu: 'RTX 4090', stock: 'out' },
  { name: 'NVIDIA RTX 4090 - Medium', spec: '2x RTX 4090 · 57.5 vCPU · 296GB RAM', gpu: 'RTX 4090', stock: 'out' },
  { name: 'NVIDIA RTX 4090 - Large', spec: '4x RTX 4090 · 115 vCPU · 592GB RAM', gpu: 'RTX 4090', stock: 'out' },
  { name: 'NVIDIA H100 - Small', spec: '1x H100 · 32 vCPU · 256GB RAM', gpu: 'H100', stock: 'in' },
  { name: 'NVIDIA H100 - Large', spec: '8x H100 · 256 vCPU · 2TB RAM', gpu: 'H100', stock: 'in' },
  { name: 'CPU Basic', spec: '4 vCPU · 16GB RAM · No GPU', gpu: 'CPU', stock: 'in' },
  { name: 'CPU Pro', spec: '16 vCPU · 64GB RAM · No GPU', gpu: 'CPU', stock: 'in' },
];

const GPU_FILTERS = ['All GPUs', 'RTX 4090', 'H100', 'H200', 'B200', 'RTX6000', 'B300'];

export default function ConsoleRental({
  walletId,
  onNavigate,
}: {
  walletId: string | null;
  onNavigate: (page: 'deployments') => void;
}) {
  const [configType, setConfigType] = useState<'public' | 'my' | 'custom'>('public');
  const [serverType, setServerType] = useState<'gpu' | 'cpu'>('gpu');
  const [gpuFilter, setGpuFilter] = useState('All GPUs');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [storage, setStorage] = useState<'attach' | 'new'>('new');
  const [name, setName] = useState('');
  const [sshName, setSshName] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 4;

  const filteredConfigs = serverType === 'cpu'
    ? CONFIGS.filter((c) => c.gpu === 'CPU')
    : CONFIGS.filter((c) => c.gpu !== 'CPU' && (gpuFilter === 'All GPUs' || c.gpu === gpuFilter));

  const pageItems = RENTAL_TEMPLATES.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(RENTAL_TEMPLATES.length / perPage);

  const startRental = () => {
    if (!name.trim()) { alert('Enter a rental name.'); return; }
    alert(`Starting rental ${name} is not implemented in this demo.`);
  };

  return (
    <div className="max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-[#111111]">Create Rental</h1>
        <p className="text-[13px] text-[#6b7280]">Rent a GPU or CPU server from the Chimera marketplace.</p>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#111111]">1. Configuration Type</h3>
          <span className="text-red-500">*</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: 'public', icon: '📦', title: 'Public Templates', desc: 'Curated configurations from the community' },
            { id: 'my', icon: '✨', title: 'My Templates', desc: 'Your saved configurations' },
            { id: 'custom', icon: '⚙️', title: 'Custom Config', desc: 'Configure from scratch' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setConfigType(c.id as typeof configType)}
              className={`text-left p-4 rounded-[14px] border transition ${configType === c.id ? 'border-[#111111] bg-[#f5f5f7]' : 'border-[#e5e5e5] hover:bg-[#f5f5f7]'}`}
            >
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="text-[14px] font-semibold text-[#111111]">{c.title}</div>
              <div className="text-[12px] text-[#6b7280]">{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {configType === 'public' && (
        <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-4">
          <h3 className="text-[16px] font-bold text-[#111111] mb-3">Select Public Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            {pageItems.map((t) => (
              <button
                key={t.name}
                onClick={() => setSelectedTemplate(t.name)}
                className={`text-left p-4 rounded-[14px] border transition ${selectedTemplate === t.name ? 'border-[#111111] bg-[#f5f5f7]' : 'border-[#e5e5e5] hover:bg-[#f5f5f7]'}`}
              >
                <div className="text-[14px] font-semibold text-[#111111]">{t.name}</div>
                <div className="text-[12px] text-[#6b7280]">{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-[8px] text-[13px] font-semibold ${page === p ? 'bg-[#111111] text-white' : 'bg-[#f5f5f7] text-[#6b7280]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#111111]">2. Select Rental Configuration</h3>
          <span className="text-red-500">*</span>
        </div>
        <div className="flex bg-[#f5f5f7] rounded-[10px] p-1 mb-4 w-fit">
          <button onClick={() => setServerType('gpu')} className={`px-4 py-2 rounded-[8px] text-[13px] font-semibold transition ${serverType === 'gpu' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6b7280]'}`}>
            <Monitor className="w-4 h-4 inline-block mr-1" /> GPU Servers
          </button>
          <button onClick={() => setServerType('cpu')} className={`px-4 py-2 rounded-[8px] text-[13px] font-semibold transition ${serverType === 'cpu' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6b7280]'}`}>
            <Cpu className="w-4 h-4 inline-block mr-1" /> CPU Servers
          </button>
        </div>
        {serverType === 'gpu' && (
          <div className="flex flex-wrap gap-2 mb-4">
            {GPU_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setGpuFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border ${gpuFilter === f ? 'bg-[#111111] text-white border-[#111111]' : 'bg-white text-[#6b7280] border-[#e5e5e5]'}`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredConfigs.map((c) => (
            <button
              key={c.name}
              onClick={() => setSelectedConfig(c.name)}
              className={`text-left p-4 rounded-[14px] border transition ${selectedConfig === c.name ? 'border-[#111111] bg-[#f5f5f7]' : 'border-[#e5e5e5] hover:bg-[#f5f5f7]'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-[14px] font-semibold text-[#111111]">{c.name}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.stock === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                  {c.stock === 'in' ? 'In Stock' : 'Out of Stock'}
                </span>
              </div>
              <div className="text-[12px] text-[#6b7280]">{c.spec}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-4">
        <h3 className="text-[16px] font-bold text-[#111111] mb-3">3. Mount Persistent Storage <span className="font-normal text-[#6b7280]">(Optional)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button onClick={() => setStorage('attach')} className={`text-left p-4 rounded-[14px] border transition ${storage === 'attach' ? 'border-[#111111] bg-[#f5f5f7]' : 'border-[#e5e5e5] hover:bg-[#f5f5f7]'}`}>
            <div className="text-2xl mb-2">🗄️</div>
            <div className="text-[14px] font-semibold text-[#111111]">Attach Existing</div>
            <div className="text-[12px] text-[#6b7280]">No volumes available</div>
          </button>
          <button onClick={() => setStorage('new')} className={`text-left p-4 rounded-[14px] border transition ${storage === 'new' ? 'border-[#111111] bg-[#f5f5f7]' : 'border-[#e5e5e5] hover:bg-[#f5f5f7]'}`}>
            <div className="text-2xl mb-2">⊕</div>
            <div className="text-[14px] font-semibold text-[#111111]">Create New</div>
            <div className="text-[12px] text-[#6b7280]">Create and attach a new volume</div>
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-4">
        <h3 className="text-[16px] font-bold text-[#111111] mb-3">4. SSH Key for Access</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#111111] mb-2">Key Name</label>
            <input value={sshName} onChange={(e) => setSshName(e.target.value)} placeholder="e.g., MacBook Pro" className="w-full border border-[#e5e5e5] rounded-[10px] px-4 py-2.5 text-[14px] outline-none focus:border-[#111111]" />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#111111] mb-2">Public Key</label>
            <textarea value={sshKey} onChange={(e) => setSshKey(e.target.value)} placeholder="Paste your public SSH key here" className="w-full border border-[#e5e5e5] rounded-[10px] p-4 text-[14px] h-[100px] outline-none focus:border-[#111111]" />
          </div>
          <div className="text-right">
            <Button className="bg-white border border-[#e5e5e5] text-[#111111] hover:bg-[#f5f5f7]" onClick={() => alert('Add SSH key not wired in this demo.')}>Add Key</Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[16px] font-bold text-[#111111]">5. Rental Name</h3>
          <span className="text-red-500">*</span>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Training Server, Dev Environment" className="w-full border border-[#e5e5e5] rounded-[10px] px-4 py-2.5 text-[14px] outline-none focus:border-[#111111]" />
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button className="bg-white border border-[#e5e5e5] text-[#111111] hover:bg-[#f5f5f7]" onClick={() => onNavigate('deployments')}>Cancel</Button>
        <Button className="bg-[#111111] text-white hover:opacity-85" onClick={startRental}>Start Rental</Button>
      </div>
    </div>
  );
}
