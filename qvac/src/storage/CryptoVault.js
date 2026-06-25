import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * CryptoVault — per-workspace encryption for sensitive RAG documents.
 *
 * Inspired by Qvault: each workspace gets its own derived encryption key.
 * Documents are encrypted at rest (AES-256-GCM) before being stored in
 * HypercoreStore, and decrypted on read. Keys are derived from a master
 * key + workspace name using HKDF, so only the node holding the master
 * key can decrypt.
 *
 * This module wraps the storage layer — it sits between the embedding
 * service and HypercoreStore, transparently encrypting/decrypting
 * documents by workspace.
 *
 * Key hierarchy:
 *   masterKey (node secret, 32 bytes)
 *     └── workspaceKey = HKDF(masterKey, workspaceName)
 *           └── per-document: AES-256-GCM(workspaceKey, nonce, plaintext)
 */

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

export class CryptoVault {
  constructor(config = {}) {
    this.logger = new Logger('CryptoVault');
    this.enabled = config.enabled !== false;
    this._masterKey = config.masterKey
      ? Buffer.from(config.masterKey, 'hex')
      : crypto.randomBytes(32);
    this._workspaceKeys = new Map();
    this._encryptedCount = 0;
    this._decryptedCount = 0;
  }

  /**
   * Derive a workspace-specific key using HKDF.
   */
  _getWorkspaceKey(workspace) {
    if (this._workspaceKeys.has(workspace)) {
      return this._workspaceKeys.get(workspace);
    }
    const info = Buffer.from(`chimera-workspace:${workspace}`, 'utf-8');
    const derived = crypto.hkdfSync('sha256', this._masterKey, Buffer.alloc(0), info, 32);
    const key = Buffer.from(derived);
    this._workspaceKeys.set(workspace, key);
    return key;
  }

  /**
   * Encrypt a document for a workspace.
   * Returns { encrypted, nonce, tag } as hex strings.
   */
  encrypt(workspace, plaintext) {
    if (!this.enabled) return { data: plaintext, encrypted: false };

    const key = this._getWorkspaceKey(workspace);
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    this._encryptedCount++;
    return {
      data: encrypted.toString('hex'),
      nonce: nonce.toString('hex'),
      tag: tag.toString('hex'),
      encrypted: true,
    };
  }

  /**
   * Decrypt a document from a workspace.
   * Returns the plaintext string.
   */
  decrypt(workspace, { data, nonce, tag }) {
    if (!this.enabled || !nonce || !tag) return data;

    const key = this._getWorkspaceKey(workspace);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(nonce, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data, 'hex')),
      decipher.final(),
    ]);

    this._decryptedCount++;
    return decrypted.toString('utf-8');
  }

  /**
   * Encrypt a batch of documents for RAG ingestion.
   * Returns array of { id, encryptedContent, nonce, tag, metadata }.
   */
  encryptDocuments(workspace, documents) {
    return documents.map(doc => {
      const text = typeof doc === 'string' ? doc : (doc.text || doc.content || '');
      const enc = this.encrypt(workspace, text);
      return {
        id: doc.id || `doc-${Math.random().toString(36).slice(2, 8)}`,
        encryptedContent: enc.data,
        nonce: enc.nonce,
        tag: enc.tag,
        encrypted: enc.encrypted,
        metadata: doc.metadata || {},
      };
    });
  }

  /**
   * Decrypt a batch of documents.
   */
  decryptDocuments(workspace, documents) {
    return documents.map(doc => {
      if (!doc.encrypted) return doc;
      const plaintext = this.decrypt(workspace, {
        data: doc.encryptedContent || doc.data,
        nonce: doc.nonce,
        tag: doc.tag,
      });
      return {
        id: doc.id,
        text: plaintext,
        metadata: doc.metadata || {},
      };
    });
  }

  /**
   * Get the master key hex (for backup/migration).
   */
  getMasterKeyHex() {
    return this._masterKey.toString('hex');
  }

  /**
   * Rotate the master key (re-encrypts all cached workspace keys).
   * Note: documents encrypted with the old key must be re-encrypted.
   */
  rotateMasterKey(newMasterKey) {
    const oldKey = this._masterKey;
    this._masterKey = Buffer.from(newMasterKey, 'hex');
    this._workspaceKeys.clear();
    this.logger.info('Master key rotated — workspace keys will be re-derived on next access');
    return oldKey.toString('hex');
  }

  /**
   * Check if a workspace has been initialized (key derived).
   */
  hasWorkspaceKey(workspace) {
    return this._workspaceKeys.has(workspace);
  }

  /**
   * Clear cached workspace keys (forces re-derivation on next access).
   */
  clearWorkspaceKeys() {
    this._workspaceKeys.clear();
  }

  getStats() {
    return {
      enabled: this.enabled,
      cachedWorkspaceKeys: this._workspaceKeys.size,
      totalEncrypted: this._encryptedCount,
      totalDecrypted: this._decryptedCount,
      algorithm: ALGORITHM,
    };
  }
}
