import fetch from 'node-fetch';

const STREAMR_NODE_PRIVATE_KEY = process.env.STREAMR_NODE_PRIVATE_KEY;
const STREAMR_STREAM_ID = process.env.STREAMR_STREAM_ID;
const STREAMR_API_URL = process.env.STREAMR_API_URL || 'https://streamr.network/api';

export async function publishTelemetry(payload) {
  if (!STREAMR_NODE_PRIVATE_KEY || !STREAMR_STREAM_ID) {
    console.warn('[streamr] missing config; skipping telemetry');
    return { skipped: true };
  }
  const res = await fetch(`${STREAMR_API_URL}/streams/${encodeURIComponent(STREAMR_STREAM_ID)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STREAMR_NODE_PRIVATE_KEY}`,
    },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Streamr API ${res.status}: ${body}`);
  }
  return { success: true };
}
