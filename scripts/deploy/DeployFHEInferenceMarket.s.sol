// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../contracts/FHEInferenceMarket.sol";

contract DeployFHEInferenceMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        FHEInferenceMarket market = new FHEInferenceMarket();

        vm.stopBroadcast();

        console.log("FHEInferenceMarket deployed at:", address(market));
        console.log("Chain ID:", block.chainid);
    }
}
