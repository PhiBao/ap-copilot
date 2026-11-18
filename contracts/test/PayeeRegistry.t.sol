// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayeeRegistry} from "../src/PayeeRegistry.sol";

contract PayeeRegistryTest is Test {
    PayeeRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes32 internal constant ID_A = keccak256("payee:alice");
    bytes32 internal constant ID_B = keccak256("payee:bob");

    function setUp() public {
        registry = new PayeeRegistry(1 hours);
    }

    function test_register_and_activeAccount() public {
        registry.register(ID_A, alice, "Alice Studio");
        assertTrue(registry.isActive(ID_A));
        assertEq(registry.activeAccount(ID_A), alice);
        assertEq(registry.payeeIdOf(alice), ID_A);
        assertEq(registry.payee(ID_A).label, "Alice Studio");
    }

    function test_register_rejects_zero_address() public {
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.ZeroAddress.selector));
        registry.register(ID_A, address(0), "zero");
    }

    function test_register_rejects_duplicate_id() public {
        registry.register(ID_A, alice, "Alice");
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.PayeeExists.selector, ID_A));
        registry.register(ID_A, bob, "Bob");
    }

    function test_register_rejects_address_taken() public {
        registry.register(ID_A, alice, "Alice");
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.AddressTaken.selector, alice));
        registry.register(ID_B, alice, "Alice again");
    }

    function test_change_does_not_land_instantly() public {
        registry.register(ID_A, alice, "Alice");
        registry.requestChange(ID_A, bob, "Alice new address");
        assertEq(registry.activeAccount(ID_A), alice, "old address must stay active during the window");
        assertFalse(registry.canApplyChange(ID_A));

        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.ChangeTooEarly.selector, block.timestamp + 1 hours, block.timestamp));
        registry.applyChange(ID_A);

        vm.warp(block.timestamp + 1 hours);
        assertTrue(registry.canApplyChange(ID_A));
        registry.applyChange(ID_A);
        assertEq(registry.activeAccount(ID_A), bob);
        assertEq(registry.payeeIdOf(bob), ID_A);
        assertEq(registry.payeeIdOf(alice), bytes32(0));
    }

    function test_pending_change_is_visible() public {
        registry.register(ID_A, alice, "Alice");
        registry.requestChange(ID_A, bob, "Alice new address");
        PayeeRegistry.Payee memory p = registry.payee(ID_A);
        assertEq(uint8(p.status), uint8(PayeeRegistry.Status.PendingChange));
        assertEq(p.pendingAccount, bob);
    }

    function test_cancel_change_keeps_old_address() public {
        registry.register(ID_A, alice, "Alice");
        registry.requestChange(ID_A, bob, "new");
        registry.cancelChange(ID_A);
        assertTrue(registry.isActive(ID_A));
        assertEq(registry.activeAccount(ID_A), alice);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotPending.selector, ID_A));
        registry.applyChange(ID_A);
    }

    function test_freeze_blocks_payments_and_change() public {
        registry.register(ID_A, alice, "Alice");
        registry.freeze(ID_A);
        assertFalse(registry.isActive(ID_A));
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotActive.selector, ID_A));
        registry.activeAccount(ID_A);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotActive.selector, ID_A));
        registry.requestChange(ID_A, bob, "new");
    }

    function test_double_freeze_reverts() public {
        registry.register(ID_A, alice, "Alice");
        registry.freeze(ID_A);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.Frozen.selector, ID_A));
        registry.freeze(ID_A);
    }

    function test_unfreeze_restores() public {
        registry.register(ID_A, alice, "Alice");
        registry.freeze(ID_A);
        registry.unfreeze(ID_A);
        assertTrue(registry.isActive(ID_A));
    }

    function test_remove_only_when_frozen() public {
        registry.register(ID_A, alice, "Alice");
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotFrozen.selector, ID_A));
        registry.remove(ID_A);
        registry.freeze(ID_A);
        registry.remove(ID_A);
        assertFalse(registry.isActive(ID_A));
        assertEq(registry.payeeIdOf(alice), bytes32(0));
    }

    function test_frozen_payee_can_be_re_registered_after_removal() public {
        registry.register(ID_A, alice, "Alice");
        registry.freeze(ID_A);
        registry.remove(ID_A);
        registry.register(ID_A, carol, "Carol");
        assertEq(registry.activeAccount(ID_A), carol);
    }

    function test_second_claim_on_same_payee_is_possible_but_explicit() public {
        // Two different ids cannot share one address: the book stays one-to-one.
        registry.register(ID_A, alice, "Alice");
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.AddressTaken.selector, alice));
        registry.register(ID_B, alice, "Alice alias");
    }
}
