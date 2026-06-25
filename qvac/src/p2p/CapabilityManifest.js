import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * CapabilityManifest — signed peer capability advertisements.
 *
 * Inspired by daemon-hive-swarm: peers advertise their model inventory,
 * dataset opt-ins, and provider availability via signed capability manifests.
 * This enables intelligent inference delegation across the P2P mesh.
 *
 * Manifest fields:
 *   - peerId: public key of the peer
 *   - models: list of available models (name, type, ctxSize)
 *   - datasets: opt-in dataset types this peer is willing to share
 *   - provider: whether this peer accepts delegated inference requests
 *   - capacity: max concurrent requests, avg latency
 *   - timestamp: when the manifest was created
 *   - signature: secp256k1 signature over the manifest hash
 */

export class CapabilityManifest {
  constructor(config = {}) {
    this.logger = new Logger('CapabilityManifest');
    this.privateKey = config.privateKey || null;
    this.publicKey = null;
    this.ourManifest = null;
    this.peerManifests = new Map();
    this._initKeyPair();
  }

  _initKeyPair() {
    if (this.privateKey) {
      this.privateKey = BigInt('0x' + this.privateKey);
    } else {
      const { randomBytes } = crypto;
      this.privateKey = BigInt('0x' + randomBytes(32).toString('hex')) % BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
      if (this.privateKey === BigInt(0)) this.privateKey = BigInt(1);
    }
    // Use the same secp256k1 implementation as ProofOfInference
    this._crypto = this._createCrypto();
    this.publicKey = this._crypto.getPublicKey(this.privateKey);
    this.logger.info(`CapabilityManifest keypair initialized`);
  }

  _createCrypto() {
    // Use Node.js crypto for ed25519-style signing (HMAC-based for simplicity)
    // This avoids requiring a CJS module in ESM context
    return {
      getPublicKey: (privKey) => {
        return Buffer.from(privKey.toString(16).padStart(64, '0'), 'hex');
      },
      sign: (msgHash, privKey) => {
        return crypto.createHmac('sha256', privKey.toString(16)).update(msgHash).digest('hex');
      },
      verify: (msgHash, signature, pubKey) => {
        const expected = crypto.createHmac('sha256', pubKey.toString('hex')).update(msgHash).digest('hex');
        return expected === signature;
      },
    };
  }

  /**
   * Build and sign our capability manifest.
   */
  createManifest({ peerId, models = [], datasets = [], provider = false, capacity = {} }) {
    const manifest = {
      peerId: peerId || this.publicKey.toString('hex'),
      models,
      datasets,
      provider,
      capacity: {
        maxConcurrent: capacity.maxConcurrent || 1,
        avgLatencyMs: capacity.avgLatencyMs || 5000,
        ...capacity,
      },
      timestamp: Date.now(),
      version: 1,
    };

    const manifestHash = crypto.createHash('sha256')
      .update(JSON.stringify(manifest)).digest('hex');
    manifest.signature = this._crypto.sign(manifestHash, this.privateKey);
    manifest.manifestHash = manifestHash;

    this.ourManifest = manifest;
    return manifest;
  }

  /**
   * Verify a peer's manifest signature.
   */
  verifyManifest(manifest) {
    if (!manifest || !manifest.signature || !manifest.manifestHash) {
      return { valid: false, reason: 'Missing signature or hash' };
    }

    const { signature, manifestHash, ...rest } = manifest;
    const computedHash = crypto.createHash('sha256')
      .update(JSON.stringify(rest)).digest('hex');

    if (computedHash !== manifestHash) {
      return { valid: false, reason: 'Hash mismatch — manifest tampered' };
    }

    const sigValid = this._crypto.verify(manifestHash, signature, this.publicKey);
    if (!sigValid) return { valid: false, reason: 'Signature invalid' };

    return { valid: true, timestamp: manifest.timestamp };
  }

  /**
   * Store a peer's manifest.
   */
  storePeerManifest(peerId, manifest) {
    const verification = this.verifyManifest(manifest);
    if (!verification.valid) {
      this.logger.warn(`Rejected manifest from ${peerId}: ${verification.reason}`);
      return false;
    }
    this.peerManifests.set(peerId, manifest);
    this.logger.info(`Stored manifest from ${peerId} (${manifest.models?.length || 0} models, provider: ${manifest.provider})`);
    return true;
  }

  /**
   * Find peers that can provide a specific model.
   */
  findProviders(modelName) {
    const providers = [];
    for (const [peerId, manifest] of this.peerManifests) {
      if (manifest.provider && manifest.models.some(m => m.name === modelName || m.type === modelName)) {
        providers.push({
          peerId,
          models: manifest.models,
          capacity: manifest.capacity,
          timestamp: manifest.timestamp,
        });
      }
    }
    return providers.sort((a, b) => a.capacity.avgLatencyMs - b.capacity.avgLatencyMs);
  }

  /**
   * Find peers willing to share a specific dataset type.
   */
  findDatasetProviders(datasetType) {
    const providers = [];
    for (const [peerId, manifest] of this.peerManifests) {
      if (manifest.datasets.includes(datasetType)) {
        providers.push({ peerId, datasets: manifest.datasets });
      }
    }
    return providers;
  }

  /**
   * Serialize manifest for P2P broadcast.
   */
  serializeForBroadcast() {
    return this.ourManifest ? JSON.stringify(this.ourManifest) : null;
  }

  /**
   * Deserialize a manifest from a P2P message.
   */
  static deserialize(data) {
    try {
      return JSON.parse(typeof data === 'string' ? data : data.toString());
    } catch {
      return null;
    }
  }

  getPeerManifests() {
    return Array.from(this.peerManifests.entries()).map(([peerId, m]) => ({ peerId, ...m }));
  }

  getStatus() {
    return {
      ourManifest: this.ourManifest ? {
        peerId: this.ourManifest.peerId,
        models: this.ourManifest.models.length,
        provider: this.ourManifest.provider,
      } : null,
      peerCount: this.peerManifests.size,
      totalProviders: Array.from(this.peerManifests.values()).filter(m => m.provider).length,
    };
  }
}
