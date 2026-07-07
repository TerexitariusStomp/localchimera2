// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../../contracts/ChimeraBridgeDispatcher.sol";

/**
 * @notice Deploy the ChimeraBridgeDispatcher contract.
 * @dev Required environment variables:
 *   - BOTCHAIN_LIFI_DIAMOND: Li.Fi diamond address on Botchain (or the target chain).
 *   - PRIVATE_KEY: deployer key.
 */
contract DeployChimeraBridgeDispatcher is Script {
    function run() external returns (ChimeraBridgeDispatcher dispatcher) {
        address lifiDiamond = vm.envAddress("BOTCHAIN_LIFI_DIAMOND");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        dispatcher = new ChimeraBridgeDispatcher(lifiDiamond);
        vm.stopBroadcast();
    }
}
