# Judge Q&A — honest, short answers

**What is it, in one sentence, and who is it for specifically?**
Ledgerly stages a verified batch of stablecoin invoices and settles it with one approval; it is for the ops lead at a 5–30-person Web3 agency or DAO paying contractors monthly in tUSD8.

**What did you build during the hackathon, and what did you reuse?**
Built: PayeeRegistry, Policy, the whole web workflow, the 36-test adversarial suite, deployment, docs and demo. Reused: the MIT Aevum Starter Kit's chain config, EIP-3009 typed-data helpers, chunked log reader and fork tooling, with attribution in `LICENSE-STARTER-KIT.md` and `NOTICE.md`.

**How does it use Aevum, and why is that integration necessary?**
Both contracts are deployed on Aevum 44005 and settle the official tUSD8. The payee lookup (`activeAccount`) and settlement resolve the destination on-chain at execution time — that is the security claim. Moving the flow off Aevum would remove the verifiable decision. No other chain or partner was used; the event has no partner prizes.

**What breaks first at scale, or what is the biggest known weakness?**
The client-side event scan grows linearly; a real deployment needs an indexer. The owner/guardian are EOAs rather than a multisig, and extraction currently handles CSV/pasted text only. The payee book is self-managed — it is not a KYC or government identity registry.

**Why you?**
The team built directly from QDay's own docs and starter kit, tested the exact Aevum gotchas (Shanghai opcodes, 1,000-block logs, unstaked Kernel factory), and treated the blocked bad payment as a first-class demo rather than an afterthought.

**What happens after the hackathon?**
Add ERC-8004 verification when the Aevum registry ships, introduce smart-account session keys for non-owner operators, add multisig ownership and OCR ingestion, then pursue the QDay mainnet builder fast track.

**Why is the AI part not a wrapper?**
The extraction is deterministic and runs in the browser; even if an LLM improves it later, it only proposes. Payment authority lives in a contract that resolves the payee id at settlement, enforces caps/expiry/revocation, and produces auditable events. The product would still be meaningful with no model at all.

**Which prior work did you check to avoid copying?**
Meigi (ETHGlobal Tokyo 2026) for Confirmation of Payee, SpendLeash (built in this event) for agent spending caps, Request Network for invoicing, and the official starter kit's Checkout. Ledgerly differs by combining invoice intake, an approval-bound verified batch, and reconciliation into one workflow; it deliberately avoids a standalone payee registry and an autonomous capped agent.
