import { Logger } from '../core/Logger.js';

/**
 * ConfidenceRouter — self-consistency check to decide local vs escalate.
 *
 * Inspired by Conduit's confidence router: since QVAC exposes no logprobs,
 * measure answer stability instead. Sample the local model k times, compute
 * embedding cosine similarity between answers, and check for hedging/length
 * heuristics. If confident, answer locally for free; if not, escalate to
 * a paid peer.
 *
 * Decision signals:
 *   1. self_considence — structured output from model (if available)
 *   2. self-consistency — k samples, embed each, compute pairwise cosine sim
 *   3. heuristics — hedging words, output length variance, empty answers
 *
 * Escalation path:
 *   - If confidence ≥ threshold AND consistency ≥ minConsistency AND no flags
 *     → return local answer (cost 0)
 *   - Otherwise → escalate to InferenceRouter for peer delegation
 */

const DEFAULT_K = 3;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CONSISTENCY_THRESHOLD = 0.75;
const HEDGE_WORDS = [
  'perhaps', 'maybe', 'possibly', 'might', 'could', 'uncertain',
  'not sure', 'i think', 'i believe', 'likely', 'approximately',
  'roughly', 'unclear', 'unknown', 'unsure',
];

export class ConfidenceRouter {
  constructor(config = {}) {
    this.logger = new Logger('ConfidenceRouter');
    this.enabled = config.enabled !== false;
    this.k = config.k || DEFAULT_K;
    this.confidenceThreshold = config.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
    this.consistencyThreshold = config.consistencyThreshold || DEFAULT_CONSISTENCY_THRESHOLD;
    this.maxTemp = config.maxTemp || 0.3;
    this._stats = {
      totalRouted: 0,
      localAnswered: 0,
      escalated: 0,
      avgConfidence: 0,
      avgConsistency: 0,
    };
  }

  /**
   * Route a prompt: either answer locally or escalate.
   * @param {string} prompt - user prompt
   * @param {object} executor - { inferenceLayer, embeddingService, router }
   * @param {object} options - { maxTokens, temperature, k }
   * @returns { decision, localAnswer, consistency, confidence, flags }
   */
  async route(prompt, executor, options = {}) {
    if (!this.enabled) {
      return { decision: 'escalate', reason: 'disabled' };
    }

    this._stats.totalRouted++;
    const k = options.k || this.k;
    const maxTokens = options.maxTokens || 128;
    const temp = Math.min(options.temperature || this.maxTemp, this.maxTemp);

    // Generate k samples
    const samples = [];
    for (let i = 0; i < k; i++) {
      try {
        const result = await executor.inferenceLayer.handleInferenceRequest({
          prompt,
          maxTokens,
          temperature: temp,
          source: `confidence-router-${i}`,
        });
        if (result.output && result.output.trim().length > 0) {
          samples.push(result.output.trim());
        }
      } catch (e) {
        this.logger.warn(`Sample ${i} failed: ${e.message}`);
      }
    }

    if (samples.length === 0) {
      this._stats.escalated++;
      return { decision: 'escalate', reason: 'all_samples_failed', consistency: 0, confidence: 0 };
    }

    // If only one sample, can't measure consistency
    if (samples.length === 1) {
      const flags = this._checkHeuristics(samples[0]);
      const confident = flags.length === 0;
      if (confident) {
        this._stats.localAnswered++;
        return { decision: 'local', localAnswer: samples[0], consistency: 1.0, confidence: 0.5, flags: [] };
      }
      this._stats.escalated++;
      return { decision: 'escalate', reason: 'heuristic_flags', localAnswer: samples[0], consistency: 1.0, confidence: 0.3, flags };
    }

    // Compute consistency via embedding cosine similarity
    let consistency = 0;
    if (executor.embeddingService) {
      try {
        const embeddings = [];
        for (const sample of samples) {
          const emb = await executor.embeddingService.embed(sample);
          embeddings.push(emb);
        }
        consistency = this._avgPairwiseSimilarity(embeddings);
      } catch (e) {
        this.logger.warn(`Embedding consistency check failed: ${e.message}`);
        consistency = this._textualConsistency(samples);
      }
    } else {
      consistency = this._textualConsistency(samples);
    }

    // Check heuristics on all samples
    const allFlags = samples.flatMap(s => this._checkHeuristics(s));
    const uniqueFlags = [...new Set(allFlags)];

    // Compute confidence
    const confidence = this._computeConfidence(samples, consistency, uniqueFlags);

    // Update stats
    this._stats.avgConfidence = this._stats.avgConfidence * 0.8 + confidence * 0.2;
    this._stats.avgConsistency = this._stats.avgConsistency * 0.8 + consistency * 0.2;

    // Decision
    const isConfident = confidence >= this.confidenceThreshold
      && consistency >= this.consistencyThreshold
      && uniqueFlags.length === 0;

    if (isConfident) {
      this._stats.localAnswered++;
      // Return the longest sample (most complete answer)
      const best = samples.sort((a, b) => b.length - a.length)[0];
      this.logger.info(`Local answer (conf=${confidence.toFixed(2)}, cons=${consistency.toFixed(2)})`);
      return { decision: 'local', localAnswer: best, consistency, confidence, flags: [], samples };
    }

    this._stats.escalated++;
    this.logger.info(`Escalating (conf=${confidence.toFixed(2)}, cons=${consistency.toFixed(2)}, flags=${uniqueFlags.join(',')})`);
    return {
      decision: 'escalate',
      reason: 'low_confidence',
      localAnswer: samples[0],
      consistency,
      confidence,
      flags: uniqueFlags,
      samples,
    };
  }

