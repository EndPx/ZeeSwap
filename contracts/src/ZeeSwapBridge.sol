// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Custodial TESTNET representation; signatures attest offchain Zcash observations, not consensus proofs.
/// @dev IDs must be random. Commitments must be salted and opaque; never supply a shielded receiver, memo or txid.
contract ZeeSwapBridge is ERC20, EIP712, Pausable {
    bytes32 public constant MINT_TYPEHASH =
        keccak256("Mint(bytes32 id,address recipient,uint256 amount,uint256 nonce,uint256 deadline)");
    bytes32 public constant REDEMPTION_TYPEHASH = keccak256(
        "Redemption(bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline)"
    );
    uint256 public constant MIN_AMOUNT = 10_000;
    uint256 public constant MAX_AMOUNT = 100_000_000;

    enum MintState {
        NONE,
        MINTED,
        CANCELLED
    }

    struct Mint {
        bytes32 id;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    struct Redemption {
        bytes32 id;
        address payer;
        uint256 amount;
        bytes32 payoutCommitment;
        uint256 nonce;
        uint256 deadline;
    }

    struct RedemptionRecord {
        address payer;
        uint256 amount;
        bytes32 payoutCommitment;
        bool delivered;
    }

    address public immutable admin;
    address public immutable operator;
    address public immutable authorizer;
    uint256 public unpaidRedemptionPrincipal;
    mapping(bytes32 => MintState) public mintStates;
    mapping(bytes32 => RedemptionRecord) public redemptions;
    mapping(uint256 => bool) public usedNonces;

    error Unauthorized();
    error InvalidTerms();
    error InvalidState();
    error Deadline();
    error NonceUsed();
    error InvalidSignature();

    event BridgeMinted(bytes32 indexed id, address indexed recipient, uint256 amount);
    event MintCancelled(bytes32 indexed id);
    event RedemptionRequested(bytes32 indexed id, address indexed payer, uint256 amount, bytes32 payoutCommitment);
    event RedemptionAcknowledged(bytes32 indexed id, uint256 amount, bytes32 evidenceCommitment);

    constructor(address administrator, address runtimeOperator, address signer)
        ERC20("ZeeSwap Bridged Testnet Zcash", "zeeTAZ")
        EIP712("ZeeSwapBridge", "1")
    {
        require(block.chainid == 84532 || block.chainid == 31337, "testnet only");
        if (
            administrator == address(0) || runtimeOperator == address(0) || signer == address(0)
                || administrator == runtimeOperator || administrator == signer
        ) revert InvalidTerms();
        admin = administrator;
        operator = runtimeOperator;
        authorizer = signer;
        _pause();
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function pause() external {
        if (msg.sender != admin) revert Unauthorized();
        _pause();
    }

    function unpause() external {
        if (msg.sender != admin) revert Unauthorized();
        _unpause();
    }

    function mintDigest(Mint calldata terms) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(MINT_TYPEHASH, terms)));
    }

    function redemptionDigest(Redemption calldata terms) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REDEMPTION_TYPEHASH, terms)));
    }

    /// @notice Operator must first confirm exact shielded principal in the dedicated bridge wallet.
    function mint(Mint calldata terms, bytes calldata signature) external onlyOperator whenNotPaused {
        _terms(terms.id, terms.amount, terms.deadline);
        if (terms.recipient == address(0) || terms.recipient == address(this)) revert InvalidTerms();
        if (mintStates[terms.id] != MintState.NONE) revert InvalidState();
        _authorize(mintDigest(terms), terms.nonce, signature);
        mintStates[terms.id] = MintState.MINTED;
        _mint(terms.recipient, terms.amount);
        emit BridgeMinted(terms.id, terms.recipient, terms.amount);
    }

    /// @notice Permanent cancellation must reach canonical Base finality before any Zcash deposit refund is signed.
    function cancelMint(bytes32 id) external onlyOperator {
        if (id == bytes32(0)) revert InvalidTerms();
        if (mintStates[id] != MintState.NONE) revert InvalidState();
        mintStates[id] = MintState.CANCELLED;
        emit MintCancelled(id);
    }

    /// @notice Burns only the caller's tokens and preserves the principal as an unpaid redemption liability.
    function requestRedemption(Redemption calldata terms, bytes calldata signature) external whenNotPaused {
        _terms(terms.id, terms.amount, terms.deadline);
        if (msg.sender != terms.payer) revert Unauthorized();
        if (terms.payoutCommitment == bytes32(0)) revert InvalidTerms();
        if (redemptions[terms.id].amount != 0) revert InvalidState();
        _authorize(redemptionDigest(terms), terms.nonce, signature);
        redemptions[terms.id] = RedemptionRecord(terms.payer, terms.amount, terms.payoutCommitment, false);
        unpaidRedemptionPrincipal += terms.amount;
        _burn(terms.payer, terms.amount);
        emit RedemptionRequested(terms.id, terms.payer, terms.amount, terms.payoutCommitment);
    }

    /// @notice Attests confirmed canonical Zcash delivery. Ambiguous/failed sends must remain unpaid.
    function acknowledgeRedemption(bytes32 id, bytes32 evidenceCommitment) external onlyOperator {
        RedemptionRecord storage record = redemptions[id];
        if (record.amount == 0 || record.delivered) revert InvalidState();
        if (evidenceCommitment == bytes32(0)) revert InvalidTerms();
        record.delivered = true;
        unpaidRedemptionPrincipal -= record.amount;
        emit RedemptionAcknowledged(id, record.amount, evidenceCommitment);
    }

    function _terms(bytes32 id, uint256 amount, uint256 deadline) private view {
        if (id == bytes32(0) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) revert InvalidTerms();
        if (block.timestamp >= deadline) revert Deadline();
    }

    function _authorize(bytes32 digest, uint256 nonce, bytes calldata signature) private {
        if (usedNonces[nonce]) revert NonceUsed();
        if (ECDSA.recover(digest, signature) != authorizer) revert InvalidSignature();
        usedNonces[nonce] = true;
    }
}
