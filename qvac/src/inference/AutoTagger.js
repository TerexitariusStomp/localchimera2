import { Logger } from '../core/Logger.js';

/**
 * AutoTagger — automatically tags documents, transcripts, and notes
 * with relevant labels based on content analysis.
 *
 * Inspired by mem-it's auto-tagging: when documents are ingested into
 * RAG or transcripts are processed, AutoTagger analyzes the content
 * and assigns tags from both a predefined taxonomy and dynamic
 * keyword extraction.
 *
 * Tagging strategies:
 *   1. Taxonomy matching: match content against a predefined set of categories
 *   2. Keyword extraction: extract top-N keywords via TF-IDF-like scoring
 *   3. Entity extraction: use existing KnowledgeGraph entities as tags
 *   4. LLM-based: ask the model to suggest tags (optional, uses inference)
 *
 * Tags are stored as { tag, score, source } tuples.
 */

const DEFAULT_TAXONOMY = [
  'technology', 'science', 'health', 'finance', 'legal', 'education',
  'business', 'research', 'code', 'tutorial', 'news', 'personal',
  'meeting', 'project', 'bug', 'feature', 'documentation', 'question',
  'decision', 'action-item', 'summary', 'analysis', 'review',
  'voice-transcript', 'rag-document', 'wiki-page', 'inference',
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
]);

const MAX_TAGS = 10;
const MIN_KEYWORD_LENGTH = 3;
const MIN_KEYWORD_SCORE = 2;

export class AutoTagger {
  constructor(config = {}) {
    this.logger = new Logger('AutoTagger');
    this.enabled = config.enabled !== false;
    this.taxonomy = new Set([...(config.taxonomy || DEFAULT_TAXONOMY)]);
    this.maxTags = config.maxTags || MAX_TAGS;
    this._stats = {
      totalTagged: 0,
      totalTags: 0,
      avgTagsPerDoc: 0,
    };
  }

  /**
   * Auto-tag a document or transcript.
   * @param {string} content - text to tag
   * @param {object} options - { knowledgeGraph, inferenceLayer, existingTags }
   * @returns { tags: [{ tag, score, source }] }
   */
  async tag(content, options = {}) {
    if (!this.enabled || !content) return { tags: [] };

    const tagSet = new Map(); // tag -> { score, source }

    // 1. Taxonomy matching
    this._taxonomyMatch(content, tagSet);

    // 2. Keyword extraction
    this._keywordExtraction(content, tagSet);

    // 3. Entity extraction from KnowledgeGraph
    if (options.knowledgeGraph) {
      this._entityTags(content, options.knowledgeGraph, tagSet);
    }

    // 4. LLM-based tagging (optional)
    if (options.inferenceLayer && options.useLLM) {
      await this._llmTags(content, options.inferenceLayer, tagSet);
    }

    // Merge with existing tags
    if (options.existingTags) {
      for (const t of options.existingTags) {
        if (!tagSet.has(t)) {
          tagSet.set(t, { score: 0.5, source: 'manual' });
        }
      }
    }

    // Sort by score and limit
    const sorted = Array.from(tagSet.entries())
      .map(([tag, info]) => ({ tag, score: info.score, source: info.source }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxTags);

    this._stats.totalTagged++;
    this._stats.totalTags += sorted.length;
    this._updateAvgTags(sorted.length);

    return { tags: sorted };
  }

  /**
   * Batch tag multiple documents.
   */
  async tagBatch(documents, options = {}) {
    const results = [];
    for (const doc of documents) {
      const content = typeof doc === 'string' ? doc : (doc.text || doc.content || '');
      const result = await this.tag(content, options);
      results.push({ doc: doc.id || null, ...result });
    }
    return results;
  }

  /**
   * Match content against taxonomy categories.
   */
  _taxonomyMatch(content, tagSet) {
    const lower = content.toLowerCase();
    for (const tag of this.taxonomy) {
      const tagLower = tag.toLowerCase().replace(/[-_]/g, ' ');
      const variants = [
        tagLower,
        tagLower.replace(/[-_]/g, ''),
        tagLower.replace(/\s+/g, '-'),
      ];

      let score = 0;
      for (const variant of variants) {
        const regex = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = lower.match(regex);
        if (matches) score += matches.length;
      }

      // Check for category-specific keywords
      const categoryKeywords = this._getCategoryKeywords(tag);
      for (const kw of categoryKeywords) {
        if (lower.includes(kw)) score += 1;
      }

      if (score > 0) {
        const existing = tagSet.get(tag);
        tagSet.set(tag, {
          score: (existing?.score || 0) + score * 0.5,
          source: 'taxonomy',
        });
      }
    }
  }

  /**
   * Extract keywords via simple TF scoring.
   */
  _keywordExtraction(content, tagSet) {
    const words = content.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(w));

    const freq = new Map();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Get top keywords
    const top = Array.from(freq.entries())
      .filter(([, count]) => count >= MIN_KEYWORD_SCORE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [word, count] of top) {
      const tag = word.replace(/[^a-z0-9-]/g, '');
      if (tag.length >= MIN_KEYWORD_LENGTH) {
        const existing = tagSet.get(tag);
        tagSet.set(tag, {
          score: (existing?.score || 0) + count * 0.3,
          source: 'keyword',
        });
      }
    }
  }

