// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ZeeSwapSettlement as V1} from "../src/ZeeSwapSettlement.sol";
import {ZeeSwapSettlementV2 as V2} from "../src/ZeeSwapSettlementV2.sol";

contract RecoveryTestToken is ERC20 {
    bool public fee;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;

    constructor() ERC20("Recovery fixture", "FIX") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFee(bool enabled) external {
        fee = enabled;
    }

    function callback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (fee && from != address(0) && to != address(0)) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else {
            super._update(from, to, amount);
        }
        if (from == callbackTarget && to != address(0)) {
            (callbackSucceeded,) = callbackTarget.call(callbackData);
        }
    }
}

contract SettlementV2Test is Test {
    RecoveryTestToken internal token;
    V2 internal settlement;
    uint256 internal constant QUOTE_KEY = 0xA11CE;
    uint256 internal constant RECOVERY_KEY = 0xDEC0DE;
    address internal operator = address(0xB0B);
    address internal payer = address(0xCAFE);
    address internal recipient = address(0xBEEF);
    bytes32 internal constant ID = keccak256("public-v2-fixture");
    uint256 internal constant PRINCIPAL = 1_234_567;
    uint256 internal constant CANCEL_AT = 9100;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        token = new RecoveryTestToken();
        settlement = new V2(address(token), address(this), operator, vm.addr(QUOTE_KEY), vm.addr(RECOVERY_KEY));
        token.mint(address(this), 20_000_000);
        token.approve(address(settlement), type(uint256).max);
        settlement.depositInventory(20_000_000);
        token.mint(payer, 20_000_000);
        vm.prank(payer);
        token.approve(address(settlement), type(uint256).max);
    }

    function _sign(bytes32 body, uint256 key, address target, uint256 chain) internal pure returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ZeeSwapSettlement"),
                keccak256("1"),
                chain,
                target
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, body)));
        return abi.encodePacked(r, s, v);
    }

    function _fund(bytes32 id, uint256 nonce) internal {
        _fundAmount(id, nonce, PRINCIPAL);
    }

    function _fundAmount(bytes32 id, uint256 nonce, uint256 amount) internal {
        V1.Funding memory q = V1.Funding(id, address(token), payer, recipient, amount, nonce, 1900, CANCEL_AT);
        bytes32 body = keccak256(
            abi.encode(
                keccak256(
                    "Funding(bytes32 id,address token,address payer,address refundRecipient,uint256 amount,uint256 nonce,uint256 fundingCutoff,uint256 cancellationAvailableAt)"
                ),
                q
            )
        );
        bytes memory signature = _sign(body, QUOTE_KEY, address(settlement), block.chainid);
        vm.prank(payer);
        settlement.fund(q, signature);
    }

    function _commit(bytes32 id) internal {
        vm.prank(operator);
        settlement.commitPayout(id);
    }

    function _abortTerms(bytes32 id) internal view returns (V2.Abort memory) {
        return V2.Abort(
            id,
            recipient,
            PRINCIPAL,
            keccak256("evm-treasury-route-v1"),
            7,
            keccak256("public synthetic recovery certificate"),
            block.timestamp + 120
        );
    }

    function _abortSignature(V2.Abort memory q, uint256 key, address target, uint256 chain)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 body = keccak256(
            abi.encode(
                keccak256(
                    "Abort(bytes32 id,address refundRecipient,uint256 amount,bytes32 mode,uint256 nonce,bytes32 recoveryProofDigest,uint256 validUntil)"
                ),
                q
            )
        );
        return _sign(body, key, target, chain);
    }

    function _abort(V2.Abort memory q) internal {
        bytes memory sig = _abortSignature(q, RECOVERY_KEY, address(settlement), block.chainid);
        vm.prank(vm.addr(RECOVERY_KEY));
        settlement.abortEscrow(q, sig);
    }

    function _books(uint256 inventory, uint256 liability) internal view {
        assertEq(settlement.inventory(), inventory);
        assertEq(settlement.escrowLiability(), liability);
        assertEq(token.balanceOf(address(settlement)), inventory + liability);
    }

    function testAnyoneRefundAtExactDeadlineWhilePausedPreservesInventory() public {
        _fund(ID, 1);
        settlement.pause();
        vm.warp(CANCEL_AT - 1);
        vm.expectRevert(V1.Deadline.selector);
        settlement.refundFunded(ID);
        vm.warp(CANCEL_AT);
        vm.prank(address(0x1234));
        settlement.refundFunded(ID);
        assertEq(token.balanceOf(recipient), PRINCIPAL);
        assertEq(token.balanceOf(payer), 20_000_000 - PRINCIPAL);
        assertEq(uint256(settlement.states(ID)), uint256(V1.State.REFUNDED));
        _books(20_000_000, 0);
        vm.expectRevert(V1.InvalidState.selector);
        settlement.refundFunded(ID);
        vm.prank(payer);
        vm.expectRevert(V1.InvalidState.selector);
        settlement.refund(ID);
    }

    function testRefundWinsAtDeadlineCommitCannotWin() public {
        _fund(ID, 1);
        vm.warp(CANCEL_AT);
        vm.prank(operator);
        vm.expectRevert(V1.Deadline.selector);
        settlement.commitPayout(ID);
        settlement.refundFunded(ID);
        vm.prank(operator);
        vm.expectRevert(V1.InvalidState.selector);
        settlement.commitPayout(ID);
        _books(20_000_000, 0);
    }

    function testCommitBeforeDeadlineExcludesOrdinaryRefundForever() public {
        _fund(ID, 1);
        vm.warp(CANCEL_AT - 1);
        _commit(ID);
        vm.warp(CANCEL_AT + 100_000);
        vm.expectRevert(V1.InvalidState.selector);
        settlement.refundFunded(ID);
        _books(20_000_000, PRINCIPAL);
    }

    function testAbortRefundIsTerminalAndNeverEmitsDelivery() public {
        _fund(ID, 1);
        _commit(ID);
        settlement.pause();
        vm.recordLogs();
        _abort(_abortTerms(ID));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != keccak256("Paid(bytes32,address,uint256)"));
            assertTrue(logs[i].topics[0] != keccak256("EscrowSettled(bytes32,uint256)"));
        }
        assertEq(logs[logs.length - 1].topics[0], keccak256("EscrowAborted(bytes32,address,uint256,uint256,bytes32)"));
        assertEq(token.balanceOf(recipient), PRINCIPAL);
        assertTrue(settlement.usedAbortNonces(7));
        _books(20_000_000, 0);
        vm.prank(operator);
        vm.expectRevert(V1.InvalidState.selector);
        settlement.settleEscrow(ID);
        vm.expectRevert(V1.InvalidState.selector);
        _abort(_abortTerms(ID));
        settlement.unpause();
        _assertPayoutBlocked(ID);
        vm.expectRevert(V1.InvalidState.selector);
        _fund(ID, 2);
    }

    function testSettleWinsAbortRaceAndEscrowBecomesInventoryOnlyOnce() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        vm.prank(operator);
        settlement.settleEscrow(ID);
        vm.expectRevert(V1.InvalidState.selector);
        _abort(q);
        assertEq(token.balanceOf(recipient), 0);
        _books(20_000_000 + PRINCIPAL, 0);
    }

    function testAbortCannotTargetFundedOrPaidOrUnusedIds() public {
        vm.expectRevert(V1.InvalidState.selector);
        _abort(_abortTerms(ID));
        _fund(ID, 1);
        vm.expectRevert(V1.InvalidState.selector);
        _abort(_abortTerms(ID));
        bytes32 paidId = keccak256("paid");
        _reserve(paidId);
        vm.prank(operator);
        settlement.executePayout(paidId);
        vm.expectRevert(V1.InvalidState.selector);
        _abort(_abortTerms(paidId));
        _books(20_000_000 - PRINCIPAL, PRINCIPAL);
    }

    function testAbortRoleAndQuoteSignatureAreInsufficient() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        bytes memory sig = _abortSignature(q, RECOVERY_KEY, address(settlement), block.chainid);
        vm.prank(operator);
        vm.expectRevert();
        settlement.abortEscrow(q, sig);
        sig = _abortSignature(q, QUOTE_KEY, address(settlement), block.chainid);
        vm.prank(vm.addr(RECOVERY_KEY));
        vm.expectRevert(V1.InvalidSignature.selector);
        settlement.abortEscrow(q, sig);
        _books(20_000_000, PRINCIPAL);
    }

    function testAbortWrongRecipientAmountModeAndZeroProofRefuse() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        q.refundRecipient = payer;
        vm.expectRevert(V1.InvalidTerms.selector);
        _abort(q);
        q = _abortTerms(ID);
        q.amount--;
        vm.expectRevert(V1.InvalidTerms.selector);
        _abort(q);
        q = _abortTerms(ID);
        q.mode = keccak256("legacy-mode");
        vm.expectRevert(V1.InvalidTerms.selector);
        _abort(q);
        q = _abortTerms(ID);
        q.recoveryProofDigest = bytes32(0);
        vm.expectRevert(V1.InvalidTerms.selector);
        _abort(q);
        assertFalse(settlement.usedAbortNonces(7));
        _books(20_000_000, PRINCIPAL);
    }

    function testAbortWrongDomainAndMutatedProofRefuse() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        bytes memory sig = _abortSignature(q, RECOVERY_KEY, address(settlement), 84532);
        _expectInvalidSignature(q, sig);
        sig = _abortSignature(q, RECOVERY_KEY, address(0x123), block.chainid);
        _expectInvalidSignature(q, sig);
        sig = _abortSignature(q, RECOVERY_KEY, address(settlement), block.chainid);
        q.recoveryProofDigest = keccak256("mutated");
        _expectInvalidSignature(q, sig);
        _books(20_000_000, PRINCIPAL);
    }

    function _expectInvalidSignature(V2.Abort memory q, bytes memory sig) internal {
        vm.prank(vm.addr(RECOVERY_KEY));
        vm.expectRevert(V1.InvalidSignature.selector);
        settlement.abortEscrow(q, sig);
    }

    function testAbortAuthorizationExpiresAtExactBoundary() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        vm.warp(q.validUntil);
        vm.expectRevert(V1.Deadline.selector);
        _abort(q);
        _books(20_000_000, PRINCIPAL);
    }

    function testAbortNonceCannotBeReusedAcrossOrdersOrQuoteNonceSpace() public {
        _fund(ID, 7); // Quote nonce is deliberately the same as the later abort nonce.
        _commit(ID);
        bytes32 other = keccak256("other");
        _fund(other, 8);
        _commit(other);
        _abort(_abortTerms(ID));
        vm.expectRevert(V1.NonceUsed.selector);
        _abort(_abortTerms(other));
        assertEq(token.balanceOf(recipient), PRINCIPAL);
        _books(20_000_000, PRINCIPAL);
    }

    function testRevokedRecoverySignerCannotUseOldAuthorization() public {
        _fund(ID, 1);
        _commit(ID);
        V2.Abort memory q = _abortTerms(ID);
        bytes memory sig = _abortSignature(q, RECOVERY_KEY, address(settlement), block.chainid);
        settlement.grantRole(settlement.RECOVERY_ROLE(), address(0x456));
        settlement.revokeRole(settlement.RECOVERY_ROLE(), vm.addr(RECOVERY_KEY));
        vm.prank(address(0x456));
        vm.expectRevert(V1.InvalidSignature.selector);
        settlement.abortEscrow(q, sig);
    }

    function testEscrowNeverFundsInventoryWithdrawal() public {
        _fund(ID, 1);
        settlement.withdrawInventory(address(this), 20_000_000);
        vm.expectRevert(V1.InsufficientInventory.selector);
        settlement.withdrawInventory(address(this), PRINCIPAL);
        _commit(ID);
        _abort(_abortTerms(ID));
        _books(0, 0);
        assertEq(token.balanceOf(recipient), PRINCIPAL);
    }

    function testNonExactRefundRollsBackStateLiabilityAndNonce() public {
        _fund(ID, 1);
        _commit(ID);
        token.setFee(true);
        vm.expectRevert(V1.TransferMismatch.selector);
        _abort(_abortTerms(ID));
        assertEq(uint256(settlement.states(ID)), uint256(V1.State.PAYOUT_COMMITTED));
        assertFalse(settlement.usedAbortNonces(7));
        assertEq(token.balanceOf(recipient), 0);
        _books(20_000_000, PRINCIPAL);
        token.setFee(false);
        _abort(_abortTerms(ID));
        _books(20_000_000, 0);
    }

    function testRefundCallbackCannotReenterAnotherEscrow() public {
        _fund(ID, 1);
        bytes32 other = keccak256("other");
        _fund(other, 2);
        token.callback(address(settlement), abi.encodeCall(V2.refundFunded, (other)));
        vm.warp(CANCEL_AT);
        settlement.refundFunded(ID);
        assertFalse(token.callbackSucceeded());
        assertEq(uint256(settlement.states(other)), uint256(V1.State.FUNDED));
        _books(20_000_000, PRINCIPAL);
        settlement.refundFunded(other);
        _books(20_000_000, 0);
        assertEq(token.balanceOf(recipient), 2 * PRINCIPAL);
    }

    function testCancellationTombstonesRejectStaleAuthorizationAndLateTreasuryCredit() public {
        vm.prank(operator);
        settlement.cancelSettlement(ID);
        token.mint(address(settlement), PRINCIPAL); // Unattributed transfer is not inventory or Paid.
        _assertPayoutBlocked(ID);
        assertEq(settlement.inventory(), 20_000_000);
        assertEq(uint256(settlement.states(ID)), uint256(V1.State.CANCELLED));
        assertEq(token.balanceOf(recipient), 0);
    }

    function _reserve(bytes32 id) internal {
        V1.Payout memory q = V1.Payout(id, address(token), recipient, PRINCIPAL, 99, block.timestamp + 120);
        bytes memory sig = _sign(
            keccak256(
                abi.encode(
                    keccak256(
                        "Payout(bytes32 id,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
                    ),
                    q
                )
            ),
            QUOTE_KEY,
            address(settlement),
            block.chainid
        );
        vm.prank(operator);
        settlement.reservePayout(q, sig);
    }

    function _assertPayoutBlocked(bytes32 id) internal {
        vm.expectRevert(V1.InvalidState.selector);
        _reserve(id);
    }

    function testRecoveryMustBeSeparateAtDeploymentAndMainnetRemainsForbidden() public {
        vm.expectRevert(V1.InvalidTerms.selector);
        new V2(address(token), address(this), operator, vm.addr(QUOTE_KEY), operator);
        vm.chainId(1);
        vm.expectRevert("testnet only");
        new V2(address(token), address(this), operator, vm.addr(QUOTE_KEY), vm.addr(RECOVERY_KEY));
    }

    function testFuzzRefundBranchesPreserveOtherReservation(uint256 amount, bool committed) public {
        amount = bound(amount, 100_000, 10_000_000);
        _reserve(keccak256("independent payout"));
        _fundAmount(ID, 1, amount);
        _books(20_000_000, amount);
        if (committed) {
            _commit(ID);
            V2.Abort memory q = _abortTerms(ID);
            q.amount = amount;
            _abort(q);
        } else {
            vm.warp(CANCEL_AT);
            settlement.refundFunded(ID);
        }
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(payer), 20_000_000 - amount);
        assertEq(settlement.reservedInventory(), PRINCIPAL);
        assertEq(settlement.availableInventory(), 20_000_000 - PRINCIPAL);
        _books(20_000_000, 0);
    }
}
