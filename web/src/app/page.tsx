"use client";

import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, policyAbi, TUSD8 } from "@/lib/contracts";
import { useDesk } from "@/lib/desk";
import { fromUnits } from "@/lib/intake";
import { ProofPanel } from "@/components/ProofPanel";

export default function Desk() {
  const { address, isConnected } = useAccount();
  const { desk } = useDesk();
  const policy = desk?.policy;

  const { data: st } = useReadContract({
    address: policy,
    abi: policyAbi,
    functionName: "state",
    query: { enabled: !!policy },
  });
  const { data: owner } = useReadContract({
    address: policy,
    abi: policyAbi,
    functionName: "owner",
    query: { enabled: !!policy },
  });
  const { data: balance } = useReadContract({
    address: TUSD8,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: policy ? [policy] : undefined,
    query: { enabled: !!policy, refetchInterval: 5000 },
  });

  const cap = st?.[1] ?? 0n;
  const daySpent = st?.[5] ?? 0n;
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  return (
    <main className="shell">
      <div className="hero">
        <div>
          <p className="eyebrow">QDay Aevum · builder challenge #1</p>
          <h1>Pay the invoices.<br />Not the impostor.</h1>
          <p className="lede">
            Ledgerly stages a batch of tUSD8 payments from your invoices, checks every payee
            against a verified book, and settles the batch with one approval. A changed
            bank address cannot redirect a staged payment — the chain refuses it.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/batch" className="btn btn-copper">Start a batch <span aria-hidden="true">→</span></Link>
            <Link href="/docs" className="btn btn-secondary">How it works</Link>
            <Link href="/new" className="btn btn-secondary">Create your desk</Link>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            One sentence: <em>drop in your invoices; it stages one verified batch you approve once —
            and it can never pay the wrong payee.</em>
          </p>
        </div>

        <ProofPanel />
      </div>

      <div className="divider" />

      <div className="grid-3">
        <div className="stat">
          <div className="stat-label">Working balance</div>
          <div className="stat-value">{balance !== undefined ? fromUnits(balance) : "—"} <small>tUSD8</small></div>
          <div className="hint">{isConnected ? (isOwner ? "You own this desk" : "Connected as non-owner") : "Read from the contract — connect to act"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Daily cap</div>
          <div className="stat-value">{cap > 0n ? fromUnits(cap) : "—"} <small>tUSD8</small></div>
          <div className="hint">Spent today: {fromUnits(daySpent)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Payee book</div>
          <div className="stat-value">1 : 1 <small>id → address</small></div>
          <div className="hint">Address changes wait in a public window</div>
        </div>
      </div>

      <div className="spacer" />
      <div className="grid-2">
        <div className="panel panel-pad">
          <h3>The five steps</h3>
          <ol className="lede" style={{ paddingLeft: 20, margin: 0, fontSize: 14 }}>
            <li><Link href="/payees" className="link">Register payees</Link> and their verified addresses.</li>
            <li><Link href="/batch" className="link">Paste invoices</Link> — CSV or one row per line.</li>
            <li>Review what was extracted; correct any field before staging.</li>
            <li>Approve the batch once and settle it on Aevum.</li>
            <li><Link href="/proof" className="link">Reconcile</Link> and export an accounting-ready file.</li>
          </ol>
        </div>
        <div className="panel panel-pad">
          <h3>Why this is not another checkout</h3>
          <p className="lede" style={{ fontSize: 14 }}>
            A checkout proves a payment happened. Ledgerly proves the <em>decision</em> was right:
            the payee was verified, the address was not recently hijacked, the amount respected
            every cap, and the books match the chain. The bad case is a first-class demo step,
            not a footnote.
          </p>
          <p className="hint" style={{ marginTop: 12 }}>
            This demo desk is live on Aevum. <Link href="/new" className="link">Create your own</Link> in
            two wallet transactions, or open the <Link href="/admin" className="link">desk controls</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
