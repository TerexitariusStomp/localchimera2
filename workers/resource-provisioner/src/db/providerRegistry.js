import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import {
  aggregateProviders,
  fetchJson,
  normalizeAkash,
  normalizeAnyone,
  normalizeGolem,
  normalizeMysterium,
  normalizeNativeMachine,
  normalizeStorj,
} from '../providerNormalize.js';

const DB_DIR = path.resolve(process.cwd(), 'data');
const PROVIDERS_DB_PATH = path.join(DB_DIR, 'providers.db');
const LOCATIONS_DB_PATH = path.join(DB_DIR, 'provider_locations.db');

function ensureDbPath(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

let providersDb = null;
let locationsDb = null;

function addColumnIfMissing(db, table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function initProvidersDb() {
  if (providersDb) return providersDb;
  ensureDbPath(PROVIDERS_DB_PATH);
  providersDb = new DatabaseSync(PROVIDERS_DB_PATH);
  providersDb.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      network_name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      status TEXT,
      location TEXT,
      country TEXT,
      region TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      specs TEXT,
      metrics TEXT,
      raw_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider_id, network_name)
    );
    CREATE INDEX IF NOT EXISTS idx_providers_network ON providers(network_name);
    CREATE INDEX IF NOT EXISTS idx_providers_resource ON providers(resource_type);
    CREATE INDEX IF NOT EXISTS idx_providers_country ON providers(country);
    CREATE INDEX IF NOT EXISTS idx_providers_location ON providers(location);
  `);
  addColumnIfMissing(providersDb, 'providers', 'metrics', 'TEXT');
  return providersDb;
}

export function initLocationsDb() {
  if (locationsDb) return locationsDb;
  ensureDbPath(LOCATIONS_DB_PATH);
  locationsDb = new DatabaseSync(LOCATIONS_DB_PATH);
  locationsDb.exec(`
    CREATE TABLE IF NOT EXISTS location_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      country TEXT,
      region TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      network_name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      provider_count INTEGER NOT NULL DEFAULT 0,
      resources TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(location, network_name, resource_type)
    );
    CREATE INDEX IF NOT EXISTS idx_loc_country ON location_aggregates(country);
    CREATE INDEX IF NOT EXISTS idx_loc_network ON location_aggregates(network_name);
    CREATE INDEX IF NOT EXISTS idx_loc_resource ON location_aggregates(resource_type);

    CREATE TABLE IF NOT EXISTS combined_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      country TEXT,
      region TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      provider_count INTEGER NOT NULL DEFAULT 0,
      resources TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(location)
    );
    CREATE INDEX IF NOT EXISTS idx_combined_country ON combined_metrics(country);
    CREATE INDEX IF NOT EXISTS idx_combined_location ON combined_metrics(location);
  `);
  return locationsDb;
}

export function resetProvidersDb() {
  const db = initProvidersDb();
  db.exec('DELETE FROM providers;');
  return db;
}

export function resetLocationsDb() {
  const db = initLocationsDb();
  db.exec('DELETE FROM location_aggregates;');
  return db;
}

export function resetCombinedMetrics() {
  const db = initLocationsDb();
  db.exec('DELETE FROM combined_metrics;');
  return db;
}

export function upsertProvider(record) {
  const db = initProvidersDb();
  const stmt = db.prepare(`
    INSERT INTO providers (
      provider_id, provider_name, network_name, resource_type, status,
      location, country, region, city, latitude, longitude, specs, metrics, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id, network_name) DO UPDATE SET
      provider_name = excluded.provider_name,
      resource_type = excluded.resource_type,
      status = excluded.status,
      location = excluded.location,
      country = excluded.country,
      region = excluded.region,
      city = excluded.city,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      specs = excluded.specs,
      metrics = excluded.metrics,
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(
    record.provider_id,
    record.provider_name,
    record.network_name,
    record.resource_type,
    record.status || 'unknown',
    record.location || null,
    record.country || null,
    record.region || null,
    record.city || null,
    record.latitude || null,
    record.longitude || null,
    record.specs || null,
    record.metrics ? JSON.stringify(record.metrics) : null,
    record.raw_json ? JSON.stringify(record.raw_json) : null
  );
  return record;
}