  /**
   * Use KnowledgeGraph entities as tags.
   */
  _entityTags(content, kg, tagSet) {
    const lower = content.toLowerCase();
    const allEntities = kg.searchEntities('', 50);
    for (const entity of allEntities) {
      if (lower.includes(entity.name.toLowerCase())) {
        const existing = tagSet.get(entity.name.toLowerCase());
        tagSet.set(entity.name.toLowerCase(), {
          score: (existing?.score || 0) + 1.0,
          source: 'entity',
        });
      }
    }
  }

  /**
   * LLM-based tagging (optional, uses inference).
   */
  async _llmTags(content, inferenceLayer, tagSet) {
    try {
      const result = await inferenceLayer.handleInferenceRequest({
        prompt: `Analyze the following text and suggest 3-5 single-word tags that best describe its topic. Output ONLY a comma-separated list of tags, nothing else.\n\nText: ${content.slice(0, 1000)}`,
        maxTokens: 64,
        temperature: 0.3,
        source: 'auto-tagger',
      });

      const tags = result.output
        .split(',')
        .map(t => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''))
        .filter(t => t.length > 0);

      for (const tag of tags) {
        const existing = tagSet.get(tag);
        tagSet.set(tag, {
          score: (existing?.score || 0) + 1.5,
          source: 'llm',
        });
      }
    } catch (e) {
      this.logger.warn(`LLM tagging failed: ${e.message}`);
    }
  }

  /**
   * Get category-specific keywords for better taxonomy matching.
   */
  _getCategoryKeywords(category) {
    const keywords = {
      'technology': ['software', 'hardware', 'ai', 'ml', 'algorithm', 'data', 'api', 'server', 'cloud'],
      'science': ['experiment', 'hypothesis', 'theory', 'research', 'study', 'physics', 'chemistry', 'biology'],
      'health': ['medical', 'patient', 'treatment', 'symptom', 'diagnosis', 'doctor', 'health', 'disease'],
      'finance': ['money', 'budget', 'cost', 'revenue', 'profit', 'investment', 'payment', 'usdt', 'token'],
      'legal': ['contract', 'agreement', 'law', 'legal', 'compliance', 'regulation', 'terms'],
      'education': ['learn', 'teach', 'course', 'lesson', 'student', 'tutorial', 'guide'],
      'business': ['strategy', 'market', 'customer', 'sales', 'product', 'business', 'plan'],
      'code': ['function', 'class', 'variable', 'bug', 'error', 'debug', 'compile', 'runtime', 'import'],
      'meeting': ['meeting', 'agenda', 'attendee', 'minutes', 'discussion', 'action item', 'follow-up'],
      'project': ['milestone', 'task', 'timeline', 'deliverable', 'sprint', 'backlog', 'project'],
      'bug': ['bug', 'error', 'crash', 'fail', 'broken', 'issue', 'fix', 'regression'],
      'feature': ['feature', 'enhancement', 'improvement', 'new', 'add', 'implement'],
      'voice-transcript': ['transcript', 'whisper', 'speech', 'audio', 'recording', 'voice'],
      'rag-document': ['document', 'ingest', 'embedding', 'chunk', 'retrieval', 'rag'],
      'decision': ['decided', 'chose', 'selected', 'approved', 'rejected', 'decision'],
      'action-item': ['todo', 'task', 'action', 'follow up', 'assign', 'responsible'],
    };
    return keywords[category] || [];
  }

  /**
   * Add a custom taxonomy tag.
   */
  addTaxonomyTag(tag) {
    this.taxonomy.add(tag.toLowerCase());
  }

  _updateAvgTags(count) {
    if (this._stats.avgTagsPerDoc === 0) {
      this._stats.avgTagsPerDoc = count;
    } else {
      this._stats.avgTagsPerDoc = this._stats.avgTagsPerDoc * 0.8 + count * 0.2;
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      taxonomySize: this.taxonomy.size,
      totalTagged: this._stats.totalTagged,
      totalTags: this._stats.totalTags,
      avgTagsPerDoc: Math.round(this._stats.avgTagsPerDoc * 10) / 10,
      maxTags: this.maxTags,
    };
  }
}
