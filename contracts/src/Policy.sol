// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {PayeeRegistry} from "./PayeeRegistry.sol";

/// @notice EIP-3009 (USDC-style) signed transfers. tUSD8 on Aevum implements this.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title Policy
/// @notice An owner-bounded spend engine. The owner deposits tUSD8, sets caps and expiry,
///         and then pays verified payees in batches. Every payout is checked against the
///         payee registry and the policy limits. The owner (or anyone, for a signed batch)
///         triggers settlement; the policy decides what is allowed.
/// @dev Two settlement routes:
///      1. `executeBatch` — owner pre-approves this contract, then it pulls each payout.
///      2. `executeBatchSigned` — owner signs one EIP-712 approval for the batch, a relayer
///         submits it, and the owner needs no gas token.
///      A third route, `executeBatchWithAuthorizations`, uses one EIP-3009 signature per
///      payout for fully gasless settlement with no pre-approval.
contract Policy is EIP712 {
    using SafeERC20 for IERC20;

    struct Payout {
        bytes32 payeeId;
        uint256 amount;
        string ref;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct PolicyState {
        uint256 perPaymentCap;
        uint256 dailyCap;
        uint256 lifetimeCap;
        uint64 expiresAt;
        bool revoked;
        uint256 spentToday;
        uint64 spentDayStart;
        uint256 lifetimeSpent;
        uint64 createdAt;
    }

    IERC20 public immutable token;
    PayeeRegistry public immutable registry;
    address public owner;

    PolicyState public state;
    mapping(bytes32 batchId => bool) public settled;

    bytes32 public constant BATCH_TYPEHASH =
        keccak256("Batch(address owner,bytes32 batchId,bytes32 payoutHash,uint256 nonce,uint64 validUntil)");

    event PolicyConfigured(address indexed owner, uint256 perPaymentCap, uint256 dailyCap, uint256 lifetimeCap, uint64 expiresAt);
    event Deposited(address indexed owner, uint256 amount);
    event BatchSettled(bytes32 indexed batchId, address indexed by, uint256 payoutCount, uint256 total);
    event PayoutSettled(bytes32 indexed batchId, bytes32 indexed payeeId, address indexed to, uint256 amount, string ref);
    event PolicyRevoked(address indexed owner, uint64 at);
    event Withdrawn(address indexed owner, uint256 amount);

    error NotOwner();
    error Revoked();
    error Expired(uint64 expiresAt);
    error ZeroAmount();
    error ZeroAddress();
    error ZeroId();
    error CapExceeded(uint256 cap, uint256 attempted);
    error DailyCapExceeded(uint256 cap, uint256 attempted);
    error LifetimeCapExceeded(uint256 cap, uint256 attempted);
    error PayeeNotActive(bytes32 payeeId);
    error BatchAlreadySettled(bytes32 batchId);
    error EmptyBatch();
    error SignatureExpired(uint64 validUntil);
    error InvalidSignature();
    error ArrayLengthMismatch();
    error TransferFailed();
    error NothingToWithdraw();
    error InsufficientBalance(uint256 available, uint256 needed);

    constructor(IERC20 token_, PayeeRegistry registry_, address owner_)
        EIP712("APCopilotPolicy", "1")
    {
        if (address(token_) == address(0) || address(registry_) == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        token = token_;
        registry = registry_;
        owner = owner_;
    }

    // ------------------------------------------------------------------ config

    /// @notice Configure the caps and expiry. Only the owner. Zero cap means unlimited.
    function configure(
        uint256 perPaymentCap,
        uint256 dailyCap,
        uint256 lifetimeCap,
        uint64 expiresAt
    ) external onlyOwner {
        state.perPaymentCap = perPaymentCap;
        state.dailyCap = dailyCap;
        state.lifetimeCap = lifetimeCap;
        state.expiresAt = expiresAt;
        state.createdAt = uint64(block.timestamp);
        emit PolicyConfigured(owner, perPaymentCap, dailyCap, lifetimeCap, expiresAt);
    }

    /// @notice Revoke the policy. Instant, one action. No payout can settle after this.
    function revoke() external onlyOwner {
        state.revoked = true;
        emit PolicyRevoked(owner, uint64(block.timestamp));
    }

    /// @notice Owner deposits the working balance.
    function deposit(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(owner, amount);
    }

    /// @notice Owner withdraws part or all of the remaining balance.
    function withdraw(uint256 amount) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (amount == 0 || amount > balance) revert NothingToWithdraw();
        token.safeTransfer(owner, amount);
        emit Withdrawn(owner, amount);
    }

    // -------------------------------------------------------------- settlement

    /// @notice Settle a batch from the owner's deposited balance. Owner pre-approves.
    function executeBatch(bytes32 batchId, Payout[] calldata payouts) external {
        _settle(batchId, payouts);
    }

    /// @notice Settle a batch the owner signed. Anyone may submit it; the signature is the
    ///         approval. The owner needs no gas token for this path.
    function executeBatchSigned(
        bytes32 batchId,
        Payout[] calldata payouts,
        uint256 nonce,
        uint64 validUntil,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > validUntil) revert SignatureExpired(validUntil);
        bytes32 payoutHash = _hashPayouts(payouts);
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(BATCH_TYPEHASH, owner, batchId, payoutHash, nonce, validUntil))
        );
        if (ECDSA.recover(digest, v, r, s) != owner) revert InvalidSignature();
        _settle(batchId, payouts);
    }

    /// @notice Settle a batch with one EIP-3009 authorization per payout. The owner signs
    ///         each payout off-chain; a relayer submits. No pre-approval, no gas token.
    function executeBatchWithAuthorizations(
        bytes32 batchId,
        Payout[] calldata payouts,
        Authorization[] calldata auths
    ) external {
        uint256 n = payouts.length;
        if (auths.length != n) revert ArrayLengthMismatch();

        // Policy checks first, so a bad batch never burns a signature.
        _checkBatch(batchId, payouts);

        for (uint256 i = 0; i < n; i++) {
            Payout calldata p = payouts[i];
            Authorization calldata a = auths[i];
            address to = registry.activeAccount(p.payeeId);
            IERC3009(address(token)).receiveWithAuthorization(
                owner, address(this), p.amount, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s
            );
            // The authorization pulled from the owner into this policy; forward to the payee.
            token.safeTransfer(to, p.amount);
            _recordPayout(batchId, p, to);
        }
        _markSettled(batchId, n, _batchTotal(payouts));
    }

    // ------------------------------------------------------------------- views

    /// @notice The EIP-712 digest the owner must sign for a batch.
    function batchDigest(
        bytes32 batchId,
        Payout[] calldata payouts,
        uint256 nonce,
        uint64 validUntil
    ) external view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(BATCH_TYPEHASH, owner, batchId, _hashPayouts(payouts), nonce, validUntil))
        );
    }

    function BATCH_TYPEHASH_VALUE() external pure returns (bytes32) {
        return BATCH_TYPEHASH;
    }

    function lifetimeSpent() external view returns (uint256) {
        return state.lifetimeSpent;
    }

    function remainingDaily() external view returns (uint256) {
        uint256 spent = _spentToday();
        uint256 cap = state.dailyCap;
        return cap == 0 || spent >= cap ? (cap == 0 ? type(uint256).max : 0) : cap - spent;
    }

    function remainingLifetime() external view returns (uint256) {
        uint256 cap = state.lifetimeCap;
        return cap == 0 ? type(uint256).max : (state.lifetimeSpent >= cap ? 0 : cap - state.lifetimeSpent);
    }

    function batchHash(bytes32 batchId, Payout[] calldata payouts) external pure returns (bytes32) {
        return keccak256(abi.encode(batchId, _hashPayouts(payouts)));
    }

    // ----------------------------------------------------------------- internal

    function _settle(bytes32 batchId, Payout[] calldata payouts) internal {
        _checkBatch(batchId, payouts);
        uint256 total = _batchTotal(payouts);
        uint256 available = token.balanceOf(address(this));
        if (available < total) revert InsufficientBalance(available, total);

        for (uint256 i = 0; i < payouts.length; i++) {
            Payout calldata p = payouts[i];
            address to = registry.activeAccount(p.payeeId);
            // Spend the policy's own funded budget. The owner pre-funded it with deposit().
            token.safeTransfer(to, p.amount);
            _recordPayout(batchId, p, to);
        }
        _markSettled(batchId, payouts.length, total);
    }

    function _checkBatch(bytes32 batchId, Payout[] calldata payouts) internal view {
        if (state.revoked) revert Revoked();
        if (state.expiresAt != 0 && block.timestamp > state.expiresAt) revert Expired(state.expiresAt);
        if (settled[batchId]) revert BatchAlreadySettled(batchId);
        if (payouts.length == 0) revert EmptyBatch();

        uint256 total;
        for (uint256 i = 0; i < payouts.length; i++) {
            Payout calldata p = payouts[i];
            if (p.amount == 0) revert ZeroAmount();
            if (p.payeeId == bytes32(0)) revert ZeroId();
            // The registry is the gate: only an active verified payee can be paid.
            if (!registry.isActive(p.payeeId)) revert PayeeNotActive(p.payeeId);
            if (state.perPaymentCap != 0 && p.amount > state.perPaymentCap) {
                revert CapExceeded(state.perPaymentCap, p.amount);
            }
            total += p.amount;
        }

        uint256 spent = _spentToday();
        if (state.dailyCap != 0 && spent + total > state.dailyCap) {
            revert DailyCapExceeded(state.dailyCap, spent + total);
        }
        if (state.lifetimeCap != 0 && state.lifetimeSpent + total > state.lifetimeCap) {
            revert LifetimeCapExceeded(state.lifetimeCap, state.lifetimeSpent + total);
        }
    }

    function _recordPayout(bytes32 batchId, Payout calldata p, address to) internal {
        // Update the running day window.
        uint64 day = uint64(block.timestamp / 1 days);
        if (day != state.spentDayStart) {
            state.spentDayStart = day;
            state.spentToday = 0;
        }
        state.spentToday += p.amount;
        state.lifetimeSpent += p.amount;
        emit PayoutSettled(batchId, p.payeeId, to, p.amount, p.ref);
    }

    function _markSettled(bytes32 batchId, uint256 count, uint256 total) internal {
        settled[batchId] = true;
        emit BatchSettled(batchId, msg.sender, count, total);
    }

    function _batchTotal(Payout[] calldata payouts) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < payouts.length; i++) {
            total += payouts[i].amount;
        }
    }

    function _spentToday() internal view returns (uint256) {
        uint64 day = uint64(block.timestamp / 1 days);
        return day == state.spentDayStart ? state.spentToday : 0;
    }

    function _hashPayouts(Payout[] calldata payouts) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](payouts.length);
        for (uint256 i = 0; i < payouts.length; i++) {
            hashes[i] = keccak256(
                abi.encode(payouts[i].payeeId, payouts[i].amount, keccak256(bytes(payouts[i].ref)))
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
}
