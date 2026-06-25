import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * ContentAddress — content-addressed verification for Chimera objects.
 *
 * Inspired by Hologram OS: every part of the system carries a name computed
 * from its own contents. Resolve any name, recompute it from the bytes, and
 * if they match you have verified that thing yourself, with no server and no
 * authority standing in between.
 *
 * This module provides:
 *   - contentHash(data): SHA-256 content hash (the "name" of the object)
 *   - verify(data, expectedHash): recompute and compare
 *   - ContentRegistry: maps content hashes to objects, enables dedup
 *   - MerkleProof: prove inclusion of a chunk in a larger document
 *
 * Used for:
 *   - Verifying wiki page integrity (detect tampering after P2P sync)
 *   - Verifying inference receipts (link output to exact model+prompt)
 *   - Verifying RAG document provenance (track source through chunking)
 */

export class ContentAddress {
  constructor(config = {}) {
    this.logger = new Logger('ContentAddress');
    this.algorithm = config.algorithm || 'sha256';
    this._registry = new Map();
    this._verifyCount = 0;
    this._mismatchCount = 0;
  }

  /**
   * Compute the content hash of any serializable data.
   */
  hash(data) {
    const serialized = this._serialize(data);
    return crypto.createHash(this.algorithm).update(serialized).digest('hex');
  }

  /**
   * Verify that data matches an expected content hash.
   */
  verify(data, expectedHash) {
    this._verifyCount++;
    const computed = this.hash(data);
    const match = computed === expectedHash;
    if (!match) {
      this._mismatchCount++;
      this.logger.warn(`Content hash mismatch: expected ${expectedHash.slice(0, 16)}... got ${computed.slice(0, 16)}...`);
    }
    return match;
  }

  /**
   * Register an object in the content registry.
   * Returns the content hash (the object's "name").
   */
  register(data) {
    const h = this.hash(data);
    if (!this._registry.has(h)) {
      this._registry.set(h, {
        hash: h,
        data,
        registeredAt: Date.now(),
        size: this._serialize(data).length,
      });
    }
    return h;
  }

  /**
   * Resolve an object by its content hash.
   */
  resolve(contentHash) {
    const entry = this._registry.get(contentHash);
    return entry ? entry.data : null;
  }

  /**
   * Check if a content hash is registered.
   */
  exists(contentHash) {
    return this._registry.has(contentHash);
  }

  /**
   * Build a Merkle proof that a leaf is included in a root.
   * Returns the proof path (array of {side, hash}).
   */
  buildMerkleProof(leaves, leafIndex) {
    const hashes = leaves.map(l => this.hash(l));
    const proof = [];
    let idx = leafIndex;

    while (hashes.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || hashes[i];
        if (i === idx || i + 1 === idx) {
          if (i === idx) {
            proof.push({ side: 'right', hash: right });
          } else {
            proof.push({ side: 'left', hash: left });
          }
        }
        nextLevel.push(crypto.createHash(this.algorithm)
          .update(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]))
          .digest('hex'));
      }
      idx = Math.floor(idx / 2);
      hashes.length = 0;
      hashes.push(...nextLevel);
    }

    return { root: hashes[0], proof };
  }

  /**
   * Verify a Merkle proof.
   */
  verifyMerkleProof(leaf, root, proof) {
    let computedHash = this.hash(leaf);
    for (const step of proof) {
      const combined = step.side === 'left'
        ? Buffer.concat([Buffer.from(step.hash, 'hex'), Buffer.from(computedHash, 'hex')])
        : Buffer.concat([Buffer.from(computedHash, 'hex'), Buffer.from(step.hash, 'hex')]);
      computedHash = crypto.createHash(this.algorithm).update(combined).digest('hex');
    }
    return computedHash === root;
  }

  /**
   * Create a content-addressed manifest for a wiki page or document.
   */
  createManifest({ type, title, content, author, tags = [], metadata = {} }) {
    const contentHash = this.hash(content);
    const manifest = {
      type,
      title,
      contentHash,
      author: author || 'local',
      tags,
      metadata,
      timestamp: Date.now(),
    };
    const manifestHash = this.hash(manifest);
    return { ...manifest, manifestHash };
  }

  /**
   * Verify a content-addressed manifest.
   */
  verifyManifest(manifest) {
    if (!manifest || !manifest.manifestHash) return { valid: false, reason: 'No manifest hash' };
    const { manifestHash, ...rest } = manifest;
    const computed = this.hash(rest);
    if (computed !== manifestHash) return { valid: false, reason: 'Manifest hash mismatch' };
    return { valid: true, contentHash: manifest.contentHash };
  }

  _serialize(data) {
    if (typeof data === 'string') return Buffer.from(data, 'utf-8');
    if (Buffer.isBuffer(data)) return data;
    return Buffer.from(JSON.stringify(data), 'utf-8');
  }

  getStats() {
    return {
      algorithm: this.algorithm,
      registrySize: this._registry.size,
      verifyCount: this._verifyCount,
      mismatchCount: this._mismatchCount,
    };
  }

  /**
   * Clear the registry (does not affect verification counts).
   */
  clearRegistry() {
    this._registry.clear();
  }
}
