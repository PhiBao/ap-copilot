// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayeeRegistry} from "../src/PayeeRegistry.sol";
import {Policy, IERC20} from "../src/Policy.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

contract PolicyTest is Test {
    MockUSD8 internal token;
    PayeeRegistry internal registry;
    Policy internal policy;

    uint256 internal constant OWNER_KEY = 0xA11CE;
    uint256 internal constant ATTACKER_KEY = 0xB0B;
    address internal owner;
    address internal attacker;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant ID_A = keccak256("payee:alice");
    bytes32 internal constant ID_B = keccak256("payee:bob");
    bytes32 internal constant ID_C = keccak256("payee:carol");

    uint256 internal constant SEED = 10_000e6;

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        attacker = vm.addr(ATTACKER_KEY);
        token = new MockUSD8();
        registry = new PayeeRegistry(1 hours, address(this), address(this));
        policy = new Policy(IERC20(address(token)), registry, owner);

        registry.register(ID_A, alice, "Alice Studio");
        registry.register(ID_B, bob, "Bob Labs");
        registry.register(ID_C, carol, "Carol Co");

        token.mint(owner, SEED);
        token.mint(address(policy), SEED);

        vm.prank(owner);
        policy.configure(500e6, 1_000e6, 5_000e6, uint64(block.timestamp) + 30 days);
    }

    function _payouts() internal view returns (Policy.Payout[] memory p) {
        p = new Policy.Payout[](3);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 100e6, ref: "INV-001"});
        p[1] = Policy.Payout({payeeId: ID_B, amount: 200e6, ref: "INV-002"});
        p[2] = Policy.Payout({payeeId: ID_C, amount: 200e6, ref: "INV-003"});
    }

    function _exec(bytes32 batchId, Policy.Payout[] memory p) internal {
        vm.prank(owner);
        policy.executeBatch(batchId, p);
    }

    function test_owner_only_settlement() public {
        vm.expectRevert(abi.encodeWithSelector(Policy.NotOwner.selector));
        policy.executeBatch(keccak256("batch-stranger"), _payouts());
    }

    function test_batch_settles_from_the_policy_budget() public {
        uint256 beforeAlice = token.balanceOf(alice);
        uint256 beforePolicy = token.balanceOf(address(policy));
        _exec(keccak256("batch-1"), _payouts());
        assertEq(token.balanceOf(alice), beforeAlice + 100e6);
        assertEq(token.balanceOf(bob), 200e6);
        assertEq(token.balanceOf(carol), 200e6);
        // The budget leaves the policy, not the owner's wallet.
        assertEq(token.balanceOf(address(policy)), beforePolicy - 500e6);
        assertEq(token.balanceOf(owner), SEED, "owner balance must be untouched");
        assertEq(policy.lifetimeSpent(), 500e6);
        assertTrue(policy.settled(keccak256("batch-1")));
    }

    function test_batch_refuses_when_budget_is_short() public {
        Policy poor = new Policy(IERC20(address(token)), registry, owner);
        vm.prank(owner);
        poor.configure(0, 0, 0, uint64(block.timestamp) + 30 days);
        vm.expectRevert(abi.encodeWithSelector(Policy.InsufficientBalance.selector, 0, 500e6));
        vm.prank(owner);
        poor.executeBatch(keccak256("batch-poor"), _payouts());
    }

    function test_replay_batch_reverts() public {
        _exec(keccak256("batch-1"), _payouts());
        vm.expectRevert(abi.encodeWithSelector(Policy.BatchAlreadySettled.selector, keccak256("batch-1")));
        _exec(keccak256("batch-1"), _payouts());
    }

    function test_batch_total_is_capped_by_daily_cap() public {
        Policy.Payout[] memory big = new Policy.Payout[](3);
        big[0] = Policy.Payout({payeeId: ID_A, amount: 400e6, ref: "first"});
        big[1] = Policy.Payout({payeeId: ID_B, amount: 400e6, ref: "second"});
        big[2] = Policy.Payout({payeeId: ID_C, amount: 400e6, ref: "third"});
        vm.expectRevert(abi.encodeWithSelector(Policy.DailyCapExceeded.selector, uint256(1000e6), uint256(1200e6)));
        _exec(keccak256("batch-big"), big);
    }

    function test_per_payment_cap_blocks_large_line() public {
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 501e6, ref: "over line cap"});
        vm.expectRevert(abi.encodeWithSelector(Policy.CapExceeded.selector, uint256(500e6), uint256(501e6)));
        _exec(keccak256("batch-line"), p);
    }

    function test_lifetime_cap_blocks_later_batch() public {
        vm.prank(owner);
        policy.configure(0, 0, 5_000e6, uint64(block.timestamp) + 30 days);
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 5_001e6, ref: "drain"});
        vm.expectRevert(abi.encodeWithSelector(Policy.LifetimeCapExceeded.selector, uint256(5000e6), uint256(5001e6)));
        _exec(keccak256("batch-drain"), p);
    }

    function test_invoice_reference_cannot_settle_twice() public {
        Policy.Payout[] memory first = new Policy.Payout[](1);
        first[0] = Policy.Payout({payeeId: ID_A, amount: 10e6, ref: "INV-DUP"});
        _exec(keccak256("batch-dup-1"), first);

        Policy.Payout[] memory second = new Policy.Payout[](1);
        second[0] = Policy.Payout({payeeId: ID_A, amount: 10e6, ref: "INV-DUP"});
        vm.expectRevert(abi.encodeWithSelector(Policy.ReferenceAlreadySettled.selector, "INV-DUP"));
        _exec(keccak256("batch-dup-2"), second);
    }

    function test_unregistered_payee_is_refused() public {
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: keccak256("payee:mallory"), amount: 1e6, ref: "bad"});
        vm.expectRevert(abi.encodeWithSelector(Policy.PayeeNotActive.selector, keccak256("payee:mallory")));
        _exec(keccak256("batch-bad"), p);
    }

    function test_frozen_payee_is_refused() public {
        registry.freeze(ID_A);
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 1e6, ref: "frozen"});
        vm.expectRevert(abi.encodeWithSelector(Policy.PayeeNotActive.selector, ID_A));
        _exec(keccak256("batch-frozen"), p);
    }

    function test_pending_change_does_not_redirect_payment() public {
        // The wedge: a hijacked change request cannot move an already-staged payment.
        registry.requestChange(ID_A, attacker, "hijacked");
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 100e6, ref: "INV-001"});
        _exec(keccak256("batch-hijack"), p);
        assertEq(token.balanceOf(alice), 100e6, "must still pay the verified address");
        assertEq(token.balanceOf(attacker), 0);
    }

    function test_revoke_stops_everything_instantly() public {
        vm.prank(owner);
        policy.revoke();
        vm.expectRevert(abi.encodeWithSelector(Policy.Revoked.selector));
        _exec(keccak256("batch-after-revoke"), _payouts());
    }

    function test_expiry_stops_settlement() public {
        vm.warp(1_000_000);
        vm.prank(owner);
        policy.configure(0, 0, 0, uint64(block.timestamp) - 1);
        vm.expectRevert(abi.encodeWithSelector(Policy.Expired.selector, uint64(block.timestamp) - 1));
        _exec(keccak256("batch-expired"), _payouts());
    }

    function test_only_owner_can_configure_or_revoke() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Policy.NotOwner.selector));
        policy.configure(1, 1, 1, 1);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Policy.NotOwner.selector));
        policy.revoke();
    }

    function test_zero_amount_line_reverts() public {
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 0, ref: "zero"});
        vm.expectRevert(abi.encodeWithSelector(Policy.ZeroAmount.selector));
        _exec(keccak256("batch-zero"), p);
    }

    function test_empty_batch_reverts() public {
        Policy.Payout[] memory p = new Policy.Payout[](0);
        vm.expectRevert(abi.encodeWithSelector(Policy.EmptyBatch.selector));
        _exec(keccak256("batch-empty"), p);
    }

    function test_remaining_caps_track_spend() public {
        assertEq(policy.remainingDaily(), 1_000e6);
        _exec(keccak256("batch-1"), _payouts());
        assertEq(policy.remainingDaily(), 500e6);
        assertEq(policy.remainingLifetime(), 4_500e6);
    }

    function test_withdraw_only_owner_and_capped_by_balance() public {
        vm.prank(owner);
        policy.withdraw(1_000e6);
        assertEq(token.balanceOf(owner), SEED + 1_000e6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Policy.NothingToWithdraw.selector));
        policy.withdraw(SEED);
    }

    // ---------------------------------------------------- signed batch route

    function test_signed_batch_settles_for_owner() public {
        bytes32 batchId = keccak256("batch-signed");
        Policy.Payout[] memory p = _payouts();
        uint256 nonce = 1;
        uint64 validUntil = uint64(block.timestamp) + 1 hours;
        bytes32 digest = policy.batchDigest(batchId, p, nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);

        policy.executeBatchSigned(batchId, p, nonce, validUntil, v, r, s);
        assertEq(token.balanceOf(alice), 100e6);
    }

    function test_signed_batch_rejects_foreign_signature() public {
        bytes32 batchId = keccak256("batch-forged");
        Policy.Payout[] memory p = _payouts();
        uint256 nonce = 1;
        uint64 validUntil = uint64(block.timestamp) + 1 hours;
        bytes32 digest = policy.batchDigest(batchId, p, nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTACKER_KEY, digest);

        vm.expectRevert(abi.encodeWithSelector(Policy.InvalidSignature.selector));
        policy.executeBatchSigned(batchId, p, nonce, validUntil, v, r, s);
    }

    function test_signed_batch_rejects_expiry() public {
        bytes32 batchId = keccak256("batch-late");
        Policy.Payout[] memory p = _payouts();
        uint256 nonce = 1;
        uint64 validUntil = uint64(block.timestamp) - 1;
        bytes32 digest = policy.batchDigest(batchId, p, nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);

        vm.expectRevert(abi.encodeWithSelector(Policy.SignatureExpired.selector, uint64(block.timestamp) - 1));
        policy.executeBatchSigned(batchId, p, nonce, validUntil, v, r, s);
    }

    // ---------------------------------------------- gasless EIP-3009 route

    function test_gasless_batch_with_authorizations() public {
        bytes32 batchId = keccak256("batch-gasless");
        Policy.Payout[] memory p = new Policy.Payout[](2);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 100e6, ref: "INV-001"});
        p[1] = Policy.Payout({payeeId: ID_B, amount: 200e6, ref: "INV-002"});

        Policy.Authorization[] memory auths = new Policy.Authorization[](2);
        auths[0] = _authFor(owner, address(policy), 100e6, batchId, 0);
        auths[1] = _authFor(owner, address(policy), 200e6, batchId, 1);

        policy.executeBatchWithAuthorizations(batchId, p, auths);
        assertEq(token.balanceOf(alice), 100e6);
        assertEq(token.balanceOf(bob), 200e6);
        assertEq(token.balanceOf(address(policy)), SEED, "gasless path pulls and forwards: net zero on the policy");
    }

    function test_gasless_batch_refuses_wrong_payee_amount() public {
        // The registry gate applies before any signature is burned.
        bytes32 batchId = keccak256("batch-gasless-bad");
        Policy.Payout[] memory p = new Policy.Payout[](1);
        p[0] = Policy.Payout({payeeId: ID_A, amount: 900e6, ref: "over cap"});

        Policy.Authorization[] memory auths = new Policy.Authorization[](1);
        auths[0] = _authFor(owner, address(policy), 900e6, batchId, 0);

        vm.expectRevert(abi.encodeWithSelector(Policy.CapExceeded.selector, uint256(500e6), uint256(900e6)));
        policy.executeBatchWithAuthorizations(batchId, p, auths);
    }

    // ------------------------------------------------------------------ utils



    function _payoutHash(Policy.Payout[] memory p) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](p.length);
        for (uint256 i = 0; i < p.length; i++) {
            hashes[i] = keccak256(abi.encode(p[i].payeeId, p[i].amount, keccak256(bytes(p[i].ref))));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _authFor(
        address from,
        address to,
        uint256 value,
        bytes32 batchId,
        uint256 i
    ) internal view returns (Policy.Authorization memory a) {
        bytes32 nonce = keccak256(abi.encode(batchId, i));
        bytes32 digest = token.DOMAIN_SEPARATOR();
        // EIP-3009 ReceiveWithAuthorization digest.
        bytes32 typehash =
            keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
        bytes32 structHash = keccak256(abi.encode(typehash, from, to, value, 0, uint256(block.timestamp) + 1 hours, nonce));
        digest = keccak256(abi.encodePacked("\x19\x01", digest, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        return Policy.Authorization({
            validAfter: 0,
            validBefore: uint64(block.timestamp) + 1 hours,
            nonce: nonce,
            v: v,
            r: r,
            s: s
        });
    }
}
