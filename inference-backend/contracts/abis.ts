/**
 * Minimal ABI fragments for Chimera marketplace contracts.
 * These are aligned with the QVAC ComputeRegistry, OrderBook, EscrowVault, and Reputation.
 */

export const ComputeRegistryABI = [
  'function registerProvider(bytes32 qvacPeerId, string name, uint16 taskTypes, tuple(string modelId, uint256 pricePerRequest, uint256 minTPS, uint256 maxContextTokens)[] tiers, uint256 stakeAmount) external payable returns (address providerAddress)',
  'function updateProvider(address providerAddress, string name, uint16 taskTypes, tuple(string modelId, uint256 pricePerRequest, uint256 minTPS, uint256 maxContextTokens)[] tiers) external',
  'function pauseProvider(address providerAddress) external',
  'function resumeProvider(address providerAddress) external',
  'function slashProvider(address providerAddress, bytes proof) external',
  'function depositStake(address providerAddress) external payable',
  'function withdrawStake(address providerAddress, uint256 amount) external',
  'function getProvider(address providerAddress) external view returns (tuple(address authority, bytes32 qvacPeerId, string name, uint16 taskTypes, uint8 status, uint256 stake, uint256 registeredAt, uint256 updatedAt))',
  'function isActiveProvider(address providerAddress) external view returns (bool)',
  'function minimumStake() external view returns (uint256)',
  'event ProviderRegistered(address indexed authority, bytes32 indexed qvacPeerId, string name)',
  'event ProviderUpdated(address indexed authority, string name, uint16 taskTypes, tuple(string modelId, uint256 pricePerRequest, uint256 minTPS, uint256 maxContextTokens)[] tiers)',
  'event ProviderSlashed(address indexed authority, bytes proof)',
] as const;

export const OrderBookABI = [
  'function placeOrder(uint8 side, uint256 pricePerRequest, uint64 taskType, uint256 quantity, uint256 expiry, string modelId, bytes signature) external returns (bytes32 orderId)',
  'function cancelOrder(bytes32 orderId) external',
  'function fillOrder(bytes32 orderId, uint256 fillQuantity) external returns (uint256 filledAmount)',
  'event OrderPlaced(bytes32 indexed orderId, address indexed maker, uint8 side, uint256 price, uint256 quantity, uint64 taskType)',
  'event OrderFilled(bytes32 indexed orderId, address indexed maker, uint256 filledQuantity)',
] as const;

export const EscrowVaultABI = [
  'function createJob(address providerAuthority, bytes32 requestHash, uint64 nonce, uint64 taskType, uint64 validUntil, bytes quoteSignature, uint256 amount, address paymentMint, uint256 providerFeeBps) external payable returns (bytes32 jobId)',
  'function providerAck(bytes32 jobId) external',
  'function providerComplete(bytes32 jobId, bytes32 responseHash) external',
  'function consumerConfirm(bytes32 jobId) external',
  'function disputeJob(bytes32 jobId, bytes32 evidenceHash) external',
  'function resolveDispute(bytes32 jobId, bool consumerWins) external',
  'function refundJob(bytes32 jobId) external',
  'function getJob(address jobAddress) external view returns (tuple(bytes32 jobId, address consumer, address providerAuthority, bytes32 providerPeerId, bytes32 requestHash, uint64 nonce, uint64 taskType, uint64 validUntil, bytes quoteSignature, uint256 amount, address paymentMint, uint256 providerFeeBps, uint8 state, uint256 createdAt, uint256 providerAckedAt, uint256 providerCompletedAt, uint256 confirmWindowStart, uint256 settledAt, bytes32 responseHash, bytes32 attestationRoot, bytes32 disputeEvidenceHash, address arbitrator))',
  'event JobCreated(bytes32 indexed jobId, address indexed consumer, address indexed provider, uint256 amount)',
  'event JobProviderAcked(bytes32 indexed jobId)',
  'event JobProviderCompleted(bytes32 indexed jobId, bytes32 responseHash)',
  'event JobConsumerConfirmed(bytes32 indexed jobId)',
  'event JobAutoSettled(bytes32 indexed jobId)',
  'event JobRefunded(bytes32 indexed jobId, address indexed consumer, uint256 amount)',
  'event JobDisputed(bytes32 indexed jobId, address indexed disputer, bytes32 evidenceHash)',
  'event JobDisputeResolved(bytes32 indexed jobId, bool consumerWins)',
  'event ProtocolFeeCollected(uint256 amount)',
] as const;

export const ReputationABI = [
  'function recordJobCompleted(address providerAuthority, uint256 amount) external',
  'function recordJobDisputed(address providerAuthority) external',
  'function recordJobSlashed(address providerAuthority) external',
  'function anchorRatings(address providerAuthority, bytes32 ratingsCID) external',
  'function calculateReputationScore(address providerAuthority) external view returns (uint256 score)',
  'function getProviderReputation(address providerAuthority) external view returns (tuple(address providerAuthority, uint64 jobsCompleted, uint64 jobsDisputed, uint64 jobsSlashed, uint256 totalEarned, uint256 totalStaked, bytes32 ratingsCID, uint256 lastUpdate))',
  'event JobCompleted(address indexed provider, uint256 amount)',
  'event JobDisputed(address indexed provider)',
  'event JobSlashed(address indexed provider)',
  'event RatingsAnchored(address indexed provider, bytes32 ratingsCID)',
] as const;
