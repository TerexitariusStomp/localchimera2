import { Logger } from '../core/Logger.js';

/**
 * MemoryCompactor — compress old conversation history into a summary
 * instead of dropping messages when over budget.
 *
 * Inspired by Sanctum's "memory discipline": when the PromptBudgeter
 * would drop older history messages, the compactor first summarizes
 * them into a single compact message that preserves key context.
 *
 * Compaction strategy:
 *   1. Identify messages that would be dropped (older ones over budget)
 *   2. Concatenate them into a single block
 *   3. Produce a summary via the inference layer (or a simple extractive fallback)
 *   4. Replace the dropped messages with a single {role: 'system', content: '[Previous context summary] ...'} message
 *
 * This preserves context that would otherwise be lost, at the cost of
 * one inference call per compaction (cached for reuse).
 */

const COMPACTION_THRESHOLD = 4;
const MAX_SUMMARY_TOKENS = 256;
const COMPACTION_SYSTEM_PROMPT = `Summarize the following conversation history in 2-3 sentences, preserving key facts, decisions, and context. Be concise.`;

export class MemoryCompactor {
  constructor(config = {}) {
    this.logger = new Logger('MemoryCompactor');
    this.enabled = config.enabled !== false;
    this.threshold = config.threshold || COMPACTION_THRESHOLD;
    this.maxSummaryTokens = config.maxSummaryTokens || MAX_SUMMARY_TOKENS;
    this._compactionCache = new Map();
    this._totalCompactions = 0;
    this._totalMessagesCompacted = 0;
  }

  /**
   * Compact history: replace dropped messages with a summary.
   *
   * @param {Array} history - full conversation history
   * @param {number} keepRecent - number of recent messages to keep
   * @param {object} options - { inferenceLayer, cacheKey }
   * @returns {Array} compacted history
   */
  async compact(history, keepRecent, options = {}) {
    if (!this.enabled || !history || history.length <= keepRecent + this.threshold) {
      return history;
    }

    const toCompact = history.slice(0, history.length - keepRecent);
    const toKeep = history.slice(history.length - keepRecent);

    if (toCompact.length < this.threshold) {
      return history;
    }

    const cacheKey = options.cacheKey || this._hashMessages(toCompact);
    if (this._compactionCache.has(cacheKey)) {
      const cachedSummary = this._compactionCache.get(cacheKey);
      this.logger.debug('Using cached compaction summary');
      return [
        { role: 'system', content: `[Previous context summary]\n${cachedSummary}` },
        ...toKeep,
      ];
    }

    let summary;
    if (options.inferenceLayer) {
      try {
        summary = await this._summarizeWithLLM(toCompact, options.inferenceLayer);
      } catch (e) {
        this.logger.warn(`LLM summarization failed, using extractive fallback: ${e.message}`);
        summary = this._extractiveSummary(toCompact);
      }
    } else {
      summary = this._extractiveSummary(toCompact);
    }

    this._compactionCache.set(cacheKey, summary);
    this._totalCompactions++;
    this._totalMessagesCompacted += toCompact.length;
    this.logger.info(`Compacted ${toCompact.length} messages into summary (${summary.length} chars)`);

    return [
      { role: 'system', content: `[Previous context summary]\n${summary}` },
      ...toKeep,
    ];
  }

  /**
   * Summarize messages using the inference layer.
   */
  async _summarizeWithLLM(messages, inferenceLayer) {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const result = await inferenceLayer.handleInferenceRequest({
      prompt: `${COMPACTION_SYSTEM_PROMPT}\n\nConversation:\n${conversationText.slice(0, 4000)}`,
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      maxTokens: this.maxSummaryTokens,
      temperature: 0.3,
      source: 'memory-compactor',
    });

    return result.output || this._extractiveSummary(messages);
  }

  /**
   * Extractive fallback: pick key sentences from messages.
   */
  _extractiveSummary(messages) {
    const sentences = [];
    for (const msg of messages) {
      const content = msg.content || '';
      const parts = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 20 && trimmed.length < 200) {
          sentences.push(trimmed);
        }
      }
    }
    const selected = sentences.slice(0, 5);
    return selected.length > 0
      ? `Key points from earlier conversation: ${selected.join('; ')}.`
      : `[${messages.length} earlier messages omitted]`;
  }

  /**
   * Integrate with PromptBudgeter: when budget would drop messages,
   * compact them first.
   */
  async budgetedBuild({ promptBudgeter, inferenceLayer, systemPrompt, documents, history, userQuery }) {
    const budgets = promptBudgeter._computeBudgets();
    const { history: fittedHistory, dropped } = promptBudgeter.fitHistory(history, budgets.historyBudget);

    if (dropped > 0 && dropped >= this.threshold) {
      const compacted = await this.compact(history, fittedHistory.length, {
        inferenceLayer,
        cacheKey: this._hashMessages(history.slice(0, history.length - fittedHistory.length)),
      });
      return promptBudgeter.build({
        systemPrompt,
        documents,
        history: compacted,
        userQuery,
      });
    }

    return promptBudgeter.build({ systemPrompt, documents, history, userQuery });
  }

  _hashMessages(messages) {
    const text = messages.map(m => `${m.role}:${m.content}`).join('|');
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `cmp-${Math.abs(hash).toString(36)}`;
  }

  clearCache() {
    this._compactionCache.clear();
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalCompactions: this._totalCompactions,
      totalMessagesCompacted: this._totalMessagesCompacted,
      cacheSize: this._compactionCache.size,
      threshold: this.threshold,
    };
  }
}
