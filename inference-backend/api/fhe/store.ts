import { FHEContext } from './seal-context.js';

export type FHEJobStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface FHEJob {
  jobId: string;
  accountHash: string;
  encryptedPrompt: string;
  publicKey?: string;
  relinKeys?: string;
  galoisKeys?: string;
  circuit: string;
  status: FHEJobStatus;
  encryptedResult?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const jobs = new Map<string, FHEJob>();

let processor: FHEContext | null = null;

export async function getProcessor(): Promise<FHEContext> {
  if (!processor) {
    processor = await FHEContext.create();
  }
  return processor;
}

export function createFHEJob(input: {
  accountHash: string;
  encryptedPrompt: string;
  publicKey?: string;
  relinKeys?: string;
  galoisKeys?: string;
  circuit?: string;
}): FHEJob {
  const jobId = `fhe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: FHEJob = {
    jobId,
    accountHash: input.accountHash,
    encryptedPrompt: input.encryptedPrompt,
    publicKey: input.publicKey,
    relinKeys: input.relinKeys,
    galoisKeys: input.galoisKeys,
    circuit: input.circuit || 'shift:1',
    status: 'pending',
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getFHEJob(jobId: string): FHEJob | undefined {
  return jobs.get(jobId);
}

export function setFHEResult(jobId: string, encryptedResult: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.encryptedResult = encryptedResult;
  job.status = 'complete';
  job.completedAt = Date.now();
  return true;
}

export function setFHEError(jobId: string, error: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.error = error;
  job.status = 'failed';
  job.completedAt = Date.now();
  return true;
}

export function listFHEJobsForAccount(accountHash: string): FHEJob[] {
  return Array.from(jobs.values())
    .filter((j) => j.accountHash === accountHash)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function processPendingFHEJobs(): Promise<void> {
  const ctx = await getProcessor();
  for (const job of jobs.values()) {
    if (job.status !== 'pending') continue;
    try {
      job.status = 'processing';
      const result = ctx.runCircuit(job.encryptedPrompt, job.circuit);
      setFHEResult(job.jobId, result);
    } catch (err) {
      setFHEError(job.jobId, (err as Error).message);
    }
  }
}

export function startFHEProcessor(intervalMs = 1000): () => void {
  const id = setInterval(() => {
    processPendingFHEJobs().catch(() => {});
  }, intervalMs);
  return () => clearInterval(id);
}
