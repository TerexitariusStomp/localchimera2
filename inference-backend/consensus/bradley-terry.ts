/**
 * Bradley-Terry model for peer-ranked consensus.
 *
 * Given pairwise comparison results, estimates each peer's latent quality score
 * using maximum-likelihood estimation with damping and regularization.
 */

import { ComparisonPair, RankingScore } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface BTParams {
  damping: number;
  maxIterations: number;
  convergenceThreshold: number;
  regularizationLambda: number;
}

const DEFAULT_PARAMS: BTParams = {
  damping: 0.85,
  maxIterations: 100,
  convergenceThreshold: 1e-6,
  regularizationLambda: 0.1,
};

/**
 * Aggregate pairwise comparisons into peer quality scores.
 */
export function aggregateRankings(
  comparisons: ComparisonPair[],
  params: Partial<BTParams> = {}
): RankingScore[] {
  const opts = { ...DEFAULT_PARAMS, ...params };

  if (comparisons.length === 0) {
    return [];
  }

  // Build adjacency: wins[peerId] = total wins
  const peers = new Set<string>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const comparisonsPerPeer = new Map<string, number>();

  for (const c of comparisons) {
    peers.add(c.peerA);
    peers.add(c.peerB);

    if (c.preference === 'A') {
      wins.set(c.peerA, (wins.get(c.peerA) || 0) + 1);
      losses.set(c.peerB, (losses.get(c.peerB) || 0) + 1);
    } else if (c.preference === 'B') {
      wins.set(c.peerB, (wins.get(c.peerB) || 0) + 1);
      losses.set(c.peerA, (losses.get(c.peerA) || 0) + 1);
    }
    // ties contribute to neither win nor loss

    comparisonsPerPeer.set(c.peerA, (comparisonsPerPeer.get(c.peerA) || 0) + 1);
    comparisonsPerPeer.set(c.peerB, (comparisonsPerPeer.get(c.peerB) || 0) + 1);
  }

  // Initialize scores uniformly
  const peerList = Array.from(peers);
  let scores = new Map<string, number>();
  for (const peer of peerList) {
    scores.set(peer, 1.0);
  }

  // Iterative re-weighted least squares / MM algorithm
  for (let iter = 0; iter < opts.maxIterations; iter++) {
    const newScores = new Map<string, number>();

    for (const peer of peerList) {
      let numerator = opts.regularizationLambda; // prior
      let denominator = opts.regularizationLambda;

      for (const other of peerList) {
        if (peer === other) continue;

        const winCount = comparisons.filter(
          (c) =>
            (c.peerA === peer && c.peerB === other && c.preference === 'A') ||
            (c.peerB === peer && c.peerA === other && c.preference === 'B')
        ).length;

        const totalMatches = comparisons.filter(
          (c) =>
            (c.peerA === peer && c.peerB === other) ||
            (c.peerB === peer && c.peerA === other)
        ).length;

        if (totalMatches === 0) continue;

        const otherScore = scores.get(other)!;
        const expected = totalMatches / (1 + Math.exp(-(scores.get(peer)! - otherScore)));

        numerator += winCount;
        denominator += expected / scores.get(peer)!;
      }

      const rawScore = numerator / denominator;
      newScores.set(peer, opts.damping * rawScore + (1 - opts.damping) * scores.get(peer)!);
    }

    // Check convergence
    let maxDelta = 0;
    for (const peer of peerList) {
      const delta = Math.abs(newScores.get(peer)! - scores.get(peer)!);
      if (delta > maxDelta) maxDelta = delta;
    }

    scores = newScores;

    if (maxDelta < opts.convergenceThreshold) {
      logger.debug({ iterations: iter + 1 }, 'Bradley-Terry converged');
      break;
    }
  }

  // Normalize to mean 1.0 for interpretability
  const meanScore = peerList.reduce((sum, p) => sum + scores.get(p)!, 0) / peerList.length;

  return peerList.map((peerId) => {
    const raw = scores.get(peerId)!;
    const n = comparisonsPerPeer.get(peerId) || 0;

    // Confidence scales with number of comparisons
    const confidence = Math.min(1.0, n / 20);

    return {
      peerId,
      score: raw / meanScore,
      confidence,
      comparisons: n,
    };
  });
}

/**
 * Weighted majority vote using BT scores as weights.
 */
export function weightedMajorityVote(
  responses: Array<{ peerId: string; output: string }>,
  rankings: RankingScore[]
): { output: string; confidence: number } {
  const scoreMap = new Map(rankings.map((r) => [r.peerId, r.score]));

  // Group identical outputs and sum weights
  const voteTotals = new Map<string, number>();
  for (const resp of responses) {
    const weight = scoreMap.get(resp.peerId) || 0.5;
    voteTotals.set(resp.output, (voteTotals.get(resp.output) || 0) + weight);
  }

  let bestOutput = '';
  let bestWeight = -1;
  let totalWeight = 0;

  for (const [output, weight] of voteTotals) {
    totalWeight += weight;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestOutput = output;
    }
  }

  const confidence = totalWeight > 0 ? bestWeight / totalWeight : 0;
  return { output: bestOutput, confidence };
}
