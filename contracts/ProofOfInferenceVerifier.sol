// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ProofOfInferenceVerifier
 * @dev On-chain verification of Proof-of-Inference receipts produced by Chimera nodes.
 *
 * Inspired by InferMart (on-chain USDT settlement) and Edge-AI-Nexus (verifiable inference).
 *
 * Each receipt contains:
 *   - merkleRoot: SHA-256 Merkle root of (promptHash, outputHash, modelId, timestamp, routeId)
 *   - signature: secp256k1 signature (r, s, recoveryId) over the merkleRoot
 *   - publicKey: secp256k1 public key (uncompressed, 65 bytes)
 *   - previousHash: SHA-256 of the previous receipt (tamper-evident chain)
 *   - chainIndex: sequential index in the chain
 *
 * Verification flow:
 *   1. Node submits a receipt to verifyInference()
 *   2. Contract recovers the public key from the signature using ecrecover
 *   3. Contract checks that the recovered address matches the registered node address
 *   4. Contract emits InferenceVerified event with the receipt data
 *   5. USDT settlement can be triggered based on verified receipts
 *
 * The contract also tracks the latest chain index per node to detect gaps.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ProofOfInferenceVerifier {
    // Receipt structure (packed for gas efficiency)
    struct Receipt {
        bytes32 merkleRoot;
        bytes32 promptHash;
        bytes32 outputHash;
        uint256 timestamp;
        uint256 chainIndex;
        uint256 tokensGenerated;
        uint256 durationMs;
        bytes32 sigR;
        bytes32 sigS;
        uint8 recoveryId;
        bytes publicKey; // 65 bytes uncompressed
        bytes32 previousHash;
    }

    // Node registration
    struct NodeInfo {
        address nodeAddress;
        bytes32 publicKeyHash; // keccak256 of the 65-byte uncompressed public key
        uint256 latestChainIndex;
        uint256 totalReceipts;
        uint256 totalTokens;
        bool registered;
    }

    // USDT token contract
    IERC20 public immutable usdt;

    // Node registry: publicKeyHash => NodeInfo
    mapping(bytes32 => NodeInfo) public nodes;

    // Verified receipts: merkleRoot => verified
    mapping(bytes32 => bool) public verifiedReceipts;

    // Settlement records
    struct Settlement {
        bytes32 merkleRoot;
        uint256 amount;
        uint256 timestamp;
    }
    mapping(bytes32 => Settlement[]) public settlements;

    // Events
    event NodeRegistered(bytes32 indexed publicKeyHash, address indexed nodeAddress);
    event InferenceVerified(
        bytes32 indexed publicKeyHash,
        bytes32 indexed merkleRoot,
        uint256 chainIndex,
        uint256 tokensGenerated,
        uint256 timestamp
    );
    event SettlementExecuted(
        bytes32 indexed merkleRoot,
        address indexed recipient,
        uint256 amount
    );

    // Config
    uint256 public constant MAX_SETTLE_PER_TX = 100;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdt) {
        usdt = IERC20(_usdt);
        owner = msg.sender;
    }

    /**
     * @dev Register a node by its public key hash.
     * @param publicKeyHash keccak256 of the 65-byte uncompressed secp256k1 public key
     */
    function registerNode(bytes32 publicKeyHash) external {
        require(!nodes[publicKeyHash].registered, "Already registered");
        nodes[publicKeyHash] = NodeInfo({
            nodeAddress: msg.sender,
            publicKeyHash: publicKeyHash,
            latestChainIndex: 0,
            totalReceipts: 0,
            totalTokens: 0,
            registered: true
        });
        emit NodeRegistered(publicKeyHash, msg.sender);
    }

    /**
     * @dev Verify a proof-of-inference receipt on-chain.
     * Uses ecrecover to verify the secp256k1 signature over the merkleRoot.
     *
     * Note: Chimera uses raw secp256k1 (not Ethereum's prefixed signing),
     * so we derive the Ethereum address from the public key and compare.
     *
     * @param receipt The inference receipt to verify
     */
    function verifyInference(Receipt calldata receipt) external returns (bool) {
        bytes32 pubKeyHash = keccak256(receipt.publicKey);
        NodeInfo storage node = nodes[pubKeyHash];
        require(node.registered, "Node not registered");
        require(!verifiedReceipts[receipt.merkleRoot], "Already verified");
        require(receipt.chainIndex == node.latestChainIndex + 1, "Chain index mismatch");

        // Recover signer address from signature
        // The signature is over the merkleRoot (no Ethereum prefix, raw secp256k1)
        bytes32 ethSignedHash = receipt.merkleRoot; // No prefix for raw secp256k1
        address recovered = ecrecover(ethSignedHash, receipt.recoveryId + 27, receipt.sigR, receipt.sigS);

        // Derive expected address from public key
        // For uncompressed public key: take last 20 bytes of keccak256(pubKey[1:])
        bytes32 pubKeyAddrHash = keccak256(receipt.publicKey[1:]);
        address expectedAddr = address(uint160(uint256(pubKeyAddrHash)));

        require(recovered == expectedAddr, "Signature verification failed");

        // Mark as verified
        verifiedReceipts[receipt.merkleRoot] = true;
        node.latestChainIndex = receipt.chainIndex;
        node.totalReceipts++;
        node.totalTokens += receipt.tokensGenerated;

        emit InferenceVerified(
            pubKeyHash,
            receipt.merkleRoot,
            receipt.chainIndex,
            receipt.tokensGenerated,
            receipt.timestamp
        );

        return true;
    }

    /**
     * @dev Batch verify multiple receipts in a single transaction.
     */
    function verifyBatch(Receipt[] calldata receipts) external returns (uint256) {
        require(receipts.length <= MAX_SETTLE_PER_TX, "Too many receipts");
        uint256 verified = 0;
        for (uint256 i = 0; i < receipts.length; i++) {
            try this.verifyInference(receipts[i]) {
                verified++;
            } catch {
                // Skip failed verifications
            }
        }
        return verified;
    }

    /**
     * @dev Settle USDT for verified inference receipts.
     * @param merkleRoot The merkle root of the verified receipt
     * @param recipient The address to receive USDT
     * @param amount The amount of USDT (in 6 decimals)
     */
    function settle(
        bytes32 merkleRoot,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        require(verifiedReceipts[merkleRoot], "Receipt not verified");
        require(amount > 0, "Amount must be > 0");

        require(usdt.transfer(recipient, amount), "USDT transfer failed");

        settlements[merkleRoot].push(Settlement({
            merkleRoot: merkleRoot,
            amount: amount,
            timestamp: block.timestamp
        }));

        emit SettlementExecuted(merkleRoot, recipient, amount);
    }

    /**
     * @dev Batch settle multiple verified receipts.
     */
    function settleBatch(
        bytes32[] calldata merkleRoots,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            merkleRoots.length == recipients.length && recipients.length == amounts.length,
            "Array length mismatch"
        );
        require(merkleRoots.length <= MAX_SETTLE_PER_TX, "Too many settlements");

        for (uint256 i = 0; i < merkleRoots.length; i++) {
            require(verifiedReceipts[merkleRoots[i]], "Receipt not verified");
            require(usdt.transfer(recipients[i], amounts[i]), "USDT transfer failed");

            settlements[merkleRoots[i]].push(Settlement({
                merkleRoot: merkleRoots[i],
                amount: amounts[i],
                timestamp: block.timestamp
            }));

            emit SettlementExecuted(merkleRoots[i], recipients[i], amounts[i]);
        }
    }

    /**
     * @dev Get node info by public key hash.
     */
    function getNode(bytes32 publicKeyHash) external view returns (NodeInfo memory) {
        return nodes[publicKeyHash];
    }

    /**
     * @dev Get settlement count for a receipt.
     */
    function getSettlementCount(bytes32 merkleRoot) external view returns (uint256) {
        return settlements[merkleRoot].length;
    }

    /**
     * @dev Check if a receipt has been verified.
     */
    function isVerified(bytes32 merkleRoot) external view returns (bool) {
        return verifiedReceipts[merkleRoot];
    }
}
