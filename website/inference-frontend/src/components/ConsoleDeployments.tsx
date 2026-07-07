import { useState, useEffect } from 'react';
import { Server, Plus } from 'lucide-react';
import { Button } from './ui';
import { getDeployments, closeDeployment, type Deployment } from '../lib/deployments';

const FILTERS = ['all', 'active', 'pending', 'closed'] as const;

const statusClass: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  closed: 'bg-slate-50 text-slate-500 border-slate-100',
};

export default function ConsoleDeployments({
  walletId,
  onNavigate,
}: {
  walletId: string | null;
  onNavigate: (page: 'console-deploy' | 'rental', params?: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  useEffect(() => {
    setDeployments(getDeployments(walletId));
  }, [walletId]);

  const filtered = filter === 'all' ? deployments : deployments.filter((d) => d.status === filter);

  const handleClose = (id: string) => {
    if (!walletId) return;
    closeDeployment(walletId, id);
    setDeployments(getDeployments(walletId));
  };

  return (
    <div className="max-w-[1200px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#111111]">Your Deployments</h1>
          <p className="text-[13px] text-[#6b7280]">Manage active, pending, and closed deployments.</p>
        </div>
        <Button onClick={() => onNavigate('console-deploy')} className="bg-[#111111] text-white hover:opacity-85">
          <Plus className="w-4 h-4" />New Deployment
        </Button>
      </div>

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold border transition ${
              filter === f
                ? 'bg-[#111111] text-white border-[#111111]'
                : 'bg-white text-[#6b7280] border-[#e5e5e5] hover:bg-[#f5f5f7]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#e5e5e5] rounded-[14px] p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center mx-auto mb-4">
            <Server className="w-6 h-6 text-[#6b7280]" />
          </div>
          <h3 className="text-[16px] font-bold text-[#111111] mb-2">No {filter !== 'all' ? filter : ''} deployments</h3>
          <p className="text-[13px] text-[#6b7280] mb-4">
            {walletId ? 'Deploy a container from the marketplace or the SDL builder.' : 'Connect your wallet to view your deployments.'}
          </p>
          <Button onClick={() => onNavigate('console-deploy')} className="bg-[#111111] text-white hover:opacity-85">
            <Plus className="w-4 h-4" />Create Deployment
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((d) => (
            <div key={d.id} className="bg-white border border-[#e5e5e5] rounded-[14px] p-5 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-[15px] font-bold text-[#111111]">{d.name}</h3>
                  <div className="text-[12px] text-[#6b7280] mt-1">{d.id} · {d.image}</div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${statusClass[d.status]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'active' ? 'bg-emerald-600' : d.status === 'pending' ? 'bg-amber-600' : 'bg-slate-400'}`} />
                  {d.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 py-4 border-t border-b border-[#f0f0f0] mb-4">
                <div className="text-center">
                  <div className="text-[14px] font-bold text-[#111111]">{d.cpu}</div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">CPU</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-[#111111]">{d.gpu}</div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">GPU</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-[#111111]">{d.memory}GB</div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">Memory</div>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-[#111111]">{d.storage}GB</div>
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wide font-semibold">Storage</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-[#6b7280]">
                  Created <strong className="text-[#111111]">{d.created}</strong> · {d.cost}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onNavigate('console-deploy', `image=${encodeURIComponent(d.image)}`)}
                    className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border border-[#e5e5e5] bg-white text-[#111111] hover:bg-[#f5f5f7]"
                  >
                    Redeploy
                  </button>
                  {d.status !== 'closed' && (
                    <button
                      onClick={() => handleClose(d.id)}
                      className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold border border-[#e5e5e5] bg-white text-[#111111] hover:bg-[#f5f5f7]"
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
