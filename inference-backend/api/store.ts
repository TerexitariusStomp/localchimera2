import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');

export type ResourceType = 'compute' | 'storage' | 'bandwidth';

export interface NodeLocation {
  lat: number;
  lng: number;
  name: string;
  country?: string;
  resource?: ResourceType;
  load?: number;
}

export interface NetworkStats {
  totalNodes: number;
  activeNodes: number;
  countries: number;
  transferredBytes: number;
  bandwidthGbps: number;
  regions: Record<string, number>;
  locations: NodeLocation[];
}

export interface NetworkUsage {
  bandwidthGbps: number;
  transferredTB: number;
  daily: { date: string; bandwidthGbps: number; transferredTB: number }[];
}

export type ReferralStatus = 'pending' | 'qualified';

export interface ReferralRecord {
  id: string;
  name: string;
  status: ReferralStatus;
  date: string;
}

export interface ReferralAccount {
  account: string;
  inviteCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  lifetimeReward: number;
  level: number;
  referralsNeeded: number;
  invitedBy?: string;
  history: ReferralRecord[];
}

const LEVELS = [1, 5, 10, 25, 50];

async function ensureDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  await ensureDir();
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) return fallback;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await ensureDir();
  await writeFile(join(DATA_DIR, name), JSON.stringify(data, null, 2));
}

function safeKey(account: string): string {
  return account.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const defaultRegions = () => ({
  'North America': 5231,
  Europe: 7120,
  Asia: 12480,
  'South America': 1980,
  Africa: 2540,
  Oceania: 1452,
});

const defaultLocations = (): NodeLocation[] => [
  { lat: 40.7128, lng: -74.006, name: 'New York', country: 'US', resource: 'compute', load: 82 },
  { lat: 37.7749, lng: -122.4194, name: 'San Francisco', country: 'US', resource: 'storage', load: 74 },
  { lat: 43.651, lng: -79.347, name: 'Toronto', country: 'CA', resource: 'bandwidth', load: 61 },
  { lat: 47.6062, lng: -122.3321, name: 'Seattle', country: 'US', resource: 'compute', load: 77 },
  { lat: 41.8781, lng: -87.6298, name: 'Chicago', country: 'US', resource: 'bandwidth', load: 55 },
  { lat: 19.4326, lng: -99.1332, name: 'Mexico City', country: 'MX', resource: 'compute', load: 48 },
  { lat: -23.5505, lng: -46.6333, name: 'São Paulo', country: 'BR', resource: 'compute', load: 68 },
  { lat: -34.6037, lng: -58.3816, name: 'Buenos Aires', country: 'AR', resource: 'bandwidth', load: 42 },
  { lat: 4.711, lng: -74.0721, name: 'Bogotá', country: 'CO', resource: 'storage', load: 39 },
  { lat: 51.5074, lng: -0.1278, name: 'London', country: 'GB', resource: 'compute', load: 88 },
  { lat: 50.1109, lng: 8.6821, name: 'Frankfurt', country: 'DE', resource: 'storage', load: 79 },
  { lat: 52.3676, lng: 4.9041, name: 'Amsterdam', country: 'NL', resource: 'bandwidth', load: 72 },
  { lat: 48.8566, lng: 2.3522, name: 'Paris', country: 'FR', resource: 'compute', load: 65 },
  { lat: 52.2297, lng: 21.0122, name: 'Warsaw', country: 'PL', resource: 'bandwidth', load: 58 },
  { lat: 59.3293, lng: 18.0686, name: 'Stockholm', country: 'SE', resource: 'storage', load: 54 },
  { lat: 40.4168, lng: -3.7038, name: 'Madrid', country: 'ES', resource: 'compute', load: 60 },
  { lat: 35.6895, lng: 139.6917, name: 'Tokyo', country: 'JP', resource: 'compute', load: 91 },
  { lat: 1.3521, lng: 103.8198, name: 'Singapore', country: 'SG', resource: 'storage', load: 85 },
  { lat: 19.076, lng: 72.8777, name: 'Mumbai', country: 'IN', resource: 'bandwidth', load: 76 },
  { lat: 37.5665, lng: 126.978, name: 'Seoul', country: 'KR', resource: 'compute', load: 80 },
  { lat: 22.3193, lng: 114.1694, name: 'Hong Kong', country: 'HK', resource: 'bandwidth', load: 73 },
  { lat: 25.2048, lng: 55.2708, name: 'Dubai', country: 'AE', resource: 'bandwidth', load: 67 },
  { lat: 41.0082, lng: 28.9784, name: 'Istanbul', country: 'TR', resource: 'compute', load: 64 },
  { lat: -33.8688, lng: 151.2093, name: 'Sydney', country: 'AU', resource: 'storage', load: 71 },
  { lat: -36.8485, lng: 174.7633, name: 'Auckland', country: 'NZ', resource: 'bandwidth', load: 38 },
  { lat: -33.9249, lng: 18.4241, name: 'Cape Town', country: 'ZA', resource: 'storage', load: 45 },
  { lat: -1.2921, lng: 36.8219, name: 'Nairobi', country: 'KE', resource: 'bandwidth', load: 36 },
  { lat: 6.5244, lng: 3.3792, name: 'Lagos', country: 'NG', resource: 'compute', load: 41 },
];

export async function getNetworkStats(): Promise<NetworkStats> {
  return readJson<NetworkStats>('network.json', {
    totalNodes: 30803,
    activeNodes: 28192,
    countries: 198,
    transferredBytes: 3.07e15,
    bandwidthGbps: 0.07,
    regions: defaultRegions(),
    locations: defaultLocations(),
  });
}

function last30Days(): NetworkUsage['daily'] {
  const days: NetworkUsage['daily'] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      bandwidthGbps: 0,
      transferredTB: 0,
    });
  }
  return days;
}

