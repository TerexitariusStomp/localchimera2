// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "fhevm/lib/FHE.sol";
import { ZamaEthereumConfig } from "fhevm/config/ZamaConfig.sol";

/**
 * @title FHEInferenceMarket
 * @dev On-chain FHE inference job registry using Zama fhEVM.
 *
 * The prompt is encrypted byte-by-byte off-chain as `externalEuint8` handles.
 * The contract verifies the handles via `FHE.fromExternal`, then a provider
 * runs a homomorphic shift circuit (+1 per byte) on-chain without ever seeing
 * the plaintext. The result handles are allowed back to the tasker for off-chain
 * decryption.
 *
 * Inherits `ZamaEthereumConfig`, which sets up the coprocessor/ACL/KMS addresses
 * for Ethereum mainnet (chainId 1), Sepolia (chainId 11155111), or local
 * Hardhat/Anvil (chainId 31337). For other EVM chains, configure the same
 * protocol contracts via `FHE.setCoprocessor` in the constructor.
 */
contract FHEInferenceMarket is ZamaEthereumConfig {
    struct Job {
        address tasker;
        address provider;
        euint8[] prompt;
        euint8[] result;
        bool exists;
        bool processed;
    }

    mapping(bytes32 => Job) public jobs;

    event JobCreated(bytes32 indexed jobId, address indexed tasker, uint256 length);
    event JobAssigned(bytes32 indexed jobId, address indexed provider);
    event JobProcessed(bytes32 indexed jobId);

    /**
     * @notice Create an encrypted inference job.
     * @param prompt Handles for each encrypted prompt byte. The tasker must
     *               allow this contract to use these handles when creating them.
     * @param inputProof ZK proof for the encrypted inputs; required on first use.
     * @return jobId Unique identifier for the job.
     */
    function createJob(
        externalEuint8[] calldata prompt,
        bytes calldata inputProof
    ) external returns (bytes32 jobId) {
        euint8[] memory verified = new euint8[](prompt.length);
        for (uint256 i = 0; i < prompt.length; i++) {
            verified[i] = FHE.fromExternal(prompt[i], inputProof);
            FHE.allowThis(verified[i]);
        }

        jobId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, prompt, block.number)
        );

        Job storage job = jobs[jobId];
        job.tasker = msg.sender;
        job.provider = address(0);
        for (uint256 i = 0; i < verified.length; i++) {
            job.prompt.push(verified[i]);
        }
        job.exists = true;
        job.processed = false;

        emit JobCreated(jobId, msg.sender, prompt.length);
    }

    /**
     * @notice Assign a provider to a job. Only the tasker can assign.
     */
    function assignProvider(bytes32 jobId, address provider) external {
        Job storage job = jobs[jobId];
        require(job.exists, "job not found");
        require(job.tasker == msg.sender, "not tasker");
        job.provider = provider;
        emit JobAssigned(jobId, provider);
    }

    /**
     * @notice Run the homomorphic inference circuit on the encrypted prompt.
     * @dev The provider never sees the plaintext. The circuit is a simple +1
     * shift per byte; it demonstrates a real FHE operation inside the contract.
     */
    function processJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.exists, "job not found");
        require(job.provider == msg.sender, "not provider");
        require(!job.processed, "already processed");

        euint8 one = FHE.asEuint8(1);
        for (uint256 i = 0; i < job.prompt.length; i++) {
            euint8 shifted = FHE.add(job.prompt[i], one);
            job.result.push(shifted);
            FHE.allow(shifted, job.tasker);
            FHE.allowThis(shifted);
        }
        job.processed = true;

        emit JobProcessed(jobId);
    }

    /**
     * @notice Return the encrypted result handles to the tasker.
     */
    function getResult(bytes32 jobId) external view returns (euint8[] memory) {
        Job storage job = jobs[jobId];
        require(job.exists, "job not found");
        require(job.tasker == msg.sender, "not tasker");
        require(job.processed, "not processed");
        return job.result;
    }
}
