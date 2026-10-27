// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ZeeSwapUSDCFaucet} from "../src/ZeeSwapUSDCFaucet.sol";

contract FaucetWrongDecimals is ERC20 {
    constructor() ERC20("Wrong", "WRONG") {}
}

contract FaucetFeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else {
            super._update(from, to, amount);
        }
    }
}

contract USDCFaucetTest is Test {
    address constant TOKEN = 0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    ZeeSwapUSDCFaucet faucet;
    MockUSDC token;
    event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        MockUSDC implementation = new MockUSDC(address(this), address(this));
        vm.etch(TOKEN, address(implementation).code);
        token = MockUSDC(TOKEN);
        faucet = new ZeeSwapUSDCFaucet();
        deal(TOKEN, address(faucet), 1000e6, true);
    }

    function testExactClaimEventAndIndependentWallets() public {
        vm.expectEmit(true, false, false, true, address(faucet));
        emit Claimed(ALICE, 10e6, 87400);
        vm.prank(ALICE);
        faucet.claim();
        assertEq(token.balanceOf(ALICE), 10e6);
        assertEq(token.balanceOf(address(faucet)), 990e6);
        assertEq(faucet.nextClaimAt(ALICE), 87400);
        assertEq(faucet.nextClaimAt(BOB), 0);
        vm.prank(BOB);
        faucet.claim();
        assertEq(token.balanceOf(BOB), 10e6);
        assertEq(faucet.CLAIM_AMOUNT(), 10e6);
        assertEq(faucet.COOLDOWN(), 86400);
        assertEq(faucet.TOKEN(), TOKEN);
    }

    function testCooldownBoundaryAndNoDoubleClaim() public {
        vm.prank(ALICE);
        faucet.claim();
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(ZeeSwapUSDCFaucet.CooldownActive.selector, 87400));
        faucet.claim();
        vm.warp(87399);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(ZeeSwapUSDCFaucet.CooldownActive.selector, 87400));
        faucet.claim();
        vm.warp(87400);
        vm.prank(ALICE);
        faucet.claim();
        assertEq(token.balanceOf(ALICE), 20e6);
    }

    function testInsufficientReserveDoesNotConsumeCooldown() public {
        deal(TOKEN, address(faucet), 10e6 - 1);
        vm.prank(ALICE);
        vm.expectRevert(ZeeSwapUSDCFaucet.InsufficientReserve.selector);
        faucet.claim();
        assertEq(faucet.nextClaimAt(ALICE), 0);
        assertEq(token.balanceOf(ALICE), 0);
        deal(TOKEN, address(faucet), 10e6);
        vm.prank(ALICE);
        faucet.claim();
        assertEq(token.balanceOf(address(faucet)), 0);
    }

    function testWrongChainDeploymentAndClaimRefuse() public {
        vm.chainId(1);
        vm.expectRevert(ZeeSwapUSDCFaucet.WrongChain.selector);
        new ZeeSwapUSDCFaucet();
        vm.prank(ALICE);
        vm.expectRevert(ZeeSwapUSDCFaucet.WrongChain.selector);
        faucet.claim();
    }

    function testBaseSepoliaAllowed() public {
        vm.chainId(84532);
        ZeeSwapUSDCFaucet other = new ZeeSwapUSDCFaucet();
        assertEq(other.TOKEN(), TOKEN);
    }

    function testOnlyFixedTokenWithSixDecimals() public {
        vm.etch(TOKEN, hex"");
        vm.expectRevert(ZeeSwapUSDCFaucet.InvalidToken.selector);
        new ZeeSwapUSDCFaucet();
        FaucetWrongDecimals wrong = new FaucetWrongDecimals();
        vm.etch(TOKEN, address(wrong).code);
        vm.expectRevert(ZeeSwapUSDCFaucet.InvalidToken.selector);
        new ZeeSwapUSDCFaucet();
    }

    function testFeeTokenTransferRollsBackBalanceAndCooldown() public {
        FaucetFeeToken fee = new FaucetFeeToken();
        vm.etch(TOKEN, address(fee).code);
        faucet = new ZeeSwapUSDCFaucet();
        deal(TOKEN, address(faucet), 10e6);
        vm.prank(ALICE);
        vm.expectRevert(ZeeSwapUSDCFaucet.InexactTransfer.selector);
        faucet.claim();
        assertEq(faucet.nextClaimAt(ALICE), 0);
        assertEq(token.balanceOf(ALICE), 0);
        assertEq(token.balanceOf(address(faucet)), 10e6);
    }

    function testFaucetHasNoMintRole() public view {
        assertFalse(token.hasRole(token.MINTER_ROLE(), address(faucet)));
        assertFalse(token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(faucet)));
    }
}
