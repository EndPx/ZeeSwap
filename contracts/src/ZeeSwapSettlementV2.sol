// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ZeeSwapSettlement} from "./ZeeSwapSettlement.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Separate local/testnet deployment for future escrow recovery; no upgrade of V1 orders.
/// @dev Recovery trusts an operator attestation of shielded nonpayment, not an onchain Zcash proof.
/// The recovery signer must revoke signing fences and reconcile every independent journal and
/// signed transaction before authorizing an abort. A timeout or missing mempool entry is insufficient.
contract ZeeSwapSettlementV2 is ZeeSwapSettlement {
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");
    bytes32 public constant EXECUTION_MODE = keccak256("evm-treasury-route-v1");
    bytes32 public constant ABORT_TYPEHASH = keccak256(
        "Abort(bytes32 id,address refundRecipient,uint256 amount,bytes32 mode,uint256 nonce,bytes32 recoveryProofDigest,uint256 validUntil)"
    );

    struct Abort {
        bytes32 id;
        address refundRecipient;
        uint256 amount;
        bytes32 mode;
        uint256 nonce;
        bytes32 recoveryProofDigest;
        uint256 validUntil;
    }

    mapping(uint256 => bool) public usedAbortNonces;

    event EscrowAborted(
        bytes32 indexed id, address indexed refundRecipient, uint256 amount, uint256 nonce, bytes32 recoveryProofDigest
    );

    constructor(address asset, address admin, address operator, address quoteSigner, address recovery)
        ZeeSwapSettlement(asset, admin, operator, quoteSigner)
    {
        if (recovery == address(0) || recovery == admin || recovery == operator || recovery == quoteSigner) {
            revert InvalidTerms();
        }
        _grantRole(RECOVERY_ROLE, recovery);
    }

    /// @notice Anyone may pay gas; only the immutable signed recipient receives principal.
    /// @dev Deliberately available while paused, like the inherited payer-only refund.
    function refundFunded(bytes32 id) external nonReentrant {
        if (states[id] != State.FUNDED) revert InvalidState();
        Escrow memory q = escrows[id];
        if (block.timestamp < q.cancellationAvailableAt) revert Deadline();
        _refundPrincipal(id, q);
        emit Refunded(id, q.refundRecipient, q.amount);
    }

    /// @dev Inherited EIP-712 domain binds the chain and this new deployment address. The distinct
    /// Abort type and nonce namespace cannot consume or reuse a funding/payout authorization.
    function abortDigest(Abort calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ABORT_TYPEHASH, q)));
    }

    /// @notice Privileged recovery attests that no signed Zcash payout can succeed or has succeeded.
    /// @dev Admin controls role membership and therefore remains trusted. No public timeout refund
    /// exists for committed escrow. This function emits no Paid or EscrowSettled delivery event.
    function abortEscrow(Abort calldata q, bytes calldata signature) external nonReentrant onlyRole(RECOVERY_ROLE) {
        if (states[q.id] != State.PAYOUT_COMMITTED) revert InvalidState();
        Escrow memory escrow = escrows[q.id];
        if (
            q.refundRecipient != escrow.refundRecipient || q.amount != escrow.amount || q.mode != EXECUTION_MODE
                || q.recoveryProofDigest == bytes32(0)
        ) revert InvalidTerms();
        if (block.timestamp >= q.validUntil) revert Deadline();
        if (usedAbortNonces[q.nonce]) revert NonceUsed();
        if (!hasRole(RECOVERY_ROLE, ECDSA.recover(abortDigest(q), signature))) revert InvalidSignature();
        usedAbortNonces[q.nonce] = true;
        _refundPrincipal(q.id, escrow);
        emit EscrowAborted(q.id, escrow.refundRecipient, escrow.amount, q.nonce, q.recoveryProofDigest);
    }

    function _refundPrincipal(bytes32 id, Escrow memory q) private {
        states[id] = State.REFUNDED;
        escrowLiability -= q.amount;
        // V1's transfer helper is private. Keep the same exact debit/credit invariant here.
        uint256 beforeHere = token.balanceOf(address(this));
        uint256 beforeTo = token.balanceOf(q.refundRecipient);
        token.safeTransfer(q.refundRecipient, q.amount);
        if (
            token.balanceOf(address(this)) + q.amount != beforeHere
                || token.balanceOf(q.refundRecipient) != beforeTo + q.amount
        ) revert TransferMismatch();
    }
}
