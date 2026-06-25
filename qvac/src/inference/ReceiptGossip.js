import crypto from 'crypto';
import { Logger } from '../core/Logger.js';
import { ProofOfInference } from './ProofOfInference.js';

/**
 * ReceiptGossip — P2P cross-verification of inference receipts.
 *
 * Inspired by Edge-AI-Nexus: peers gossip about inference receipts they've
 * verified, creating a trustless verification layer without on-chain gas.
 * When a node generates a receipt, it broadcasts it to peers. Peers
 * independently verify the signature and Merkle root, then broadcast
 * their verification result. If enough peers agree, the receipt is
 * considered "community verified" without needing a blockchain transaction.
 *
 * Gossip protocol:
 *   1. Node generates receipt → broadcasts {type: 'poi-receipt', receipt}
 *   2. Peer receives → verifies signature + Merkle root
 *   3. Peer broadcasts {type: 'poi-verification', receiptHash, valid, verifierId}
 *   4. Node collects verifications; when threshold reached → "community verified"
 *
 * Also includes DynamicPricing: adjusts token price based on network
 * demand (queue depth) and supply (available peers).
 */

/**
 * DynamicPricing — demand-based token pricing.
 *
 * Inspired by InferMart's marketplace: price per token adjusts based on
 * current network demand (inference queue depth) and supply (available
 * providers from CapabilityManifest).
 *
 * Pricing curve:
 *   basePrice × (1 + demandFactor) × (1 - supplyFactor)
 *
 *   demandFactor = min(queueDepth / 10, 1.0) × maxDemandMultiplier
 *   supplyFactor = min(availablePeers / 20, 1.0) × maxSupplyDiscount
 *
 * Price is bounded by [minPrice, maxPrice] to prevent extremes.
 */
export class DynamicPricing {
  constructor(config = {}) {
    this.logger = new Logger('DynamicPricing');
    this.basePrice = config.basePrice || 0.0001; // USDT per token
    this.maxDemandMultiplier = config.maxDemandMultiplier || 0.5; // +50% at max demand
    this.maxSupplyDiscount = config.maxSupplyDiscount || 0.3; // -30% at max supply
    this.minPrice = config.minPrice || 0.00001;
    this.maxPrice = config.maxPrice || 0.001;
    this._priceHistory = [];
    this._currentPrice = this.basePrice;
  }

  /**
   * Compute the current dynamic price.
   * @param {number} queueDepth - current inference queue depth
   * @param {number} availablePeers - peers currently available for delegation
   */
  computePrice(queueDepth = 0, availablePeers = 0) {
    const demandFactor = Math.min(queueDepth / 10, 1.0) * this.maxDemandMultiplier;
    const supplyFactor = Math.min(availablePeers / 20, 1.0) * this.maxSupplyDiscount;

    const price = this.basePrice * (1 + demandFactor) * (1 - supplyFactor);
    const clamped = Math.max(this.minPrice, Math.min(this.maxPrice, price));

    this._currentPrice = clamped;
    this._priceHistory.push({
      price: clamped,
      queueDepth,
      availablePeers,
      demandFactor,
      supplyFactor,
      timestamp: Date.now(),
    });

    if (this._priceHistory.length > 100) {
      this._priceHistory.shift();
    }

    return clamped;
  }

  getCurrentPrice() {
    return this._currentPrice;
  }

  getPriceHistory(limit = 20) {
    return this._priceHistory.slice(-limit);
  }

  getStats() {
    return {
      basePrice: this.basePrice,
      currentPrice: this._currentPrice,
      minPrice: this.minPrice,
      maxPrice: this.maxPrice,
      historySize: this._priceHistory.length,
    };
  }
}

/**
 * ReceiptGossip — P2P receipt cross-verification.
 */
export class ReceiptGossip {
  constructor(config = {}) {
    this.logger = new Logger('ReceiptGossip');
    this.verificationThreshold = config.verificationThreshold || 3;
    this._receipts = new Map(); // receiptHash → { receipt, verifications: Map, status }
    this._ourVerifications = new Set(); // receiptHashes we've verified
    this._p2p = null; // PearP2P instance for broadcasting
    this._peerId = config.peerId || crypto.randomUUID();
    this._stats = {
      receiptsGossiped: 0,
      receiptsVerified: 0,
      receiptsCommunityVerified: 0,
    };
  }