export function getProviders({ network, resource, country, status } = {}) {
  const db = initProvidersDb();
  const conditions = [];
  const params = [];
  if (network) { conditions.push('network_name = ?'); params.push(network); }
  if (resource) { conditions.push('resource_type = ?'); params.push(resource); }
  if (country) { conditions.push('country = ?'); params.push(country); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM providers ${where} ORDER BY updated_at DESC`);
  return stmt.all(...params);
}

export function getProviderCount(filters) {
  const rows = getProviders(filters);
  return rows.length;
}

export function aggregateLocations() {
  const providersDb = initProvidersDb();
  const locationsDb = initLocationsDb();
  locationsDb.exec('DELETE FROM location_aggregates;');
  locationsDb.exec('DELETE FROM combined_metrics;');

  const rows = providersDb.prepare(`
    SELECT provider_id, provider_name, network_name, resource_type, location, country,
           region, city, latitude, longitude, metrics, specs
    FROM providers
    WHERE country IS NOT NULL
       OR city IS NOT NULL
       OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  `).all();

  const providers = rows.map((p) => ({
    ...p,
    metrics: p.metrics ? JSON.parse(p.metrics) : {},
  }));

  const { aggregates, combined } = aggregateProviders(providers);

  const insertAggregate = locationsDb.prepare(`
    INSERT INTO location_aggregates (
      location, country, region, city, latitude, longitude,
      network_name, resource_type, provider_count, resources
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location, network_name, resource_type) DO UPDATE SET
      country = excluded.country,
      region = excluded.region,
      city = excluded.city,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      provider_count = excluded.provider_count,
      resources = excluded.resources,
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const a of aggregates) {
    insertAggregate.run(
      a.location,
      a.country || null,
      a.region || null,
      a.city || null,
      a.latitude || null,
      a.longitude || null,
      a.network_name,
      a.resource_type,
      a.provider_count,
      JSON.stringify(a.resources)
    );
  }

  const insertCombined = locationsDb.prepare(`
    INSERT INTO combined_metrics (
      location, country, region, city, latitude, longitude, provider_count, resources
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location) DO UPDATE SET
      country = excluded.country,
      region = excluded.region,
      city = excluded.city,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      provider_count = excluded.provider_count,
      resources = excluded.resources,
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const c of combined) {
    insertCombined.run(
      c.location,
      c.country || null,
      c.region || null,
      c.city || null,
      c.latitude || null,
      c.longitude || null,
      c.provider_count,
      JSON.stringify(c.resources)
    );
  }

  return { locations: aggregates.length, combined: combined.length };
}

export function getLocationAggregates({ country, network, resource } = {}) {
  const db = initLocationsDb();
  const conditions = [];
  const params = [];
  if (country) { conditions.push('country = ?'); params.push(country); }
  if (network) { conditions.push('network_name = ?'); params.push(network); }
  if (resource) { conditions.push('resource_type = ?'); params.push(resource); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM location_aggregates ${where} ORDER BY provider_count DESC`);
  return stmt.all(...params);
}

export function getCombinedMetrics({ country } = {}) {
  const db = initLocationsDb();
  const conditions = [];
  const params = [];
  if (country) { conditions.push('country = ?'); params.push(country); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM combined_metrics ${where} ORDER BY provider_count DESC`);
  return stmt.all(...params);
}


export async function syncProviders(config = {}) {
  const networks = [
    { name: 'akash', url: 'https://console-api.akash.network/v1/providers', normalize: normalizeAkash },
    { name: 'golem', url: 'https://api2.stats.golem.network/v2/network/online', normalize: normalizeGolem },
    { name: 'mysterium', url: 'https://discovery.mysterium.network/api/v4/proposals', normalize: normalizeMysterium },
    { name: 'anyone', url: 'https://api.ec.anyone.tech/relay-map', normalize: normalizeAnyone },
    { name: 'storj', url: null, normalize: normalizeStorj },
  ];

  initProvidersDb();
  let total = 0;

  for (const network of networks) {
    try {
      const data = network.url ? await fetchJson(network.url) : await network.normalize();
      const records = network.url ? network.normalize(data) : data;
      for (const record of records) {
        upsertProvider(record);
      }
      total += records.length;
      console.log(`[provider-registry] synced ${records.length} ${network.name} providers`);
    } catch (err) {
      console.warn(`[provider-registry] failed to sync ${network.name}: ${err.message}`);
    }
  }

  const aggregated = aggregateLocations();
  console.log(`[provider-registry] aggregated ${aggregated.locations} separate locations, ${aggregated.combined} combined locations`);
  return { total, aggregated };
}

export function closeProviderDbs() {
  if (providersDb) { providersDb.close(); providersDb = null; }
  if (locationsDb) { locationsDb.close(); locationsDb = null; }
}
