// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ZeeSwapUSDCFaucet} from "../src/ZeeSwapUSDCFaucet.sol";

/// @notice Root-operated deployment only; select the protected deployer with --account.
contract DeployUSDCFaucet is Script {
    address internal constant TOKEN = 0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63;
    bytes32 internal constant TOKEN_CODE_HASH = 0x46c011d67236b418b5af0e8ebb45036224c42d331f7414cc0fff2ed7ffe967bd;
    uint256 public constant INITIAL_STOCK = 1_000_000_000; // 1,000 USDC, six decimals.

    function run() external returns (ZeeSwapUSDCFaucet faucet) {
        require(block.chainid == 84532, "Base Sepolia only");
        require(TOKEN.codehash == TOKEN_CODE_HASH, "unexpected token runtime");
        vm.startBroadcast();
        faucet = new ZeeSwapUSDCFaucet();
        // The selected deployer must already hold MINTER_ROLE. Never grant it to the faucet.
        MockUSDC(TOKEN).mint(address(faucet), INITIAL_STOCK);
        require(MockUSDC(TOKEN).balanceOf(address(faucet)) == INITIAL_STOCK, "incorrect faucet stock");
        vm.stopBroadcast();
    }
}
