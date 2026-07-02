import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getNetworkStats, getNetworkUsage } from '../api/stats';
import type { NetworkStats, NetworkUsage, ResourceType } from '../types';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  const value = bytes / Math.pow(1000, i);
  return `${value.toFixed(2)} ${units[i]}`;
}

function StatLabel({ children, hint }: { children: ReactNode; hint?: boolean }) {
  return (
    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
      {children}
      {hint && <span className="text-slate-400">ⓘ</span>}
    </div>
  );
}

const RESOURCE_COLORS: Record<ResourceType, string> = {
  compute: '#a855f7',
  storage: '#22c55e',
  bandwidth: '#00e5ff',
};

function markerIcon(resource?: ResourceType) {
  const color = RESOURCE_COLORS[resource || 'bandwidth'];
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${color}40,0 2px 6px rgba(0,0,0,0.25);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export default function NetworkHealthTab({ accountHash }: { accountHash?: string }) {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [usage, setUsage] = useState<NetworkUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, u] = await Promise.all([
        getNetworkStats(),
        getNetworkUsage(accountHash),
      ]);
      setStats(s);
      setUsage(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountHash]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !stats) {
    return <div className="text-sm text-muted-foreground">Loading network health...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* World Network Health — OSM map + stats */}
      <div className="bg-white rounded-2xl shadow-sm p-6 text-slate-800">
        <h2 className="text-xl font-bold text-slate-800 mb-4">World Network Health</h2>
        <div className="h-80 w-full rounded-xl overflow-hidden border border-slate-100">
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            maxZoom={10}
            scrollWheelZoom={false}
            worldCopyJump
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stats?.locations.map((loc) => (
              <Marker
                key={`${loc.name}-${loc.lat}-${loc.lng}`}
                position={[loc.lat, loc.lng]}
                icon={markerIcon(loc.resource)}
              >
                <Popup>
                  <div className="text-sm font-semibold text-slate-800">{loc.name}</div>
                  <div className="text-xs text-slate-500">{loc.country}</div>
                  <div className="text-xs text-slate-700 mt-1 capitalize">
                    Resource: {loc.resource}
                  </div>
                  <div className="text-xs text-slate-700">Load: {loc.load}%</div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-block rounded-full w-2.5 h-2.5" style={{ background: RESOURCE_COLORS.compute }} />
            Compute
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block rounded-full w-2.5 h-2.5" style={{ background: RESOURCE_COLORS.storage }} />
            Storage
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block rounded-full w-2.5 h-2.5" style={{ background: RESOURCE_COLORS.bandwidth }} />
            Bandwidth
          </div>
          <div className="ml-auto text-right">
            {stats?.locations.length ?? 0} active locations
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <StatLabel>Nodes</StatLabel>
            <div className="text-2xl font-bold text-slate-800">{stats?.totalNodes.toLocaleString() ?? 0}</div>
          </div>
          <div>
            <StatLabel hint>Transferred</StatLabel>
            <div className="text-2xl font-bold text-slate-800">{stats ? formatBytes(stats.transferredBytes) : '0 B'}</div>
          </div>
          <div>
            <StatLabel>Countries</StatLabel>
            <div className="text-2xl font-bold text-slate-800">{stats?.countries ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Bandwidth + Transferred */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-[#f0f9ff] p-2">
              <TrendingUp className="h-5 w-5 text-[#00e5ff]" />
            </div>
            <div className="font-semibold text-slate-800">Bandwidth (Gb/s)</div>
          </div>
          <div className="text-5xl font-bold text-slate-800">{usage?.bandwidthGbps.toFixed(2) ?? '0.00'}</div>
          <div className="text-xs text-slate-400 mt-2 text-right">Last 30 days</div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-[#f0f9ff] p-2">
              <RefreshCw className="h-5 w-5 text-[#a855f7]" />
            </div>
            <div className="font-semibold text-slate-800">Transferred (TB)</div>
          </div>
          <div className="text-5xl font-bold text-slate-800">{usage?.transferredTB.toFixed(2) ?? '0.00'}</div>
          <div className="text-xs text-slate-400 mt-2 text-right">Last 30 days</div>
        </div>
      </div>

      {/* Active nodes by region */}
      <div className="bg-white rounded-2xl shadow-sm p-5 text-slate-800">
        <h3 className="font-semibold text-slate-800 mb-3">Active nodes by region</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {stats &&
            Object.entries(stats.regions).map(([region, count]) => (
              <div
                key={region}
                className="flex justify-between items-center rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="text-xs text-slate-500">{region}</span>
                <span className="text-sm font-bold text-slate-800">{count.toLocaleString()}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
