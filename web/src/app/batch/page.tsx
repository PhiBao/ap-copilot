"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toHex, type Address } from "viem";
import { payeeRegistryAbi, policyAbi, TUSD8 } from "@/lib/contracts";
import { useNetwork } from "@/lib/network";
import { useDesk } from "@/lib/desk";
import { parseInvoices, toUnits, fromUnits, type InvoiceLine } from "@/lib/intake";
import { explainError } from "@/lib/errors";
import { Steps } from "@/components/Steps";

const SAMPLE = `# payee, amount, reference
Studio North Ltd, 0.05, INV-2026-014
Bright Design Co, 0.03, INV-2026-021
Rivera Consulting, 0.02, RETAINER-NOV`;

interface ReviewedLine extends InvoiceLine {
  id32: `0x${string}`;
  account?: Address;
  status: "ok" | "unknown" | "pending" | "frozen";
  duplicate?: boolean;
}

export default function Batch() {
  const { net } = useNetwork();
  const { desk } = useDesk();
  const { address, isConnected } = useAccount();
  const registry = desk?.registry;
  const policy = desk?.policy;

  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<InvoiceLine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [batchHash, setBatchHash] = useState<`0x${string}` | undefined>();
  const [sentTotal, setSentTotal] = useState(0n);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: st, refetch: refetchState } = useReadContract({
    address: policy, abi: policyAbi, functionName: "state",
    query: { enabled: !!policy },
  });
  const { data: owner } = useReadContract({
    address: policy, abi: policyAbi, functionName: "owner",
    query: { enabled: !!policy },
  });
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  const reviewed: ReviewedLine[] = useMemo(() => parsed.map((l) => {
    const id32 = keccak256(toHex(l.payeeLabel.trim()));
    return { ...l, id32, status: "unknown" as const };
  }), [parsed]);

  const ids = reviewed.map((l) => l.id32);
  const { data: checks, refetch: refetchChecks } = useReadContracts({
    contracts: ids.map((id) => ({
      address: registry, abi: payeeRegistryAbi, functionName: "payee" as const, args: [id] as const,
    })),
    query: { enabled: !!registry && ids.length > 0 },
  });

  const refHashes = reviewed.map((l) => keccak256(toHex(l.reference.trim())));
  const { data: refChecks } = useReadContracts({
    contracts: refHashes.map((h) => ({
      address: policy, abi: policyAbi, functionName: "settledReference" as const, args: [h] as const,
    })),
    query: { enabled: !!policy && refHashes.length > 0 },
  });

  const resolved = useMemo(() => reviewed.map((l, i) => {
    const r = checks?.[i];
    const duplicate = refChecks?.[i]?.status === "success" ? Boolean(refChecks[i].result) : false;
    if (!r || r.status !== "success" || !r.result) return { ...l, duplicate };
    const p = r.result as unknown as { account: Address; label: string; status: number };
    if (p.status === 0) return { ...l, status: "unknown" as const, duplicate };
    if (p.status === 2) return { ...l, status: "pending" as const, account: p.account, duplicate };
    if (p.status === 3) return { ...l, status: "frozen" as const, account: p.account, duplicate };
    return { ...l, status: "ok" as const, account: p.account, duplicate };
  }), [reviewed, checks, refChecks]);

  const total = resolved.reduce((sum, l) => {
    try { return sum + toUnits(l.amount); } catch { return sum; }
  }, 0n);

  const blocked = resolved.some((l) => l.status !== "ok" || l.duplicate);
  const perCap = st?.[0] ?? 0n;
  const dailyCap = st?.[1] ?? 0n;
  const revoked = st?.[4] ?? false;
  const overCap = resolved.some((l) => { try { return perCap > 0n && toUnits(l.amount) > perCap; } catch { return true; } });
  const overDaily = dailyCap > 0n && total > dailyCap;
  const duplicates = resolved.filter((l) => l.duplicate);

  const activeStep = batchHash ? 5 : parsed.length > 0 ? 3 : 2;

  function doParse() {
    setError("");
    const r = parseInvoices(input);
    setParsed(r.lines);
    setWarnings(r.warnings);
    if (!batchId) setBatchId(`batch-${Date.now().toString(36)}`);
    setHash(undefined);
    setBatchHash(undefined);
  }

  function updateLine(index: number, patch: Partial<InvoiceLine>) {
    setParsed((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function register(line: ReviewedLine) {
    setError("");
    const draft = (drafts[line.id] ?? "").trim();
    if (!registry) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(draft)) { setError("Enter the payee's 0x address to register it."); return; }
    try {
      const h = await writeContractAsync({
        address: registry, abi: payeeRegistryAbi, functionName: "register",
        args: [line.id32, draft as Address, line.payeeLabel.trim()],
      });
      setHash(h);
      await refetchChecks();
    } catch (e) { setError(explainError(e)); }
  }

  async function approveAndSettle() {
    setError("");
    if (!isConnected || !policy || !address) { setError("Connect the desk owner wallet."); return; }
    if (!isOwner) { setError("Only the desk owner can settle a batch. Connect the owner wallet."); return; }
    if (blocked) { setError("Resolve every payee and duplicate issue before settling."); return; }
    if (overCap || overDaily) { setError("Amounts exceed the policy caps."); return; }
    if (revoked) { setError("This policy has been revoked."); return; }

    const payouts = resolved.map((l) => ({ payeeId: l.id32, amount: toUnits(l.amount), ref: l.reference }));
    try {
      const id = keccak256(toHex(batchId || `batch-${Date.now()}`));
      setBatchHash(undefined);
      const h = await writeContractAsync({
        address: policy, abi: policyAbi, functionName: "executeBatch", args: [id, payouts],
      });
      setHash(h);
      setBatchHash(h);
      setSentTotal(total);
      refetchState();
      try {
        const prev = localStorage.getItem(`ledgerly:batches:${net.key}`);
        const list = prev ? JSON.parse(prev) : [];
        list.push({ batchId: id, settledAt: new Date().toISOString(), lines: resolved.map((l) => ({ reference: l.reference, payee: l.payeeLabel, account: l.account, amount: l.amount })) });
        localStorage.setItem(`ledgerly:batches:${net.key}`, JSON.stringify(list.slice(-50)));
      } catch { /* ignore */ }
    } catch (e) { setError(explainError(e)); }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Steps 02–04 · stage, verify, settle</p>
        <h1>One batch.<br />One approval.</h1>
        <p className="lede">
          Paste invoices in any order. Ledgerly resolves each payee against the on-chain book,
          checks for duplicates, and shows exactly what will be paid — before the owner signs.
        </p>
      </div>

      <Steps current={activeStep} />

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">01 · Invoice intake</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setInput(SAMPLE); setParsed([]); }}>Load example</button>
          </div>
          <div className="panel-pad">
            <label className="field">
              <span className="field-label">Paste CSV or “payee, amount, reference”</span>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={SAMPLE} />
              <span className="hint">Parsing runs in your browser. Every extracted field is editable below.</span>
            </label>
            <button className="btn" onClick={doParse} disabled={!input.trim()}>Extract lines</button>
            {warnings.length > 0 && <div className="notice notice-bad" style={{ fontSize: 12 }}>{warnings.join(" ")}</div>}
            <label className="field" style={{ marginTop: 22 }}>
              <span className="field-label">Batch id</span>
              <input value={batchId} onChange={(e) => setBatchId(e.target.value)} className="mono" />
              <span className="hint">A unique id; a batch can only settle once on-chain.</span>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">02 · Verification</span>
            <span className={`badge ${blocked ? "badge-bad" : resolved.length ? "badge-ok" : "badge-neutral"}`}>
              {blocked ? "Blocked" : resolved.length ? "Ready" : "Awaiting lines"}
            </span>
          </div>
          {resolved.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>Extract lines to see payee verification here.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Payee / reference</th><th className="num">Amount</th><th>Check</th></tr></thead>
                <tbody>
                  {resolved.map((l, i) => (
                    <tr key={`${l.id}-${i}`}>
                      <td>
                        <input value={l.payeeLabel} onChange={(e) => updateLine(i, { payeeLabel: e.target.value })} style={{ fontWeight: 600 }} />
                        <input value={l.reference} onChange={(e) => updateLine(i, { reference: e.target.value })} className="faint" style={{ fontSize: 11 }} />
                      </td>
                      <td className="num">
                        <input value={l.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} style={{ width: 90, textAlign: "right" }} />
                      </td>
                      <td>
                        <span className={`badge ${l.duplicate ? "badge-bad" : l.status === "ok" ? "badge-ok" : l.status === "pending" ? "badge-warn" : "badge-bad"}`}>
                          {l.duplicate ? "Duplicate ref" : l.status === "ok" ? "Verified" : l.status === "pending" ? "Change pending" : l.status === "frozen" ? "Frozen" : "Not in book"}
                        </span>
                        {l.account && <div className="hint mono truncate" title={l.account}>{l.account.slice(0, 10)}…</div>}
                        {l.status === "unknown" && (
                          <div style={{ marginTop: 8 }}>
                            <input
                              className="mono"
                              placeholder="payee address"
                              value={drafts[l.id] ?? ""}
                              onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                              style={{ fontSize: 11, padding: "4px 6px", width: "100%" }}
                            />
                            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => register(l)} disabled={isPending || confirming}>
                              Register & re-check
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="spacer" />
      <div className="panel">
        <div className="panel-head"><span className="panel-title">03 · Approval</span></div>
        <div className="panel-pad">
          <div className="grid-3">
            <div className="stat"><div className="stat-label">Lines</div><div className="stat-value">{resolved.length}</div></div>
            <div className="stat"><div className="stat-label">Batch total</div><div className="stat-value">{fromUnits(total)} <small>tUSD8</small></div></div>
            <div className="stat"><div className="stat-label">Guard</div><div className="stat-value" style={{ fontSize: 18, color: blocked || overCap || overDaily || revoked ? "var(--red)" : "var(--green)" }}>
              {revoked ? "Revoked" : blocked ? "Blocked" : overCap || overDaily ? "Cap exceeded" : "Clear"}
            </div></div>
          </div>
          {(blocked || overCap || overDaily || revoked) && (
            <div className="notice notice-bad">
              This batch will not settle.{" "}
              {resolved.some((l) => l.status === "unknown") && "A payee is not in the book. "}
              {resolved.some((l) => l.status === "pending") && "A payee has a pending address change. "}
              {resolved.some((l) => l.status === "frozen") && "A payee is frozen. "}
              {duplicates.length > 0 && `Duplicate invoice reference: ${duplicates.map((d) => d.reference).join(", ")}. `}
              {overCap && "A line exceeds the per-payment cap. "}
              {overDaily && "The total exceeds the daily cap. "}
              {revoked && "The policy is revoked. "}
            </div>
          )}
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn btn-copper" onClick={approveAndSettle} disabled={!resolved.length || blocked || overCap || overDaily || revoked || isPending || confirming || !isOwner}>
              {isPending ? "Sign in wallet…" : confirming ? "Confirming…" : isOwner ? "Approve & settle batch" : "Owner wallet required"}
            </button>
            <span className="hint">
              {isConnected
                ? isOwner
                  ? `Settles from the desk budget. No ERC-20 approval needed.`
                  : "Connected wallet is not this desk's owner."
                : "Connect the desk owner wallet to settle."}
            </span>
          </div>
          {error && <p className="form-error">{error}</p>}
          {isSuccess && batchHash && hash && (
            <div className="notice notice-ok" style={{ marginBottom: 0 }}>
              Batch settled. <a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${batchHash}`} target="_blank" rel="noreferrer">{batchHash.slice(0, 20)}…</a>
              {" · "}{fromUnits(sentTotal)} tUSD8 distributed. <a className="link" href="/proof">Reconcile →</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
