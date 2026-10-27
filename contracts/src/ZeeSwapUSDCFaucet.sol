// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Finite, prefunded Base Sepolia test-asset faucet. No mint or admin authority.
contract ZeeSwapUSDCFaucet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant TOKEN = 0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63;
    uint256 public constant CLAIM_AMOUNT = 10_000_000;
    uint256 public constant COOLDOWN = 24 hours;
    mapping(address => uint256) public nextClaimAt;

    error WrongChain();
    error InvalidToken();
    error CooldownActive(uint256 availableAt);
    error InsufficientReserve();
    error InexactTransfer();

    event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);

    constructor() {
        if (block.chainid != 84532 && block.chainid != 31337) revert WrongChain();
        if (TOKEN.code.length == 0 || IERC20Metadata(TOKEN).decimals() != 6) revert InvalidToken();
    }

    function claim() external nonReentrant {
        if (block.chainid != 84532 && block.chainid != 31337) revert WrongChain();
        uint256 availableAt = nextClaimAt[msg.sender];
        if (block.timestamp < availableAt) revert CooldownActive(availableAt);
        IERC20 token = IERC20(TOKEN);
        uint256 reserveBefore = token.balanceOf(address(this));
        if (reserveBefore < CLAIM_AMOUNT) revert InsufficientReserve();
        uint256 recipientBefore = token.balanceOf(msg.sender);
        uint256 next = block.timestamp + COOLDOWN;
        nextClaimAt[msg.sender] = next;
        token.safeTransfer(msg.sender, CLAIM_AMOUNT);
        if (
            token.balanceOf(address(this)) != reserveBefore - CLAIM_AMOUNT
                || token.balanceOf(msg.sender) != recipientBefore + CLAIM_AMOUNT
        ) revert InexactTransfer();
        emit Claimed(msg.sender, CLAIM_AMOUNT, next);
    }
}
