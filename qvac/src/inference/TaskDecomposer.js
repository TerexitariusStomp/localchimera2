import { Logger } from '../core/Logger.js';

/**
 * TaskDecomposer — breaks complex inference requests into sub-tasks
 * that can be distributed across peers for parallel execution.
 *
 * Inspired by daemon-hive-swarm's task decomposition: when a request
 * is too complex for a single inference call, decompose it into
 * smaller sub-tasks, execute them in parallel (locally or via P2P
 * delegation), then synthesize the results.
 *
 * Decomposition strategies:
 *   1. LLM-based: ask the model to break the request into steps
 *   2. Heuristic: split multi-part questions, code with explanations, etc.
 *   3. Manual: caller provides sub-tasks explicitly
 *
 * Execution:
 *   - Sub-tasks run in parallel via Promise.all
 *   - Each sub-task can be routed to a different peer (via InferenceRouter)
 *   - Results are synthesized into a final answer
 *
 * Integration: sits between the API layer and InferenceRouter/InferenceLayer.
 */

const DECOMPOSE_PROMPT = `You are a task decomposer. Break the following request into 2-4 independent sub-tasks that can be executed in parallel. Each sub-task should be a self-contained prompt. Output ONLY a JSON array of strings, no explanation.

Request:`;

const SYNTHESIZE_PROMPT = `You are a result synthesizer. Combine the following sub-task results into a single coherent answer. Remove redundancy and ensure logical flow. Output only the final answer.

Sub-task results:`;

const MAX_SUBTASKS = 4;
const MIN_COMPLEXITY_SCORE = 3;

export class TaskDecomposer {
  constructor(config = {}) {
    this.logger = new Logger('TaskDecomposer');
    this.enabled = config.enabled !== false;
    this.maxSubtasks = config.maxSubtasks || MAX_SUBTASKS;
    this.minComplexity = config.minComplexity || MIN_COMPLEXITY_SCORE;
    this._stats = {
      totalDecomposed: 0,
      totalSubtasks: 0,
      totalSynthesized: 0,
      avgSubtaskCount: 0,
    };
  }

  /**
   * Assess the complexity of a request on a 1-5 scale.
   * Higher = more likely to benefit from decomposition.
   */
  assessComplexity(prompt) {
    let score = 0;
    const len = prompt.length;
    if (len > 500) score++;
    if (len > 1500) score++;
    // Multi-part questions
    if (/\b(also|additionally|furthermore|then|after that|next)\b/i.test(prompt)) score++;
    // Code requests with explanation
    if (/\b(code|function|implement|write a (script|program))\b/i.test(prompt) && /\b(explain|describe|why|how)\b/i.test(prompt)) score++;
    // Comparison requests
    if (/\b(compare|versus|vs|difference between|pros and cons)\b/i.test(prompt)) score++;
    // List/research requests
    if (/\b(list all|enumerate|research|analyze|summarize each)\b/i.test(prompt)) score++;
    return Math.min(score, 5);
  }

  /**
   * Decompose a request into sub-tasks using LLM.
   * @param {string} prompt - the original request
   * @param {object} options - { inferenceLayer, router, strategy }
   * @returns { subTasks, complexity }
   */
  async decompose(prompt, options = {}) {
    if (!this.enabled) return { subTasks: [prompt], complexity: 0, decomposed: false };

    const complexity = this.assessComplexity(prompt);
    if (complexity < this.minComplexity) {
      this.logger.debug(`Complexity ${complexity} < ${this.minComplexity}, skipping decomposition`);
      return { subTasks: [prompt], complexity, decomposed: false };
    }

    // Try LLM-based decomposition
    if (options.inferenceLayer) {
      try {
        const result = await options.inferenceLayer.handleInferenceRequest({
          prompt: `${DECOMPOSE_PROMPT}\n${prompt}`,
          maxTokens: 256,
          temperature: 0.3,
          source: 'task-decomposer',
        });

        const subTasks = this._parseSubTasks(result.output);
        if (subTasks && subTasks.length > 1) {
          this._stats.totalDecomposed++;
          this._stats.totalSubtasks += subTasks.length;
          this._updateAvgSubtasks(subTasks.length);
          this.logger.info(`Decomposed request into ${subTasks.length} sub-tasks (complexity: ${complexity})`);
          return { subTasks: subTasks.slice(0, this.maxSubtasks), complexity, decomposed: true };
        }
      } catch (e) {
        this.logger.warn(`LLM decomposition failed: ${e.message}`);
      }
    }

    // Fallback: heuristic decomposition
    const heuristicTasks = this._heuristicDecompose(prompt);
    if (heuristicTasks.length > 1) {
      this._stats.totalDecomposed++;
      this._stats.totalSubtasks += heuristicTasks.length;
      this._updateAvgSubtasks(heuristicTasks.length);
      return { subTasks: heuristicTasks, complexity, decomposed: true };
    }

    return { subTasks: [prompt], complexity, decomposed: false };
  }

