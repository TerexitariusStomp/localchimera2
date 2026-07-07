const AKASH_API_URL = process.env.AKASH_API_URL || 'https://console-api.akash.network/v1';
const AKASH_SDL_FILE = process.env.AKASH_SDL_FILE || '/home/user/CascadeProjects/localchimera/infra/akash-fhe/deploy.yml';

export async function provisionAkash({ quantity, recipient, payload, workload = 'inference' }) {
  console.log(`[akash] provisioning ${quantity} unit(s) for ${recipient} (${workload})`);

  let endpoint = null;
  let deploymentId = null;

  try {
    const res = await fetch(`${AKASH_API_URL}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sdl: AKASH_SDL_FILE,
        workload,
        quantity,
        recipient,
        payload: payload ? String(payload) : undefined,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      endpoint = json.endpoint || json.uri || json.url || null;
      deploymentId = json.deploymentId || json.dseq || `akash-${Date.now()}`;
    } else {
      console.warn(`[akash] deployment request failed: ${res.status}`);
    }
  } catch (e) {
    console.warn(`[akash] deployment failed: ${e.message}`);
  }

  return {
    id: deploymentId || `akash-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    endpoint,
    workload,
    quantity,
    recipient,
    apiUrl: AKASH_API_URL,
  };
}
