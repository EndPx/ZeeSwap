// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ZeeSwapBridge as Bridge} from "../src/ZeeSwapBridge.sol";

contract BridgeTest is Test {
    uint256 internal constant KEY = 0xA11CE; // Public local test fixture only.
    address internal operator = address(0xB0B);
    address internal payer = address(0xCAFE);
    Bridge internal bridge;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        bridge = new Bridge(address(this), operator, vm.addr(KEY));
        bridge.unpause();
    }

    function mintTerms() internal view returns (Bridge.Mint memory) {
        return Bridge.Mint(keccak256("fixture-mint"), payer, 100_000_000, 1, block.timestamp + 120);
    }

    function redeemTerms() internal view returns (Bridge.Redemption memory) {
        return Bridge.Redemption(
            keccak256("fixture-redemption"),
            payer,
            10_000_000,
            keccak256("opaque-salted-fixture"),
            2,
            block.timestamp + 120
        );
    }

    function sign(bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function issue() internal {
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        vm.prank(operator);
        bridge.mint(q, sig);
    }

    function request() internal {
        Bridge.Redemption memory q = redeemTerms();
        bytes memory sig = sign(bridge.redemptionDigest(q));
        vm.prank(payer);
        bridge.requestRedemption(q, sig);
    }

    function testIdentityAndExactIssuance() public {
        issue();
        assertEq(bridge.name(), "ZeeSwap Bridged Testnet Zcash");
        assertEq(bridge.symbol(), "zeeTAZ");
        assertEq(bridge.decimals(), 8);
        assertEq(bridge.balanceOf(payer), 100_000_000);
        assertEq(bridge.totalSupply(), 100_000_000);
        assertEq(uint8(bridge.mintStates(mintTerms().id)), uint8(Bridge.MintState.MINTED));
    }

    function testDeploymentStartsPausedUntilAdministratorOpensIt() public {
        Bridge initial = new Bridge(address(this), operator, vm.addr(KEY));
        assertTrue(initial.paused());
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(initial.mintDigest(q));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(operator);
        initial.mint(q, sig);
        Bridge.Redemption memory r = redeemTerms();
        sig = sign(initial.redemptionDigest(r));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(payer);
        initial.requestRedemption(r, sig);
        vm.prank(operator);
        initial.cancelMint(q.id);
        vm.expectRevert(Bridge.Unauthorized.selector);
        vm.prank(operator);
        initial.unpause();
        initial.unpause();
        assertFalse(initial.paused());
        assertEq(initial.totalSupply(), 0);
    }

    function testDigestsMatchIndependentEIP712Encoding() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ZeeSwapBridge"),
                keccak256("1"),
                uint256(31337),
                address(bridge)
            )
        );
        Bridge.Mint memory q = mintTerms();
        bytes32 mintBody = keccak256(
            abi.encode(
                keccak256("Mint(bytes32 id,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"),
                q.id,
                q.recipient,
                q.amount,
                q.nonce,
                q.deadline
            )
        );
        assertEq(bridge.mintDigest(q), keccak256(abi.encodePacked("\x19\x01", domain, mintBody)));
        Bridge.Redemption memory r = redeemTerms();
        bytes32 redemptionBody = keccak256(
            abi.encode(
                keccak256(
                    "Redemption(bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline)"
                ),
                r.id,
                r.payer,
                r.amount,
                r.payoutCommitment,
                r.nonce,
                r.deadline
            )
        );
        assertEq(bridge.redemptionDigest(r), keccak256(abi.encodePacked("\x19\x01", domain, redemptionBody)));
    }

    function testMintAndCancellationArePermanentExclusiveBranches() public {
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        vm.prank(operator);
        bridge.cancelMint(q.id);
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.mint(q, sig);
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.cancelMint(q.id);
        q.id = keccak256("mint-wins");
        sig = sign(bridge.mintDigest(q));
        vm.prank(operator);
        bridge.mint(q, sig);
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.cancelMint(q.id);
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.mint(q, sig);
    }

    function testTamperedMintTermsRejected() public {
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        for (uint256 i; i < 5; ++i) {
            Bridge.Mint memory changed = mintTerms();
            if (i == 0) changed.id = keccak256("changed");
            if (i == 1) changed.recipient = address(0x123);
            if (i == 2) changed.amount -= 1;
            if (i == 3) changed.nonce += 1;
            if (i == 4) changed.deadline += 1;
            vm.expectRevert(Bridge.InvalidSignature.selector);
            vm.prank(operator);
            bridge.mint(changed, sig);
        }
    }

    function testSignatureDomainRejectsOtherContractAndChain() public {
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        Bridge other = new Bridge(address(this), operator, vm.addr(KEY));
        other.unpause();
        vm.expectRevert(Bridge.InvalidSignature.selector);
        vm.prank(operator);
        other.mint(q, sig);
        vm.chainId(84532);
        vm.expectRevert(Bridge.InvalidSignature.selector);
        vm.prank(operator);
        bridge.mint(q, sig);
    }

    function testNonceCannotBeReusedAcrossMintAndRedemption() public {
        issue();
        Bridge.Mint memory q = mintTerms();
        q.id = keccak256("different-mint");
        bytes memory sig = sign(bridge.mintDigest(q));
        vm.expectRevert(Bridge.NonceUsed.selector);
        vm.prank(operator);
        bridge.mint(q, sig);
        Bridge.Redemption memory r = redeemTerms();
        r.nonce = 1;
        sig = sign(bridge.redemptionDigest(r));
        vm.expectRevert(Bridge.NonceUsed.selector);
        vm.prank(payer);
        bridge.requestRedemption(r, sig);
    }

    function testRolesAndConstructorBoundaries() public {
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        vm.expectRevert(Bridge.Unauthorized.selector);
        bridge.mint(q, sig);
        vm.expectRevert(Bridge.Unauthorized.selector);
        bridge.cancelMint(q.id);
        vm.expectRevert(Bridge.Unauthorized.selector);
        bridge.acknowledgeRedemption(q.id, keccak256("evidence"));
        vm.expectRevert(Bridge.Unauthorized.selector);
        vm.prank(operator);
        bridge.pause();
        vm.expectRevert(Bridge.InvalidTerms.selector);
        new Bridge(operator, operator, vm.addr(KEY));
        vm.expectRevert(Bridge.InvalidTerms.selector);
        new Bridge(vm.addr(KEY), operator, vm.addr(KEY));
        vm.expectRevert(Bridge.InvalidTerms.selector);
        new Bridge(address(this), address(0), vm.addr(KEY));
        vm.chainId(1);
        vm.expectRevert("testnet only");
        new Bridge(address(this), operator, vm.addr(KEY));
    }

    function testMintInvalidBoundsRecipientIdAndDeadline() public {
        for (uint256 i; i < 6; ++i) {
            Bridge.Mint memory q = mintTerms();
            if (i == 0) q.amount = bridge.MIN_AMOUNT() - 1;
            if (i == 1) q.amount = bridge.MAX_AMOUNT() + 1;
            if (i == 2) q.recipient = address(0);
            if (i == 3) q.id = bytes32(0);
            if (i == 4) q.recipient = address(bridge);
            if (i == 5) q.deadline = block.timestamp;
            bytes memory sig = sign(bridge.mintDigest(q));
            vm.expectRevert(i == 5 ? Bridge.Deadline.selector : Bridge.InvalidTerms.selector);
            vm.prank(operator);
            bridge.mint(q, sig);
        }
    }

    function testPauseBlocksExposureAllowsExistingAcknowledgementAndCancellation() public {
        issue();
        request();
        bridge.pause();
        Bridge.Mint memory q = mintTerms();
        bytes memory sig = sign(bridge.mintDigest(q));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(operator);
        bridge.mint(q, sig);
        Bridge.Redemption memory r = redeemTerms();
        sig = sign(bridge.redemptionDigest(r));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(payer);
        bridge.requestRedemption(r, sig);
        vm.prank(operator);
        bridge.cancelMint(keccak256("cancel-while-paused"));
        vm.prank(operator);
        bridge.acknowledgeRedemption(r.id, keccak256("opaque-salted-evidence"));
        assertEq(bridge.unpaidRedemptionPrincipal(), 0);
        bridge.unpause();
        assertFalse(bridge.paused());
    }

    function testBurnRequiresPayerAndNeverAllowance() public {
        issue();
        Bridge.Redemption memory q = redeemTerms();
        bytes memory sig = sign(bridge.redemptionDigest(q));
        vm.prank(payer);
        bridge.approve(operator, type(uint256).max);
        vm.expectRevert(Bridge.Unauthorized.selector);
        vm.prank(operator);
        bridge.requestRedemption(q, sig);
        assertEq(bridge.totalSupply(), 100_000_000);
        vm.prank(payer);
        bridge.requestRedemption(q, sig);
        assertEq(bridge.totalSupply(), 90_000_000);
        assertEq(bridge.unpaidRedemptionPrincipal(), 10_000_000);
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(payer);
        bridge.requestRedemption(q, sig);
    }

    function testRedemptionTamperingAndZeroCommitmentRejected() public {
        issue();
        Bridge.Redemption memory q = redeemTerms();
        bytes memory sig = sign(bridge.redemptionDigest(q));
        for (uint256 i; i < 6; ++i) {
            Bridge.Redemption memory changed = redeemTerms();
            if (i == 0) changed.id = keccak256("changed");
            if (i == 1) changed.payer = address(0x123);
            if (i == 2) changed.amount -= 1;
            if (i == 3) changed.payoutCommitment = keccak256("different-commitment");
            if (i == 4) changed.nonce += 1;
            if (i == 5) changed.deadline += 1;
            vm.expectRevert(Bridge.InvalidSignature.selector);
            vm.prank(changed.payer);
            bridge.requestRedemption(changed, sig);
        }
        q.payoutCommitment = bytes32(0);
        sig = sign(bridge.redemptionDigest(q));
        vm.expectRevert(Bridge.InvalidTerms.selector);
        vm.prank(payer);
        bridge.requestRedemption(q, sig);
    }

    function testAcknowledgementOnceAndOpaqueEvidenceRequired() public {
        issue();
        request();
        Bridge.Redemption memory r = redeemTerms();
        vm.expectRevert(Bridge.InvalidTerms.selector);
        vm.prank(operator);
        bridge.acknowledgeRedemption(r.id, bytes32(0));
        vm.warp(block.timestamp + 10000);
        assertEq(bridge.unpaidRedemptionPrincipal(), r.amount);
        vm.prank(operator);
        bridge.acknowledgeRedemption(r.id, keccak256("opaque-salted-evidence"));
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.acknowledgeRedemption(r.id, keccak256("another"));
        vm.expectRevert(Bridge.InvalidState.selector);
        vm.prank(operator);
        bridge.acknowledgeRedemption(keccak256("unknown"), keccak256("another"));
        assertEq(bridge.unpaidRedemptionPrincipal(), 0);
    }

    function testInsufficientBalanceRollsBackNonceAndLiability() public {
        Bridge.Redemption memory r = redeemTerms();
        bytes memory sig = sign(bridge.redemptionDigest(r));
        vm.expectRevert();
        vm.prank(payer);
        bridge.requestRedemption(r, sig);
        assertFalse(bridge.usedNonces(r.nonce));
        assertEq(bridge.unpaidRedemptionPrincipal(), 0);
        (, uint256 amount,,) = bridge.redemptions(r.id);
        assertEq(amount, 0);
    }

    function testFuzzBurnConservesPrincipalAndAckReducesIt(uint256 input) public {
        issue();
        Bridge.Redemption memory r = redeemTerms();
        r.amount = bound(input, bridge.MIN_AMOUNT(), bridge.MAX_AMOUNT());
        bytes memory sig = sign(bridge.redemptionDigest(r));
        vm.prank(payer);
        bridge.requestRedemption(r, sig);
        assertEq(bridge.totalSupply() + bridge.unpaidRedemptionPrincipal(), 100_000_000);
        vm.prank(operator);
        bridge.acknowledgeRedemption(r.id, keccak256("opaque-salted-evidence"));
        assertEq(bridge.totalSupply() + bridge.unpaidRedemptionPrincipal(), 100_000_000 - r.amount);
    }
}
