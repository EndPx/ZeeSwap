// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ZeeSwapSettlement as Settlement} from "../src/ZeeSwapSettlement.sol";

contract FeeToken is ERC20 {
    bool public fee;

    constructor() ERC20("Lookalike", "mockUSDC") {
        _mint(msg.sender, 1000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setFee(bool value) external {
        fee = value;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (fee && from != address(0) && to != address(0)) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else {
            super._update(from, to, amount);
        }
    }
}

contract SettlementTest is Test {
    MockUSDC internal token;
    Settlement internal settlement;
    uint256 internal constant SIGNER_KEY = 0xA11CE; // Public test fixture only.
    address internal operator = address(0xB0B);
    address internal payer = address(0xCAFE);
    address internal recipient = address(0xBEEF);
    bytes32 internal constant ID = keccak256("public-test-order");

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        token = new MockUSDC(address(this), address(this));
        settlement = new Settlement(address(token), address(this), operator, vm.addr(SIGNER_KEY));
        token.mint(address(this), 100e6);
        token.approve(address(settlement), type(uint256).max);
        settlement.depositInventory(20e6);
        token.mint(payer, 20e6);
        vm.prank(payer);
        token.approve(address(settlement), type(uint256).max);
    }

    function payout() internal view returns (Settlement.Payout memory) {
        return Settlement.Payout(ID, address(token), recipient, 1e6, 1, block.timestamp + 120);
    }

    function funding() internal view returns (Settlement.Funding memory) {
        return
            Settlement.Funding(ID, address(token), payer, payer, 1e6, 2, block.timestamp + 900, block.timestamp + 8100);
    }

    function domain(address target) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ZeeSwapSettlement"),
                keccak256("1"),
                block.chainid,
                target
            )
        );
    }

    function sign(bytes32 body, address target) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(SIGNER_KEY, keccak256(abi.encodePacked("\x19\x01", domain(target), body)));
        return abi.encodePacked(r, s, v);
    }

    function payoutSignature(Settlement.Payout memory q) internal view returns (bytes memory) {
        return sign(
            keccak256(
                abi.encode(
                    keccak256(
                        "Payout(bytes32 id,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
                    ),
                    q.id,
                    q.token,
                    q.recipient,
                    q.amount,
                    q.nonce,
                    q.deadline
                )
            ),
            address(settlement)
        );
    }

    function fundingSignature(Settlement.Funding memory q) internal view returns (bytes memory) {
        return sign(
            keccak256(
                abi.encode(
                    keccak256(
                        "Funding(bytes32 id,address token,address payer,address refundRecipient,uint256 amount,uint256 nonce,uint256 fundingCutoff,uint256 cancellationAvailableAt)"
                    ),
                    q.id,
                    q.token,
                    q.payer,
                    q.refundRecipient,
                    q.amount,
                    q.nonce,
                    q.fundingCutoff,
                    q.cancellationAvailableAt
                )
            ),
            address(settlement)
        );
    }

    function reserve(Settlement.Payout memory q) internal {
        bytes memory sig = payoutSignature(q);
        vm.prank(operator);
        settlement.reservePayout(q, sig);
    }

    function fund(Settlement.Funding memory q) internal {
        bytes memory sig = fundingSignature(q);
        vm.prank(payer);
        settlement.fund(q, sig);
    }

    function testMockIdentityAndMinterSeparation() public {
        assertEq(token.decimals(), 6);
        assertEq(token.name(), "ZeeSwap Mock USDC");
        assertFalse(token.hasRole(token.MINTER_ROLE(), operator));
        vm.prank(operator);
        vm.expectRevert();
        token.mint(operator, 1);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(payer);
        vm.expectRevert();
        token.grantRole(minterRole, payer);
    }

    function testRejectMainnetDeployments() public {
        vm.chainId(1);
        vm.expectRevert("testnet only");
        new MockUSDC(address(this), address(this));
        vm.expectRevert("testnet only");
        new Settlement(address(token), address(this), operator, operator);
    }

    function testPayoutOnceAndCannotCancelPaid() public {
        reserve(payout());
        assertEq(settlement.availableInventory(), 19e6);
        vm.prank(operator);
        settlement.executePayout(ID);
        assertEq(token.balanceOf(recipient), 1e6);
        assertEq(settlement.inventory(), 19e6);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.executePayout(ID);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.cancelSettlement(ID);
    }

    function testCancellationBeforeReservationIsPermanent() public {
        vm.prank(operator);
        settlement.cancelSettlement(ID);
        vm.expectRevert(Settlement.InvalidState.selector);
        reserve(payout());
        vm.expectRevert(Settlement.InvalidState.selector);
        fund(funding());
    }

    function testCancelReleasesReservedInventoryAndStopsPayout() public {
        reserve(payout());
        vm.prank(operator);
        settlement.cancelSettlement(ID);
        assertEq(settlement.availableInventory(), 20e6);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.executePayout(ID);
        assertEq(token.balanceOf(recipient), 0);
    }

    function testReservedInventoryCannotBeWithdrawnOrDoubleReserved() public {
        Settlement.Payout memory q = payout();
        q.amount = 10e6;
        reserve(q);
        q.id = bytes32(uint256(2));
        q.nonce = 3;
        reserve(q);
        vm.expectRevert(Settlement.InsufficientInventory.selector);
        settlement.withdrawInventory(recipient, 1);
        q.id = bytes32(uint256(3));
        q.nonce = 4;
        vm.expectRevert(Settlement.InsufficientInventory.selector);
        reserve(q);
        assertFalse(settlement.usedNonces(4));
    }

    function testEscrowCannotFundOperatorPayoutOrWithdrawal() public {
        settlement.withdrawInventory(address(this), 20e6);
        fund(funding());
        assertEq(settlement.escrowLiability(), 1e6);
        assertEq(settlement.inventory(), 0);
        assertEq(token.balanceOf(address(settlement)), 1e6);
        Settlement.Payout memory q = payout();
        q.id = keccak256("different-destination-order");
        vm.expectRevert(Settlement.InsufficientInventory.selector);
        reserve(q);
        vm.expectRevert(Settlement.InsufficientInventory.selector);
        settlement.withdrawInventory(recipient, 1);
    }

    function testCommitThenSettleReleasesEscrowExactlyOnce() public {
        Settlement.Funding memory q = funding();
        fund(q);
        vm.prank(operator);
        settlement.commitPayout(ID);
        vm.warp(q.cancellationAvailableAt + 1);
        vm.prank(payer);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.refund(ID);
        vm.prank(operator);
        settlement.settleEscrow(ID);
        assertEq(settlement.escrowLiability(), 0);
        assertEq(settlement.inventory(), 21e6);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.settleEscrow(ID);
    }

    function testRefundAtBoundaryAndCommitExcluded() public {
        Settlement.Funding memory q = funding();
        q.refundRecipient = recipient;
        fund(q);
        vm.warp(q.cancellationAvailableAt - 1);
        vm.prank(payer);
        vm.expectRevert(Settlement.Deadline.selector);
        settlement.refund(ID);
        vm.warp(q.cancellationAvailableAt);
        vm.prank(operator);
        vm.expectRevert(Settlement.Deadline.selector);
        settlement.commitPayout(ID);
        vm.prank(payer);
        settlement.refund(ID);
        assertEq(token.balanceOf(recipient), 1e6);
        assertEq(settlement.escrowLiability(), 0);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.commitPayout(ID);
        vm.prank(payer);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.refund(ID);
    }

    function testCommitImmediatelyBeforeBoundary() public {
        Settlement.Funding memory q = funding();
        fund(q);
        vm.warp(q.cancellationAvailableAt - 1);
        vm.prank(operator);
        settlement.commitPayout(ID);
        assertEq(uint256(settlement.states(ID)), uint256(Settlement.State.PAYOUT_COMMITTED));
    }

    function testFundingCutoffExclusive() public {
        Settlement.Funding memory q = funding();
        bytes memory sig = fundingSignature(q);
        vm.warp(q.fundingCutoff);
        vm.prank(payer);
        vm.expectRevert(Settlement.Deadline.selector);
        settlement.fund(q, sig);
    }

    function testPayoutExpiryAndCancellation() public {
        Settlement.Payout memory q = payout();
        reserve(q);
        vm.warp(q.deadline);
        vm.prank(operator);
        vm.expectRevert(Settlement.Deadline.selector);
        settlement.executePayout(ID);
        vm.prank(operator);
        settlement.cancelSettlement(ID);
        assertEq(settlement.reservedInventory(), 0);
    }

    function testWrongPayerAndNoDirectTransferAcceptance() public {
        Settlement.Funding memory q = funding();
        bytes memory sig = fundingSignature(q);
        vm.prank(recipient);
        vm.expectRevert(Settlement.WrongPayer.selector);
        settlement.fund(q, sig);
        token.transfer(address(settlement), 1e6);
        assertEq(uint256(settlement.states(ID)), 0);
        assertEq(settlement.inventory(), 20e6);
    }

    function testWrongTokenDespiteSameSymbol() public {
        MockUSDC other = new MockUSDC(address(this), address(this));
        Settlement.Payout memory q = payout();
        q.token = address(other);
        vm.expectRevert(Settlement.InvalidTerms.selector);
        reserve(q);
        Settlement.Funding memory f = funding();
        f.token = address(other);
        vm.expectRevert(Settlement.InvalidTerms.selector);
        fund(f);
    }

    function testAlteredRecipientAmountDeadlineAndIdRejected() public {
        Settlement.Payout memory q = payout();
        bytes memory sig = payoutSignature(q);
        q.recipient = payer;
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
        q = payout();
        q.amount += 1;
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
        q = payout();
        q.deadline += 1;
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
        q = payout();
        q.id = bytes32(uint256(9));
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
    }

    function testAlteredFundingRecipientAndPayerRejected() public {
        Settlement.Funding memory q = funding();
        bytes memory sig = fundingSignature(q);
        q.refundRecipient = recipient;
        vm.prank(payer);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.fund(q, sig);
        q = funding();
        q.payer = recipient;
        vm.prank(recipient);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.fund(q, sig);
    }

    function testWrongChainContractOperationAndSignerRejected() public {
        Settlement.Payout memory q = payout();
        bytes memory sig = payoutSignature(q);
        vm.chainId(84532);
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
        vm.chainId(31337);
        Settlement other = new Settlement(address(token), address(this), operator, vm.addr(SIGNER_KEY));
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        other.reservePayout(q, sig);
        Settlement.Funding memory f = funding();
        vm.prank(payer);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.fund(f, sig);
        settlement.revokeRole(settlement.QUOTE_SIGNER_ROLE(), vm.addr(SIGNER_KEY));
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidSignature.selector);
        settlement.reservePayout(q, sig);
    }

    function testGlobalNonceReplayRejectedAcrossDirections() public {
        reserve(payout());
        Settlement.Funding memory f = funding();
        f.id = bytes32(uint256(5));
        f.nonce = 1;
        vm.expectRevert(Settlement.NonceUsed.selector);
        fund(f);
    }

    function testUnauthorizedActions() public {
        vm.startPrank(payer);
        vm.expectRevert();
        settlement.executePayout(ID);
        vm.expectRevert();
        settlement.cancelSettlement(ID);
        vm.expectRevert();
        settlement.commitPayout(ID);
        vm.expectRevert();
        settlement.settleEscrow(ID);
        vm.expectRevert();
        settlement.withdrawInventory(payer, 1);
        vm.expectRevert();
        settlement.pause();
        vm.stopPrank();
    }

    function testPausePreservesRefundAndCancellation() public {
        Settlement.Funding memory f = funding();
        fund(f);
        Settlement.Payout memory q = payout();
        q.id = bytes32(uint256(5));
        reserve(q);
        settlement.pause();
        vm.prank(operator);
        vm.expectRevert();
        settlement.commitPayout(f.id);
        vm.prank(operator);
        vm.expectRevert();
        settlement.executePayout(q.id);
        vm.prank(operator);
        settlement.cancelSettlement(q.id);
        vm.warp(f.cancellationAvailableAt);
        vm.prank(payer);
        settlement.refund(f.id);
        assertEq(settlement.escrowLiability(), 0);
        assertEq(settlement.reservedInventory(), 0);
    }

    function testBadTermsAndCancellationDelay() public {
        Settlement.Funding memory f = funding();
        f.cancellationAvailableAt += 1;
        vm.expectRevert(Settlement.InvalidTerms.selector);
        fund(f);
        Settlement.Payout memory q = payout();
        q.recipient = address(settlement);
        vm.expectRevert(Settlement.InvalidTerms.selector);
        reserve(q);
        q = payout();
        q.id = 0;
        vm.expectRevert(Settlement.InvalidTerms.selector);
        reserve(q);
        q = payout();
        q.amount = 99_999;
        vm.expectRevert(Settlement.InvalidTerms.selector);
        reserve(q);
        q = payout();
        q.amount = 10_000_001;
        vm.expectRevert(Settlement.InvalidTerms.selector);
        reserve(q);
    }

    function testFeeTokenRejectedAndStateRolledBack() public {
        FeeToken fee = new FeeToken();
        settlement = new Settlement(address(fee), address(this), operator, vm.addr(SIGNER_KEY));
        fee.approve(address(settlement), type(uint256).max);
        fee.setFee(true);
        vm.expectRevert(Settlement.TransferMismatch.selector);
        settlement.depositInventory(1e6);
        assertEq(settlement.inventory(), 0);
        assertEq(fee.balanceOf(address(settlement)), 0);
        fee.setFee(false);
        settlement.depositInventory(2e6);
        Settlement.Payout memory q = payout();
        q.token = address(fee);
        reserve(q);
        fee.setFee(true);
        vm.prank(operator);
        vm.expectRevert(Settlement.TransferMismatch.selector);
        settlement.executePayout(ID);
        assertEq(uint256(settlement.states(ID)), uint256(Settlement.State.RESERVED));
        assertEq(settlement.inventory(), 2e6);
        assertEq(fee.balanceOf(recipient), 0);
    }

    function testFundingReplayAndUnauthorizedRefundRejected() public {
        Settlement.Funding memory q = funding();
        fund(q);
        vm.expectRevert(Settlement.InvalidState.selector);
        fund(q);
        vm.warp(q.cancellationAvailableAt);
        vm.prank(recipient);
        vm.expectRevert(Settlement.WrongPayer.selector);
        settlement.refund(ID);
        assertEq(settlement.escrowLiability(), q.amount);
    }

    function testInsufficientAllowanceDoesNotConsumeOrderOrNonce() public {
        vm.prank(payer);
        token.approve(address(settlement), 0);
        vm.expectRevert();
        fund(funding());
        assertEq(uint256(settlement.states(ID)), 0);
        assertFalse(settlement.usedNonces(2));
        assertEq(settlement.escrowLiability(), 0);
    }

    function testCannotAcknowledgeUncommittedEscrow() public {
        fund(funding());
        vm.prank(operator);
        vm.expectRevert(Settlement.InvalidState.selector);
        settlement.settleEscrow(ID);
        assertEq(settlement.escrowLiability(), 1e6);
    }

    function testCannotReserveExpiredPayout() public {
        Settlement.Payout memory q = payout();
        q.deadline = block.timestamp;
        vm.expectRevert(Settlement.Deadline.selector);
        reserve(q);
    }

    function testFuzzPayoutConservation(uint256 amount, bool cancel) public {
        amount = bound(amount, 100_000, 10_000_000);
        Settlement.Payout memory q = payout();
        q.amount = amount;
        reserve(q);
        vm.prank(operator);
        if (cancel) settlement.cancelSettlement(ID);
        else settlement.executePayout(ID);
        assertEq(settlement.reservedInventory(), 0);
        assertEq(settlement.inventory() + token.balanceOf(recipient), 20e6);
        assertEq(token.balanceOf(address(settlement)), settlement.inventory());
    }

    function testFuzzEscrowConservation(uint256 amount, bool commit) public {
        amount = bound(amount, 100_000, 10_000_000);
        Settlement.Funding memory q = funding();
        q.amount = amount;
        fund(q);
        if (commit) {
            vm.prank(operator);
            settlement.commitPayout(ID);
            vm.prank(operator);
            settlement.settleEscrow(ID);
        } else {
            vm.warp(q.cancellationAvailableAt);
            vm.prank(payer);
            settlement.refund(ID);
        }
        assertEq(settlement.escrowLiability(), 0);
        assertEq(token.balanceOf(payer) + settlement.inventory(), 40e6);
        assertEq(token.balanceOf(address(settlement)), settlement.inventory());
    }
}
