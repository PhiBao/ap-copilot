# Ledgerly — verified batch payables

**Drop in your invoices; it stages one verified batch you approve once — and it can never pay the wrong payee.**

- **Live app:** https://ap-copilot.vercel.app/ (public, no login)
- **Demo video:** https://ap-copilot.vercel.app/demo.mp4 (captioned screencast of the live app; see `docs/DEMO.md` for the voice script)
- **Repo:** https://github.com/PhiBao/ap-copilot
- **Track:** Native AI Assistants (fallback: Open Innovation) · Aevum Builder Challenge #1

### Try it in 60 seconds

1. Open **Batch**, click **Load example**, then **Extract lines**.
2. Watch payee verification: registered names show a verified on-chain address; unknown names block the batch. Edit any extracted field before staging — the software proposes, you decide.
3. Click **Approve & settle batch**, approve in your wallet, then open **Proof** and follow the on-chain payouts to the explorer.

### Proof (independently checkable on Aevum testnet, chain 44005)

| Artifact | Link |
| --- | --- |
| PayeeRegistry contract | https://explorer-test.qday.info/address/0x770bdcbc6ef06f99a1c239a77b6792ef1006cf97 |
| Policy contract | https://explorer-test.qday.info/address/0x645174d655814839a85bd80d2f54b35a7160465e |
| Live batch settlement (0.1 tUSD8 to three verified payees) | https://explorer-test.qday.info/tx/0x1119a5bef298513eba4978bf34c37925a4948f1840221aa9e1277b19d9ccb4c0 |
| tUSD8 token (official test stablecoin) | https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483 |
| Deployer transaction for the current Policy | https://explorer-test.qday.info/tx/0x47e5299f358052b04d733cd6bc2c56f521204ef6725b615d3bbaa47b85fb0873 |

The current Policy was deployed at block `3481328+`. Read `lifetimeSpent()` and scan `PayoutSettled` events on the explorer; compare them with the CSV exported from the Proof page. No trust in our UI is required.

---

## Product

Ledgerly is an approval-first accounts-payable copilot for small Web3 teams and DAOs that pay 5–30 contractors or suppliers per month in stablecoins.

