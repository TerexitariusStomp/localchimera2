import { Logger } from '../core/Logger.js';
import crypto from 'crypto';

/**
 * InferenceAccessManager — payment-gated inference access.
 *
 * Instead of sharing API keys, the node owner keeps their key private.
 * External users pay (via escrow deposit or direct payment) to receive
 * a temporary session token with a credit balance. Each inference request
 * deducts from the balance based on token usage × dynamic price.
 *
 * Lifecycle:
 *   1. purchase({ amount }) — buyer pays, receives a session token with credit
 *   2. validate(token) — checks token is valid, not expired, has remaining credit
 *   3. charge(token, tokensUsed) — deducts cost from credit after inference
 *   4. token expires when credit depleted or TTL reached
 *
 * The token is an opaque random string — no machine identity, no personal info.
 * Credit is tracked server-side; the token is just a bearer credential.
 */
export class InferenceAccessManager {
  constructor({ escrowChannel = null, dynamicPricing = null } = {}) {
    this.logger = new Logger('InferenceAccessManager');
    this.escrowChannel = escrowChannel;
    this.dynamicPricing = dynamicPricing;
    this._sessions = new Map(); // tokenHash -> session
    this._stats = {
      totalPurchased: 0,
      totalRevenue: 0,
      totalTokensUsed: 0,
      activeSessions: 0,
    };
  }

  setEscrowChannel(ec) { this.escrowChannel = ec; }
  setDynamicPricing(dp) { this.dynamicPricing = dp; }

  /**
   * Purchase inference credits.
   * @param {object} opts - { buyerAddress, amountUSDT, ttlSeconds, modelAllowList }
   * @returns {object} - { token, sessionId, credit, pricePerToken, expiresAt }
   */
  async purchase(opts = {}) {
    const { buyerAddress, amountUSDT, ttlSeconds, modelAllowList } = opts;
    if (!amountUSDT || amountUSDT <= 0) {
      throw new Error('amountUSDT must be positive');
    }

    // Get current price per token from DynamicPricing
    const pricePerToken = this.dynamicPricing
      ? this.dynamicPricing.getCurrentPrice()
      : 0.0001;

    // Convert USDT amount to token credits
    const credit = Math.floor(amountUSDT / pricePerToken);

    // Generate opaque session token
    const rawToken = 'chim_access_' + crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + (ttlSeconds || 3600) * 1000; // default 1 hour

    const session = {
      sessionId,
      tokenHash,
      buyerAddress: buyerAddress || null, // optional — can be anonymous
      credit,           // remaining token credits
      initialCredit: credit,
      pricePerToken,
      amountUSDT,
      modelAllowList: modelAllowList || null,
      createdAt: now,
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      tokensUsed: 0,
      requestCount: 0,
    };

    this._sessions.set(tokenHash, session);
    this._stats.totalPurchased++;
    this._stats.totalRevenue += amountUSDT;
    this._stats.activeSessions++;

    this.logger.info(
      `Session created: ${sessionId} (credit: ${credit} tokens, ${amountUSDT} USDT, expires: ${new Date(expiresAt).toISOString()})`
    );

    return {
      token: rawToken,
      sessionId,
      credit,
      pricePerToken,
      amountUSDT,
      expiresAt,
      modelAllowList: modelAllowList || null,
    };
  }

  /**
   * Validate a session token. Returns session info if valid, null otherwise.
   * Does NOT deduct credit — call charge() after inference completes.
   */
  validate(rawToken) {
    if (!rawToken || !rawToken.startsWith('chim_access_')) return null;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = this._sessions.get(tokenHash);
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (now > session.expiresAt) {
      this.logger.info(`Session ${session.sessionId} expired`);
      return null;
    }
    if (session.credit <= 0) {
      this.logger.info(`Session ${session.sessionId} out of credit`);
      return null;
    }

    return {
      sessionId: session.sessionId,
      credit: session.credit,
      pricePerToken: session.pricePerToken,
      modelAllowList: session.modelAllowList,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Charge a session for tokens used after an inference request.
   * @param {string} rawToken - the session token
   * @param {number} tokensUsed - total tokens (prompt + completion)
   * @returns {object} - { remaining, charged } or null if invalid
   */
  charge(rawToken, tokensUsed) {
    if (!rawToken || !rawToken.startsWith('chim_access_')) return null;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = this._sessions.get(tokenHash);
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (now > session.expiresAt) return null;

    const deduct = Math.min(tokensUsed, session.credit);
    session.credit -= deduct;
    session.tokensUsed += deduct;
    session.requestCount++;
    session.lastUsedAt = now;

    this._stats.totalTokensUsed += deduct;

    if (session.credit <= 0) {
      this.logger.info(`Session ${session.sessionId} credit depleted (${session.tokensUsed} tokens used)`);
    }

    return { remaining: session.credit, charged: deduct };
  }

  /**
   * Revoke a session by sessionId.
   */
  revoke(sessionId) {
    for (const [hash, session] of this._sessions) {
      if (session.sessionId === sessionId) {
        session.revokedAt = Date.now();
        this._stats.activeSessions--;
        this.logger.info(`Session revoked: ${sessionId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get session status by sessionId (no sensitive data).
   */
  getStatus(sessionId) {
    for (const session of this._sessions.values()) {
      if (session.sessionId === sessionId) {
        return {
          sessionId: session.sessionId,
          credit: session.credit,
          initialCredit: session.initialCredit,
          tokensUsed: session.tokensUsed,
          requestCount: session.requestCount,
          pricePerToken: session.pricePerToken,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastUsedAt: session.lastUsedAt,
          revokedAt: session.revokedAt,
          active: !session.revokedAt && Date.now() < session.expiresAt && session.credit > 0,
        };
      }
    }
    return null;
  }

  /**
   * List all active sessions (metadata only).
   */
  listActive() {
    const now = Date.now();
    return Array.from(this._sessions.values())
      .filter(s => !s.revokedAt && now < s.expiresAt && s.credit > 0)
      .map(s => ({
        sessionId: s.sessionId,
        credit: s.credit,
        tokensUsed: s.tokensUsed,
        requestCount: s.requestCount,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      }));
  }

  /**
   * Check if a model is allowed for a given session.
   */
  isModelAllowed(sessionInfo, model) {
    if (!sessionInfo || !sessionInfo.modelAllowList) return true;
    return sessionInfo.modelAllowList.includes(model);
  }

  /**
   * Get current pricing info.
   */
  getPricing() {
    const pricePerToken = this.dynamicPricing
      ? this.dynamicPricing.getCurrentPrice()
      : 0.0001;
    return {
      pricePerToken,
      pricePer1kTokens: Math.round(pricePerToken * 1000 * 10000) / 10000,
      currency: 'USDT',
      minPurchase: 0.01,
    };
  }

  /**
   * Get aggregate stats.
   */
  getStats() {
    return {
      ...this._stats,
      pricing: this.getPricing(),
    };
  }
}