export async function getNetworkUsage(account: string): Promise<NetworkUsage> {
  const key = `usage-${safeKey(account)}.json`;
  return readJson<NetworkUsage>(key, {
    bandwidthGbps: 0,
    transferredTB: 0,
    daily: last30Days(),
  });
}

function computeLevel(qualified: number): number {
  let level = 1;
  for (const threshold of LEVELS) {
    if (qualified >= threshold) level++;
  }
  return Math.min(level, LEVELS.length);
}

function computeNeeded(qualified: number): number {
  const level = computeLevel(qualified);
  if (level >= LEVELS.length) return 0;
  return LEVELS[level - 1] - qualified;
}

function makeInviteCode(account: string): string {
  const tail = account.replace(/^(account-hash-)?/, '').slice(-8).toUpperCase();
  return `CHIMERA-${tail}`;
}

export async function getReferralAccount(account: string): Promise<ReferralAccount> {
  const key = `referrals-${safeKey(account)}.json`;
  const existing = await readJson<ReferralAccount | null>(key, null);
  if (existing) return existing;
  return {
    account,
    inviteCode: makeInviteCode(account),
    totalReferrals: 0,
    qualifiedReferrals: 0,
    pendingReferrals: 0,
    lifetimeReward: 0,
    level: 1,
    referralsNeeded: 1,
    history: [],
  };
}

export async function applyReferralCode(
  account: string,
  code: string
): Promise<{ success: boolean; reward: number; account: ReferralAccount }> {
  const key = `referrals-${safeKey(account)}.json`;
  const accountData = await getReferralAccount(account);
  if (accountData.invitedBy) {
    return { success: false, reward: 0, account: accountData };
  }
  const reward = code.toUpperCase().startsWith('CHIMERA-') ? 5 : 0;
  accountData.invitedBy = code;
  accountData.lifetimeReward += reward;
  await writeJson(key, accountData);
  return { success: true, reward, account: accountData };
}

export interface VMRequest {
  id: string;
  account: string;
  name: string;
  image: string;
  config: string;
  sshKeyName?: string;
  sshPublicKey?: string;
  passwordHash?: string;
  status: 'pending' | 'provisioning' | 'running' | 'stopped' | 'error';
  createdAt: string;
  provider?: string;
  ip?: string;
}

export interface ContainerRequest {
  id: string;
  account: string;
  name: string;
  template?: string;
  configType: 'public' | 'my' | 'custom';
  port: number;
  protocol: string;
  envs: Record<string, string>;
  hardware: string;
  scaling: Record<string, string>;
  status: 'pending' | 'provisioning' | 'running' | 'stopped' | 'error';
  createdAt: string;
  url?: string;
}

export async function createVM(account: string, payload: Omit<VMRequest, 'id' | 'account' | 'status' | 'createdAt'>): Promise<VMRequest> {
  const vms = await listVMs(account);
  const vm: VMRequest = {
    ...payload,
    id: `vm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    account,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  vms.push(vm);
  await writeJson(`vms-${safeKey(account)}.json`, vms);
  return vm;
}

export async function listVMs(account: string): Promise<VMRequest[]> {
  return readJson<VMRequest[]>(`vms-${safeKey(account)}.json`, []);
}

export async function createContainer(
  account: string,
  payload: Omit<ContainerRequest, 'id' | 'account' | 'status' | 'createdAt'>
): Promise<ContainerRequest> {
  const containers = await listContainers(account);
  const container: ContainerRequest = {
    ...payload,
    id: `container-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    account,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  containers.push(container);
  await writeJson(`containers-${safeKey(account)}.json`, containers);
  return container;
}

export async function listContainers(account: string): Promise<ContainerRequest[]> {
  return readJson<ContainerRequest[]>(`containers-${safeKey(account)}.json`, []);
}