- **Problem:** invoices arrive as PDFs, emails and chat messages. Someone copies addresses into a spreadsheet, asks a manager in chat to approve, pastes addresses into a wallet, then retains no books-ready record. Industry data puts 29% of freelance invoices late and 85% of freelancers paid late at least sometimes; per-$1,000 cross-border costs reach $45–$69 on PayPal and $70–$100+ on SWIFT ([Spark](https://spark.money/research/stablecoin-freelancer-gig-payments), [Autochase](https://autochase.app/blog/freelancer-late-payment-statistics)).
- **Current alternative:** Request Network / Request Finance for invoicing ([request.network](https://request.network/pricing)), plus spreadsheets and manual wallet transfers. Invoicing is solved; the **decision and reconciliation** are not.
- **Value proposition:** one batch of payments, verified against a one-address payee book, with caps, expiry and instant revocation enforced by a contract, followed by an exported reconciliation that matches the chain.
- **Why now:** gasless tUSD8 settlement and cheap, fast Aevum execution make a multi-payout flow practical without custodial middleware.
- **Key insight:** the unit of control is the **batch decision**, not the transaction. Software may extract and propose; a deterministic contract check and a deliberate human approval decide.
- **Wedge:** a payee's address change is never instant. A change waits in a public window while the old address remains payable, and a guardian key can freeze it immediately. A hijacked "bank details changed" message cannot redirect a staged payment.
- **Why us:** built from the official Aevum Starter Kit plumbing, with a deliberately adversarial test suite around the bad payment case; the team has direct access to the QDay builder docs and demo channels.

## User experience

1. **Register payees** — a name maps to exactly one active address. Changes are requested, published and applied only after the delay; a dispute freezes the payee.
2. **Paste invoices** — CSV or `payee, amount, reference` rows. Parsing is deterministic and runs in the browser; no data leaves the tab.
3. **Review and verify** — every extracted field is editable. Each payee is looked up on-chain: Verified / Change pending / Frozen / Not in book. Anything but Verified disables settlement. Caps are checked live.
4. **Approve and settle** — one wallet approval, one batch transaction. The Policy spends only its own funded budget.
5. **Reconcile** — the Proof page scans on-chain `PayoutSettled` events in 1,000-block chunks, matches them to staged records, flags discrepancies in plain language, and exports a CSV.

**Activation moment:** seeing the first unknown payee flip from "Not in book" to "Verified" after registration — and seeing the button disabled until the book is right.
**Retention loop:** each settled batch becomes a reconciled ledger entry; the payee book and caps accumulate value and make the next month faster.
**Sharing loop:** the payee book is reconstructed from on-chain `PayeeRegistered` events, so teammates see the same book without a shared spreadsheet.

## Innovation

This is not "AI + a database". The novel unit is a **human-approved, contract-enforced payable batch**:

- Document intake proposes; a deterministic, on-chain payee lookup disposes. An LLM can later improve extraction without ever gaining payment authority.
- The destination address is resolved by the contract **at settlement time** from the payee id, so a staged batch cannot be rerouted by a changed address.
- The accounting export is generated from actual chain events, not from the UI's optimism.

## Hackathon relevance

- **Track:** Native AI Assistants — automated extraction across file formats, single/batch tUSD8 transactions staged for user approval, on-chain reconciliation that flags discrepancies in plain language with accounting-ready exports.
- **No partner prizes exist in this event.** The only awards are overall 1st/2nd/3rd ($800/$500/$200 USDT), so no sponsor technology was added to qualify for anything.
- **Aevum integration map:** `contracts/src/PayeeRegistry.sol` and `contracts/src/Policy.sol` are deployed on Aevum 44005 and settle the official tUSD8; `web/src/lib/contracts.ts` holds ABIs and addresses; `web/src/lib/payee-events.ts` reads registry events in 1,000-block chunks for Aevum's RPC limit; `web/src/app/proof/page.tsx` reads `PayoutSettled` events and produces explorer links. The starter kit's chain config, EIP-3009 patterns and Shanghai opcode check are reused with attribution.
- **Judging criteria:** Innovation (20) — batch-decision control and delayed payee changes; UX (15) — five guided steps, editable fields, plain-language blocks; Demo (10) — a live blocked-payment case and a real settlement; Documentation (10) — this README, diagram, verification matrix; Technical/platform (15) — scoped caps, expiry, revocation, EIP-3009 gasless route and 36 Foundry tests; Utility (15) — named buyer and monthly workflow; Safety (15) — owner/guardian roles, delay window, freeze, batch replay protection, audit events.

## Provenance

- **Built during the build window (16 Nov – 11 Dec 2026):** Ledgerly product thesis, all application contracts (`PayeeRegistry.sol`, `Policy.sol`), workflow and design, all UI pages, test suite, deployment, docs and demo.
- **Reused with attribution:** the MIT-licensed [Aevum Starter Kit](https://github.com/qday-io/aevum-starter-kit) by PQA Labs — chain config, EIP-3009 typed-data helpers, chunked log reading and the Foundry/fork Makefile patterns. Its LICENSE and NOTICE are preserved in `LICENSE-STARTER-KIT.md` and `NOTICE.md`, and a comment in each derived file names the source.
- **AI tooling:** this agent used planning/discovery notes in `~/common/discovery/qday/`, recorded in `docs/PROVENANCE.md`. No model API key or service is used at runtime; extraction is deterministic.

## Architecture

```
Browser (Next.js) ── viem/wagmi ── Aevum RPC (44005)
        │                     │
        │ read payee()/state() │ write register/configure/deposit/executeBatch
        ▼                     ▼
   PayeeRegistry          Policy (funded budget)
   1 id → 1 address       caps · expiry · revoke · batch replay guard
        ▲                     │
        └── activeAccount() ──┘   (resolved at settlement time)
```

- **Backend decision:** none. The product is a frontend talking directly to public Aevum contracts via viem/wagmi. A backend is not needed: there are no secrets to protect at runtime, no user-specific persistence (the payee book and events are on-chain), and no background jobs. The event scanner runs client-side. This follows `AGENTS.md` §9 — the simplest architecture that satisfies the requirements.
- **Runtime:** TypeScript/Node 22, Next.js 16, React 19, viem/wagmi, Foundry/Solidity 0.8.24. EVM target **Shanghai** (Aevum rejects Cancun opcodes).
- **Data flow:** invoices → parsed lines → on-chain payee checks → staged batch → `executeBatch` → `PayoutSettled` events → reconciliation CSV.
- **Diagram source:** `docs/architecture.svg` answers the question "what enforces the payee decision?" See `docs/DIAGRAMS.md`.

## Running

```bash
node >=22, pnpm, Foundry (forge/cast)
pnpm install
cp .env.example web/.env.local     # already contains the live Aevum addresses
pnpm --filter web dev              # http://localhost:3000
cd contracts && forge test --no-match-path 'test/fork/*'
make test-fork                     # real tUSD8 on a local Aevum fork
```

To deploy your own instance, use the gated `/deploy` page with a funded browser wallet (`NEXT_PUBLIC_ENABLE_DEPLOY=1`), or `make deploy-aevum ACCOUNT=<keystore>` with a dedicated test key. Never commit a private key.

## Demo

- **Live URL:** https://ap-copilot.vercel.app/
- **Flow:** Desk → Payees (freeze/change) → Batch (example → edit → verify → settle) → Proof (refresh → export).
- **What to try first:** on Batch, edit an amount above the 0.5 tUSD8 per-payment cap. The guard turns red and the settle button disables — the contract will refuse it too.
- **Setup:** connect any EVM wallet with a little tQDAY for gas and tUSD8 for the demo; faucet at https://faucet.qday.info/en.

## Verification

| Claim | Status | Artifact |
| --- | --- | --- |
| Contracts deployed on Aevum | Real, live | explorer links above |
| Batch settlement to verified payees | Real, live | batch tx `0x1119a5be…` and three `PayoutSettled` events |
| Pending change cannot redirect payment | Real, tested | `test_pending_change_does_not_redirect_payment`, live fork probe |
| Frozen payee blocks payment | Real, tested | `test_frozen_payee_is_refused`, live fork probe |
| Caps/expiry/revoke | Real, tested | Foundry suite (36 tests) |
| Gasless EIP-3009 settlement | Real, tested | `test_gasless_batch_with_authorizations` |
| Scanned-PDF OCR extraction | Not implemented | roadmap |
| KYC / real-world identity attestation | Not implemented; payee book is self-managed by design | docs/QA.md |

No mocked behavior is presented as real. The live app reads and writes the deployed contracts.

## Security and reliability

- **Roles:** `PayeeRegistry` separates `owner` (registration, changes) from `guardian` (freeze, cancel). A stranger cannot request a redirect.
- **Delay:** address changes land only after a public window (1 hour in the live deployment). The old address stays payable meanwhile; freeze is instant.
- **Budget:** the Policy spends its own deposited balance, so a compromised owner key cannot move more than the funded budget and caps allow. Instant `revoke()` stops all settlement.
- **Replay:** each `batchId` settles once. Amounts and payee ids are checked before any transfer.
- **External failure:** RPC calls are client-side; the Proof page scans logs in 1,000-block chunks. If a read fails the UI shows an error rather than a fake success.
- **Known weaknesses:** the owner/guardian are EOA keys in the demo; no multisig, no formal audit, no transaction simulation UI; unregistering a frozen payee does not delete its historical events (by design, for auditability).

## Limitations and roadmap

1. Scanned-PDF OCR and multi-format ingestion (the current parser handles CSV and pasted rows).
2. ERC-8004 identity integration once the Aevum registry address is published by QDay.
3. Smart-account / session-key delegation for a non-owner operator (the testnet bundler is live but the Kernel factory is unstaked; documented workaround exists).
4. Recurring mandates and split payouts as should-ship extensions.
5. Multisig owner, per-batch transaction simulation, and a professional audit before mainnet.

MIT licensed. Built on the Aevum Starter Kit (MIT, PQA Labs).
