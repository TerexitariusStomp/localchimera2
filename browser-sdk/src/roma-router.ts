// @ts-nocheck
/**
 * RomaRouter — Integrates ROMA (Recursive Open Meta-Agent) as a task router
 * for Chimera's network of browser/container nodes.
 *
 * ROMA decomposes complex tasks into atomic subtasks via:
 *   Atomizer → Planner → Executor → Aggregator → Verifier
 *
 * This module acts as a Chimera-side bridge that:
 *   1. Receives ROMA subtasks (via REST API or direct call)
 *   2. Maps ROMA TaskType → Chimera taskType
 *   3. Dispatches to the appropriate BrowserNode handler
 *   4. Returns results back to ROMA for aggregation
 *
 * ROMA TaskType → Chimera taskType mapping:
 *   RETRIVE       → INFERENCE (query existing knowledge)
 *   WRITE         → INFERENCE (generate text)
 *   THINK         → INFERENCE (reasoning)
 *   CODE_INTERPRET→ COMPUTE (execute code)
 *   IMAGE_GEN     → INFERENCE (image generation model)
 *
 * Usage (browser):
 *   import { RomaRouter } from '@localchimera/browser-sdk';
 *   const router = new RomaRouter(browserNode);
 *   const result = await router.executeSubtask({
 *     goal: "Summarize the latest AI news",
 *     task_type: "RETRIEVE",
 *     dependencies: [],
 *   });
 *
 * Usage (container REST API):
 *   POST /api/roma/task
 *   { "goal": "...", "task_type": "CODE_INTERPRET", "context": {...} }
 */

import { TASK_TYPE } from './browser-node';

export type RomaTaskType =
  | 'RETRIEVE'
  | 'WRITE'
  | 'THINK'
  | 'CODE_INTERPRET'
  | 'IMAGE_GEN';

export interface RomaSubTask {
  goal: string;
  task_type: RomaTaskType;
  dependencies?: string[];
  context?: Record<string, any>;
  call_params?: Record<string, any>;
}

export interface RomaExecutionResult {
  output: string;
  sources?: string[];
  task_type: RomaTaskType;
  chimera_task_type: number;
  node_id: string;
  execution_time_ms: number;
  proof?: string;
}

// Map ROMA task types to Chimera task types
const ROMA_TO_CHIMERA: Record<RomaTaskType, number> = {
  RETRIVE: TASK_TYPE.INFERENCE,
  WRITE: TASK_TYPE.INFERENCE,
  THINK: TASK_TYPE.INFERENCE,
  CODE_INTERPRET: TASK_TYPE.COMPUTE,
  IMAGE_GEN: TASK_TYPE.INFERENCE,
};

export class RomaRouter {
  private node: any;
  private log: (level: string, msg: string) => void;
  private jobsRouted: number = 0;
  private jobsSucceeded: number = 0;
  private jobsFailed: number = 0;

  constructor(node: any, logFn?: (level: string, msg: string) => void) {
    this.node = node;
    this.log = logFn || ((level, msg) => console[level](`[ROMA] ${msg}`));
  }

  /**
   * Execute a ROMA subtask by routing it to the appropriate Chimera node handler.
   */
  async executeSubtask(subtask: RomaSubTask): Promise<RomaExecutionResult> {
    const startTime = Date.now();
    this.jobsRouted++;
    const chimeraType = ROMA_TO_CHIMERA[subtask.task_type] ?? TASK_TYPE.INFERENCE;

    this.log('info', `Routing subtask [${subtask.task_type}] → Chimera type ${chimeraType}: "${subtask.goal.slice(0, 80)}..."`);

    try {
      let output: string;
      let proof: string | undefined;

      if (chimeraType === TASK_TYPE.INFERENCE) {
        const result = await this._routeInference(subtask);
        output = result.output;
        proof = result.proof;
      } else if (chimeraType === TASK_TYPE.COMPUTE) {
        const result = await this._routeCompute(subtask);
        output = result.output;
        proof = result.proof;
      } else if (chimeraType === TASK_TYPE.STORAGE) {
        const result = await this._routeStorage(subtask);
        output = result.output;
        proof = result.proof;
      } else if (chimeraType === TASK_TYPE.BANDWIDTH) {
        const result = await this._routeBandwidth(subtask);
        output = result.output;
        proof = result.proof;
      } else {
        output = await this._fallbackInference(subtask);
      }

      this.jobsSucceeded++;
      const elapsed = Date.now() - startTime;
      this.log('success', `Subtask completed in ${elapsed}ms (${output.length} chars)`);

      return {
        output,
        task_type: subtask.task_type,
        chimera_task_type: chimeraType,
        node_id: this.node.accountHashHex || 'browser',
        execution_time_ms: elapsed,
        proof,
      };
    } catch (e: any) {
      this.jobsFailed++;
      const elapsed = Date.now() - startTime;
      this.log('error', `Subtask failed after ${elapsed}ms: ${e.message}`);

      return {
        output: `Error: ${e.message}`,
        task_type: subtask.task_type,
        chimera_task_type: chimeraType,
        node_id: this.node.accountHashHex || 'browser',
        execution_time_ms: elapsed,
      };
    }
  }

