const BTT_AI_API_URL = process.env.BTT_AI_API_URL || 'http://localhost:8000';

export async function provisionBttAi({ quantity, recipient, prompt, model }) {
  console.log(`[btt-ai] provisioning ${quantity}K tokens for ${recipient}`);

  let output = null;
  try {
    const res = await fetch(`${BTT_AI_API_URL}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama-3.2-1b',
        prompt: prompt || 'Hello',
        max_tokens: (quantity || 512) * 1000,
        temperature: 0.7,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      output = data.choices?.[0]?.text || data.output || data.response || '';
    } else {
      console.warn(`[btt-ai] inference failed: ${res.status}`);
    }
  } catch (e) {
    console.warn(`[btt-ai] inference call failed: ${e.message}`);
  }

  return {
    id: `bttai-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    output,
    apiUrl: BTT_AI_API_URL,
  };
}
