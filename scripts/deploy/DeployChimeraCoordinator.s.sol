// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../contracts/ChimeraCoordinator.sol";

contract DeployChimeraCoordinator is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address escrowVault = vm.envAddress("BOTCHAIN_ESCROW_VAULT");
        address computeRegistry = vm.envAddress("BOTCHAIN_COMPUTE_REGISTRY");

        vm.startBroadcast(deployerPrivateKey);

        ChimeraCoordinator coordinator = new ChimeraCoordinator(escrowVault, computeRegistry);

        vm.stopBroadcast();

        console.log("ChimeraCoordinator deployed at:", address(coordinator));
        console.log("Escrow vault:", escrowVault);
        console.log("Compute registry:", computeRegistry);
        console.log("Chain ID:", block.chainid);
    }
}
