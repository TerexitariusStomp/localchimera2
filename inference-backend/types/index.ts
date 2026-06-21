/**
 * Core type definitions for the Chimera-Fortytwo node.
 * Aligned with QVAC coordinator protocol and Fortytwo swarm inference.
 */

// ============================================================================
// Node Identity & Configuration
// ============================================================================

export interface NodeConfig {
  name: string;
  region: string;
  capacityTokensPerSec: number;
  minPriceWei: bigint;
  stakeWei: bigint;
  modelCacheDir: string;
  defaultModel: string;
  modelFormat: 'gguf' | 'onnx' | 'wasm';
  inferenceBackend: 'onnx' | 'python' | 'mock';
  pythonInferenceUrl?: string;
  consensusMinPeers: number;
  consensusMatchTimeoutMs: number;
  rankingWindowSize: number;
}

export interface NodeIdentity {
  peerId: string;
  address: string;
  publicKey: string;
  stakeAmount: bigint;
  registeredAt: number;
  status: NodeStatus;
}

export type NodeStatus = 'active' | 'paused' | 'slashed' | 'pending';

// ============================================================================
// Model & Inference
// ============================================================================

export interface ModelSpec {
  modelId: string;
  version: string;
  format: 'gguf' | 'onnx' | 'wasm';
  sizeBytes: number;
  sha256: string;
  cdnUrl?: string;
  parameters?: Record<string, unknown>;
}

export interface InferenceParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  stop?: string[];
  seed?: number;
}

export interface InferenceRequest {
  jobId: string;
  modelId: string;
  prompt: string;
  params: InferenceParams;
  deadline: number;
}

export interface InferenceResult {
  jobId: string;
  output: string;
  usage: UsageMetrics;
  metadata?: Record<string, unknown>;
}

export interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  computeMs: number;
  memoryPeakMB: number;
}

export interface JobResult {
  jobId: string;
  output: unknown;
  usage: UsageMetrics;
  proof?: unknown;
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export type ErrorCode = NodeErrorCode;

// ============================================================================
// Peer-Ranked Consensus (Fortytwo)
// ============================================================================

export interface PeerNode {
  peerId: string;
  address: string;
  reputationScore: number;
  lastSeen: number;
  capabilities: string[];
}

export interface ComparisonPair {
  queryId: string;
  peerA: string;
  peerB: string;
  responseA: string;
  responseB: string;
  judgePeerId: string;
  preference: 'A' | 'B' | 'tie';
  timestamp: number;
}

export interface RankingScore {
  peerId: string;
  score: number;
  confidence: number;
  comparisons: number;
}

export interface ConsensusResult {
  queryId: string;
  finalOutput: string;
  aggregatedRankings: RankingScore[];
  contributingPeers: string[];
  confidence: number;
  settledAt: number;
}

// ============================================================================
// Chimera Coordinator Protocol
// ============================================================================

export interface WSEnvelope<T = unknown> {
  v: 1;
  t: string;
  id: string;
  ts: number;
  payload: T;
}

export type MessageType =
  | 'INIT'
  | 'SESSION_TICKET'
  | 'JOB_DISPATCH'
  | 'MODEL_DELIVERY'
  | 'HEARTBEAT'
  | 'HEARTBEAT_ACK'
  | 'RESULT_SUBMIT'
  | 'RESULT_ACK'
  | 'ERROR'
  | 'REFRESH_TOKEN'
  | 'MODEL_READY'
  | 'CONSENSUS_REQUEST'
  | 'CONSENSUS_RESPONSE';

export interface JobPayload {
  jobId: string;
  modelId: string;
  input: unknown;
  params: InferenceParams;
  deadline: number;
  payment: PaymentInfo;
}

export interface PaymentInfo {
  escrowId: string;
  amount: string;
  token: string;
}

export interface ResultAckPayload {
  jobId: string;
  accepted: boolean;
  settlementTxId?: string;
  earnings?: { amount: string; token: string };
  retryAfterMs?: number;
}

export type JobStatus = 'idle' | 'loading' | 'inference' | 'complete' | 'error';

export interface HeartbeatMetrics {
  jobId?: string;
  status: JobStatus;
  progress?: number;
  memoryMB: number;
  cpuMs: number;
  tokensGenerated?: number;
}

// ============================================================================
// Smart Contract Events
// ============================================================================

export interface ProviderRegisteredEvent {
  provider: string;
  peerId: string;
  stake: bigint;
  metadata: string;
}

export interface JobCreatedEvent {
  jobId: string;
  consumer: string;
  provider: string;
  amount: bigint;
  modelId: string;
}

export interface JobSettledEvent {
  jobId: string;
  provider: string;
  payout: bigint;
  protocolFee: bigint;
}

// ============================================================================
// Errors
// ============================================================================

export type NodeErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'EXECUTION_TIMEOUT'
  | 'OOM'
  | 'AUTH_EXPIRED'
  | 'INVALID_JOB'
  | 'RATE_LIMITED'
  | 'CONNECTION_FAILED'
  | 'PROTOCOL_ERROR'
  | 'CONSENSUS_FAILED'
  | 'STAKE_INSUFFICIENT'
  | 'SLASHED';

export class NodeError extends Error {
  constructor(
    public readonly code: NodeErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'NodeError';
  }
}
