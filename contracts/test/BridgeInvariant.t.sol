// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ZeeSwapBridge as Bridge} from "../src/ZeeSwapBridge.sol";

contract BridgeHandler is Test {
    uint256 internal constant KEY = 0xA11CE; // Public local test fixture only.
    address internal constant PAYER = address(0xCAFE);
    Bridge public bridge;
    uint256 public issued;
    uint256 public accepted;
    uint256 public acknowledged;
    uint256 internal sequence;
    bytes32[] internal pending;
    mapping(bytes32 => uint256) internal amounts;

    constructor() {
        bridge = new Bridge(msg.sender, address(this), vm.addr(KEY));
    }

    function signature(bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function mint(uint256 input) external {
        uint256 amount = bound(input, 10_000, 100_000_000);
        uint256 nonce = ++sequence;
        Bridge.Mint memory q = Bridge.Mint(bytes32(nonce), PAYER, amount, nonce, block.timestamp + 1);
        bridge.mint(q, signature(bridge.mintDigest(q)));
        issued += amount;
    }

    function redeem(uint256 input) external {
        uint256 balance = bridge.balanceOf(PAYER);
        if (balance < 10_000) return;
        uint256 maximum = balance < 100_000_000 ? balance : 100_000_000;
        uint256 amount = bound(input, 10_000, maximum);
        uint256 nonce = ++sequence;
        bytes32 id = bytes32(nonce);
        Bridge.Redemption memory q = Bridge.Redemption(
            id, PAYER, amount, keccak256(abi.encode("opaque-salted-fixture", nonce)), nonce, block.timestamp + 1
        );
        bytes memory sig = signature(bridge.redemptionDigest(q));
        vm.prank(PAYER);
        bridge.requestRedemption(q, sig);
        pending.push(id);
        amounts[id] = amount;
        accepted += amount;
    }

    function acknowledge(uint256 input) external {
        if (pending.length == 0) return;
        uint256 index = input % pending.length;
        bytes32 id = pending[index];
        bridge.acknowledgeRedemption(id, keccak256(abi.encode("opaque-salted-evidence", id)));
        acknowledged += amounts[id];
        pending[index] = pending[pending.length - 1];
        pending.pop();
    }
}

contract BridgeInvariantTest is StdInvariant, Test {
    BridgeHandler internal handler;
    Bridge internal bridge;

    function setUp() public {
        vm.chainId(31337);
        handler = new BridgeHandler();
        bridge = handler.bridge();
        bridge.unpause();
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = BridgeHandler.mint.selector;
        selectors[1] = BridgeHandler.redeem.selector;
        selectors[2] = BridgeHandler.acknowledge.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantPrincipalConservedAcrossMultipleRequests() public view {
        assertEq(bridge.totalSupply(), handler.issued() - handler.accepted());
        assertEq(bridge.unpaidRedemptionPrincipal(), handler.accepted() - handler.acknowledged());
        assertEq(bridge.totalSupply() + bridge.unpaidRedemptionPrincipal(), handler.issued() - handler.acknowledged());
    }
}
