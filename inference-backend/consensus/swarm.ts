/**
 * Swarm consensus manager.
 *
 * Handles:
 * - Peer discovery via ComputeRegistry
 * - Dual-role node operation (inference + judging)
 * - Distributed pairwise comparison generation
 * - Bradley-Terry aggregation
 * - Reputation-weighted output selection
 */

import { EventEmitter } from 'events';
import {
  InferenceRequest,
  InferenceResult,
  PeerNode,
  ComparisonPair,
  RankingScore,
  ConsensusResult,
  NodeConfig,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { aggregateRankings, weightedMajorityVote } from './bradley-terry.js';
import { CasperMarketplaceClient } from '../contracts/marketplace.js';

export interface SwarmManagerOptions {
  nodeId: string;
  config: NodeConfig;
  contracts: CasperMarketplaceClient;
}

export class SwarmManager extends EventEmitter {
  private nodeId: string;
  private config: NodeConfig;
  private contracts: CasperMarketplaceClient;
  private peers: Map<string, PeerNode> = new Map();
  private comparisons: ComparisonPair[] = [];
  private rankings: Map<string, RankingScore> = new Map();
  private runningQueries = new Set<string>();

  constructor(options: SwarmManagerOptions) {
    super();
    this.nodeId = options.nodeId;
    this.config = options.config;
    this.contracts = options.contracts;
  }

  // ─── Peer Discovery ───────────────────────────────────────────────────────

  async refreshPeers(): Promise<void> {
    // In a real implementation, this would scan ComputeRegistry events
    // or query a DHT / relay node for active peers.
    // For testnet, we bootstrap from known peers or coordinator.
    logger.debug('Refreshing peer list');
    this.emit('peers:refresh', Array.from(this.peers.values()));
  }

  addPeer(peer: PeerNode): void {
    this.peers.set(peer.peerId, peer);
    logger.debug({ peerId: peer.peerId, reputation: peer.reputationScore }, 'Peer added');
  }

  removePeer(peerId: string): void {
    this.peers.delete(peerId);
    logger.debug({ peerId }, 'Peer removed');
  }

  getActivePeers(): PeerNode[] {
    return Array.from(this.peers.values()).filter(
      (p) => Date.now() - p.lastSeen < 60000 // seen in last 60s
    );
  }

  // ─── Dual-Role: Inference ─────────────────────────────────────────────────

  /**
   * Run local inference on the request (generator role).
   */
  async runInference(request: InferenceRequest): Promise<InferenceResult> {
    logger.info({ jobId: request.jobId, modelId: request.modelId }, 'Running local inference');

    const start = Date.now();

    // TODO: delegate to actual inference backend (ONNX / Python / mock)
    const output = `Mock inference result for job ${request.jobId}`;
    const computeMs = Date.now() - start;

    return {
      jobId: request.jobId,
      output,
      usage: {
        promptTokens: request.prompt.length / 4,
        completionTokens: output.length / 4,
        totalTokens: (request.prompt.length + output.length) / 4,
        computeMs,
        memoryPeakMB: 256,
      },
    };
  }

  // ─── Dual-Role: Judging ───────────────────────────────────────────────────

  /**
   * Judge a pairwise comparison between two peer responses (judge role).
   */
  async judgePair(
    query: string,
    responseA: string,
    responseB: string,
    peerA: string,
    peerB: string
  ): Promise<ComparisonPair> {
    const preference = await this.evaluatePreference(query, responseA, responseB);

    const comparison: ComparisonPair = {
      queryId: this.hashQuery(query),
      peerA,
      peerB,
      responseA,
      responseB,
      judgePeerId: this.nodeId,
      preference,
      timestamp: Date.now(),
    };

    this.comparisons.push(comparison);
    this.emit('comparison', comparison);

    // Trim comparison history to window size
    if (this.comparisons.length > this.config.rankingWindowSize) {
      this.comparisons = this.comparisons.slice(-this.config.rankingWindowSize);
    }

    return comparison;
  }

  /**
   * Evaluate which response is better.
   * In production, this uses a lightweight local discriminator model.
   * For testnet, we use a simple heuristic or LLM-as-judge.
   */
  private async evaluatePreference(
    _query: string,
    responseA: string,
    responseB: string
  ): Promise<'A' | 'B' | 'tie'> {
    // Heuristic: prefer longer, more structured responses
    const scoreA = this.heuristicScore(responseA);
    const scoreB = this.heuristicScore(responseB);

    const delta = Math.abs(scoreA - scoreB);
    if (delta < 0.05) return 'tie';
    return scoreA > scoreB ? 'A' : 'B';
  }

  private heuristicScore(text: string): number {
    // Simple heuristic: length + sentence count + punctuation density
    const length = text.length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const punctuation = (text.match(/[.!?,:;]/g) || []).length / Math.max(1, length);
    return length * 0.001 + sentences * 0.1 + punctuation * 10;
  }

  // ─── Swarm Consensus ──────────────────────────────────────────────────────

  /**
   * Execute full swarm consensus for a query:
   * 1. Dispatch to N peers
   * 2. Collect responses
   * 3. Generate pairwise comparisons via judging
   * 4. Aggregate with Bradley-Terry
   * 5. Return weighted majority output
   */
  async executeSwarmConsensus(
    request: InferenceRequest,
    peerResponses: Array<{ peerId: string; output: string }>
  ): Promise<ConsensusResult> {
    if (this.runningQueries.has(request.jobId)) {
      throw new Error(`Query ${request.jobId} already in progress`);
    }
    this.runningQueries.add(request.jobId);

    try {
      logger.info(
        { jobId: request.jobId, peers: peerResponses.length },
        'Starting swarm consensus'
      );

      // Step 1: Generate pairwise comparisons
      const comparisons = await this.generateComparisons(request.prompt, peerResponses);

      // Step 2: Bradley-Terry aggregation
      const rankings = aggregateRankings(comparisons, {
        maxIterations: 100,
        convergenceThreshold: 1e-6,
      });

      // Step 3: Weighted majority vote
      const vote = weightedMajorityVote(peerResponses, rankings);

      // Step 4: Update local reputation cache
      for (const r of rankings) {
        this.rankings.set(r.peerId, r);
      }

      const result: ConsensusResult = {
        queryId: request.jobId,
        finalOutput: vote.output,
        aggregatedRankings: rankings,
        contributingPeers: peerResponses.map((r) => r.peerId),
        confidence: vote.confidence,
        settledAt: Date.now(),
      };

      this.emit('consensus:settled', result);
      logger.info(
        { jobId: request.jobId, confidence: vote.confidence, peers: peerResponses.length },
        'Swarm consensus settled'
      );

      return result;
    } finally {
      this.runningQueries.delete(request.jobId);
    }
  }

  private async generateComparisons(
    query: string,
    responses: Array<{ peerId: string; output: string }>
  ): Promise<ComparisonPair[]> {
    const comparisons: ComparisonPair[] = [];

    // Compare each unique pair
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const comp = await this.judgePair(
          query,
          responses[i].output,
          responses[j].output,
          responses[i].peerId,
          responses[j].peerId
        );
        comparisons.push(comp);
      }
    }

    return comparisons;
  }

  // ─── Reputation Integration ───────────────────────────────────────────────

  async syncReputationFromChain(): Promise<void> {
    for (const peer of this.peers.values()) {
      try {
        const score = await this.contracts.getScore(peer.address);
        peer.reputationScore = score;
      } catch (err) {
        logger.warn({ peerId: peer.peerId, err }, 'Failed to sync reputation');
      }
    }
  }

  getLocalRanking(peerId: string): RankingScore | undefined {
    return this.rankings.get(peerId);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private hashQuery(query: string): string {
    // Simple deterministic hash for testnet
    let h = 0;
    for (let i = 0; i < query.length; i++) {
      h = ((h << 5) - h + query.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16).padStart(16, '0');
  }
}
