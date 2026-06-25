import { Logger } from '../core/Logger.js';

/**
 * TokenMeter — pay-per-token metering and spend-cap enforcement.
 *
 * Inspired by InferMart: each inference answer is metered by generatedTokens
 * and settled with USDT. The buyer sets a per-session USDT cap; a request
 * that would exceed it is never sent.
 *
 * This module handles:
 *   - Per-session token accounting (prompt + completion)
 *   - Per-session USDT spend cap enforcement
 *   - Per-route metering (different miners/sources can have different rates)
 *   - Settlement records (tx hash, amount, timestamp)
 *
 * The actual on-chain transfer is delegated to the WalletManager; TokenMeter
 * only decides *when* and *how much* to settle.
 */

const WEI_PER_USDT = BigInt('1000000'); // 6 decimals for USDT

export class TokenMeter {
  constructor(config = {}) {
    this.logger = new Logger('TokenMeter');
    this.ratePerToken = config.ratePerToken || 0.0001; // USDT per token
    this.sessionCap = config.sessionCap || 10.0; // max USDT per session
    this.minSettle = config.minSettle || 1.0; // min USDT before auto-settle
    this.settleInterval = config.settleInterval || 0; // 0 = manual only
    this.enabled = config.enabled !== false;

    this._sessions = new Map();
    this._settlements = [];
    this._totalMetered = 0;
    this._totalSettled = BigInt(0);
  }

  /**
   * Start a new metering session for a route/miner.
   */
  startSession(routeId, config = {}) {
    const session = {
      routeId,
      ratePerToken: config.ratePerToken || this.ratePerToken,
      sessionCap: config.sessionCap || this.sessionCap,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      usdtAccrued: 0,
      usdtSettled: 0,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      settlements: [],
    };
    this._sessions.set(routeId, session);
    this.logger.info(`Metering session started: ${routeId} (cap: ${session.sessionCap} USDT)`);
    return session;
  }

  /**
   * Record tokens for a session and check spend cap.
   * Returns { allowed, usdtCost, sessionTotal, capExceeded }.
   */
  meter(routeId, { promptTokens = 0, completionTokens = 0 }) {
    if (!this.enabled) return { allowed: true, usdtCost: 0, sessionTotal: 0, capExceeded: false };

    let session = this._sessions.get(routeId);
    if (!session) {
      session = this.startSession(routeId);
    }

    const totalNewTokens = promptTokens + completionTokens;
    const usdtCost = totalNewTokens * session.ratePerToken;
    const projectedTotal = session.usdtAccrued + usdtCost;

    if (projectedTotal > session.sessionCap) {
      this.logger.warn(`Spend cap exceeded for ${routeId}: ${projectedTotal.toFixed(4)} > ${session.sessionCap} USDT`);
      return {
        allowed: false,
        usdtCost,
        sessionTotal: session.usdtAccrued,
        capExceeded: true,
        reason: `Request would exceed session cap (${projectedTotal.toFixed(4)} > ${session.sessionCap} USDT)`,
      };
    }

    session.promptTokens += promptTokens;
    session.completionTokens += completionTokens;
    session.totalTokens += totalNewTokens;
    session.usdtAccrued = projectedTotal;
    session.lastActivity = Date.now();
    this._totalMetered += totalNewTokens;

    this.logger.debug(`Metered ${totalNewTokens} tokens for ${routeId} (${usdtCost.toFixed(6)} USDT, session total: ${session.usdtAccrued.toFixed(4)})`);

    return {
      allowed: true,
      usdtCost,
      sessionTotal: session.usdtAccrued,
      capExceeded: false,
    };
  }

  /**
   * Check if a session should auto-settle based on accrued USDT.
   */
  shouldSettle(routeId) {
    const session = this._sessions.get(routeId);
    if (!session) return false;
    return session.usdtAccrued - session.usdtSettled >= this.minSettle;
  }

  /**
   * Record a settlement (tx hash + amount) for a session.
   */
  recordSettlement(routeId, { txHash, amount, chain = 'sepolia' }) {
    const session = this._sessions.get(routeId);
    const amountBig = typeof amount === 'bigint' ? amount : BigInt(Math.floor(amount * 1000000));

    const record = {
      routeId,
      txHash,
      amount: amountBig.toString(),
      chain,
      timestamp: Date.now(),
    };

    this._settlements.push(record);
    this._totalSettled += amountBig;

    if (session) {
      session.usdtSettled += Number(amountBig) / 1000000;
      session.settlements.push(record);
    }

    this.logger.info(`Settlement recorded for ${routeId}: ${txHash} (${Number(amountBig) / 1000000} USDT)`);
    return record;
  }

  /**
   * Get session stats.
   */
  getSession(routeId) {
    return this._sessions.get(routeId) || null;
  }

  /**
   * Get all sessions.
   */
  getSessions() {
    return Array.from(this._sessions.values());
  }

  /**
   * Get all settlements.
   */
  getSettlements() {
    return this._settlements;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      ratePerToken: this.ratePerToken,
      sessionCap: this.sessionCap,
      minSettle: this.minSettle,
      activeSessions: this._sessions.size,
      totalMetered: this._totalMetered,
      totalSettledUSDT: Number(this._totalSettled) / 1000000,
      settlementCount: this._settlements.length,
    };
  }
}
