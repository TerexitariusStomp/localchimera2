import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * DocumentChunker — split documents into semantically meaningful chunks
 * with citation tracking.
 *
 * Inspired by Sanctum (cited [DOC-xx] references) and memoit (semantic
 * chunking with embedding-based retrieval):
 *   - Split by paragraphs/sentences with configurable size
 *   - Each chunk gets a stable ID: DOC-XX-NN (doc index, chunk index)
 *   - Chunks can be embedded and searched
 *   - Citations map back to source documents
 *
 * Also includes a CitationRegistry that tracks which chunks were used
 * in an answer, enabling grounded, verifiable responses.
 */

export class DocumentChunker {
  constructor(config = {}) {
    this.logger = new Logger('DocumentChunker');
    this.chunkSize = config.chunkSize || 512;
    this.chunkOverlap = config.chunkOverlap || 50;
    this.minChunkSize = config.minChunkSize || 50;
    this.splitOnParagraph = config.splitOnParagraph !== false;
  }

  /**
   * Chunk a single document into pieces.
   * @returns {Array<{id, text, docIndex, chunkIndex, charStart, charEnd}>}
   */
  chunkDocument(text, docIndex = 0, docLabel = '') {
    if (!text || typeof text !== 'string') return [];

    const chunks = [];
    let segments;

    if (this.splitOnParagraph) {
      segments = text.split(/\n\n+/).filter(s => s.trim().length > 0);
    } else {
      segments = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    }

    let chunkIdx = 0;
    let charOffset = 0;

    for (const segment of segments) {
      const segStart = text.indexOf(segment, charOffset);
      charOffset = segStart + segment.length;

      if (segment.length <= this.chunkSize) {
        if (segment.length >= this.minChunkSize) {
          chunks.push({
            id: `DOC-${String(docIndex + 1).padStart(2, '0')}-${String(chunkIdx + 1).padStart(2, '0')}`,
            text: segment.trim(),
            docIndex,
            chunkIndex: chunkIdx,
            docLabel: docLabel || `Document ${docIndex + 1}`,
            charStart: segStart,
            charEnd: segStart + segment.length,
          });
          chunkIdx++;
        }
      } else {
        let start = 0;
        while (start < segment.length) {
          const end = Math.min(start + this.chunkSize, segment.length);
          const chunkText = segment.slice(start, end).trim();
          if (chunkText.length >= this.minChunkSize) {
            chunks.push({
              id: `DOC-${String(docIndex + 1).padStart(2, '0')}-${String(chunkIdx + 1).padStart(2, '0')}`,
              text: chunkText,
              docIndex,
              chunkIndex: chunkIdx,
              docLabel: docLabel || `Document ${docIndex + 1}`,
              charStart: segStart + start,
              charEnd: segStart + end,
            });
            chunkIdx++;
          }
          start = end - this.chunkOverlap;
          if (start >= segment.length) break;
        }
      }
    }

    return chunks;
  }

  /**
   * Chunk multiple documents.
   */
  chunkDocuments(documents) {
    const all = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const text = typeof doc === 'string' ? doc : (doc.text || doc.content || '');
      const label = typeof doc === 'object' ? (doc.title || doc.label || '') : '';
      const chunks = this.chunkDocument(text, i, label);
      all.push(...chunks);
    }
    this.logger.info(`Chunked ${documents.length} documents into ${all.length} chunks`);
    return all;
  }

  /**
   * Convert chunks to RAG-ready documents.
   */
  toRagDocuments(chunks) {
    return chunks.map(c => ({
      id: c.id,
      text: c.text,
      metadata: {
        docIndex: c.docIndex,
        chunkIndex: c.chunkIndex,
        docLabel: c.docLabel,
        charStart: c.charStart,
        charEnd: c.charEnd,
      },
    }));
  }
}

/**
 * CitationRegistry — tracks which document chunks were used in an answer.
 * Produces formatted citation chips like [DOC-01-03].
 */
export class CitationRegistry {
  constructor() {
    this._citations = new Map();
    this._chunkIndex = new Map();
  }

  /**
   * Register a chunk for citation tracking.
   */
  registerChunk(chunk) {
    this._chunkIndex.set(chunk.id, chunk);
  }

  registerChunks(chunks) {
    for (const c of chunks) this.registerChunk(c);
  }

  /**
   * Record that a chunk was cited in an answer.
   */
  addCitation(chunkId, relevanceScore = 1.0) {
    this._citations.set(chunkId, {
      chunkId,
      chunk: this._chunkIndex.get(chunkId),
      relevanceScore,
      citedAt: Date.now(),
    });
  }

  /**
   * Get all citations for the current answer.
   */
  getCitations() {
    return Array.from(this._citations.values());
  }

  /**
   * Format citations as markdown chips.
   */
  formatCitations() {
    const cites = this.getCitations();
    if (cites.length === 0) return '';
    const chips = cites.map(c => `[${c.chunkId}]`).join(' ');
    const sources = cites.map(c => `- **${c.chunkId}**: ${c.chunk?.docLabel || 'Unknown'} — "${c.chunk?.text.slice(0, 100)}..."`).join('\n');
    return `\n\n---\n**Sources:** ${chips}\n${sources}`;
  }

  /**
   * Clear citations for a new answer.
   */
  clear() {
    this._citations.clear();
  }

  getStats() {
    return {
      registeredChunks: this._chunkIndex.size,
      activeCitations: this._citations.size,
    };
  }
}