  /**
   * Execute a full ROMA pipeline (atomize → plan → execute → aggregate).
   * This is a lightweight in-browser implementation that doesn't require
   * the Python ROMA server. It uses the browser node's inference capability
   * for atomization, planning, and aggregation.
   */
  async solve(goal: string, opts?: {
    maxDepth?: number;
    maxSubtasks?: number;
  }): Promise<string> {
    const maxDepth = opts?.maxDepth ?? 3;
    const maxSubtasks = opts?.maxSubtasks ?? 5;

    this.log('info', `ROMA solve: "${goal.slice(0, 100)}..."`);

    // Step 1: Atomize — decide if this is atomic or needs planning
    const atomized = await this._atomize(goal);

    if (atomized.isAtomic) {
      // Direct execution
      const result = await this.executeSubtask({
        goal,
        task_type: atomized.taskType,
      });
      return result.output;
    }

    // Step 2: Plan — decompose into subtasks
    const subtasks = await this._plan(goal, maxSubtasks);
    this.log('info', `Planned ${subtasks.length} subtasks`);

    // Step 3: Execute each subtask (sequentially for dependency safety)
    const results: RomaExecutionResult[] = [];
    for (const subtask of subtasks) {
      if (subtask.dependencies && subtask.dependencies.length > 0) {
        // Inject dependency results into context
        const depResults = subtask.dependencies
          .map((dep) => results.find((r) => r.task_type === dep))
          .filter(Boolean);
        subtask.context = {
          ...(subtask.context || {}),
          dependency_results: depResults.map((r) => r.output),
        };
      }
      const result = await this.executeSubtask(subtask);
      results.push(result);
    }

    // Step 4: Aggregate — combine results
    const aggregated = await this._aggregate(goal, results);

    // Step 5: Verify
    const verified = await this._verify(goal, aggregated);

    if (!verified.pass) {
      this.log('warn', `Verification failed: ${verified.feedback}`);
      // Retry once with feedback
      const retryResult = await this.executeSubtask({
        goal: `${goal}\n\nPrevious attempt feedback: ${verified.feedback}`,
        task_type: 'WRITE',
        context: { previous_results: results.map((r) => r.output) },
      });
      return retryResult.output;
    }

    return aggregated;
  }

  // ─── Internal: ROMA stages implemented via browser inference ────

