import fetch from 'node-fetch';

const MYSTERIUM_API_URL = process.env.MYSTERIUM_API_URL;

export async function openTunnel({ deploymentId, targetHost }) {
  if (!MYSTERIUM_API_URL) {
    console.warn('[mysterium] missing config; skipping tunnel');
    return { endpoint: null };
  }
  const res = await fetch(`${MYSTERIUM_API_URL}/connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumerId: deploymentId,
      providerId: 'auto',
      serviceType: 'wireguard',
      options: { targetHost },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mysterium API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return {
    endpoint: data.endpoint || `https://tunnel-${deploymentId}.mysterium.network`,
    consumerId: data.consumerId,
  };
}

export async function closeTunnel(deploymentId) {
  if (!MYSTERIUM_API_URL) {
    return { skipped: true };
  }
  const res = await fetch(`${MYSTERIUM_API_URL}/connection/${deploymentId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mysterium API ${res.status}: ${body}`);
  }
  return { success: true };
}
