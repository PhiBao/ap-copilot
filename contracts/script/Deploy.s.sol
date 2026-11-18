// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {PayeeRegistry} from "../src/PayeeRegistry.sol";
import {Policy, IERC20} from "../src/Policy.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

/// @notice Deploys the AP Copilot core: registry, policy, and (locally only) a mock token.
///         On Aevum the token is the real tUSD8, passed in with --sig.
contract Deploy is Script {
    // tUSD8 on QDay Aevum testnet (6 decimals). Not used for local mocks.
    address constant TUSD8_AEVUM = 0x456569838f1d43009A91ebA4263147Afd7233483;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        bool local = vm.envOr("LOCAL_TOKEN", false);
        address token = vm.envOr("TOKEN", TUSD8_AEVUM);
        address owner = vm.envOr("OWNER", address(0));
        uint64 changeDelay = uint64(vm.envOr("CHANGE_DELAY", uint256(7 days)));

        if (owner == address(0)) {
            owner = vm.addr(deployerPrivateKey);
        }

        vm.startBroadcast(deployerPrivateKey);

        PayeeRegistry registry = new PayeeRegistry(changeDelay);
        console.log("PayeeRegistry", address(registry));

        Policy policy = new Policy(IERC20(token), registry, owner);
        console.log("Policy", address(policy));

        if (local) {
            MockUSD8 mock = new MockUSD8();
            console.log("MockUSD8", address(mock));
        }

        vm.stopBroadcast();
    }
}
