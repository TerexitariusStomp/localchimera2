import { Logger } from '../core/Logger.js';

/**
 * MarketplaceBroadcaster — P2P offer advertising and discovery.
 *
 * Inspired by Conduit's serverless marketplace: sellers advertise offers
 * (model + price + TPS) on the Hyperswarm DHT, buyers discover sellers,
 * request quotes, and negotiate. No central server — all via P2P gossip.
 *
 * Flow:
 *   1. Seller: advertiseOffer(offer) → broadcasts to DHT topic
 *   2. Buyer: discoverSellers() → queries DHT for active offers
 *   3. Buyer: requestQuote(sellerId, prompt) → sends quote request
 *   4. Seller: responds with quote (price, estimated TPS, ETA)
 *   5. Buyer: accepts quote → proceeds to EscrowChannel payment
 *
 * Integration: uses PearP2P for transport, CapabilityProber for offer
 * data, DynamicPricing for price computation.
 */

const MARKET_TOPIC = 'chimera:market:v1';
const OFFER_TTL_MS = 60 * 1000; // offers expire after 60s if not refreshed
const REFRESH_INTERVAL_MS = 30 * 1000;

export class MarketplaceBroadcaster {
  constructor(config = {}) {
    this.logger = new Logger('MarketplaceBroadcaster');
    this.enabled = config.enabled !== false;
    this.topic = config.topic || MARKET_TOPIC;
    this.offerTtl = config.offerTtl || OFFER_TTL_MS;
    this.refreshInterval = config.refreshInterval || REFRESH_INTERVAL_MS;
    this._p2p = null;
    this._capabilityProber = null;
    this._dynamicPricing = null;
    this._myOffer = null;
    this._discoveredOffers = new Map(); // sellerId -> { offer, discoveredAt }
    this._quoteRequests = new Map(); // quoteId -> { sellerId, prompt, status, quote }
    this._refreshTimer = null;
    this._stats = {
      offersBroadcast: 0,
      offersDiscovered: 0,
      quotesRequested: 0,
      quotesResponded: 0,
      quotesAccepted: 0,
    };
  }

  setP2P(p2p) {
    this._p2p = p2p;
  }

  setCapabilityProber(prober) {
    this._capabilityProber = prober;
  }

  setDynamicPricing(pricing) {
    this._dynamicPricing = pricing;
  }

  /**
   * Start broadcasting our offer if we can sell.
   */
  async start() {
    if (!this.enabled || !this._p2p) return;

    // Listen for offers and quote requests from other peers
    this._p2p.onMessage('market:offer', (msg, peer) => this._handleIncomingOffer(msg, peer));
    this._p2p.onMessage('market:quote_request', (msg, peer) => this._handleQuoteRequest(msg, peer));
    this._p2p.onMessage('market:quote_response', (msg, peer) => this._handleQuoteResponse(msg, peer));
    this._p2p.onMessage('market:quote_accept', (msg, peer) => this._handleQuoteAccept(msg, peer));

    // Build and broadcast our offer
    await this._buildAndBroadcastOffer();

    // Set up periodic refresh
    this._refreshTimer = setInterval(() => this._refreshOffer(), this.refreshInterval);
    this._refreshTimer.unref?.();

    this.logger.info('Marketplace broadcaster started');
  }

