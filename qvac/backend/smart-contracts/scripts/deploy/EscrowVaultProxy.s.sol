// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/EscrowVault.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract EscrowVaultProxyDeploy is Script {
    function run() external {
        address computeRegistry = vm.envAddress("COMPUTE_REGISTRY");
        address reputation = vm.envAddress("REPUTATION");
        address owner = vm.envAddress("OWNER");
        address protocolFeeRecipient = vm.envAddress("PROTOCOL_FEE_RECIPIENT");

        vm.startBroadcast();

        EscrowVault implementation = new EscrowVault();
        bytes memory initData = abi.encodeWithSelector(
            EscrowVault.initialize.selector,
            computeRegistry,
            reputation,
            owner,
            protocolFeeRecipient
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        console.log("Implementation:", address(implementation));
        console.log("Proxy:", address(proxy));
    }
}
