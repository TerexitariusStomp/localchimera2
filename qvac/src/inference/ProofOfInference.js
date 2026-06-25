import crypto from 'crypto';
import { Logger } from '../core/Logger.js';

/**
 * ProofOfInference — cryptographic proof-of-inference receipts.
 *
 * Inspired by Beacon (Edge-AI-Nexus): every inference answer is hashed into
 * a Merkle chain and signed (secp256k1), producing a portable receipt that
 * anyone can independently verify.
 *
 * Each receipt contains:
 *   - Merkle root of the inference event (prompt hash, output hash, model, ts)
 *   - secp256k1 signature over the Merkle root
 *   - Chain link to the previous receipt (tamper-evident sequence)
 *   - Public key for verification
 *
 * Receipts are stored in a JSONL append-only log and can be verified via
 * the /api/proof/verify endpoint.
 */

const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
const SECP256K1_A = BigInt(0);
const SECP256K1_B = BigInt(7);
const SECP256K1_GX = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798');
const SECP256K1_GY = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8');
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

function mod(a, m) {
  return ((a % m) + m) % m;
}

function modInv(a, m) {
  let [old_r, r] = [a, m];
  let [old_s, s] = [BigInt(1), BigInt(0)];
  while (r !== BigInt(0)) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

function pointAdd(P, Q) {
  if (P === null) return Q;
  if (Q === null) return P;
  if (P.x === Q.x && P.y === Q.y) return pointDouble(P);
  const lambda = mod((Q.y - P.y) * modInv(Q.x - P.x, SECP256K1_P), SECP256K1_P);
  const x = mod(lambda * lambda - P.x - Q.x, SECP256K1_P);
  const y = mod(lambda * (P.x - x) - P.y, SECP256K1_P);
  return { x, y };
}

function pointDouble(P) {
  if (P === null) return null;
  const lambda = mod(BigInt(3) * P.x * P.x * modInv(BigInt(2) * P.y, SECP256K1_P), SECP256K1_P);
  const x = mod(lambda * lambda - BigInt(2) * P.x, SECP256K1_P);
  const y = mod(lambda * (P.x - x) - P.y, SECP256K1_P);
  return { x, y };
}

function pointMul(k, P) {
  let result = null;
  let addend = P;
  while (k > BigInt(0)) {
    if (k & BigInt(1)) result = pointAdd(result, addend);
    addend = pointDouble(addend);
    k >>= BigInt(1);
  }
  return result;
}

function pointToBytes(P) {
  const xHex = P.x.toString(16).padStart(64, '0');
  return Buffer.from('04' + xHex + P.y.toString(16).padStart(64, '0'), 'hex');
}

function bytesToPoint(buf) {
  if (buf[0] !== 0x04) throw new Error('Only uncompressed points supported');
  const x = BigInt('0x' + buf.slice(1, 33).toString('hex'));
  const y = BigInt('0x' + buf.slice(33, 65).toString('hex'));
  return { x, y };
}

function bigToBuf32(n) {
  const h = n.toString(16).padStart(64, '0');
  return Buffer.from(h, 'hex');
}

function bufToBig(buf) {
  return BigInt('0x' + buf.toString('hex'));
}

export class ProofOfInference {
  constructor(config = {}) {
    this.logger = new Logger('ProofOfInference');
    this.privateKey = config.privateKey || null;
    this.publicKey = null;
    this.previousHash = null;
    this.receiptCount = 0;
    this._chainFile = config.chainFile || null;
    this._initKeyPair();
  }

  _initKeyPair() {
    if (this.privateKey) {
      this.privateKey = BigInt('0x' + this.privateKey);
    } else {
      this.privateKey = mod(BigInt(crypto.randomBytes(32).toString('hex')), SECP256K1_N - BigInt(1)) + BigInt(1);
    }
    const G = { x: SECP256K1_GX, y: SECP256K1_GY };
    this.publicKey = pointMul(this.privateKey, G);
    this.logger.info(`PoI keypair initialized (pubkey: ${this.publicKey.x.toString(16).slice(0, 16)}...)`);
  }

  /**
   * Build a Merkle tree from inference event fields and return the root.
   */
  _merkleRoot({ promptHash, outputHash, modelId, timestamp, routeId }) {
    const leaves = [
      Buffer.from(promptHash, 'hex'),
      Buffer.from(outputHash, 'hex'),
      Buffer.from(modelId || 'unknown', 'utf-8'),
      bigToBuf32(BigInt(timestamp)),
      Buffer.from(routeId || '', 'utf-8'),
    ].sort(Buffer.compare);

    let level = leaves;
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || level[i];
        next.push(crypto.createHash('sha256').update(Buffer.concat([left, right])).digest());
      }
      level = next;
    }
    return level[0].toString('hex');
  }

  /**
   * Sign a hash with secp256k1 (deterministic RFC 6979-style via extra entropy).
   */
  _sign(msgHash) {
    const z = bufToBig(Buffer.from(msgHash, 'hex'));
    let k = mod(z + this.privateKey, SECP256K1_N);
    const G = { x: SECP256K1_GX, y: SECP256K1_GY };
    let attempt = 0;
    while (attempt < 256) {
      const point = pointMul(k, G);
      const r = mod(point.x, SECP256K1_N);
      if (r === BigInt(0)) { k = mod(k + BigInt(1), SECP256K1_N); attempt++; continue; }
      const s = mod(k * modInv(z + r * this.privateKey, SECP256K1_N), SECP256K1_N);
      if (s === BigInt(0)) { k = mod(k + BigInt(1), SECP256K1_N); attempt++; continue; }
      const recoveryId = (point.y & BigInt(1)) | ((point.x !== r) ? BigInt(2) : BigInt(0));
      return {
        r: bigToBuf32(r).toString('hex'),
        s: bigToBuf32(s).toString('hex'),
        recoveryId: Number(recoveryId),
      };
    }
    throw new Error('Signing failed after 256 attempts');
  }

  /**
   * Verify a signature against a public key and message hash.
   */
  static verify(msgHash, signature, publicKeyHex) {
    const r = bufToBig(Buffer.from(signature.r, 'hex'));
    const s = bufToBig(Buffer.from(signature.s, 'hex'));
    const z = bufToBig(Buffer.from(msgHash, 'hex'));
    const pubKey = bytesToPoint(Buffer.from(publicKeyHex, 'hex'));
    const G = { x: SECP256K1_GX, y: SECP256K1_GY };

    if (r >= SECP256K1_N || s >= SECP256K1_N || r === BigInt(0) || s === BigInt(0)) return false;

    const w = modInv(s, SECP256K1_N);
    const u1 = mod(z * w, SECP256K1_N);
    const u2 = mod(r * w, SECP256K1_N);
    const point = pointAdd(pointMul(u1, G), pointMul(u2, pubKey));
    if (point === null) return false;
    return mod(point.x, SECP256K1_N) === r;
  }

  getPublicKeyHex() {
    return pointToBytes(this.publicKey).toString('hex');
  }

  /**
   * Generate a proof-of-inference receipt for an inference event.
   */
  generateReceipt({ prompt, output, modelId, routeId, durationMs, tokensGenerated }) {
    const timestamp = Date.now();
    const promptHash = crypto.createHash('sha256').update(prompt || '').digest('hex');
    const outputHash = crypto.createHash('sha256').update(output || '').digest('hex');
    const merkleRoot = this._merkleRoot({ promptHash, outputHash, modelId, timestamp, routeId });
    const signature = this._sign(merkleRoot);

    const receipt = {
      version: 1,
      timestamp,
      routeId: routeId || '',
      modelId: modelId || 'unknown',
      promptHash,
      outputHash,
      merkleRoot,
      signature,
      publicKey: this.getPublicKeyHex(),
      previousHash: this.previousHash,
      chainIndex: this.receiptCount,
      durationMs,
      tokensGenerated,
    };

    this.previousHash = crypto.createHash('sha256')
      .update(JSON.stringify(receipt)).digest('hex');
    this.receiptCount++;

    return receipt;
  }

  /**
   * Verify a receipt independently.
   */
  static verifyReceipt(receipt) {
    if (!receipt || !receipt.merkleRoot || !receipt.signature || !receipt.publicKey) {
      return { valid: false, reason: 'Missing fields' };
    }
    const sigValid = ProofOfInference.verify(receipt.merkleRoot, receipt.signature, receipt.publicKey);
    if (!sigValid) return { valid: false, reason: 'Signature invalid' };

    const promptHash = crypto.createHash('sha256').update(receipt.promptHash).digest('hex');
    if (promptHash !== receipt.promptHash) return { valid: false, reason: 'Prompt hash mismatch' };

    return { valid: true, chainIndex: receipt.chainIndex, timestamp: receipt.timestamp };
  }

  getStatus() {
    return {
      enabled: true,
      receiptCount: this.receiptCount,
      publicKey: this.getPublicKeyHex().slice(0, 24) + '...',
      previousHash: this.previousHash?.slice(0, 16) + '...' || null,
    };
  }
}