  stop() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._myOffer) {
      this._p2p?.broadcast('market:offer', { ...this._myOffer, withdrawn: true });
      this._myOffer = null;
    }
    this.logger.info('Marketplace broadcaster stopped');
  }

  /**
   * Build our offer from capability profile and pricing.
   */
  async _buildAndBroadcastOffer() {
    if (!this._capabilityProber) return;

    const profile = await this._capabilityProber.getProfile();
    if (!profile?.offer?.sellable) {
      this.logger.info('Not selling — buyer-only node');
      return;
    }

    let price = profile.pricing?.per1kTokens || 0.002;
    if (this._dynamicPricing) {
      const pricingStats = this._dynamicPricing.getStats();
      if (pricingStats.currentMultiplier) {
        price = price * pricingStats.currentMultiplier;
      }
    }

    this._myOffer = {
      sellerId: this._p2p?.nodeId || 'unknown',
      model: profile.offer.model,
      tier: profile.offer.tier,
      tps: profile.offer.tps,
      pricePer1k: Math.round(price * 10000) / 10000,
      currency: 'USDT',
      backend: profile.hardware.backend,
      available: true,
      broadcastAt: Date.now(),
      expiresAt: Date.now() + this.offerTtl,
    };

    this._p2p.broadcast('market:offer', this._myOffer);
    this._stats.offersBroadcast++;
    this.logger.info(`Offer broadcast: ${this._myOffer.model} @ ${this._myOffer.pricePer1k} USDT/1k tokens`);
  }

  /**
   * Refresh our offer periodically.
   */
  async _refreshOffer() {
    await this._buildAndBroadcastOffer();
  }

  /**
   * Handle incoming offer from another seller.
   */
  _handleIncomingOffer(msg, peer) {
    if (!msg || !msg.sellerId) return;
    if (msg.withdrawn) {
      this._discoveredOffers.delete(msg.sellerId);
      return;
    }

    this._discoveredOffers.set(msg.sellerId, {
      ...msg,
      discoveredAt: Date.now(),
      peerId: peer?.id,
    });
    this._stats.offersDiscovered++;
    this.logger.debug(`Discovered offer from ${msg.sellerId.slice(0, 12)}: ${msg.model} @ ${msg.pricePer1k}`);
  }

  /**
   * Discover all active seller offers.
   */
  discoverSellers() {
    const now = Date.now();
    // Clean expired offers
    for (const [sellerId, offer] of this._discoveredOffers) {
      if (now > offer.expiresAt) {
        this._discoveredOffers.delete(sellerId);
      }
    }
    return Array.from(this._discoveredOffers.values()).sort((a, b) => a.pricePer1k - b.pricePer1k);
  }

  /**
   * Request a quote from a specific seller.
   */
  async requestQuote(sellerId, prompt, options = {}) {
    if (!this._p2p) throw new Error('P2P not initialized');

    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request = {
      quoteId,
      sellerId,
      buyerId: this._p2p.nodeId,
      prompt: prompt.slice(0, 500), // truncate for quote
      maxTokens: options.maxTokens || 256,
      createdAt: Date.now(),
    };

    this._quoteRequests.set(quoteId, { ...request, status: 'pending', quote: null });
    this._p2p.send(sellerId, 'market:quote_request', request);
    this._stats.quotesRequested++;

    this.logger.info(`Quote requested: ${quoteId} → ${sellerId.slice(0, 12)}`);
    return quoteId;
  }

  /**
   * Handle a quote request from a buyer (seller side).
   */
  async _handleQuoteRequest(msg, peer) {
    if (!msg || !msg.quoteId) return;
    if (!this._myOffer || !this._myOffer.available) return;

    // Compute quote based on prompt length and our pricing
    const promptTokens = Math.ceil(msg.prompt.length / 4);
    const maxTokens = msg.maxTokens || 256;
    const totalTokens = promptTokens + maxTokens;
    const price = Math.round((totalTokens / 1000) * this._myOffer.pricePer1k * 10000) / 10000;
    const eta = Math.ceil(maxTokens / (this._myOffer.tps || 10)) * 1000; // ms

    const quote = {
      quoteId: msg.quoteId,
      sellerId: this._myOffer.sellerId,
      buyerId: msg.buyerId,
      price,
      currency: 'USDT',
      estimatedTps: this._myOffer.tps,
      estimatedEtaMs: eta,
      model: this._myOffer.model,
      validUntil: Date.now() + 30000, // 30s to accept
    };

    this._p2p.send(msg.buyerId, 'market:quote_response', quote);
    this._stats.quotesResponded++;
    this.logger.info(`Quote sent: ${quote.quoteId} — ${price} USDT`);
  }

  /**
   * Handle a quote response (buyer side).
   */
  _handleQuoteResponse(msg, peer) {
    if (!msg || !msg.quoteId) return;
    const request = this._quoteRequests.get(msg.quoteId);
    if (!request) return;

    request.status = 'quoted';
    request.quote = msg;
    this.logger.info(`Quote received: ${msg.quoteId} — ${msg.price} USDT, ETA ${msg.estimatedEtaMs}ms`);
  }

  /**
   * Accept a quote (buyer side).
   */
  async acceptQuote(quoteId) {
    const request = this._quoteRequests.get(quoteId);
    if (!request || request.status !== 'quoted') {
      throw new Error(`Quote ${quoteId} not found or not in quoted state`);
    }

    this._p2p.send(request.sellerId, 'market:quote_accept', {
      quoteId,
      buyerId: this._p2p.nodeId,
      acceptedAt: Date.now(),
    });

    request.status = 'accepted';
    this._stats.quotesAccepted++;
    this.logger.info(`Quote accepted: ${quoteId}`);
    return request.quote;
  }

  /**
   * Handle quote acceptance (seller side).
   */
  _handleQuoteAccept(msg, peer) {
    if (!msg || !msg.quoteId) return;
    this.logger.info(`Quote accepted by buyer: ${msg.quoteId}`);
    // Seller should now proceed to escrow channel setup
  }

  /**
   * Get quote status.
   */
  getQuote(quoteId) {
    return this._quoteRequests.get(quoteId) || null;
  }

  /**
   * Get our current offer.
   */
  getMyOffer() {
    return this._myOffer;
  }

  getStats() {
    return {
      enabled: this.enabled,
      isSelling: !!this._myOffer?.available,
      myOffer: this._myOffer ? {
        model: this._myOffer.model,
        tier: this._myOffer.tier,
        tps: this._myOffer.tps,
        pricePer1k: this._myOffer.pricePer1k,
      } : null,
      discoveredSellers: this._discoveredOffers.size,
      pendingQuotes: Array.from(this._quoteRequests.values()).filter(q => q.status === 'pending').length,
      offersBroadcast: this._stats.offersBroadcast,
      offersDiscovered: this._stats.offersDiscovered,
      quotesRequested: this._stats.quotesRequested,
      quotesResponded: this._stats.quotesResponded,
      quotesAccepted: this._stats.quotesAccepted,
    };
  }
}