  /**
   * Check heuristic flags: hedging, short answers, empty, contradictions.
   */
  _checkHeuristics(text) {
    const flags = [];
    const lower = text.toLowerCase();

    // Hedging
    for (const word of HEDGE_WORDS) {
      if (lower.includes(word)) {
        flags.push('hedging');
        break;
      }
    }

    // Too short
    if (text.length < 20) flags.push('too_short');

    // Empty/nonsense
    if (text.length === 0 || /^(none|null|undefined|n\/a|nothing)$/i.test(text)) {
      flags.push('empty');
    }

    // Repetitive (same word repeated 5+ times)
    const words = lower.split(/\s+/);
    const wordFreq = {};
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
      if (wordFreq[w] > 5) {
        flags.push('repetitive');
        break;
      }
    }

    return flags;
  }

  /**
   * Compute overall confidence from consistency + flags.
   */
  _computeConfidence(samples, consistency, flags) {
    let confidence = consistency;
    // Penalize for flags
    for (const flag of flags) {
      switch (flag) {
        case 'hedging': confidence -= 0.15; break;
        case 'too_short': confidence -= 0.2; break;
        case 'empty': confidence -= 0.5; break;
        case 'repetitive': confidence -= 0.2; break;
      }
    }
    // Length agreement bonus
    if (samples.length > 1) {
      const lengths = samples.map(s => s.length);
      const meanLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((s, l) => s + Math.pow(l - meanLen, 2), 0) / lengths.length;
      const cv = Math.sqrt(variance) / (meanLen || 1);
      if (cv < 0.2) confidence += 0.05; // Low variance = consistent length
    }
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Average pairwise cosine similarity between embeddings.
   */
  _avgPairwiseSimilarity(embeddings) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        total += this._cosine(embeddings[i], embeddings[j]);
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  _cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Textual consistency fallback: n-gram Jaccard similarity.
   */
  _textualConsistency(samples) {
    if (samples.length < 2) return 1.0;
    const getNgrams = (text, n = 2) => {
      const words = text.toLowerCase().split(/\s+/);
      const ngrams = new Set();
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.add(words.slice(i, i + n).join(' '));
      }
      return ngrams;
    };

    let totalSim = 0;
    let count = 0;
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const a = getNgrams(samples[i]);
        const b = getNgrams(samples[j]);
        const intersection = [...a].filter(x => b.has(x)).length;
        const union = a.size + b.size - intersection;
        totalSim += union > 0 ? intersection / union : 0;
        count++;
      }
    }
    return count > 0 ? totalSim / count : 0;
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalRouted: this._stats.totalRouted,
      localAnswered: this._stats.localAnswered,
      escalated: this._stats.escalated,
      localRate: this._stats.totalRouted > 0
        ? Math.round((this._stats.localAnswered / this._stats.totalRouted) * 100) / 100
        : 0,
      avgConfidence: Math.round(this._stats.avgConfidence * 100) / 100,
      avgConsistency: Math.round(this._stats.avgConsistency * 100) / 100,
      k: this.k,
      confidenceThreshold: this.confidenceThreshold,
      consistencyThreshold: this.consistencyThreshold,
    };
  }
}
