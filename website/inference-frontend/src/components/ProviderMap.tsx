import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_URL = '/example/data/locations.json';

const COLORS: Record<string, string> = {
  gpu: '#a855f7',
  cpu: '#f59e0b',
  storage: '#22c55e',
  bandwidth: '#00e5ff',
  mixed: '#f472b6',
};

const LABELS: Record<string, string> = {
  gpu: 'GPU',
  cpu: 'CPU',
  storage: 'Storage',
  bandwidth: 'Bandwidth',
  mixed: 'Mixed',
};

type LocationData = {
  lat: number;
  lng: number;
  location: string;
  country?: string;
  provider_count: number;
  networks?: { resource_type?: string; resources?: any }[];
  resources?: any;
};

type LocationsResponse = {
  locations?: LocationData[];
  total_providers?: number;
};

function classifyLocation(networks: any[] = [], resources: any) {
  const types = new Set<string>();
  for (const n of networks) {
    const rt = (n.resource_type || '').toLowerCase();
    if (rt.includes('gpu')) types.add('gpu');
    if (rt.includes('compute')) types.add('cpu');
    if (rt.includes('storage')) types.add('storage');
    if (rt.includes('bandwidth')) types.add('bandwidth');
  }
  if (resources) {
    if ((resources.total_gpu_count || 0) > 0) types.add('gpu');
    if ((resources.total_cpu_cores || 0) > 0) types.add('cpu');
    if ((resources.total_storage_tb || 0) > 0) types.add('storage');
    if ((resources.total_bandwidth_mbps || 0) > 0) types.add('bandwidth');
  }
  return types;
}

function primaryType(types: Set<string>): string {
  for (const key of ['gpu', 'cpu', 'storage', 'bandwidth']) {
    if (types.has(key)) return key;
  }
  return 'mixed';
}

function getLocationResources(p: LocationData) {
  const resources = p.resources || {};
  const hasTopLevel = Object.values(resources).some((v) => typeof v === 'number' && v > 0);
  if (hasTopLevel) return resources;
  const aggregated = {
    total_gpu_count: 0,
    total_cpu_cores: 0,
    total_memory_gb: 0,
    total_storage_tb: 0,
    total_bandwidth_mbps: 0,
  };
  for (const n of p.networks || []) {
    const r = n.resources || {};
    aggregated.total_gpu_count += r.total_gpu_count || 0;
    aggregated.total_cpu_cores += r.total_cpu_cores || 0;
    aggregated.total_memory_gb += r.total_memory_gb || 0;
    aggregated.total_storage_tb += r.total_storage_tb || 0;
    aggregated.total_bandwidth_mbps += r.total_bandwidth_mbps || 0;
  }
  return aggregated;
}

function formatResources(resources: any): string[] {
  const parts: string[] = [];
  if (!resources) return parts;
  if (resources.total_gpu_count) parts.push(`${resources.total_gpu_count.toFixed(0)} GPUs`);
  if (resources.total_cpu_cores) parts.push(`${resources.total_cpu_cores.toFixed(0)} CPU cores`);
  if (resources.total_memory_gb) parts.push(`${resources.total_memory_gb.toFixed(0)} GB RAM`);
  if (resources.total_storage_tb) parts.push(`${resources.total_storage_tb.toFixed(0)} TB storage`);
  if (resources.total_bandwidth_mbps) parts.push(`${(resources.total_bandwidth_mbps / 1000).toFixed(1)} Gbps bandwidth`);
  return parts;
}

