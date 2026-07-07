// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IChimeraCoordinator {
    function setBridgeDispatcher(address _bridgeDispatcher) external;
    function setBridgeData(
        uint64 taskType,
        address receiver,
        uint256 destinationChainId,
        bytes calldata lifiCallData
    ) external;
    function setRefundBridgeData(
        uint64 taskType,
        address receiver,
        uint256 destinationChainId,
        bytes calldata lifiCallData
    ) external;
    function setRefundTimeout(uint256 newTimeout) external;
}

/**
 * @notice Configure the ChimeraCoordinator to use the ChimeraBridgeDispatcher and refund bridge.
 * @dev Required environment variables:
 *   - BOTCHAIN_COORDINATOR_ADDRESS: address of the deployed ChimeraCoordinator.
 *   - BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS: address of the deployed ChimeraBridgeDispatcher.
 *   - BRIDGE_RECEIVER: address that should receive bridged funds on the destination chain.
 *   - BRIDGE_DESTINATION_CHAIN_ID: Li.Fi destination chain id for the forward bridge.
 *   - BRIDGE_LIFI_CALLDATA: hex-encoded Li.Fi diamond call data for the forward bridge.
 *   - REFUND_BRIDGE_RECEIVER: address that should receive refunded funds on the origin chain (consumer or coordinator).
 *   - REFUND_BRIDGE_DESTINATION_CHAIN_ID: Li.Fi destination chain id for the refund bridge (usually the origin chain).
 *   - REFUND_BRIDGE_LIFI_CALLDATA: hex-encoded Li.Fi diamond call data for the refund bridge.
 *   - REFUND_TIMEOUT_SECONDS: seconds after bridging before a refund is allowed (default 1 hour).
 *   - PRIVATE_KEY: owner key of the coordinator.
 *
 * Run once per task type you want to support. Example:
 *   BRIDGE_LIFI_CALLDATA=0x...
 *   REFUND_BRIDGE_LIFI_CALLDATA=0x...
 *   forge script scripts/deploy/ConfigureChimeraBridge.s.sol --rpc-url https://rpc.bohr.life --broadcast
 */
contract ConfigureChimeraBridge is Script {
    function run() external {
        address coordinator = vm.envAddress("BOTCHAIN_COORDINATOR_ADDRESS");
        address dispatcher = vm.envAddress("BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS");
        address receiver = vm.envAddress("BRIDGE_RECEIVER");
        uint256 destinationChainId = vm.envUint("BRIDGE_DESTINATION_CHAIN_ID");
        bytes memory lifiCallData = vm.envBytes("BRIDGE_LIFI_CALLDATA");
        address refundReceiver = vm.envAddress("REFUND_BRIDGE_RECEIVER");
        uint256 refundDestinationChainId = vm.envUint("REFUND_BRIDGE_DESTINATION_CHAIN_ID");
        bytes memory refundLifiCallData = vm.envBytes("REFUND_BRIDGE_LIFI_CALLDATA");
        uint256 refundTimeout = vm.envOr("REFUND_TIMEOUT_SECONDS", uint256(3600));
        uint64 taskType = uint64(vm.envUint("BRIDGE_TASK_TYPE")); // 1=compute, 2=storage, 4=inference, 8=bandwidth
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        IChimeraCoordinator(coordinator).setBridgeDispatcher(dispatcher);
        IChimeraCoordinator(coordinator).setBridgeData(taskType, receiver, destinationChainId, lifiCallData);
        IChimeraCoordinator(coordinator).setRefundBridgeData(taskType, refundReceiver, refundDestinationChainId, refundLifiCallData);
        IChimeraCoordinator(coordinator).setRefundTimeout(refundTimeout);
        vm.stopBroadcast();
    }
}
