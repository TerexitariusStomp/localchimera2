import { Logger } from '../core/Logger.js';

/**
 * MemoryExtractor — LLM-based extraction of structured memories from raw text.
 *
 * Inspired by MeshMind's extract_memories: takes raw content (documents,
 * transcripts, notes), uses an LLM to extract entities, relationships,
 * and facts, then stores them in the KnowledgeGraph as triplets
 * (subject → predicate → object).
 *
 * Pipeline:
 *   1. extract(content) → LLM generates structured JSON with entities + relations
 *   2. deduplicate → skip entities/relations already in KnowledgeGraph
 *   3. score → assign importance based on frequency, type, source
 *   4. store → add to KnowledgeGraph as entities + relations
 *
 * Also integrates with MemoryManager for cognitive memory storage.
 *
 * Extraction prompt asks the LLM for:
 *   { "entities": [{ "name", "type", "description" }],
 *     "relations": [{ "subject", "predicate", "object" }],
 *     "facts": ["..."] }
 */

const EXTRACT_PROMPT = `You are a memory extraction system. Analyze the following text and extract structured information.

Return ONLY a JSON object with this exact structure:
{
  "entities": [
    { "name": "EntityName", "type": "person|organization|location|concept|event|technology", "description": "brief description" }
  ],
  "relations": [
    { "subject": "EntityName", "predicate": "works_at|located_in|created|part_of|related_to|uses|member_of", "object": "EntityName" }
  ],
  "facts": [
    "concise factual statement extracted from the text"
  ]
}

Extract only what is explicitly stated. Be precise. Do not hallucinate.`;

const MAX_CONTENT_CHARS = 4000;

export class MemoryExtractor {
  constructor(config = {}) {
    this.logger = new Logger('MemoryExtractor');
    this.enabled = config.enabled !== false;
    this.maxContentChars = config.maxContentChars || MAX_CONTENT_CHARS;
    this.confidenceThreshold = config.confidenceThreshold || 0.5;
    this._inferenceLayer = null;
    this._knowledgeGraph = null;
    this._memoryManager = null;
    this._stats = {
      totalExtracted: 0,
      totalEntities: 0,
      totalRelations: 0,
      totalFacts: 0,
      totalDuplicates: 0,
      totalFailed: 0,
      avgExtractMs: 0,
    };
  }

  setInferenceLayer(layer) {
    this._inferenceLayer = layer;
  }

  setKnowledgeGraph(kg) {
    this._knowledgeGraph = kg;
  }

  setMemoryManager(mm) {
    this._memoryManager = mm;
  }

  /**
   * Extract structured memories from content.
   * @param {string} content - raw text to extract from
   * @param {object} options - { namespace, source, skipStore, skipDedup }
   * @returns { entities, relations, facts, stored, duplicates }
   */
  async extract(content, options = {}) {
    if (!this.enabled || !content) return { entities: [], relations: [], facts: [] };
    if (!this._inferenceLayer) throw new Error('Inference layer not set');

    const start = Date.now();
    const truncated = content.slice(0, this.maxContentChars);
    const namespace = options.namespace || 'default';

    try {
      // LLM extraction
      const result = await this._inferenceLayer.handleInferenceRequest({
        prompt: `${EXTRACT_PROMPT}\n\nText:\n${truncated}`,
        maxTokens: 1024,
        temperature: 0.1,
        source: 'memory-extractor',
      });

      const parsed = this._parseExtraction(result.output || '');
      this._stats.totalExtracted++;
      this._stats.avgExtractMs = this._stats.avgExtractMs * 0.8 + (Date.now() - start) * 0.2;

      if (options.skipStore) {
        return { ...parsed, stored: false, duplicates: 0 };
      }

      // Store in KnowledgeGraph + MemoryManager
      const storeResult = await this._store(parsed, namespace, options.source || 'extraction', options.skipDedup);

      return {
        ...parsed,
        stored: storeResult.stored,
        duplicates: storeResult.duplicates,
        extractionMs: Date.now() - start,
      };
    } catch (e) {
      this._stats.totalFailed++;
      this.logger.warn(`Extraction failed: ${e.message}`);
      return { entities: [], relations: [], facts: [], error: e.message };
    }
  }

  /**
   * Extract from multiple content chunks (batch).
   */
  async extractBatch(contents, options = {}) {
    const results = [];
    for (const content of contents) {
      const result = await this.extract(content, options);
      results.push(result);
    }
    return this._mergeResults(results);
  }

