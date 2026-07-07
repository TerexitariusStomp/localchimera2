// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ComputeRegistry.sol";
import "../contracts/OrderBook.sol";
import "../contracts/Reputation.sol";
import "../contracts/EscrowVault.sol";
import "../contracts/PaymentChannel.sol";

/**
 * @title DeployChimera
 * @notice Foundry deployment script for Chimera-Fortytwo marketplace contracts.
 *         Deploys ComputeRegistry, Reputation, EscrowVault, and OrderBook.
 *
 * Environment:
 *   PRIVATE_KEY       — deployer private key
 *   FEE_RECIPIENT     — protocol fee recipient address (defaults to deployer)
 *   MINIMUM_STAKE     — minimum provider stake in wei (default: 1 ether)
 *
 * Usage:
 *   forge script scripts/DeployChimera.s.sol:DeployChimera \
 *     --rpc-url https://rpc.bohr.life --broadcast --verify \
 *     --verifier blockscout --verifier-url https://scan.bohr.life/api/
 */
contract DeployChimera is Script {
    uint256 public constant DEFAULT_MINIMUM_STAKE = 1 ether;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", vm.addr(deployerPrivateKey));
        uint256 minimumStake = vm.envOr("MINIMUM_STAKE", DEFAULT_MINIMUM_STAKE);

        vm.startBroadcast(deployerPrivateKey);

        console.log("========================================");
        console.log("Chimera Marketplace Contract Deployment");
        console.log("========================================");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("FeeRecipient:", feeRecipient);
        console.log("MinimumStake:", minimumStake);

        // 1. ComputeRegistry
        ComputeRegistry registry = new ComputeRegistry(
            vm.addr(deployerPrivateKey),
            feeRecipient,
            minimumStake
        );
        console.log("ComputeRegistry deployed at:", address(registry));

        // 2. Reputation (pass address(0) for escrowVault; will wire later)
        Reputation reputation = new Reputation(
            vm.addr(deployerPrivateKey),
            address(registry),
            address(0)
        );
        console.log("Reputation deployed at:", address(reputation));

        // 3. EscrowVault
        EscrowVault escrow = new EscrowVault(
            address(registry),
            address(reputation),
            vm.addr(deployerPrivateKey),
            feeRecipient
        );
        console.log("EscrowVault deployed at:", address(escrow));

        // 4. Wire Reputation escrowVault
        reputation.setEscrowVault(address(escrow));
        console.log("Reputation escrowVault wired to:", address(escrow));

        // 5. OrderBook
        OrderBook orderBook = new OrderBook(
            address(registry),
            vm.addr(deployerPrivateKey)
        );
        console.log("OrderBook deployed at:", address(orderBook));

        // 6. PaymentChannel
        PaymentChannel paymentChannel = new PaymentChannel();
        console.log("PaymentChannel deployed at:", address(paymentChannel));

        console.log("========================================");
        console.log("Deployment complete!");
        console.log("========================================");
        console.log('"computeRegistry": "%s",', address(registry));
        console.log('"orderBook": "%s",', address(orderBook));
        console.log('"escrowVault": "%s",', address(escrow));
        console.log('"reputation": "%s",', address(reputation));
        console.log('"paymentChannel": "%s"', address(paymentChannel));

        vm.stopBroadcast();
    }
}
