import FHEContext from './seal-context';

let fhePromise: Promise<FHEContext> | null = null;

export function getFHEContext(): Promise<FHEContext> {
  if (!fhePromise) {
    fhePromise = FHEContext.create();
  }
  return fhePromise;
}

export async function submitFHEJob(
  accountHash: string,
  prompt: string,
  circuit = 'shift:1'
): Promise<{ jobId: string; status: string; circuit: string }> {
  const ctx = await getFHEContext();
  const encryptedPrompt = ctx.encryptString(prompt);
  const keys = ctx.exportKeys();
  const res = await fetch('/api/fhe/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountHash,
      encryptedPrompt,
      publicKey: keys.publicKey,
      relinKeys: keys.relinKeys,
      galoisKeys: keys.galoisKeys,
      circuit,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Failed to create FHE job (${res.status})`);
  }
  return await res.json();
}

export async function pollFHEResult(
  jobId: string,
  timeoutMs = 30000,
  intervalMs = 500
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/fhe/jobs/${jobId}/result`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Failed to poll FHE job (${res.status})`);
    }
    const data = await res.json();
    if (data.status === 'complete') return data.encryptedResult as string;
    if (data.status === 'failed') throw new Error(data.error || 'FHE job failed');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('FHE job timed out');
}

export async function decryptFHEResult(encryptedResult: string): Promise<string> {
  const ctx = await getFHEContext();
  return ctx.decryptString(encryptedResult);
}