  /**
   * Parse LLM output into structured entities/relations/facts.
   */
  _parseExtraction(output) {
    let parsed;
    try {
      // Try to find JSON in output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return { entities: [], relations: [], facts: [] };
      }
    } catch {
      this.logger.warn('Failed to parse extraction output as JSON');
      return { entities: [], relations: [], facts: [] };
    }

    const entities = (parsed.entities || [])
      .filter(e => e.name && e.type)
      .map(e => ({
        name: String(e.name).trim(),
        type: String(e.type).trim().toLowerCase(),
        description: String(e.description || '').trim(),
      }));

    const relations = (parsed.relations || [])
      .filter(r => r.subject && r.predicate && r.object)
      .map(r => ({
        subject: String(r.subject).trim(),
        predicate: String(r.predicate).trim().toLowerCase(),
        object: String(r.object).trim(),
      }));

    const facts = (parsed.facts || [])
      .filter(f => typeof f === 'string' && f.trim().length > 0)
      .map(f => f.trim());

    this._stats.totalEntities += entities.length;
    this._stats.totalRelations += relations.length;
    this._stats.totalFacts += facts.length;

    return { entities, relations, facts };
  }

  /**
   * Store extracted data in KnowledgeGraph and MemoryManager.
   */
  async _store(parsed, namespace, source, skipDedup = false) {
    let stored = { entities: 0, relations: 0, facts: 0 };
    let duplicates = 0;

    // Store entities in KnowledgeGraph
    if (this._knowledgeGraph) {
      for (const entity of parsed.entities) {
        // Check for duplicates
        if (!skipDedup && this._knowledgeGraph.findEntity?.(entity.name)) {
          duplicates++;
          continue;
        }
        try {
          this._knowledgeGraph.addEntity({
            name: entity.name,
            type: entity.type,
            description: entity.description,
            namespace,
            source,
          });
          stored.entities++;
        } catch (e) {
          this.logger.debug(`Failed to store entity ${entity.name}: ${e.message}`);
        }
      }

      // Store relations
      for (const rel of parsed.relations) {
        try {
          this._knowledgeGraph.addRelation({
            source: rel.subject,
            target: rel.object,
            type: rel.predicate,
            namespace,
            source,
          });
          stored.relations++;
        } catch (e) {
          this.logger.debug(`Failed to store relation: ${e.message}`);
        }
      }
    }

    // Store facts as semantic memories
    if (this._memoryManager) {
      for (const fact of parsed.facts) {
        this._memoryManager.add({
          content: fact,
          type: 'semantic',
          namespace,
          importance: 0.5,
          source,
          metadata: { extracted: true },
        });
        stored.facts++;
      }
    }

    this._stats.totalDuplicates += duplicates;
    return { stored, duplicates };
  }

  /**
   * Merge results from batch extraction.
   */
  _mergeResults(results) {
    const entityMap = new Map();
    const relationSet = new Set();
    const facts = [];
    let totalDuplicates = 0;
    let totalStored = { entities: 0, relations: 0, facts: 0 };

    for (const result of results) {
      for (const entity of result.entities || []) {
        const key = `${entity.name}:${entity.type}`;
        if (!entityMap.has(key)) {
          entityMap.set(key, entity);
        } else {
          totalDuplicates++;
        }
      }
      for (const rel of result.relations || []) {
        const key = `${rel.subject}:${rel.predicate}:${rel.object}`;
        if (!relationSet.has(key)) {
          relationSet.add(key);
        } else {
          totalDuplicates++;
        }
      }
      facts.push(...(result.facts || []));
      if (result.stored) {
        totalStored.entities += result.stored.entities || 0;
        totalStored.relations += result.stored.relations || 0;
        totalStored.facts += result.stored.facts || 0;
      }
      totalDuplicates += result.duplicates || 0;
    }

    return {
      entities: Array.from(entityMap.values()),
      relations: Array.from(relationSet).map(key => {
        const [subject, predicate, object] = key.split(':');
        return { subject, predicate, object };
      }),
      facts: [...new Set(facts)],
      duplicates: totalDuplicates,
      stored: totalStored,
    };
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalExtracted: this._stats.totalExtracted,
      totalEntities: this._stats.totalEntities,
      totalRelations: this._stats.totalRelations,
      totalFacts: this._stats.totalFacts,
      totalDuplicates: this._stats.totalDuplicates,
      totalFailed: this._stats.totalFailed,
      avgExtractMs: Math.round(this._stats.avgExtractMs),
    };
  }
}
