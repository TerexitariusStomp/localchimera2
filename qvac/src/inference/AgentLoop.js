import { Logger } from '../core/Logger.js';
import { PromptGuard } from './PromptGuard.js';
import { PromptBudgeter } from './PromptBudgeter.js';

/**
 * AgentLoop — on-device tool-calling agent.
 *
 * Inspired by Solace (t routed agent) and mem-it (tool-calling on 1B model):
 *   - Routes between local inference and peer delegation
 *   - Calls tools (search_memory, list_todos, calculator, local_time)
 *   - Answers grounded in tool results with streaming citations
 *   - Hardened against prompt injection via PromptGuard
 *   - Budgeted via PromptBudgeter to respect context window
 *
 * The agent loop:
 *   1. Receive user query
 *   2. Model decides: answer directly OR call a tool
 *   3. If tool call: execute tool, feed result back
 *   4. Model produces final answer (with citations if grounded in tools)
 *   5. Repeat up to maxRounds
 */

const TOOL_DEFINITIONS = [
  {
    name: 'search_memory',
    description: 'Search the local knowledge base / RAG for relevant information',
    parameters: { query: 'string', topK: 'number (optional, default 5)' },
  },
  {
    name: 'list_todos',
    description: 'List pending action items from stored transcripts/notes',
    parameters: {},
  },
  {
    name: 'calculator',
    description: 'Evaluate a mathematical expression',
    parameters: { expression: 'string' },
  },
  {
    name: 'local_time',
    description: 'Get the current local time and date',
    parameters: {},
  },
  {
    name: 'search_wiki',
    description: 'Search the LLM Wiki for pages matching a query',
    parameters: { query: 'string' },
  },
];

const AGENT_SYSTEM_PROMPT = `You are a helpful on-device AI agent. You have access to tools that can help you answer questions.

Available tools:
- search_memory(query, topK?): Search the local knowledge base for relevant information.
- list_todos(): List pending action items from stored transcripts/notes.
- calculator(expression): Evaluate a mathematical expression.
- local_time(): Get the current local time and date.
- search_wiki(query): Search the LLM Wiki for pages matching a query.

To call a tool, respond with EXACTLY:
[TOOL_CALL: tool_name({ "param": "value" })]

After receiving tool results, provide your final answer.
If no tool is needed, answer directly.
Cite sources as [DOC-xx] for document results or [WIKI-xx] for wiki results.
Keep answers concise and grounded in tool results when available.`;

export class AgentLoop {
  constructor(config = {}) {
    this.logger = new Logger('AgentLoop');
    this.maxRounds = config.maxRounds || 3;
    this.promptGuard = new PromptGuard(config.promptGuard || {});
    this.promptBudgeter = new PromptBudgeter(config.promptBudgeter || {});
    this.tools = new Map();
    this._registerBuiltinTools();
    this.maxTokens = config.maxTokens || 512;
    this.temperature = config.temperature || 0.4;
  }

