# GOAL — QDay Aevum Builder Challenge #1

Deadline: **11 Dec 2026, 08:00 UTC** (firm). Top-5 live demo: **15 Dec 06:00 UTC**. Start now: 18 Nov → ~23 days.

## Product (Gate 1 approved)

**AP Copilot** — approval-first accounts-payable copilot for small Web3 teams.
Identity: "Drop in your invoices; it stages one verified batch you approve once — and it can never pay the wrong payee."
Track: **Native AI Assistants** (backup: Open Innovation). Network: QDay Aevum (44005), tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`. No tokens, no partner prizes.

## Winning conditions (Judging /100)

Innovation 20 · UX 15 · Technical+platform 15 · Real-world utility 15 · Safety 15 · Demo 10 · Docs 10.
Must-have moments: documents→batch flow in 90s · wrong-payee payment blocked · one-action revoke · gasless/standard tUSD8 settlement · reconciliation + accounting export · explorer links for every proof tx.

## Must Ship (smallest product that proves the thesis)

- Invoice intake: text/CSV/structured files → extracted fields shown for correction before staging. (Scanned-PDF = Should Ship.)
- Verified payee book: self-managed, delayed address-change window, dispute freeze — blocks mismatches.
- Batch staging → single human approval → one on-chain batch settlement in tUSD8 (gasless via signed authorization + relayer; standard approve+pay fallback).
- Scope enforcement: per-payment cap, daily cap, expiry, instant revoke, audit trail.
- Reconciliation: on-chain settlements matched against staged records; discrepancy flagged in plain language; accounting-ready CSV export.
- Live Next.js app + public repo (MIT) + Foundry contracts tested + README per AGENTS.md §12.
- Real Aevum deployment + test tokens; every proof a tx hash.

## Time checkpoints (AGENTS.md §19)

- 30% (~25 Nov): walking skeleton end-to-end + sponsor integration + one real proof artifact.
- 70% (~4 Dec): feature freeze. After this: fixes, polish, deploy, README, video only.
- Last 15% (~8–11 Dec): rehearsal, videos, submission form, access check. No new features.

## Rules (hard limits)

Aevum-only settlement · all code written in build window · public repo, no secrets ever · MIT license + starter-kit attribution · live attendance Dec 15 · no malicious code · submit before deadline.

## Validation plan

3–5 operator conversations (DAO/agency/ops) before/early in build. If <2 confirm monthly batch-pay pain → pivot to Mandate subscriptions (runner-up, Open Innovation).

## P0 hardening plan (approved 19 Nov, after fresh product review)

1. Contract v2: owner/signed-only settlement, on-chain duplicate-reference guard, `ChangeCancelled` event; **one redeploy** on Aevum.
2. "Create your desk": any team deploys its own Registry+Policy from its wallet in two transactions; per-wallet desk selection.
3. Admin lifecycle UI: configure caps/expiry, deposit/withdraw, revoke, plain-language errors.
4. Payee-change UX: request change with countdown, apply/cancel — the wedge must be performable.
5. Batch repairs: remove vestigial ERC-20 approval; demo amounts fit caps; inline register/map for Not-in-book; duplicate warnings.
6. Proof fix: topic-filtered queries, all-batch history from `BatchSettled`, no localStorage dependency.

## P1 (only after P0 lands)

7. Real assistant intake: JSON/TSV/email text + client-side PDF text extraction; optional LLM behind env flag; sentences for discrepancies.
8. Signed gasless approval in the UI (EIP-712 owner signature, anyone submits).

## Loop discipline

Each iteration: commit small → verify end-to-end → report checkpoint status (works / behind / proposed cuts). Never borrow time across checkpoints. Read `~/common/AGENTS.md` + `FOUNDER.md` as the source of truth.
