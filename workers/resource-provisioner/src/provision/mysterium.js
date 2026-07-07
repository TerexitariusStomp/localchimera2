const MYSTERIUM_API_URL = process.env.MYSTERIUM_API_URL || 'http://localhost:4050';

export async function provisionMysterium({ quantity, recipient, duration }) {
  console.log(`[mysterium] provisioning ${quantity} GB for ${recipient}`);

  let endpoint = null;
  try {
    const proposalRes = await fetch(`${MYSTERIUM_API_URL}/proposals`, { headers: { Accept: 'application/json' } });
    if (proposalRes.ok) {
      const proposals = (await proposalRes.json()).proposals || [];
      const proposal = proposals[0];
      if (proposal) {
        const connectRes = await fetch(`${MYSTERIUM_API_URL}/connection`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consumer_id: recipient,
            provider_id: proposal.provider_id,
            service_type: proposal.service_type || 'wireguard',
          }),
        });
        if (connectRes.ok) {
          const conn = await connectRes.json();
          endpoint = conn.ip || conn.session_id || proposal.provider_id;
        }
      }
    }
  } catch (e) {
    console.warn(`[mysterium] connection failed: ${e.message}`);
  }

  return {
    id: `myst-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    endpoint,
    duration: duration || 1,
    apiUrl: MYSTERIUM_API_URL,
  };
}