  _registerBuiltinTools() {
    this.registerTool('calculator', async (params) => {
      try {
        const expr = params.expression || params.expr || '';
        if (!/^[\d\s+\-*/().%^]+$/.test(expr)) {
          return { error: 'Invalid expression' };
        }
        const result = Function(`"use strict"; return (${expr.replace(/\^/g, '**')})`)();
        return { result: String(result) };
      } catch (e) {
        return { error: e.message };
      }
    });

    this.registerTool('local_time', async () => {
      const now = new Date();
      return {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        iso: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    });
  }

  /**
   * Register a tool handler.
   */
  registerTool(name, handler) {
    this.tools.set(name, handler);
    this.logger.info(`Tool registered: ${name}`);
  }

  /**
   * Run the agent loop.
   * @param {string} query - user query
   * @param {object} context - { inferenceLayer, embeddingService, wikiIndexer, history }
   */
  async run(query, context = {}) {
    const { inferenceLayer, embeddingService, wikiIndexer, history = [] } = context;

    // Register context-dependent tools
    if (embeddingService) {
      this.registerTool('search_memory', async (params) => {
        const matches = await embeddingService.ragSearch(
          params.workspace || 'chimera-rag',
          params.query || '',
          params.topK || 5
        );
        return {
          matches: matches.map((m, i) => ({
            id: `DOC-${String(i + 1).padStart(2, '0')}`,
            text: (m.text || m.content || '').slice(0, 500),
            score: m.score || 0,
          })),
        };
      });
    }

    if (wikiIndexer) {
      this.registerTool('search_wiki', async (params) => {
        const results = wikiIndexer.search(params.query || '');
        return {
          matches: (results || []).slice(0, 5).map((r, i) => ({
            id: `WIKI-${String(i + 1).padStart(2, '0')}`,
            title: r.title || r.path || '',
            text: (r.content || r.preview || '').slice(0, 500),
          })),
        };
      });
    }

    // Build safe prompt
    const { history: safeHistory, injectionSuspected } = this.promptGuard.buildSafePrompt({
      systemPrompt: AGENT_SYSTEM_PROMPT,
      documents: [],
      userQuery: query,
      history,
    });

    const budgeted = this.promptBudgeter.build({
      systemPrompt: AGENT_SYSTEM_PROMPT,
      documents: [],
      history: safeHistory.slice(1),
      userQuery: query,
    });

    let currentHistory = budgeted.history;
    const toolCalls = [];
    const citations = [];

    for (let round = 0; round < this.maxRounds; round++) {
      if (!inferenceLayer) throw new Error('Inference layer required for agent loop');

      const result = await inferenceLayer.handleInferenceRequest({
        prompt: currentHistory.map(m => m.content).join('\n\n'),
        systemPrompt: AGENT_SYSTEM_PROMPT,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        source: 'agent-loop',
      });

      const output = result.output || '';

      // Check for tool call
      const toolCallMatch = output.match(/\[TOOL_CALL:\s*(\w+)\s*\(([\s\S]*?)\)\s*\]/);
      if (!toolCallMatch) {
        // No tool call — this is the final answer
        return {
          answer: output,
          toolCalls,
          citations,
          injectionSuspected,
          rounds: round + 1,
        };
      }

      const toolName = toolCallMatch[1];
      let toolParams = {};
      try {
        const paramStr = toolCallMatch[2].trim();
        if (paramStr) toolParams = JSON.parse(paramStr);
      } catch {
        this.logger.warn(`Failed to parse tool params for ${toolName}`);
      }

      this.logger.info(`Agent calling tool: ${toolName}(${JSON.stringify(toolParams)})`);
      toolCalls.push({ name: toolName, params: toolParams, round });

      const handler = this.tools.get(toolName);
      let toolResult;
      if (handler) {
        try {
          toolResult = await handler(toolParams);
        } catch (e) {
          toolResult = { error: e.message };
        }
      } else {
        toolResult = { error: `Unknown tool: ${toolName}` };
      }

      // Extract citations from tool results
      if (toolResult.matches) {
        for (const m of toolResult.matches) {
          if (m.id) citations.push(m.id);
        }
      }

      // Feed tool result back into history
      currentHistory = [
        ...currentHistory,
        { role: 'assistant', content: output },
        { role: 'user', content: `[TOOL_RESULT: ${toolName}]\n${JSON.stringify(toolResult).slice(0, 2000)}` },
      ];
    }

    // Exhausted rounds — return last output
    return {
      answer: 'Agent exhausted maximum rounds without final answer.',
      toolCalls,
      citations,
      injectionSuspected,
      rounds: this.maxRounds,
    };
  }

  getToolDefinitions() {
    return TOOL_DEFINITIONS;
  }

  getStatus() {
    return {
      maxRounds: this.maxRounds,
      registeredTools: Array.from(this.tools.keys()),
      promptGuard: this.promptGuard.getStats(),
      promptBudgeter: this.promptBudgeter.getStatus(),
    };
  }
}
