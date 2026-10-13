// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Custodial testnet settlement. Zcash receipts are attested by the operator.
/// @dev Never put shielded addresses, memos, or Zcash txids in authorization fields.
contract ZeeSwapSettlement is AccessControl, EIP712, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20Metadata;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant QUOTE_SIGNER_ROLE = keccak256("QUOTE_SIGNER_ROLE");
    bytes32 public constant PAYOUT_TYPEHASH =
        keccak256("Payout(bytes32 id,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 public constant FUNDING_TYPEHASH = keccak256(
        "Funding(bytes32 id,address token,address payer,address refundRecipient,uint256 amount,uint256 nonce,uint256 fundingCutoff,uint256 cancellationAvailableAt)"
    );
    uint256 public constant MIN_AMOUNT = 100_000;
    uint256 public constant MAX_AMOUNT = 10_000_000;
    uint256 public constant CANCELLATION_DELAY = 7200;

    enum State {
        NONE,
        RESERVED,
        PAID,
        CANCELLED,
        FUNDED,
        PAYOUT_COMMITTED,
        SETTLED,
        REFUNDED
    }

    struct Payout {
        bytes32 id;
        address token;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    struct Funding {
        bytes32 id;
        address token;
        address payer;
        address refundRecipient;
        uint256 amount;
        uint256 nonce;
        uint256 fundingCutoff;
        uint256 cancellationAvailableAt;
    }

    struct PayoutRecord {
        address recipient;
        uint256 amount;
        uint256 deadline;
    }

    struct Escrow {
        address payer;
        address refundRecipient;
        uint256 amount;
        uint256 cancellationAvailableAt;
    }

    IERC20Metadata public immutable token;
    uint256 public inventory;
    uint256 public reservedInventory;
    uint256 public escrowLiability;
    mapping(bytes32 => State) public states;
    mapping(bytes32 => PayoutRecord) public payouts;
    mapping(bytes32 => Escrow) public escrows;
    mapping(uint256 => bool) public usedNonces;

    error InvalidTerms();
    error InvalidState();
    error InvalidSignature();
    error NonceUsed();
    error InsufficientInventory();
    error TransferMismatch();
    error Deadline();
    error WrongPayer();

    event InventoryDeposited(address indexed from, uint256 amount);
    event InventoryWithdrawn(address indexed to, uint256 amount);
    event PayoutReserved(bytes32 indexed id, address indexed recipient, uint256 amount);
    event Paid(bytes32 indexed id, address indexed recipient, uint256 amount);
    event SettlementCancelled(bytes32 indexed id);
    event Funded(bytes32 indexed id, address indexed payer, uint256 amount, uint256 cancellationAvailableAt);
    event PayoutCommitted(bytes32 indexed id);
    event EscrowSettled(bytes32 indexed id, uint256 amount);
    event Refunded(bytes32 indexed id, address indexed recipient, uint256 amount);

    constructor(address asset, address admin, address operator, address quoteSigner) EIP712("ZeeSwapSettlement", "1") {
        require(block.chainid == 84532 || block.chainid == 31337, "testnet only");
        if (asset.code.length == 0 || admin == address(0) || operator == address(0) || quoteSigner == address(0)) {
            revert InvalidTerms();
        }
        if (IERC20Metadata(asset).decimals() != 6) revert InvalidTerms();
        token = IERC20Metadata(asset);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        _grantRole(QUOTE_SIGNER_ROLE, quoteSigner);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function availableInventory() public view returns (uint256) {
        return inventory - reservedInventory;
    }

    function depositInventory(uint256 amount) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == 0) revert InvalidTerms();
        _pull(msg.sender, amount);
        inventory += amount;
        emit InventoryDeposited(msg.sender, amount);
    }

    function withdrawInventory(address to, uint256 amount) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        _recipient(to);
        if (amount == 0 || amount > availableInventory()) revert InsufficientInventory();
        inventory -= amount;
        _push(to, amount);
        emit InventoryWithdrawn(to, amount);
    }

    function payoutDigest(Payout calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PAYOUT_TYPEHASH, q)));
    }

    function fundingDigest(Funding calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(FUNDING_TYPEHASH, q)));
    }

    function reservePayout(Payout calldata q, bytes calldata signature)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        _terms(q.id, q.token, q.amount);
        _recipient(q.recipient);
        if (states[q.id] != State.NONE) revert InvalidState();
        if (block.timestamp >= q.deadline) revert Deadline();
        _authorize(payoutDigest(q), q.nonce, signature);
        if (q.amount > availableInventory()) revert InsufficientInventory();
        states[q.id] = State.RESERVED;
        payouts[q.id] = PayoutRecord(q.recipient, q.amount, q.deadline);
        reservedInventory += q.amount;
        emit PayoutReserved(q.id, q.recipient, q.amount);
    }

    function executePayout(bytes32 id) external nonReentrant onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (states[id] != State.RESERVED) revert InvalidState();
        PayoutRecord memory q = payouts[id];
        if (block.timestamp >= q.deadline) revert Deadline();
        states[id] = State.PAID;
        reservedInventory -= q.amount;
        inventory -= q.amount;
        _push(q.recipient, q.amount);
        emit Paid(id, q.recipient, q.amount);
    }

    /// @notice Permanent exclusion of Base payout, including before any reservation exists.
    /// @dev A source refund signer must wait for finality and re-read CANCELLED.
    function cancelSettlement(bytes32 id) external nonReentrant onlyRole(OPERATOR_ROLE) {
        if (id == bytes32(0)) revert InvalidTerms();
        State state = states[id];
        if (state != State.NONE && state != State.RESERVED) revert InvalidState();
        if (state == State.RESERVED) reservedInventory -= payouts[id].amount;
        states[id] = State.CANCELLED;
        emit SettlementCancelled(id);
    }

    function fund(Funding calldata q, bytes calldata signature) external nonReentrant whenNotPaused {
        _terms(q.id, q.token, q.amount);
        _recipient(q.refundRecipient);
        if (q.payer != msg.sender) revert WrongPayer();
        if (states[q.id] != State.NONE) revert InvalidState();
        if (block.timestamp >= q.fundingCutoff) revert Deadline();
        if (q.cancellationAvailableAt != q.fundingCutoff + CANCELLATION_DELAY) revert InvalidTerms();
        _authorize(fundingDigest(q), q.nonce, signature);
        states[q.id] = State.FUNDED;
        escrows[q.id] = Escrow(q.payer, q.refundRecipient, q.amount, q.cancellationAvailableAt);
        escrowLiability += q.amount;
        _pull(msg.sender, q.amount);
        emit Funded(q.id, q.payer, q.amount, q.cancellationAvailableAt);
    }

    /// @dev Zcash signing is allowed only after this transition is finalized off-chain.
    function commitPayout(bytes32 id) external nonReentrant onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (states[id] != State.FUNDED) revert InvalidState();
        if (block.timestamp >= escrows[id].cancellationAvailableAt) revert Deadline();
        states[id] = State.PAYOUT_COMMITTED;
        emit PayoutCommitted(id);
    }

    /// @notice Operator attests confirmed Zcash delivery. No on-chain Zcash proof is implied.
    function settleEscrow(bytes32 id) external nonReentrant onlyRole(OPERATOR_ROLE) {
        if (states[id] != State.PAYOUT_COMMITTED) revert InvalidState();
        uint256 amount = escrows[id].amount;
        states[id] = State.SETTLED;
        escrowLiability -= amount;
        inventory += amount;
        emit EscrowSettled(id, amount);
    }

    function refund(bytes32 id) external nonReentrant {
        if (states[id] != State.FUNDED) revert InvalidState();
        Escrow memory q = escrows[id];
        if (msg.sender != q.payer) revert WrongPayer();
        if (block.timestamp < q.cancellationAvailableAt) revert Deadline();
        states[id] = State.REFUNDED;
        escrowLiability -= q.amount;
        _push(q.refundRecipient, q.amount);
        emit Refunded(id, q.refundRecipient, q.amount);
    }

    function _authorize(bytes32 digest, uint256 nonce, bytes calldata signature) private {
        if (usedNonces[nonce]) revert NonceUsed();
        if (!hasRole(QUOTE_SIGNER_ROLE, ECDSA.recover(digest, signature))) revert InvalidSignature();
        usedNonces[nonce] = true;
    }

    function _terms(bytes32 id, address asset, uint256 amount) private view {
        if (id == bytes32(0) || asset != address(token) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            revert InvalidTerms();
        }
    }

    function _recipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidTerms();
    }

    function _pull(address from, uint256 amount) private {
        uint256 beforeHere = token.balanceOf(address(this));
        uint256 beforeFrom = token.balanceOf(from);
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) != beforeHere + amount || token.balanceOf(from) + amount != beforeFrom) {
            revert TransferMismatch();
        }
    }

    function _push(address to, uint256 amount) private {
        uint256 beforeHere = token.balanceOf(address(this));
        uint256 beforeTo = token.balanceOf(to);
        token.safeTransfer(to, amount);
        if (token.balanceOf(address(this)) + amount != beforeHere || token.balanceOf(to) != beforeTo + amount) {
            revert TransferMismatch();
        }
    }
}
