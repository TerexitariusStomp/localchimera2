import { LayoutGrid, Upload, Container, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from './ui';

const BUILD_CARDS = [
  { id: 'vm', title: 'Launch Container-VM', desc: 'Deploy and work with a plain Linux VM-like container.', params: 'image=library/ubuntu:22.04', icons: ['🐳', '🖥'] },
  { id: 'custom', title: 'Run Custom Container', desc: 'Run your own Docker container from a private or public registry.', params: '', icons: ['🐋'] },
];

const TEMPLATES = [
  { name: 'Golem Alpine Linux', icon: '�', color: '#dbeafe', text: '#2563eb', desc: 'Minimal Alpine Linux container running on the Golem network. A real, deployable Golem VM image.', tags: ['Golem', 'CPU'], params: 'network=golem&image=golem/alpine:latest' },
  { name: 'Golem Nginx Server', icon: '🌐', color: '#dcfce7', text: '#16a34a', desc: 'Nginx web server running on Golem. Ready to serve static content on the decentralized compute marketplace.', tags: ['Golem', 'Web'], params: 'network=golem&image=golem/nginx:latest' },
  { name: 'Golem Blender Render', icon: '🎨', color: '#fce7f3', text: '#db2777', desc: 'Blender rendering workload on Golem. Uses the official golem/blender image for CPU-based rendering.', tags: ['Golem', 'GPU'], params: 'network=golem&image=golem/blender:latest' },
  { name: 'Akash WordPress', icon: '�', color: '#f3e8ff', text: '#9333ea', desc: 'WordPress + MariaDB deployment on Akash. Uses a standard Akash SDL with persistent storage.', tags: ['Akash', 'Web'], params: 'network=akash&image=wordpress:6.5&service=wordpress' },
  { name: 'Akash PostgreSQL', icon: '🐘', color: '#e0f2fe', text: '#0284c7', desc: 'PostgreSQL database on Akash. Includes persistent storage and exposes the standard Postgres port.', tags: ['Akash', 'DB'], params: 'network=akash&image=postgres:16&service=postgres' },
  { name: 'Akash Minecraft Server', icon: '🎮', color: '#fef3c7', text: '#d97706', desc: 'Minecraft Java server on Akash. Uses the official itzg/minecraft-server image with a persistent world.', tags: ['Akash', 'Game'], params: 'network=akash&image=itzg/minecraft-server:latest&service=minecraft' },
];

export default function ConsoleTemplates({ onNavigate }: { onNavigate: (page: 'console-deploy', params?: string) => void }) {
  return (
    <div className="max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-[#111111]">Templates</h1>
        <p className="text-[13px] text-[#6b7280]">Browse and deploy pre-built templates from the marketplace.</p>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h3 className="text-[16px] font-bold text-[#111111]">Build Your Own</h3>
            <p className="text-[13px] text-[#6b7280]">Select a type or upload your own SDL.</p>
          </div>
          <Button onClick={() => onNavigate('console-deploy', 'tab=upload')} className="bg-white border border-[#e5e5e5] text-[#111111] hover:bg-[#f5f5f7]">
            <Upload className="w-4 h-4" />Upload SDL
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUILD_CARDS.map((c) => (
            <button
              key={c.id}
              onClick={() => onNavigate('console-deploy', c.params || undefined)}
              className="block text-center border border-[#e5e5e5] rounded-[14px] p-6 hover:bg-[#f5f5f7] transition w-full"
            >
              <div className="flex justify-center gap-2 mb-3">
                {c.icons.map((icon, i) => (
                  <span key={i} className="text-2xl w-10 h-10 rounded-full bg-[#f5f5f7] flex items-center justify-center">{icon}</span>
                ))}
              </div>
              <h4 className="text-[15px] font-semibold text-[#111111] mb-1">{c.title}</h4>
              <p className="text-[13px] text-[#6b7280]">{c.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h3 className="text-[16px] font-bold text-[#111111]">Explore Templates</h3>
            <p className="text-[13px] text-[#6b7280]">Pre-made solutions for AI/ML, blockchain nodes, and more.</p>
          </div>
          <Button className="bg-white border border-[#e5e5e5] text-[#111111] hover:bg-[#f5f5f7]">
            <LayoutGrid className="w-4 h-4" />View All
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => onNavigate('console-deploy', t.params || undefined)}
              className="block text-left border border-[#e5e5e5] rounded-[14px] p-4 hover:bg-[#f5f5f7] transition w-full"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-[18px] font-semibold" style={{ background: t.color, color: t.text }}>
                  {t.icon}
                </span>
                <h4 className="text-[14px] font-semibold text-[#111111] leading-tight">{t.name}</h4>
              </div>
              <p className="text-[13px] text-[#6b7280] line-clamp-3 mb-3">{t.desc}</p>
              <div className="flex flex-wrap gap-2">
                {t.tags.map((tag) => (
                  <span key={tag} className="text-[11px] px-2 py-1 rounded-full border border-[#e5e5e5] text-[#6b7280] font-semibold">{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
