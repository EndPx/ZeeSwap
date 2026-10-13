// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ZeeSwapSettlement as Settlement} from "../src/ZeeSwapSettlement.sol";

contract SettlementHandler is Test {
    uint256 constant KEY = 0xA11CE;
    MockUSDC public token;
    Settlement public settlement;
    mapping(bytes32 => uint256) public payments;
    mapping(bytes32 => uint256) public refunds;

    constructor() {
        token = new MockUSDC(address(this), address(this));
        settlement = new Settlement(address(token), address(this), address(this), vm.addr(KEY));
        token.mint(address(this), 1000e6);
        token.approve(address(settlement), type(uint256).max);
        settlement.depositInventory(200e6);
    }

    function signature(bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function orderId(uint256 seed) internal pure returns (bytes32) {
        return bytes32(seed % 16 + 1);
    }

    function reserve(uint256 seed, uint256 amount) external {
        bytes32 id = orderId(seed);
        Settlement.Payout memory q = Settlement.Payout(
            id, address(token), address(0xBEEF), bound(amount, 100_000, 10e6), uint256(id), block.timestamp + 120
        );
        try settlement.reservePayout(q, signature(settlement.payoutDigest(q))) {} catch {}
    }

    function fund(uint256 seed, uint256 amount) external {
        bytes32 id = orderId(seed);
        Settlement.Funding memory q = Settlement.Funding(
            id,
            address(token),
            address(this),
            address(this),
            bound(amount, 100_000, 10e6),
            uint256(id),
            block.timestamp + 900,
            block.timestamp + 8100
        );
        try settlement.fund(q, signature(settlement.fundingDigest(q))) {} catch {}
    }

    function execute(uint256 seed) external {
        bytes32 id = orderId(seed);
        try settlement.executePayout(id) {
            payments[id]++;
        } catch {}
    }

    function cancel(uint256 seed) external {
        try settlement.cancelSettlement(orderId(seed)) {} catch {}
    }

    function commit(uint256 seed) external {
        try settlement.commitPayout(orderId(seed)) {} catch {}
    }

    function settle(uint256 seed) external {
        bytes32 id = orderId(seed);
        try settlement.settleEscrow(id) {
            payments[id]++;
        } catch {}
    }

    function refund(uint256 seed) external {
        bytes32 id = orderId(seed);
        try settlement.refund(id) {
            refunds[id]++;
        } catch {}
    }

    function passTime(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 9000));
    }

    function withdraw(uint256 amount) external {
        try settlement.withdrawInventory(address(this), bound(amount, 1, 100e6)) {} catch {}
    }

    function replenish(uint256 amount) external {
        try settlement.depositInventory(bound(amount, 1, 100e6)) {} catch {}
    }
}

contract SettlementInvariantTest is StdInvariant, Test {
    SettlementHandler handler;
    Settlement settlement;
    MockUSDC token;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(1000);
        handler = new SettlementHandler();
        settlement = handler.settlement();
        token = handler.token();
        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = handler.reserve.selector;
        selectors[1] = handler.fund.selector;
        selectors[2] = handler.execute.selector;
        selectors[3] = handler.cancel.selector;
        selectors[4] = handler.commit.selector;
        selectors[5] = handler.settle.selector;
        selectors[6] = handler.refund.selector;
        selectors[7] = handler.passTime.selector;
        selectors[8] = handler.withdraw.selector;
        selectors[9] = handler.replenish.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantFundsAndReservationsAreConserved() public view {
        uint256 escrowTotal;
        uint256 reservedTotal;
        for (uint256 i = 1; i <= 16; i++) {
            bytes32 id = bytes32(i);
            Settlement.State state = settlement.states(id);
            if (state == Settlement.State.FUNDED || state == Settlement.State.PAYOUT_COMMITTED) {
                (,, uint256 amount,) = settlement.escrows(id);
                escrowTotal += amount;
            }
            if (state == Settlement.State.RESERVED) {
                (, uint256 amount,) = settlement.payouts(id);
                reservedTotal += amount;
            }
            assertLe(handler.payments(id) + handler.refunds(id), 1);
        }
        assertEq(escrowTotal, settlement.escrowLiability());
        assertEq(reservedTotal, settlement.reservedInventory());
        assertLe(reservedTotal, settlement.inventory());
        assertEq(token.balanceOf(address(settlement)), settlement.inventory() + escrowTotal);
        assertEq(
            token.balanceOf(address(handler)) + token.balanceOf(address(settlement)) + token.balanceOf(address(0xBEEF)),
            1000e6
        );
    }
}
