export interface Deployment {
  id: string;
  name: string;
  image: string;
  status: 'active' | 'pending' | 'closed';
  cpu: number;
  gpu: number;
  memory: number;
  storage: number;
  created: string;
  cost: string;
  owner: string;
}

const STORAGE_KEY = 'chimera-deployments';

export function getDeployments(walletId: string | null): Deployment[] {
  if (!walletId) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, Deployment[]>;
    return all[walletId] || [];
  } catch {
    return [];
  }
}

export function saveDeployment(walletId: string, deployment: Deployment) {
  if (!walletId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: Record<string, Deployment[]> = raw ? JSON.parse(raw) : {};
    if (!all[walletId]) all[walletId] = [];
    all[walletId].unshift(deployment);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function deleteDeployment(walletId: string, deploymentId: string) {
  if (!walletId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const all: Record<string, Deployment[]> = JSON.parse(raw);
    if (!all[walletId]) return;
    all[walletId] = all[walletId].filter((d) => d.id !== deploymentId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function closeDeployment(walletId: string, deploymentId: string) {
  if (!walletId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const all: Record<string, Deployment[]> = JSON.parse(raw);
    if (!all[walletId]) return;
    const d = all[walletId].find((d) => d.id === deploymentId);
    if (d) d.status = 'closed';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
