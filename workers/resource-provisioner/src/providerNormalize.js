export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function toGb(bytes) {
  return bytes ? Math.round(bytes / (1024 ** 3)) : 0;
}

export function toTb(bytes) {
  return bytes ? Math.round(bytes / (1024 ** 4)) : 0;
}

export function toPb(bytes) {
  return bytes ? Math.round(bytes / (1024 ** 5)) : 0;
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function normalizeAkash(data) {
  return (data || []).map((p) => {
    const country = p.ipCountry || p.country || null;
    const region = p.ipRegion || p.locationRegion || null;
    const city = p.city || p.ipRegion || null;
    const lat = p.ipLat ? parseFloat(p.ipLat) : null;
    const lon = p.ipLon ? parseFloat(p.ipLon) : null;
    const stats = p.stats || {};
    const cpuTotal = stats.cpu?.total ? stats.cpu.total / 1000 : 0;
    const cpuAvailable = stats.cpu?.available ? stats.cpu.available / 1000 : 0;
    const memoryTotal = toGb(stats.memory?.total);
    const memoryAvailable = toGb(stats.memory?.available);
    const storageTotal = toTb(stats.storage?.total?.total);
    const storageAvailable = toTb(stats.storage?.total?.available);
    const gpuCount = stats.gpu?.total || 0;
    const gpuModels = p.gpuModels?.map((g) => `${g.vendor || ''} ${g.model} ${g.ram || ''}`.trim()) || [];
    const metrics = {
      cpu_total_cores: cpuTotal,
      cpu_available_cores: cpuAvailable,
      memory_total_gb: memoryTotal,
      memory_available_gb: memoryAvailable,
      storage_total_tb: storageTotal,
      storage_available_tb: storageAvailable,
      gpu_count: gpuCount,
      gpu_models: gpuModels,
      network_speed_up_mbps: p.networkSpeedUp || null,
      network_speed_down_mbps: p.networkSpeedDown || null,
    };
    return {
      provider_id: p.owner || p.name,
      provider_name: p.name || p.owner?.slice(0, 12) || 'Unknown',
      network_name: 'Akash Network',
      resource_type: 'Compute · GPU',
      status: p.isOnline ? 'online' : 'offline',
      location: [city, region, country].filter(Boolean).join(', ') || null,
      country,
      region,
      city,
      latitude: lat,
      longitude: lon,
      specs: `CPU ${cpuTotal.toFixed(1)} cores · RAM ${memoryTotal} GB · Storage ${storageTotal} TB · GPU ${gpuCount > 0 ? gpuModels.join(', ') : 'none'}`,
      metrics,
      raw_json: p,
    };
  });
}

export function normalizeGolem(data) {
  const providers = Array.isArray(data) ? data : (data?.providers || data?.online || []);
  return providers.map((p) => {
    const nodeId = p.node_id || p.id;
    const runtimeName = Object.keys(p.runtimes || {})[0];
    const info = p.runtimes?.[runtimeName]?.properties || p.data || p;
    const name = info['golem.node.id.name'] || nodeId?.slice(0, 12) || 'Unknown';
    const cpuCores = info['golem.inf.cpu.cores'] || info['golem.inf.cpu.threads'] || null;
    const memGib = info['golem.inf.mem.gib'] || null;
    const storageGib = info['golem.inf.storage.gib'] || null;
    const runtimes = Object.keys(p.runtimes || {});
    const metrics = {
      cpu_cores: cpuCores,
      memory_gib: memGib,
      storage_gib: storageGib,
      runtimes,
      earnings_total: p.earnings_total || null,
      uptime: p.uptime || null,
    };
    return {
      provider_id: nodeId,
      provider_name: name,
      network_name: 'Golem Network',
      resource_type: 'Compute',
      status: p.online ? 'online' : 'offline',
      location: info['golem.node.debug.subnet'] || p.network || null,
      specs: `CPU ${cpuCores || '?'} · Mem ${memGib || '?'} Gi · Storage ${storageGib || '?'} Gi`,
      metrics,
      raw_json: p,
    };
  });
}

export function normalizeMysterium(data) {
  return (data || []).map((p) => {
    const loc = p.location || {};
    const country = loc.country || null;
    const region = loc.region || null;
    const city = loc.city || null;
    const q = p.quality || {};
    const metrics = {
      bandwidth_mbps: q.bandwidth || null,
      latency_ms: q.latency || null,
      packet_loss_percent: q.packetLoss || null,
      quality_score: q.quality || null,
      uptime_hours: q.uptime || null,
      service_type: p.service_type || 'wireguard',
    };
    return {
      provider_id: p.provider_id || p.id,
      provider_name: p.provider_id?.slice(0, 12) || 'Unknown',
      network_name: 'Mysterium Network',
      resource_type: 'Bandwidth',
      status: 'online',
      location: [city, region, country].filter(Boolean).join(', ') || null,
      country,
      region,
      city,
      specs: `Bandwidth ${q.bandwidth ? q.bandwidth.toFixed(1) + ' Mbps' : '?'} · Latency ${q.latency ? q.latency.toFixed(1) + ' ms' : '?'} · Quality ${q.quality || '?'}`,
      metrics,
      raw_json: p,
    };
  });
}

export function normalizeAnyone(data) {
  const cells = Array.isArray(data) ? data : (data?.cells || []);
  return cells.map((c) => ({
    provider_id: c.index || c.id,
    provider_name: c.index?.slice(0, 12) || c.id?.slice(0, 12) || 'Unknown',
    network_name: 'Anyone Protocol',
    resource_type: 'Bandwidth',
    status: (c.relayCount || 0) > 0 ? 'online' : 'offline',
    location: c.geo ? `Lat ${c.geo[0]?.toFixed(2)}, Lon ${c.geo[1]?.toFixed(2)}` : null,
    latitude: c.geo ? c.geo[0] : null,
    longitude: c.geo ? c.geo[1] : null,
    specs: `${c.relayCount || 0} relays in cell`,
    metrics: { relay_count: c.relayCount || 0 },
    raw_json: c,
  }));
}

export function satelliteRegion(satellite) {
  const host = satellite.split('@')[1]?.split(':')[0]?.toLowerCase() || '';
  if (host.includes('ap1')) return { country: 'Singapore', region: 'Asia-Pacific', city: 'Singapore' };
  if (host.includes('us1')) return { country: 'United States', region: 'North America', city: 'US East' };
  if (host.includes('eu1')) return { country: 'Germany', region: 'Europe', city: 'EU Central' };
  if (host.includes('saltlake')) return { country: 'United States', region: 'North America', city: 'Salt Lake City' };
  return { country: null, region: null, city: host };
}

export async function normalizeStorj() {
  const [nodes, data] = await Promise.all([
    fetchJson('https://stats.storjshare.io/nodes.json'),
    fetchJson('https://stats.storjshare.io/data.json'),
  ]);
  const satellites = Array.from(new Set([...Object.keys(nodes), ...Object.keys(data)]));
  return satellites.map((satellite) => {
    const s = { ...nodes[satellite], ...data[satellite], satellite };
    const label = satellite.split('@')[1]?.split(':')[0] || satellite;
    const geo = satelliteRegion(satellite);
    const metrics = {
      active_nodes: s.active_nodes || 0,
      total_nodes: s.total_nodes || 0,
      vetted_nodes: s.vetted_nodes || 0,
      storage_used_gb: toGb(s.storage_remote_bytes),
      storage_used_tb: toTb(s.storage_remote_bytes),
      storage_free_gb: toGb(s.storage_free_capacity_estimate_bytes),
      storage_free_tb: toTb(s.storage_free_capacity_estimate_bytes),
      bandwidth_uploaded_tb: toTb(s.bandwidth_bytes_uploaded),
      bandwidth_downloaded_tb: toTb(s.bandwidth_bytes_downloaded),
    };
    return {
      provider_id: satellite,
      provider_name: label,
      network_name: 'Storj Network',
      resource_type: 'Storage',
      status: (s.active_nodes || 0) > 0 ? 'online' : 'offline',
      location: [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || label,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      specs: `${s.active_nodes || 0} active · ${formatBytes(s.storage_remote_bytes)} stored · ${formatBytes(s.storage_free_capacity_estimate_bytes)} free`,
      metrics,
      raw_json: s,
    };
  });
}

export function normalizeNativeMachine(snapshot, options = {}) {
  const {
    providerId = `native-${snapshot.timestamp || Date.now()}`,
    providerName = 'Native Machine',
    location = null,
    country = null,
    region = null,
    city = null,
    latitude = null,
    longitude = null,
  } = options;

  const metrics = {
    cpu_total_cores: snapshot.totalCores || snapshot.cpuCores || 0,
    memory_total_gb: Math.round(snapshot.totalMemGB || snapshot.memoryTotalGB || 0),
    storage_total_tb: Math.round(((snapshot.diskTotalGB || snapshot.storageTotalGB || 0) / 1024) * 100) / 100,
    bandwidth_mbps: snapshot.bandwidthMbps || 0,
    webgpu_available: snapshot.webgpuAvailable || false,
  };

  return {
    provider_id: providerId,
    provider_name: providerName,
    network_name: 'Chimera Native',
    resource_type: 'Compute',
    status: 'online',
    location,
    country,
    region,
    city,
    latitude,
    longitude,
    specs: `CPU ${metrics.cpu_total_cores} cores · RAM ${metrics.memory_total_gb} GB · Storage ${metrics.storage_total_tb} TB · Bandwidth ${metrics.bandwidth_mbps} Mbps`,
    metrics,
    raw_json: snapshot,
  };
}

function sumMetric(metrics, key) {
  return metrics.reduce((acc, m) => acc + (m?.[key] || 0), 0);
}

export function buildResources(metrics, providerCount) {
  return {
    provider_count: providerCount,
    total_cpu_cores: sumMetric(metrics, 'cpu_total_cores') || sumMetric(metrics, 'cpu_cores'),
    total_memory_gb: sumMetric(metrics, 'memory_total_gb') || sumMetric(metrics, 'memory_gib'),
    total_storage_tb: sumMetric(metrics, 'storage_total_tb') || sumMetric(metrics, 'storage_gib') / 1024,
    total_bandwidth_mbps: sumMetric(metrics, 'bandwidth_mbps'),
    total_gpu_count: sumMetric(metrics, 'gpu_count'),
    total_relay_count: sumMetric(metrics, 'relay_count'),
    total_storage_used_tb: sumMetric(metrics, 'storage_used_tb'),
    total_storage_free_tb: sumMetric(metrics, 'storage_free_tb'),
    total_active_nodes: sumMetric(metrics, 'active_nodes'),
  };
}

export function aggregateProviders(providers) {
  const groups = new Map();
  for (const p of providers) {
    const location = p.city || p.region || p.country || p.location || 'unknown';
    const key = `${location}|${p.network_name}|${p.resource_type}`;
    if (!groups.has(key)) {
      groups.set(key, {
        location,
        country: p.country,
        region: p.region,
        city: p.city,
        latitude: p.latitude,
        longitude: p.longitude,
        network_name: p.network_name,
        resource_type: p.resource_type,
        providers: [],
        metrics: [],
      });
    }
    groups.get(key).providers.push(p.provider_id);
    groups.get(key).metrics.push(p.metrics || {});
  }

  const aggregates = [];
  for (const g of groups.values()) {
    aggregates.push({
      location: g.location,
      country: g.country || null,
      region: g.region || null,
      city: g.city || null,
      latitude: g.latitude || null,
      longitude: g.longitude || null,
      network_name: g.network_name,
      resource_type: g.resource_type,
      provider_count: g.providers.length,
      resources: buildResources(g.metrics, g.providers.length),
    });
  }

  const combinedMap = new Map();
  for (const g of groups.values()) {
    if (!combinedMap.has(g.location)) {
      combinedMap.set(g.location, {
        location: g.location,
        country: g.country,
        region: g.region,
        city: g.city,
        latitude: g.latitude,
        longitude: g.longitude,
        providers: [],
        metrics: [],
      });
    }
    const c = combinedMap.get(g.location);
    c.providers.push(...g.providers);
    c.metrics.push(...g.metrics);
  }

  const combined = [];
  for (const c of combinedMap.values()) {
    combined.push({
      location: c.location,
      country: c.country || null,
      region: c.region || null,
      city: c.city || null,
      latitude: c.latitude || null,
      longitude: c.longitude || null,
      provider_count: c.providers.length,
      resources: buildResources(c.metrics, c.providers.length),
    });
  }

  return { aggregates, combined };
}
