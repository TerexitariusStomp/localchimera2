const ANYONE_API_URL = process.env.ANYONE_API_URL || 'http://localhost:9001';

export async function provisionAnyone({ quantity, recipient, duration }) {
  console.log(`[anyone] provisioning ${quantity} GB bandwidth for ${recipient}`);

  let endpoint = null;
  let sessionId = null;
  try {
    const res = await fetch(`${ANYONE_API_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer: recipient,
        bandwidth_gb: quantity || 1,
        duration_hours: duration || 1,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      endpoint = json.endpoint || `${ANYONE_API_URL}/session/${json.session_id}`;
      sessionId = json.session_id || `anyone-${Date.now()}`;
    } else {
      console.warn(`[anyone] session request failed: ${res.status}`);
    }
  } catch (e) {
    console.warn(`[anyone] session failed: ${e.message}`);
  }

  return {
    id: sessionId || `anyone-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    endpoint,
    bandwidthGb: quantity || 1,
    duration: duration || 1,
    apiUrl: ANYONE_API_URL,
  };
}
