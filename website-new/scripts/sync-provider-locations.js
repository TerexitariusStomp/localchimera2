import {
  aggregateProviders,
  fetchJson,
  normalizeAkash,
  normalizeAnyone,
  normalizeGolem,
  normalizeMysterium,
  normalizeStorj,
} from '../../workers/resource-provisioner/src/providerNormalize.js';
import fs from 'fs';
import path from 'path';

const OUTPUT_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'example',
  'data',
  'locations.json'
);

const NETWORKS = [
  { name: 'akash', url: 'https://console-api.akash.network/v1/providers', normalize: normalizeAkash },
  { name: 'golem', url: 'https://api2.stats.golem.network/v2/network/online', normalize: normalizeGolem },
  { name: 'mysterium', url: 'https://discovery.mysterium.network/api/v4/proposals', normalize: normalizeMysterium },
  { name: 'anyone', url: 'https://api.ec.anyone.tech/relay-map', normalize: normalizeAnyone },
  { name: 'storj', url: null, normalize: normalizeStorj },
];

async function sync() {
  const providers = [];
  for (const network of NETWORKS) {
    try {
      const data = network.url ? await fetchJson(network.url) : await network.normalize();
      const records = network.url ? network.normalize(data) : data;
      providers.push(...records);
      console.log(`[sync-provider-locations] ${network.name}: ${records.length} providers`);
    } catch (err) {
      console.warn(`[sync-provider-locations] ${network.name} failed: ${err.message}`);
    }
  }

  const locatedProviders = providers.filter(
    (p) => p.city || p.region || p.country || p.location || (p.latitude && p.longitude)
  );
  const { aggregates, combined } = aggregateProviders(locatedProviders);
  const totalProviders = combined.reduce((sum, c) => sum + c.provider_count, 0);
  const byLocation = aggregates.reduce((acc, a) => {
    if (!acc[a.location]) acc[a.location] = [];
    acc[a.location].push(a);
    return acc;
  }, {});

  const locations = combined.map((c) => ({
    location: c.location,
    country: c.country,
    region: c.region,
    city: c.city,
    lat: c.latitude,
    lng: c.longitude,
    provider_count: c.provider_count,
    resources: c.resources,
    networks: byLocation[c.location] || [],
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    total_providers: totalProviders,
    total_locations: locations.length,
    locations_with_coordinates: locations.filter((l) => l.lat && l.lng).length,
    locations,
  };

  const dataDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(OUTPUT_PATH)) {
    fs.copyFileSync(OUTPUT_PATH, path.join(dataDir, 'locations-prev.json'));
    const timestamp = new Date().toISOString().slice(0, 10);
    fs.copyFileSync(OUTPUT_PATH, path.join(dataDir, `locations-${timestamp}.json`));

    const existing = fs.readdirSync(dataDir)
      .filter((f) => /^locations-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    while (existing.length > 8) {
      const oldest = existing.shift();
      fs.unlinkSync(path.join(dataDir, oldest));
      console.log(`[sync-provider-locations] pruned old snapshot ${oldest}`);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[sync-provider-locations] wrote ${payload.locations_with_coordinates} plotted locations (${totalProviders} providers) to ${OUTPUT_PATH}`);
}

sync().catch((err) => {
  console.error(err);
  process.exit(1);
});