function createDivIcon(color: string, count: number) {
  const size = Math.max(10, Math.min(28, 10 + Math.log2(count || 1) * 3));
  return L.divIcon({
    className: 'custom-provider-marker',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;box-shadow:0 0 0 2px rgba(0,0,0,0.3);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function computeTotals(locations: LocationData[]) {
  const totals = {
    providers: 0,
    cpu: 0,
    gpu: 0,
    memory: 0,
    storage: 0,
    bandwidth: 0,
  };
  for (const loc of locations) {
    totals.providers += loc.provider_count || 0;
    const r = getLocationResources(loc);
    totals.cpu += r.total_cpu_cores || 0;
    totals.gpu += r.total_gpu_count || 0;
    totals.memory += r.total_memory_gb || 0;
    totals.storage += r.total_storage_tb || 0;
    totals.bandwidth += r.total_bandwidth_mbps || 0;
  }
  return totals;
}

export default function ProviderMap({ externalResource }: { externalResource?: string | 'all' }) {
  const [data, setData] = useState<LocationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['gpu', 'cpu', 'storage', 'bandwidth', 'mixed']));

  useEffect(() => {
    if (!externalResource || externalResource === 'all') {
      setActiveTypes(new Set(['gpu', 'cpu', 'storage', 'bandwidth', 'mixed']));
    } else {
      const r = externalResource.toLowerCase();
      setActiveTypes(new Set([r]));
    }
  }, [externalResource]);

  useEffect(() => {
    let cancelled = false;
    fetch(API_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: LocationsResponse) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || 'Failed to load provider locations');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const locations = useMemo(() => (data?.locations || []).filter((l) => l.lat && l.lng), [data]);
  const totals = useMemo(() => computeTotals(locations), [locations]);

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      const types = classifyLocation(loc.networks || [], getLocationResources(loc));
      if (types.size > 1 && activeTypes.has('mixed')) return true;
      for (const key of types) {
        if (activeTypes.has(key)) return true;
      }
      return false;
    });
  }, [locations, activeTypes]);

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const legendItem = (type: string) => {
    const checked = activeTypes.has(type);
    const count = locations.filter((loc) => {
      const types = classifyLocation(loc.networks || [], getLocationResources(loc));
      return type === 'mixed' ? types.size > 1 : types.has(type);
    }).length;
    return (
      <button
        key={type}
        onClick={() => toggleType(type)}
        className={`flex items-center gap-2 text-[12px] transition ${checked ? 'text-foreground' : 'text-muted-foreground opacity-50'}`}
      >
        <span className="w-2.5 h-2.5 rounded-full border border-white" style={{ background: COLORS[type] }} />
        {LABELS[type]}
        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-white/10 text-[10px]">{count.toLocaleString()}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[14px] p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-foreground">Global Provider Map</h3>
            <p className="text-[13px] text-muted-foreground">Live provider locations across all integrated networks.</p>
          </div>
          <div className="flex items-center gap-4 text-[12px] flex-wrap">
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{totals.providers.toLocaleString()}</span><span className="text-muted-foreground">Providers</span></div>
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{Math.round(totals.cpu).toLocaleString()}</span><span className="text-muted-foreground">CPU cores</span></div>
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{Math.round(totals.gpu).toLocaleString()}</span><span className="text-muted-foreground">GPUs</span></div>
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{Math.round(totals.memory).toLocaleString()}</span><span className="text-muted-foreground">GB RAM</span></div>
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{totals.storage.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span><span className="text-muted-foreground">TB storage</span></div>
            <div className="flex items-baseline gap-1"><span className="text-[#00e5ff] font-bold">{(totals.bandwidth / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span><span className="text-muted-foreground">Gbps bandwidth</span></div>
          </div>
        </div>

        <div className="relative h-[500px] rounded-[12px] overflow-hidden border border-border">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <p className="text-[13px] text-muted-foreground">Loading provider map…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <p className="text-[13px] text-red-400">{error}</p>
            </div>
          )}
          <MapContainer center={[20, 0]} zoom={2} minZoom={2} scrollWheelZoom={false} worldCopyJump style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredLocations.map((loc) => {
              const resources = getLocationResources(loc);
              const types = classifyLocation(loc.networks || [], resources);
              const key = primaryType(types);
              const color = COLORS[key] || COLORS.mixed;
              const label = types.size > 1 ? 'Mixed' : LABELS[key] || LABELS.mixed;
              const resParts = formatResources(resources);
              return (
                <Marker key={`${loc.lat}:${loc.lng}`} position={[loc.lat, loc.lng]} icon={createDivIcon(color, loc.provider_count)}>
                  <Popup>
                    <div className="text-foreground">
                      <h4 className="font-semibold text-sm mb-1">{loc.location}{loc.country ? `, ${loc.country}` : ''}</h4>
                      <p className="text-[12px] text-muted-foreground mb-1"><b>{loc.provider_count.toLocaleString()}</b> providers · {label}</p>
                      {resParts.length > 0 && (
                        <ul className="text-[12px] list-disc pl-4 space-y-0.5">
                          {resParts.map((part, i) => <li key={i}>{part}</li>)}
                        </ul>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          <div className="absolute bottom-3 left-3 z-[400] bg-card/95 border border-border rounded-[10px] p-3 shadow-lg backdrop-blur-sm">
            <div className="space-y-2 min-w-[140px]">
              {legendItem('gpu')}
              {legendItem('cpu')}
              {legendItem('storage')}
              {legendItem('bandwidth')}
              {legendItem('mixed')}
              <div className="pt-1 text-[10px] text-muted-foreground">
                {filteredLocations.length.toLocaleString()} locations visible
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