  private async _atomize(goal: string): Promise<{ isAtomic: boolean; taskType: RomaTaskType }> {
    const prompt = `Analyze this task and determine if it's atomic (can be done in one step) or complex (needs decomposition).\nTask: "${goal}"\n\nRespond with JSON: {"is_atomic": true/false, "task_type": "RETRIEVE|WRITE|THINK|CODE_INTERPRET|IMAGE_GEN"}`;

    try {
      const output = await this._infer(prompt);
      const parsed = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        isAtomic: parsed.is_atomic ?? true,
        taskType: (parsed.task_type as RomaTaskType) || 'THINK',
      };
    } catch {
      // Default: treat as atomic THINK task
      return { isAtomic: true, taskType: 'THINK' };
    }
  }

  private async _plan(goal: string, maxSubtasks: number): Promise<RomaSubTask[]> {
    const prompt = `Break down this task into at most ${maxSubtasks} subtasks. Each subtask should be atomic.\nTask: "${goal}"\n\nRespond with JSON array: [{"goal": "...", "task_type": "RETRIEVE|WRITE|THINK|CODE_INTERPRET", "dependencies": []}]`;

    try {
      const output = await this._infer(prompt);
      const parsed = JSON.parse(output.match(/\[[\s\S]*\]/)?.[0] || '[]');
      return (Array.isArray(parsed) ? parsed : []).slice(0, maxSubtasks).map((s: any) => ({
        goal: s.goal || '',
        task_type: (s.task_type as RomaTaskType) || 'THINK',
        dependencies: s.dependencies || [],
      }));
    } catch {
      return [{ goal, task_type: 'THINK' as RomaTaskType }];
    }
  }

  private async _aggregate(goal: string, results: RomaExecutionResult[]): Promise<string> {
    const prompt = `Combine these subtask results into a coherent answer for the original task.\n\nOriginal task: "${goal}"\n\nSubtask results:\n${results.map((r, i) => `${i + 1}. [${r.task_type}] ${r.output}`).join('\n')}\n\nProvide a unified answer:`;

    return await this._infer(prompt);
  }

  private async _verify(goal: string, answer: string): Promise<{ pass: boolean; feedback: string }> {
    const prompt = `Verify if this answer adequately addresses the task.\n\nTask: "${goal}"\nAnswer: "${answer.slice(0, 500)}"\n\nRespond with JSON: {"verdict": true/false, "feedback": "..."}`;

    try {
      const output = await this._infer(prompt);
      const parsed = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return { pass: parsed.verdict ?? true, feedback: parsed.feedback || '' };
    } catch {
      return { pass: true, feedback: '' };
    }
  }

  // ─── Internal: task type routers ────────────────────────────────

  private async _routeInference(subtask: RomaSubTask): Promise<{ output: string; proof?: string }> {
    const messages = this._buildMessages(subtask);
    const maxTokens = subtask.call_params?.max_tokens || 512;
    const temperature = subtask.call_params?.temperature ?? 0.7;

    if (this.node.infer) {
      const result = await this.node.infer({ messages, maxTokens, temperature });
      return { output: result?.content || result?.output || String(result || '') };
    }

    // Fallback: use _handleInferenceJob directly
    if (this.node._handleInferenceJob) {
      const proof = await this.node._handleInferenceJob(subtask.goal);
      return { output: proof, proof };
    }

    return { output: await this._fallbackInference(subtask) };
  }

  private async _routeCompute(subtask: RomaSubTask): Promise<{ output: string; proof?: string }> {
    const code = subtask.context?.code || subtask.goal;
    const runtime = subtask.context?.runtime || 'javascript';

    if (this.node._handleComputeJob) {
      const result = await this.node._handleComputeJob(`COMPUTE:${runtime}:${code}`);
      return { output: result, proof: result };
    }

    // Try network adapter
    const golemAdapter = this.node.networkAdapters?.find((a: any) => a.networkName === 'golem');
    if (golemAdapter?.executeCompute) {
      const output = await golemAdapter.executeCompute(code, runtime);
      return { output };
    }

    return { output: `Compute not available: ${subtask.goal.slice(0, 100)}` };
  }

  private async _routeStorage(subtask: RomaSubTask): Promise<{ output: string; proof?: string }> {
    if (this.node._handleStorageJob) {
      const result = await this.node._handleStorageJob(subtask.goal);
      return { output: result, proof: result };
    }

    const btfsAdapter = this.node.networkAdapters?.find((a: any) => a.networkName === 'btfs');
    if (btfsAdapter?.storeData) {
      const data = new TextEncoder().encode(subtask.goal);
      const cid = await btfsAdapter.storeData(data);
      return { output: `Stored: ${cid}`, proof: cid };
    }

    return { output: `Storage not available: ${subtask.goal.slice(0, 100)}` };
  }

  private async _routeBandwidth(subtask: RomaSubTask): Promise<{ output: string; proof?: string }> {
    if (this.node._handleBandwidthJob) {
      const result = await this.node._handleBandwidthJob(subtask.goal);
      return { output: result, proof: result };
    }

    return { output: `Bandwidth relay active for: ${subtask.goal.slice(0, 100)}` };
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private _buildMessages(subtask: RomaSubTask): any[] {
    const messages: any[] = [];

    if (subtask.context?.system_prompt) {
      messages.push({ role: 'system', content: subtask.context.system_prompt });
    }

    if (subtask.context?.dependency_results) {
      const depText = subtask.context.dependency_results.join('\n\n');
      messages.push({ role: 'system', content: `Previous subtask results:\n${depText}` });
    }

    messages.push({ role: 'user', content: subtask.goal });
    return messages;
  }

  private async _infer(prompt: string): Promise<string> {
    if (this.node.infer) {
      const result = await this.node.infer({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
        temperature: 0.3,
      });
      return result?.content || result?.output || String(result || '');
    }

    if (this.node._handleInferenceJob) {
      return await this.node._handleInferenceJob(prompt);
    }

    return '';
  }

  private async _fallbackInference(subtask: RomaSubTask): Promise<string> {
    this.log('warn', `No inference engine available, returning goal as-is`);
    return `Unable to process: ${subtask.goal.slice(0, 200)}`;
  }

  // ─── Status ─────────────────────────────────────────────────────

  status() {
    return {
      router: 'roma',
      jobsRouted: this.jobsRouted,
      jobsSucceeded: this.jobsSucceeded,
      jobsFailed: this.jobsFailed,
      nodeId: this.node?.accountHashHex || 'unknown',
    };
  }
}

/**
 * ROMA-compatible REST API handler.
 * Mount this on an Express/http server to accept ROMA subtasks via HTTP.
 *
 * Usage:
 *   const handler = createRomaApiHandler(router);
 *   // In your route handler:
 *   // POST /api/roma/task → handler(req, res)
 */
export function createRomaApiHandler(router: RomaRouter) {
  return async (req: any, res: any) => {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { goal, task_type, dependencies, context, call_params } = body;

      if (!goal) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "goal" field' }));
        return;
      }

      const result = await router.executeSubtask({
        goal,
        task_type: task_type || 'THINK',
        dependencies: dependencies || [],
        context: context || {},
        call_params: call_params || {},
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  };
}
