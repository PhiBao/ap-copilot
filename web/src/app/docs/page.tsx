"use client";

import { useNetwork } from "@/lib/network";
import { TUSD8 } from "@/lib/contracts";

export default function Docs() {
  const { net } = useNetwork();
  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Reference</p>
        <h1>How it works.</h1>
        <p className="lede">A short tour for a judge with 90 seconds and a repo tab open.</p>
      </div>

      <div className="grid-2">
        <div className="panel panel-pad">
          <h3>The claim</h3>
          <p className="lede" style={{ fontSize: 14 }}>
            Ledgerly is an approval-first accounts-payable copilot. It extracts invoice lines,
            checks each payee against a verified one-address book, stages a batch, and settles it
            on QDay Aevum with one owner approval. A hijacked address cannot redirect a staged
            payment, because the contract resolves the destination at settlement time.
          </p>
          <h3 style={{ marginTop: 24 }}>Innovation</h3>
          <p className="lede" style={{ fontSize: 14 }}>
            The unit of control is the <em>batch decision</em>, not the transaction. Software
            proposes; deterministic contract checks and a deliberate human approval decide. The
            reconciliation export closes the loop from invoice to books — the step demo payments
            usually skip.
          </p>
        </div>

        <div className="panel panel-pad">
          <h3>Contracts on {net.label}</h3>
          <dl className="mono" style={{ fontSize: 12.5, lineHeight: 2 }}>
            <dt className="faint">tUSD8</dt><dd style={{ margin: 0, marginBottom: 10 }} className="truncate">{TUSD8}</dd>
            <dt className="faint">PayeeRegistry</dt><dd style={{ margin: 0, marginBottom: 10 }} className="truncate">{net.registry ?? "not configured"}</dd>
            <dt className="faint">Policy</dt><dd style={{ margin: 0 }} className="truncate">{net.policy ?? "not configured"}</dd>
          </dl>
          <p className="hint" style={{ marginTop: 16 }}>
            Configure with <span className="kbd">NEXT_PUBLIC_REGISTRY_AEVUM</span> and{" "}
            <span className="kbd">NEXT_PUBLIC_POLICY_AEVUM</span>. See the repository README for
            deployment commands and test instructions.
          </p>
          <h3 style={{ marginTop: 22 }}>Prove it</h3>
          <ol className="lede" style={{ fontSize: 13.5, paddingLeft: 20 }}>
            <li>Open <a className="link" href="/payees">Payees</a> and freeze one — batch review blocks it.</li>
            <li>Stage the example batch, then edit an amount above the cap — approval disables.</li>
            <li>Settle, follow the tx on the explorer, then reconcile and export the CSV.</li>
          </ol>
        </div>
      </div>

      <div className="divider" />
      <div className="grid-3">
        <div><h3>Track</h3><p className="muted" style={{ fontSize: 14 }}>Native AI Assistants — document intake, staged transactions for user approval, automated reconciliation with plain-language discrepancy flags and accounting-ready export.</p></div>
        <div><h3>License</h3><p className="muted" style={{ fontSize: 14 }}>MIT. Built on the MIT Aevum Starter Kit (PQA Labs) for chain config, EIP-3009 plumbing and fork tooling — attribution in LICENSE-STARTER-KIT.md and NOTICE.md.</p></div>
        <div><h3>Limits</h3><p className="muted" style={{ fontSize: 14 }}>The payee book is self-managed, not a KYC provider. Extraction is deterministic (CSV/text). Scanned-PDF OCR is a roadmap item.</p></div>
      </div>
    </main>
  );
}
