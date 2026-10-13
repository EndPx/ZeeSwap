// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ZeeSwapSettlement} from "../src/ZeeSwapSettlement.sol";

contract Deploy is Script {
    function run() external returns (MockUSDC token, ZeeSwapSettlement settlement) {
        require(block.chainid == 84532, "Base Sepolia only");
        address admin = vm.envAddress("ZEE_DEPLOYER");
        address operator = vm.envAddress("ZEE_OPERATOR");
        require(admin != address(0) && operator != address(0) && admin != operator, "separate operator required");
        vm.startBroadcast(admin);
        token = new MockUSDC(admin, admin);
        settlement = new ZeeSwapSettlement(address(token), admin, operator, operator);
        // Deploy empty: minting and inventory funding are separate, explicit setup actions.
        vm.stopBroadcast();
    }
}
