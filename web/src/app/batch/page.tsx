"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toHex, type Address } from "viem";
import { payeeRegistryAbi, policyAbi, erc20Abi, TUSD8 } from "@/lib/contracts";
import { useNetwork } from "@/lib/network";
import { parseInvoices, toUnits, fromUnits, type InvoiceLine } from "@/lib/intake";
import { Steps } from "@/components/Steps";

const SAMPLE = `# payee, amount, reference
Studio North Ltd, 1250.00, INV-2026-014
Bright Design Co, 640.50, INV-2026-021
Rivera Consulting, 380.00, RETAINER-NOV`;

interface ReviewedLine extends InvoiceLine {
  id32: `0x${string}`;
  account?: Address;
  status: "ok" | "unknown" | "pending" | "frozen";
}

export default function Batch() {
  const { net } = useNetwork();
  const { address, isConnected } = useAccount();
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<InvoiceLine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [sentTotal, setSentTotal] = useState(0n);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: st } = useReadContract({
    address: net.policy, abi: policyAbi, functionName: "state",
    query: { enabled: !!net.policy },
  });
  const { data: allowance } = useReadContract({
    address: TUSD8, abi: erc20Abi, functionName: "allowance",
    args: address && net.policy ? [address, net.policy] : undefined,
    query: { enabled: !!address && !!net.policy },
  });

  const reviewed: ReviewedLine[] = useMemo(() => parsed.map((l) => {
    const id32 = keccak256(toHex(l.payeeLabel.trim()));
    return { ...l, id32, status: "unknown" as const };
  }), [parsed]);

  const ids = reviewed.map((l) => l.id32);
  const { data: checks } = useReadContracts({
    contracts: ids.map((id) => ({
      address: net.registry, abi: payeeRegistryAbi, functionName: "payee" as const, args: [id] as const,
    })),
    query: { enabled: !!net.registry && ids.length > 0 },
  });

  const resolved = useMemo(() => reviewed.map((l, i) => {
    const r = checks?.[i];
    if (!r || r.status !== "success" || !r.result) return l;
    const p = r.result as unknown as [Address, string, bigint, number, bigint, Address, string];
    if (p[3] === 0) return { ...l, status: "unknown" as const };
    if (p[3] === 2) return { ...l, status: "pending" as const, account: p[0] };
    if (p[3] === 3) return { ...l, status: "frozen" as const, account: p[0] };
    return { ...l, status: "ok" as const, account: p[0] };
  }), [reviewed, checks]);

  const total = resolved.reduce((sum, l) => {
    try { return sum + toUnits(l.amount); } catch { return sum; }
  }, 0n);

  const blocked = resolved.some((l) => l.status !== "ok");
  const perCap = st?.[0] ?? 0n;
  const dailyCap = st?.[1] ?? 0n;
  const revoked = st?.[4] ?? false;
  const overCap = resolved.some((l) => { try { return perCap > 0n && toUnits(l.amount) > perCap; } catch { return true; } });
  const overDaily = dailyCap > 0n && total > dailyCap;

  const activeStep = hash || isSuccess ? 5 : parsed.length > 0 ? 3 : 2;

  function doParse() {
    setError("");
    const r = parseInvoices(input);
    setParsed(r.lines);
    setWarnings(r.warnings);
    if (!batchId) setBatchId(`batch-${Date.now().toString(36)}`);
    setHash(undefined);
  }

  function updateLine(index: number, patch: Partial<InvoiceLine>) {
    setParsed((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function approveAndSettle() {
    setError("");
    if (!isConnected || !net.policy || !address) { setError("Connect a wallet with the policy owner."); return; }
    if (blocked) { setError("Resolve every payee issue before settling."); return; }
    if (overCap || overDaily) { setError("Amounts exceed the policy caps."); return; }
    if (revoked) { setError("This policy has been revoked."); return; }

    const payouts = resolved.map((l) => ({ payeeId: l.id32, amount: toUnits(l.amount), ref: l.reference }));
    try {
      if ((allowance ?? 0n) < total) {
        const approveHash = await writeContractAsync({
          address: TUSD8, abi: erc20Abi, functionName: "approve", args: [net.policy, total],
        });
        setHash(approveHash);
        setError("Approval sent. Wait for confirmation, then settle again.");
        return;
      }
      const id = keccak256(toHex(batchId || `batch-${Date.now()}`));
      const h = await writeContractAsync({
        address: net.policy, abi: policyAbi, functionName: "executeBatch", args: [id, payouts],
      });
      setHash(h);
      setSentTotal(total);
      try {
        localStorage.setItem(`ledgerly:export:${net.key}`, JSON.stringify({
          batchId: id, settledAt: new Date().toISOString(),
          lines: resolved.map((l) => ({ reference: l.reference, payee: l.payeeLabel, account: l.account, amount: l.amount })),
        }));
      } catch { /* ignore */ }
    } catch (e) { setError((e as Error).message.slice(0, 220)); }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Steps 02–04 · stage, verify, settle</p>
        <h1>One batch.<br />One approval.</h1>
        <p className="lede">
          Paste invoices in any order. Ledgerly extracts the lines, resolves each payee against
          the on-chain book, and shows exactly what will be paid — before you sign anything.
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
              <span className="field-label">Paste CSV rows or “payee, amount, reference”</span>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={SAMPLE} />
              <span className="hint">Deterministic parsing. No data leaves your browser. Every extracted field is editable below.</span>
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
                        <span className={`badge ${l.status === "ok" ? "badge-ok" : l.status === "pending" ? "badge-warn" : "badge-bad"}`}>
                          {l.status === "ok" ? "Verified" : l.status === "pending" ? "Change pending" : l.status === "frozen" ? "Frozen" : "Not in book"}
                        </span>
                        {l.account && <div className="hint mono truncate" title={l.account}>{l.account.slice(0, 10)}…</div>}
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
            <div className="stat"><div className="stat-label">Guard</div><div className="stat-value" style={{ fontSize: 18, color: blocked || overCap || overDaily ? "var(--red)" : "var(--green)" }}>
              {revoked ? "Revoked" : blocked ? "Blocked" : overCap || overDaily ? "Cap exceeded" : "Clear"}
            </div></div>
          </div>
          {(blocked || overCap || overDaily) && (
            <div className="notice notice-bad">
              This batch will not settle. {blocked && "A payee is missing, frozen, or has a pending address change. "}
              {overCap && "A line exceeds the per-payment cap. "}{overDaily && "The total exceeds the daily cap. "}
              Verify out-of-band before editing any address.
            </div>
          )}
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn btn-copper" onClick={approveAndSettle} disabled={!resolved.length || blocked || overCap || overDaily || revoked || isPending || confirming}>
              {isPending ? "Sign in wallet…" : confirming ? "Confirming…" : "Approve & settle batch"}
            </button>
            {allowance !== undefined && allowance < total && <span className="hint">First settle signs an ERC-20 approval, then a second transaction settles.</span>}
          </div>
          {error && <p className="form-error">{error}</p>}
          {isSuccess && hash && (
            <div className="notice notice-ok" style={{ marginBottom: 0 }}>
              Batch settled. <a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">{hash.slice(0, 20)}…</a>
              {" · "}{fromUnits(sentTotal)} tUSD8 distributed. <a className="link" href="/proof">Reconcile →</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
