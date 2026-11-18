// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayeeRegistry
/// @notice Self-managed verified payee book. One active payout address per payee id.
/// @dev The wedge of the product: an address change never lands instantly. A change is
///      requested, sits in a public delay window, and only becomes active after it.
///      A dispute freezes the payee outright, so a hijacked request cannot move money
///      during the window. Nothing here is an ERC-8004 registry: it is the product's own
///      verified book, so it works on any EVM chain and does not depend on an external
///      identity deployment being live.
contract PayeeRegistry {
    enum Status {
        None,
        Active,
        PendingChange,
        Frozen
    }

    struct Payee {
        address account;
        string label;
        uint64 registeredAt;
        Status status;
        uint64 changeRequestedAt;
        address pendingAccount;
        string pendingLabel;
    }

    /// @notice Minimum delay before a requested payout change can be applied.
    uint64 public immutable minChangeDelay;

    mapping(bytes32 payeeId => Payee) private _payees;
    mapping(address account => bytes32) private _accountToId;

    event PayeeRegistered(bytes32 indexed payeeId, address indexed account, string label, uint64 at);
    event ChangeRequested(bytes32 indexed payeeId, address indexed fromAccount, address indexed toAccount, uint64 applyAt);
    event ChangeApplied(bytes32 indexed payeeId, address indexed account, uint64 at);
    event PayeeFrozen(bytes32 indexed payeeId, address indexed account, uint64 at);
    event PayeeUnfrozen(bytes32 indexed payeeId, address indexed account, uint64 at);
    event PayeeRemoved(bytes32 indexed payeeId, address indexed account, uint64 at);

    error ZeroAddress();
    error ZeroId();
    error PayeeNotFound(bytes32 payeeId);
    error PayeeExists(bytes32 payeeId);
    error AddressTaken(address account);
    error NotActive(bytes32 payeeId);
    error NotPending(bytes32 payeeId);
    error ChangeTooEarly(uint64 applyAt, uint64 now_);
    error ChangeWindowPassed(uint64 applyAt, uint64 now_);
    error Frozen(bytes32 payeeId);
    error NotFrozen(bytes32 payeeId);

    /// @param minChangeDelay_ seconds a payout change waits before it can be applied.
    constructor(uint64 minChangeDelay_) {
        minChangeDelay = minChangeDelay_;
    }

    // ---------------------------------------------------------------- views

    /// @notice The account a payment to `payeeId` must go to right now. Reverts if the
    ///         payee is not active, so a caller can never pay a stale or frozen address.
    function activeAccount(bytes32 payeeId) external view returns (address) {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.Active && p.status != Status.PendingChange) revert NotActive(payeeId);
        return p.account;
    }

    /// @notice Whether `payeeId` can be paid right now.
    function isActive(bytes32 payeeId) external view returns (bool) {
        Status status = _payees[payeeId].status;
        return status == Status.Active || status == Status.PendingChange;
    }

    function payee(bytes32 payeeId) external view returns (Payee memory) {
        return _payees[payeeId];
    }

    /// @notice Reverse lookup: is this address currently the active payout of any payee?
    function payeeIdOf(address account) external view returns (bytes32) {
        return _accountToId[account];
    }

    function canApplyChange(bytes32 payeeId) external view returns (bool) {
        Payee storage p = _payees[payeeId];
        return p.status == Status.PendingChange && block.timestamp >= p.changeRequestedAt + minChangeDelay;
    }

    // ------------------------------------------------------------- registration

    /// @notice Register a new verified payee. Idempotency is the caller's job.
    function register(bytes32 payeeId, address account, string calldata label) external {
        if (payeeId == bytes32(0)) revert ZeroId();
        if (account == address(0)) revert ZeroAddress();
        if (_payees[payeeId].status != Status.None) revert PayeeExists(payeeId);
        if (_accountToId[account] != bytes32(0)) revert AddressTaken(account);

        _payees[payeeId] = Payee({
            account: account,
            label: label,
            registeredAt: uint64(block.timestamp),
            status: Status.Active,
            changeRequestedAt: 0,
            pendingAccount: address(0),
            pendingLabel: ""
        });
        _accountToId[account] = payeeId;
        emit PayeeRegistered(payeeId, account, label, uint64(block.timestamp));
    }

    // ------------------------------------------------------------ address change

    /// @notice Request a payout address change. Lands only after `minChangeDelay`.
    /// @dev While pending, the old address stays active and payments still go to it.
    function requestChange(bytes32 payeeId, address toAccount, string calldata label) external {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.Active) revert NotActive(payeeId);
        if (toAccount == address(0)) revert ZeroAddress();
        if (_accountToId[toAccount] != bytes32(0) && _accountToId[toAccount] != payeeId) {
            revert AddressTaken(toAccount);
        }

        p.status = Status.PendingChange;
        p.changeRequestedAt = uint64(block.timestamp);
        p.pendingAccount = toAccount;
        p.pendingLabel = label;
        emit ChangeRequested(payeeId, p.account, toAccount, uint64(block.timestamp) + minChangeDelay);
    }

    /// @notice Apply a requested change once the delay has elapsed.
    function applyChange(bytes32 payeeId) external {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.PendingChange) revert NotPending(payeeId);
        if (block.timestamp < p.changeRequestedAt + minChangeDelay) {
            revert ChangeTooEarly(p.changeRequestedAt + minChangeDelay, uint64(block.timestamp));
        }

        delete _accountToId[p.account];
        p.account = p.pendingAccount;
        p.label = p.pendingLabel;
        _accountToId[p.account] = payeeId;
        p.status = Status.Active;
        p.changeRequestedAt = 0;
        p.pendingAccount = address(0);
        p.pendingLabel = "";
        emit ChangeApplied(payeeId, p.account, uint64(block.timestamp));
    }

    /// @notice Cancel a pending change; the old address stays active.
    function cancelChange(bytes32 payeeId) external {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.PendingChange) revert NotPending(payeeId);
        p.status = Status.Active;
        p.changeRequestedAt = 0;
        p.pendingAccount = address(0);
        p.pendingLabel = "";
    }

    // ------------------------------------------------------------------ disputes

    /// @notice Freeze a payee during a dispute. Payments to it revert while frozen.
    function freeze(bytes32 payeeId) external {
        Payee storage p = _payees[payeeId];
        if (p.status == Status.None) revert PayeeNotFound(payeeId);
        if (p.status == Status.Frozen) revert Frozen(payeeId);
        p.status = Status.Frozen;
        emit PayeeFrozen(payeeId, p.account, uint64(block.timestamp));
    }

    function unfreeze(bytes32 payeeId) external {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.Frozen) revert NotFrozen(payeeId);
        p.status = Status.Active;
        emit PayeeUnfrozen(payeeId, p.account, uint64(block.timestamp));
    }

    /// @notice Remove a payee entirely. Only callable while frozen, so a disputed
    ///         payee cannot be quietly deleted and re-registered to launder state.
    function remove(bytes32 payeeId) external {
        Payee storage p = _payees[payeeId];
        if (p.status != Status.Frozen) revert NotFrozen(payeeId);
        delete _accountToId[p.account];
        delete _payees[payeeId];
        emit PayeeRemoved(payeeId, p.account, uint64(block.timestamp));
    }
}
