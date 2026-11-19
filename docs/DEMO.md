# Demo scripts (3–5 minute live finalist call)

## Live demo — 4 minutes

**0:00–0:10 — identity.** "Ledgerly stages a verified batch of stablecoin invoices and settles it with one approval — for the ops lead paying contractors monthly. Pay the invoices, not the impostor."

**0:10–0:45 — the pain and the book.** Show three invoices pasted or uploaded (PDF/CSV) into Batch. Explain the spreadsheet + chat-approval workaround. Show Payees: one name → one address, request a change, point at the 1-hour countdown while the old address stays payable.

**0:45–1:30 — the flow.** Load example, extract. Show the three rows: Verified / Not in book. Register the missing payees live (or use the seeded book). Every field is editable; nothing is paid until the operator says so.

**1:30–2:15 — the surprise (block the bad payment).** First re-extract the same refs: every line shows "Duplicate ref" and settlement disables. Then edit an amount above the 0.5 tUSD8 cap, or freeze a payee. Explain: "The contract refuses duplicates, caps, frozen or redirected payees — the destination is resolved at settlement time, so a changed address can't redirect a staged batch."

**2:15–3:00 — the proof.** Settle a real 0.1 tUSD8 batch. Follow the tx on the Aevum explorer; show `PayoutSettled` events with payee id, amount, invoice reference.

**3:00–3:40 — the books.** Proof page: it auto-rebuilds every batch and payout from chain events with payee labels. Upload the CSV you expected; show matched lines, then a modified amount flagged "amount differs" in a sentence. Export the ledger CSV. "That is the step demo payments usually skip."

**3:40–4:00 — close.** State limits honestly: self-managed payee book, EOA owner, no OCR for scanned PDFs, no formal audit. Name the roadmap: ERC-8004, session keys, multisig. Mention that any team can open **New desk** and deploy their own in two transactions.

## Video pitch (≤2 minutes, human voice)

Record at 1080p, real voice, no sped-up footage or music-only sections. Open with the one-sentence identity. Show the product working within 30 seconds: paste → extract → verify → blocked bad line → settle → explorer proof. End on the reconciliation CSV and the proof links.

## Technical walkthrough (if the form asks for one, ≤3 minutes)

1. Architecture: EOA browser → Aevum RPC → PayeeRegistry + Policy; no backend, no secrets at runtime (`docs/architecture.svg`).
2. Contract decisions: one-address payee book, delayed changes, guardian freeze, funded budget, caps/expiry/revoke, replay protection, EIP-3009 gasless route.
3. Aevum specifics: Shanghai EVM, 1,000-block log chunks, legacy transactions, explorer verification unavailable so exact deployed commit + addresses are in the README.
3b. Product boundaries: no backend and no secrets at runtime; intake is deterministic and client-side (CSV/TSV/JSON/email/PDF text); a model can improve extraction later but never gains payment authority.
4. Tests: 36 Foundry tests including the hijacked-change and frozen-payee cases; live fork probes; real testnet settlement tx.

## Reliable path / fallbacks

| Risk | Control |
| --- | --- |
| Model output | None — extraction is deterministic. |
| RPC timeout | Proof page scans in 1,000-block chunks and shows an error, never a fake success. |
| Wallet popup | Rehearse with a funded wallet; keep a recorded fallback of the full flow locally. A pre-recorded video cannot replace live attendance on 15 Dec. |
| Bad payee state | Use the seeded three-payee book; freeze can be undone with unfreeze. |
| Faucet | Fund the demo wallet the day before; tQDAY and tUSD8 claims are 24h-cooldown. |

Submit before 11 Dec 08:00 UTC; portals slow near the deadline.