  /**
   * Execute sub-tasks in parallel and synthesize results.
   * @param {Array} subTasks - array of prompt strings
   * @param {object} executor - { inferenceLayer, router } for executing sub-tasks
   * @param {object} options - { maxTokens, temperature }
   * @returns { output, subResults, synthesized }
   */
  async executeAndSynthesize(subTasks, executor, options = {}) {
    const { maxTokens = 256, temperature = 0.7 } = options;

    // Execute all sub-tasks in parallel
    const promises = subTasks.map(async (task, i) => {
      try {
        if (executor.router) {
          const result = await executor.router.routeInferenceRequest(
            { prompt: task, maxTokens, temperature },
            `decomposed-${i}`
          );
          return result.result?.output || result.output || '';
        } else if (executor.inferenceLayer) {
          const result = await executor.inferenceLayer.handleInferenceRequest({
            prompt: task,
            maxTokens,
            temperature,
            source: `decomposed-${i}`,
          });
          return result.output || '';
        }
        return '';
      } catch (e) {
        this.logger.warn(`Sub-task ${i} failed: ${e.message}`);
        return '';
      }
    });

    const subResults = await Promise.all(promises);

    // If only one sub-task, return directly
    if (subResults.length === 1) {
      return { output: subResults[0], subResults, synthesized: false };
    }

    // Synthesize results
    let synthesized;
    if (executor.inferenceLayer) {
      try {
        const combinedResults = subResults.map((r, i) => `[Result ${i + 1}]: ${r}`).join('\n\n');
        const synthResult = await executor.inferenceLayer.handleInferenceRequest({
          prompt: `${SYNTHESIZE_PROMPT}\n${combinedResults}`,
          maxTokens: 512,
          temperature: 0.5,
          source: 'task-synthesizer',
        });
        synthesized = synthResult.output || subResults.join('\n\n');
        this._stats.totalSynthesized++;
      } catch (e) {
        this.logger.warn(`Synthesis failed, concatenating: ${e.message}`);
        synthesized = subResults.join('\n\n---\n\n');
      }
    } else {
      synthesized = subResults.join('\n\n---\n\n');
    }

    return { output: synthesized, subResults, synthesized: true };
  }

  /**
   * Parse sub-tasks from LLM output (expects JSON array of strings).
   */
  _parseSubTasks(output) {
    if (!output) return null;
    try {
      const trimmed = output.trim();
      const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
          return parsed;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Heuristic decomposition: split on conjunctions and multi-part markers.
   */
  _heuristicDecompose(prompt) {
    const tasks = [];

    // Split on "also", "additionally", "then", "next"
    const parts = prompt.split(/\s+(?:also|additionally|furthermore|then|after that|next)\s+/i);
    if (parts.length > 1) {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 20) tasks.push(trimmed);
      }
    }

    // Split numbered lists
    if (tasks.length <= 1) {
      const numbered = prompt.match(/\d+\.\s+(.+?)(?=\d+\.\s+|$)/gs);
      if (numbered && numbered.length > 1) {
        tasks.push(...numbered.map(n => n.replace(/^\d+\.\s+/, '').trim()).filter(t => t.length > 10));
      }
    }

    // Split on question marks (multiple questions)
    if (tasks.length <= 1) {
      const questions = prompt.split(/\?+/).filter(q => q.trim().length > 20);
      if (questions.length > 1) {
        tasks.push(...questions.map(q => q.trim() + '?'));
      }
    }

    return tasks.length > 1 ? tasks.slice(0, this.maxSubtasks) : [prompt];
  }

  _updateAvgSubtasks(count) {
    if (this._stats.avgSubtaskCount === 0) {
      this._stats.avgSubtaskCount = count;
    } else {
      this._stats.avgSubtaskCount = this._stats.avgSubtaskCount * 0.8 + count * 0.2;
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalDecomposed: this._stats.totalDecomposed,
      totalSubtasks: this._stats.totalSubtasks,
      totalSynthesized: this._stats.totalSynthesized,
      avgSubtaskCount: Math.round(this._stats.avgSubtaskCount * 10) / 10,
      maxSubtasks: this.maxSubtasks,
      minComplexity: this.minComplexity,
    };
  }
}
