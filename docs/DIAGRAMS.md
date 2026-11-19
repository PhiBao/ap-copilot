# Diagram plan

One diagram: `docs/architecture.svg`. It answers one real question — **what enforces the payee decision?** The browser proposes a batch; `PayeeRegistry.activeAccount()` resolves the destination at settlement time; `Policy` checks caps, expiry, revocation and replay, then spends its own funded budget; `PayoutSettled` events feed reconciliation. No decorative flowcharts or Mermaid-by-default.
