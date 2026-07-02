import { Logger } from '../core/Logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const KEYS_FILE = path.join(process.cwd(), 'data', 'inference-keys.json');

export class InferenceApiKeyManager {
  constructor() {
    this.logger = new Logger('InferenceApiKeyManager');
    this.keys = [];
  }

  async initialize() {
    this.logger.info('Initializing inference API key manager...');
    try {
      const raw = await fs.readFile(KEYS_FILE, 'utf-8');
      this.keys = JSON.parse(raw);
      this.logger.info(`Loaded ${this.keys.length} inference API key(s)`);
    } catch {
      this.logger.info('No existing inference API keys found');
      this.keys = [];
    }
  }

  /**
   * Generate a new inference API key.
   * The key is a random opaque token — it contains no machine identity,
   * no personal info, and no embedded metadata.
   *
   * @param {object} opts - { name, rateLimitRpm, modelAllowList }
   * @returns {object} - { id, key, name, keyPrefix, createdAt, rateLimitRpm, modelAllowList }
   */
  async createKey(opts = {}) {
    const rawKey = 'chim_' + crypto.randomBytes(32).toString('base64url');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);
    const id = crypto.randomUUID();

    const entry = {
      id,
      keyHash,
      keyPrefix,
      name: opts.name || 'default',
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
      rateLimitRpm: opts.rateLimitRpm || 0, // 0 = unlimited
      modelAllowList: opts.modelAllowList || null, // null = all models
    };

    this.keys.push(entry);
    await this._save();

    this.logger.info(`Created inference API key: ${keyPrefix}... (name: ${entry.name})`);

    return {
      id,
      key: rawKey,
      name: entry.name,
      keyPrefix,
      createdAt: entry.createdAt,
      rateLimitRpm: entry.rateLimitRpm,
      modelAllowList: entry.modelAllowList,
    };
  }

  /**
   * Validate an API key string.
   * Returns the key entry (without the raw key) if valid, or null.
   * Updates lastUsedAt on successful validation.
   */
  async validateKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;
    if (!rawKey.startsWith('chim_')) return null;

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const entry = this.keys.find(k => k.keyHash === keyHash && !k.revokedAt);
    if (!entry) return null;

    entry.lastUsedAt = Date.now();
    await this._save();

    return {
      id: entry.id,
      name: entry.name,
      keyPrefix: entry.keyPrefix,
      rateLimitRpm: entry.rateLimitRpm,
      modelAllowList: entry.modelAllowList,
    };
  }

  /**
   * List all active (non-revoked) keys.
   * Returns metadata only — never the raw key or hash.
   */
  listKeys() {
    return this.keys
      .filter(k => !k.revokedAt)
      .map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        rateLimitRpm: k.rateLimitRpm,
        modelAllowList: k.modelAllowList,
      }));
  }

  /**
   * Revoke a key by ID.
   */
  async revokeKey(id) {
    const entry = this.keys.find(k => k.id === id && !k.revokedAt);
    if (!entry) return false;
    entry.revokedAt = Date.now();
    await this._save();
    this.logger.info(`Revoked inference API key: ${entry.keyPrefix}...`);
    return true;
  }

  /**
   * Check if a model is allowed for a given key entry.
   */
  isModelAllowed(keyEntry, model) {
    if (!keyEntry || !keyEntry.modelAllowList) return true;
    return keyEntry.modelAllowList.includes(model);
  }

  async _save() {
    await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
    await fs.writeFile(KEYS_FILE, JSON.stringify(this.keys, null, 2), 'utf-8');
  }
}
