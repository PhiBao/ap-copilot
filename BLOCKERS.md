# RESOLVED: funded test deployer

Resolved on 19 Nov 2026 via the connected browser MetaMask wallet (faucet claim + wallet-signed
deploy through the gated /deploy page). No private key was shared or committed.

---

# Original blocker note (historical)

The Aevum web faucet (https://faucet.qday.info/en) requires a connected wallet holding ~0.0001 ETH / 1 USDT / 1 USDC on Ethereum mainnet plus a bot check. The Discord faucet requires Discord verification. No funded test key exists in this environment.

Until a test address is funded with tQDAY for gas + tUSD8 for testing:
- Build and verify against `make fork` (a local copy of Aevum testnet chain 440050 with real tUSD8 state and impersonation), plus unit tests.
- Deployment to real Aevum 44005 is blocked. The user must either:
  (a) connect a funded wallet at the faucet and share the resulting address (only the address, never a key), then we can send funds to our deployer, or
  (b) provide a dedicated test wallet via `cast wallet import aevum-deployer --interactive` themselves (key stays in Foundry keystore, never in chat or repo).

No private key will be written to any file that gets committed. As soon as a deployer is funded, `make deploy-aevum ACCOUNT=aevum-deployer` deploys the two contracts.
