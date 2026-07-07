// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "contracts/ChimeraReactive.sol";

/**
 * @notice Deploy a ChimeraReactive contract on Reactive Network to automate hybrid fallback.
 * @dev Required environment variables:
 *   - REACTIVE_RPC_URL: RPC URL for Reactive Network (mainnet or Lasna testnet).
 *   - REACTIVE_PRIVATE_KEY: deployer private key.
 *   - BOTCHAIN_ORIGIN_CHAIN_ID: EIP155 chain ID of the Botchain origin network.
 *   - BOTCHAIN_COORDINATOR_ADDRESS: address of the deployed ChimeraCoordinator on the origin chain.
 *   - REACTIVE_CRON_TOPIC: CRON topic for the desired tick interval.
 *       Cron1    = 0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514
 *       Cron10   = 0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687
 *       Cron100  = 0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70
 *       Cron1000 = 0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4
 *
 * Example:
 *   REACTIVE_RPC_URL=https://lasna.reactive.network/...
 *   BOTCHAIN_ORIGIN_CHAIN_ID=968
 *   BOTCHAIN_COORDINATOR_ADDRESS=0x...
 *   REACTIVE_CRON_TOPIC=0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687
 *   forge script scripts/deploy/DeployChimeraReactive.s.sol --rpc-url $REACTIVE_RPC_URL --broadcast
 */
contract DeployChimeraReactive is Script {
    function run() external {
        uint256 originChainId = vm.envUint("BOTCHAIN_ORIGIN_CHAIN_ID");
        address coordinator = vm.envAddress("BOTCHAIN_COORDINATOR_ADDRESS");
        uint256 cronTopic = vm.envUint("REACTIVE_CRON_TOPIC");
        uint256 deployerKey = vm.envUint("REACTIVE_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        ChimeraReactive reactive = new ChimeraReactive{value: 0.01 ether}(originChainId, coordinator, cronTopic);
        vm.stopBroadcast();

        console.log("ChimeraReactive deployed at:", address(reactive));
        console.log("Origin chain ID:", originChainId);
        console.log("Coordinator:", coordinator);
        console.log("CRON topic:", cronTopic);
    }
}
