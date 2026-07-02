import type { NetworkStats, NetworkUsage, ReferralAccount } from '../types';

const API_BASE = ((import.meta.env as any).VITE_API_URL as string) || '/api';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getNetworkStats(): Promise<NetworkStats> {
  return api<NetworkStats>('/network/stats');
}

export function getNetworkUsage(account?: string): Promise<NetworkUsage> {
  const key = account || 'anonymous';
  return api<NetworkUsage>(`/network/usage/${encodeURIComponent(key)}`);
}

export function getReferralSummary(account?: string): Promise<ReferralAccount> {
  const key = account || 'anonymous';
  return api<ReferralAccount>(`/referrals/${encodeURIComponent(key)}`);
}

export function applyReferralCode(
  account: string,
  code: string
): Promise<{ success: boolean; reward: number; account: ReferralAccount }> {
  return api<{ success: boolean; reward: number; account: ReferralAccount }>(
    `/referrals/${encodeURIComponent(account)}/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }
  );
}
