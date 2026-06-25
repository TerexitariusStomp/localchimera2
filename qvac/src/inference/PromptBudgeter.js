import { Logger } from '../core/Logger.js';

/**
 * PromptBudgeter — character-budgeted prompt construction against ctx_size.
 *
 * Inspired by Sanctum: the prompt (scaffolding + docs + history) is
 * char-budgeted against the model's context window with a reserve for
 * the answer. Documents are the source of truth, so history and web
 * snippets get only a trimmed minority share.
 *
 * Budget allocation (approx 4 chars/token):
 *   - System prompt: reserved first (usually small)
 *   - Documents: up to 60% of remaining budget
 *   - History: up to 25% of remaining budget
 *   - Answer reserve: at least 15% of total ctx_size
 */

const CHARS_PER_TOKEN = 4;

export class PromptBudgeter {
  constructor(config = {}) {
    this.logger = new Logger('PromptBudgeter');
    this.ctxSize = config.ctxSize || 4096;
    this.answerReserveRatio = config.answerReserveRatio || 0.20;
    this.docRatio = config.docRatio || 0.60;
    this.historyRatio = config.historyRatio || 0.25;
  }

  /**
   * Compute the token budget for each section.
   */
  _computeBudgets() {
    const totalTokens = this.ctxSize;
    const answerReserve = Math.floor(totalTokens * this.answerReserveRatio);
    const available = totalTokens - answerReserve;
    const docBudget = Math.floor(available * this.docRatio);
    const historyBudget = Math.floor(available * this.historyRatio);
    const systemBudget = available - docBudget - historyBudget;
    return { totalTokens, answerReserve, available, docBudget, historyBudget, systemBudget };
  }

  /**
   * Fit documents into the document budget, truncating the least important.
   * Returns the fitted documents and which ones were included.
   */
  fitDocs(documents, docBudgetTokens) {
    if (!documents || documents.length === 0) return { docs: [], included: [], truncated: false };
    const docBudgetChars = docBudgetTokens * CHARS_PER_TOKEN;
    const fitted = [];
    const included = [];
    let used = 0;
    let truncated = false;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const docChars = doc.length;
      if (used + docChars <= docBudgetChars) {
        fitted.push(doc);
        included.push(i);
        used += docChars;
      } else {
        const remaining = docBudgetChars - used;
        if (remaining > 200) {
          fitted.push(doc.slice(0, remaining) + '\n[...truncated by PromptBudgeter]');
          included.push(i);
          truncated = true;
        }
        break;
      }
    }

    return { docs: fitted, included, truncated };
  }

  /**
   * Fit conversation history into the history budget, keeping the most
   * recent messages and trimming older ones.
   */
  fitHistory(history, historyBudgetTokens) {
    if (!history || history.length === 0) return { history: [], dropped: 0 };
    const historyBudgetChars = historyBudgetTokens * CHARS_PER_TOKEN;
    const fitted = [];
    let used = 0;
    let dropped = 0;

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgChars = (msg.content || '').length;
      if (used + msgChars <= historyBudgetChars) {
        fitted.unshift(msg);
        used += msgChars;
      } else {
        dropped++;
      }
    }

    return { history: fitted, dropped };
  }

  /**
   * Build a budgeted prompt from system, documents, history, and user query.
   * Returns the assembled history array and budget metadata.
   */
  build({ systemPrompt = '', documents = [], history = [], userQuery = '' }) {
    const budgets = this._computeBudgets();

    const systemChars = systemPrompt.length;
    const systemTokens = Math.ceil(systemChars / CHARS_PER_TOKEN);
    const adjustedDocBudget = budgets.docBudget + Math.max(0, budgets.systemBudget - systemTokens);

    const { docs, included, truncated } = this.fitDocs(documents, adjustedDocBudget);
    const { history: fittedHistory, dropped } = this.fitHistory(history, budgets.historyBudget);

    const assembled = [];
    if (systemPrompt) assembled.push({ role: 'system', content: systemPrompt });

    for (const doc of docs) {
      assembled.push({ role: 'user', content: `<document>\n${doc}\n</document>` });
    }

    for (const msg of fittedHistory) {
      assembled.push(msg);
    }

    if (userQuery) {
      assembled.push({ role: 'user', content: userQuery });
    }

    const totalChars = assembled.reduce((sum, m) => sum + (m.content || '').length, 0);
    const totalTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

    return {
      history: assembled,
      budgets,
      included,
      truncated,
      historyDropped: dropped,
      totalTokens,
      answerReserve: budgets.answerReserve,
      fits: totalTokens + budgets.answerReserve <= budgets.totalTokens,
    };
  }

  getStatus() {
    return {
      ctxSize: this.ctxSize,
      answerReserveRatio: this.answerReserveRatio,
      docRatio: this.docRatio,
      historyRatio: this.historyRatio,
    };
  }
}
