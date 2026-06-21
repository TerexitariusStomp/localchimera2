/**
 * Inference backends for the Chimera-Fortytwo node.
 *
 * Supports:
 * - mock: deterministic mock responses for testing
 * - python: HTTP bridge to Python ONNX/Transformers runtime
 * - onnx: direct Node.js ONNX Runtime (placeholder)
 */

import { InferenceRequest, InferenceResult, NodeConfig, NodeError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface InferenceBackend {
  initialize(): Promise<void>;
  run(request: InferenceRequest): Promise<InferenceResult>;
  health(): Promise<boolean>;
  teardown(): Promise<void>;
}

// ─── Mock Backend ───────────────────────────────────────────────────────────

class MockBackend implements InferenceBackend {
  async initialize(): Promise<void> {
    logger.info('Mock inference backend initialized');
  }

  async run(request: InferenceRequest): Promise<InferenceResult> {
    const start = Date.now();

    // Simulate compute time
    await new Promise((r) => setTimeout(r, Math.random() * 200 + 50));

    const output = `[MOCK] Result for model ${request.modelId} with prompt: "${request.prompt.slice(0, 40)}..."`;

    return {
      jobId: request.jobId,
      output,
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(output.length / 4),
        totalTokens: Math.ceil((request.prompt.length + output.length) / 4),
        computeMs: Date.now() - start,
        memoryPeakMB: 128 + Math.floor(Math.random() * 256),
      },
    };
  }

  async health(): Promise<boolean> {
    return true;
  }

  async teardown(): Promise<void> {}
}

// ─── Python Bridge Backend ─────────────────────────────────────────────────

class PythonBridgeBackend implements InferenceBackend {
  private url: string;
  private healthy = false;

  constructor(url: string) {
    this.url = url;
  }

  async initialize(): Promise<void> {
    logger.info({ url: this.url }, 'Python bridge backend initializing');
    await this.health();
  }

  async run(request: InferenceRequest): Promise<InferenceResult> {
    const start = Date.now();

    const response = await fetch(`${this.url}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: request.jobId,
        model_id: request.modelId,
        prompt: request.prompt,
        params: request.params,
      }),
    });

    if (!response.ok) {
      throw new NodeError(
        'EXECUTION_TIMEOUT',
        `Python bridge returned ${response.status}`,
        true,
        5000
      );
    }

    const data = (await response.json()) as {
      output: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        memory_peak_mb?: number;
      };
    };

    return {
      jobId: request.jobId,
      output: data.output,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        computeMs: Date.now() - start,
        memoryPeakMB: data.usage?.memory_peak_mb || 0,
      },
    };
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/health`, { method: 'GET' });
      this.healthy = res.ok;
      return this.healthy;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  async teardown(): Promise<void> {}
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createInferenceBackend(cfg: NodeConfig): InferenceBackend {
  switch (cfg.inferenceBackend) {
    case 'python':
      if (!cfg.pythonInferenceUrl) {
        throw new NodeError(
          'INVALID_JOB',
          'PYTHON_INFERENCE_URL required when INFERENCE_BACKEND=python'
        );
      }
      return new PythonBridgeBackend(cfg.pythonInferenceUrl);
    case 'onnx':
      logger.warn('ONNX direct backend not yet implemented; falling back to mock');
      return new MockBackend();
    case 'mock':
    default:
      return new MockBackend();
  }
}