  /**
   * Set the P2P instance for broadcasting.
   */
  setP2P(p2p) {
    this._p2p = p2p;
    // Register message handler for incoming receipts/verifications
    if (p2p && p2p.onMessage) {
      p2p.onMessage((msg, peerId) => this._handleMessage(msg, peerId));
    }
  }

  /**
   * Broadcast a receipt to peers for cross-verification.
   */
  async gossipReceipt(receipt) {
    if (!this._p2p) {
      this.logger.warn('No P2P instance, cannot gossip receipt');
      return;
    }

    const receiptHash = receipt.merkleRoot;
    this._receipts.set(receiptHash, {
      receipt,
      verifications: new Map(),
      status: 'pending',
      gossipedAt: Date.now(),
    });

    await this._p2p.broadcast({
      type: 'poi-receipt',
      receipt,
      from: this._peerId,
    });

    this._stats.receiptsGossiped++;
    this.logger.info(`Gossiped receipt ${receiptHash.slice(0, 16)}... to peers`);
  }

  /**
   * Handle incoming P2P messages (receipts and verifications).
   */
  _handleMessage(msg, peerId) {
    if (msg.type === 'poi-receipt') {
      this._handleIncomingReceipt(msg.receipt, msg.from || peerId);
    } else if (msg.type === 'poi-verification') {
      this._handleIncomingVerification(msg, peerId);
    }
  }

  /**
   * Verify an incoming receipt and broadcast our verification.
   */
  async _handleIncomingReceipt(receipt, fromPeer) {
    if (!receipt || !receipt.merkleRoot) return;
    const hash = receipt.merkleRoot;

    if (this._ourVerifications.has(hash)) return; // Already verified

    const result = ProofOfInference.verifyReceipt(receipt);
    this._ourVerifications.add(hash);
    this._stats.receiptsVerified++;

    // Store in our local map
    if (!this._receipts.has(hash)) {
      this._receipts.set(hash, {
        receipt,
        verifications: new Map(),
        status: 'pending',
        gossipedAt: Date.now(),
      });
    }

    // Broadcast our verification
    if (this._p2p) {
      this._p2p.broadcast({
        type: 'poi-verification',
        receiptHash: hash,
        valid: result.valid,
        reason: result.reason || null,
        verifierId: this._peerId,
      });
    }

    this.logger.debug(`Verified receipt ${hash.slice(0, 16)}... from ${fromPeer}: ${result.valid ? 'valid' : 'invalid'}`);
  }

  /**
   * Handle an incoming verification from a peer.
   */
  _handleIncomingVerification(msg, peerId) {
    const { receiptHash, valid, verifierId } = msg;
    const entry = this._receipts.get(receiptHash);
    if (!entry) return;

    entry.verifications.set(verifierId || peerId, {
      valid,
      verifiedAt: Date.now(),
      peerId: verifierId || peerId,
    });

    // Check if we've reached community verification threshold
    const validCount = Array.from(entry.verifications.values()).filter(v => v.valid).length;
    if (validCount >= this.verificationThreshold && entry.status !== 'community_verified') {
      entry.status = 'community_verified';
      entry.verifiedAt = Date.now();
      this._stats.receiptsCommunityVerified++;
      this.logger.info(`Receipt ${receiptHash.slice(0, 16)}... community verified by ${validCount} peers`);
    }
  }

  /**
   * Get the verification status of a receipt.
   */
  getReceiptStatus(receiptHash) {
    const entry = this._receipts.get(receiptHash);
    if (!entry) return { status: 'unknown' };
    return {
      status: entry.status,
      verificationCount: entry.verifications.size,
      validCount: Array.from(entry.verifications.values()).filter(v => v.valid).length,
      verifications: Array.from(entry.verifications.values()),
    };
  }

  /**
   * Get all community-verified receipts.
   */
  getCommunityVerifiedReceipts() {
    const result = [];
    for (const [hash, entry] of this._receipts) {
      if (entry.status === 'community_verified') {
        result.push({
          receiptHash: hash,
          receipt: entry.receipt,
          verifiedAt: entry.verifiedAt,
          verificationCount: entry.verifications.size,
        });
      }
    }
    return result;
  }

  getStats() {
    return {
      ...this._stats,
      trackedReceipts: this._receipts.size,
      threshold: this.verificationThreshold,
      peerId: this._peerId,
    };
  }
}
