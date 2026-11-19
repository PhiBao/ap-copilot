"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { TUSD8 } from "@/lib/contracts";
import { useNetwork } from "@/lib/network";
import { useDesk } from "@/lib/desk";
import { fromUnits, parseInvoices } from "@/lib/intake";
import { Steps } from "@/components/Steps";

const payoutEvent = parseAbiItem("event PayoutSettled(bytes32 indexed batchId,bytes32 indexed payeeId,address indexed to,uint256 amount,string ref)");
const payeeEvent = parseAbiItem("event PayeeRegistered(bytes32 indexed payeeId,address indexed account,string label,uint64 at)");

interface Payout {
  batchId: string;
  payeeId: string;
  to: Address;
  amount: bigint;
  ref: string;
  txHash: string;
  block: bigint;
}

interface Batch {
  id: string;
  payouts: Payout[];
  total: bigint;
  txHash: string;
}

interface ExpectedLine {
  reference: string;
  payee: string;
  account: string;
  amount: string;
}

interface ReconcileRow extends ExpectedLine {
  status: "matched" | "amount differs" | "address differs" | "not on chain" | "duplicate on chain";
  onchain?: Payout;
}

async function scanChunked<T>(
  publicClient: { getLogs: (a: never) => Promise<T[]>; getBlockNumber: () => Promise<bigint> },
  address: Address,
  event: unknown,
  fromBlock: bigint
): Promise<T[]> {
  const latest = await publicClient.getBlockNumber();
  const ranges: Array<[bigint, bigint]> = [];
  for (let from = fromBlock; from <= latest; from += 1000n) {
    ranges.push([from, from + 999n > latest ? latest : from + 999n]);
  }
  const out: T[] = [];
  // Aevum's RPC handles a handful of parallel range queries; 6 keeps it polite.
  for (let i = 0; i < ranges.length; i += 6) {
    const slice = ranges.slice(i, i + 6);
    const results = await Promise.all(
      slice.map(([fromBlock, toBlock]) => publicClient.getLogs({ address, event, fromBlock, toBlock } as never))
    );
    for (const logs of results) out.push(...logs);
  }
  return out;
}

export default function Proof() {
  const { net } = useNetwork();
  const { desk } = useDesk();
  const publicClient = usePublicClient({ chainId: net.chain.id });
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [expected, setExpected] = useState<ExpectedLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError(""); setLoading(true);
    try {
      if (!publicClient || !desk) throw new Error("No desk selected.");
      const start = desk.fromBlock ?? net.deployBlock ?? 0n;
      const payeeStart = desk.registryFromBlock ?? start;

      const [payoutLogs, payeeLogs] = await Promise.all([
        scanChunked(publicClient as never, desk.policy, payoutEvent, start) as unknown as Promise<Array<{ args: { batchId: string; payeeId: string; to: Address; amount: bigint; ref: string }; transactionHash: string; blockNumber: bigint }>>,
        scanChunked(publicClient as never, desk.registry, payeeEvent, payeeStart) as unknown as Promise<Array<{ args: { payeeId: string; label: string } }>>,
      ]);

      const labelMap: Record<string, string> = {};
      for (const log of payeeLogs) labelMap[log.args.payeeId] = log.args.label;
      setLabels(labelMap);

      const all: Payout[] = payoutLogs.map((log) => ({
        batchId: log.args.batchId,
        payeeId: log.args.payeeId,
        to: log.args.to,
        amount: log.args.amount,
        ref: log.args.ref,
        txHash: log.transactionHash ?? "",
        block: log.blockNumber ?? 0n,
      }));
      setPayouts(all);
      setLoaded(true);
    } catch (e) { setError((e as Error).message.slice(0, 220)); }
    setLoading(false);
  }, [publicClient, desk, net.deployBlock]);

  useEffect(() => { refresh(); }, [refresh]);

  const batches: Batch[] = useMemo(() => {
    const map = new Map<string, Batch>();
    for (const p of payouts) {
      const b = map.get(p.batchId) ?? { id: p.batchId, payouts: [], total: 0n, txHash: p.txHash };
      b.payouts.push(p);
      b.total += p.amount;
      map.set(p.batchId, b);
    }
    return [...map.values()].sort((a, b) => (b.payouts[0].block > a.payouts[0].block ? 1 : -1));
  }, [payouts]);

  const reconciliation: ReconcileRow[] = useMemo(() => {
    const byRef = new Map<string, Payout[]>();
    for (const p of payouts) byRef.set(p.ref, [...(byRef.get(p.ref) ?? []), p]);
    return expected.map((l) => {
      const matches = byRef.get(l.reference) ?? [];
      if (matches.length === 0) return { ...l, status: "not on chain" as const };
      if (matches.length > 1) return { ...l, status: "duplicate on chain" as const, onchain: matches[0] };
      const on = matches[0];
      if (fromUnits(on.amount) !== l.amount) return { ...l, status: "amount differs" as const, onchain: on };
      if (l.account && l.account.toLowerCase() !== on.to.toLowerCase()) return { ...l, status: "address differs" as const, onchain: on };
      return { ...l, status: "matched" as const, onchain: on };
    });
  }, [expected, payouts]);

  async function loadStaged() {
    try {
      const raw = localStorage.getItem(`ledgerly:batches:${net.key}`);
      const batches = raw ? JSON.parse(raw) : [];
      const lines = batches.flatMap((b: { lines: ExpectedLine[] }) => b.lines);
      setExpected(lines);
    } catch { setError("Could not read the staged batches in this browser."); }
  }

  async function loadFile(file: File) {
    const text = await file.text();
    const parsed = parseInvoices(text);
    setExpected(parsed.lines.map((l) => ({ reference: l.reference, payee: l.payeeLabel, amount: l.amount, account: "" })));
  }

  function downloadLedger() {
    const header = "batch,reference,payee,to,amount,tx\n";
    const rows = payouts.map((p) =>
      [p.batchId, p.ref, `"${(labels[p.payeeId] ?? p.payeeId).replace(/"/g, '""')}"`, p.to, fromUnits(p.amount), p.txHash].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ledgerly-ledger-${net.key}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Step 05 · proof & reconciliation</p>
        <h1>Show the receipts.</h1>
        <p className="lede">
          Every payout is an on-chain event. Ledgerly rebuilds the whole ledger from Aevum,
          labels each payee from the registry, and checks your books against what actually settled.
        </p>
      </div>

      <Steps current={5} />

      <div className="row" style={{ marginBottom: 22 }}>
        <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Reading chain…" : "Refresh on-chain ledger"}</button>
        <button className="btn btn-secondary" onClick={downloadLedger} disabled={!payouts.length}>Download ledger CSV</button>
        <button className="btn btn-secondary" onClick={loadStaged} disabled={!loaded}>Reconcile last staged batch</button>
        <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
          Reconcile a CSV
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
        </label>
        {desk && (
          <a className="btn btn-secondary" href={`${net.chain.blockExplorers?.default.url}/address/${desk.policy}`} target="_blank" rel="noreferrer">Desk on explorer ↗</a>
        )}
      </div>
      {error && <div className="notice notice-bad">{error}</div>}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">On-chain batches</span><span className="badge badge-neutral">{batches.length} batches · {payouts.length} payouts</span></div>
          {batches.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>{loaded ? "No payouts on this desk yet." : "Reading the chain…"}</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Batch</th><th>Lines</th><th className="num">Total</th><th>Tx</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="mono" title={b.id}>{b.id.slice(0, 12)}…</td>
                      <td>{b.payouts.length}</td>
                      <td className="num">{fromUnits(b.total)}</td>
                      <td><a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${b.txHash}`} target="_blank" rel="noreferrer">{b.txHash.slice(0, 10)}…</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Payee ledger</span><span className="badge badge-neutral">{payouts.length} lines</span></div>
          {payouts.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>No payouts yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ref</th><th>Payee</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {payouts.map((p, i) => (
                    <tr key={`${p.txHash}-${i}`}>
                      <td className="mono">{p.ref}</td>
                      <td>{labels[p.payeeId] ?? <span className="mono">{p.payeeId.slice(0, 8)}…</span>}<div className="faint mono" style={{ fontSize: 10 }}>{p.to.slice(0, 8)}…{p.to.slice(-4)}</div></td>
                      <td className="num">{fromUnits(p.amount)}</td>
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
        <div className="panel-head"><span className="panel-title">Books vs chain</span><span className="badge badge-neutral">{reconciliation.length} expected lines</span></div>
        {reconciliation.length === 0 ? (
          <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>Reconcile the last staged batch, or upload the CSV you paid from.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Payee</th><th className="num">Expected</th><th className="num">On chain</th><th>Status</th></tr></thead>
              <tbody>
                {reconciliation.map((l, i) => (
                  <tr key={`${l.reference}-${i}`}>
                    <td className="mono">{l.reference}</td>
                    <td>{l.payee}</td>
                    <td className="num">{l.amount}</td>
                    <td className="num">{l.onchain ? fromUnits(l.onchain.amount) : "—"}</td>
                    <td>
                      <span className={`badge ${l.status === "matched" ? "badge-ok" : "badge-bad"}`}>{l.status}</span>
                      {l.status !== "matched" && (
                        <div className="hint" style={{ maxWidth: 260 }}>
                          {l.status === "not on chain" && "No payout with this reference has settled on this desk."}
                          {l.status === "duplicate on chain" && "More than one payout carries this reference. Investigate before booking it."}
                          {l.status === "amount differs" && `Books say ${l.amount}, chain paid ${l.onchain ? fromUnits(l.onchain.amount) : "—"}.`}
                          {l.status === "address differs" && `Staged address differs from the verified payout ${l.onchain ? l.onchain.to.slice(0, 10) : ""}….`}
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

      <div className="notice notice-ok">
        <strong>Independently verifiable:</strong> every row above links to an Aevum transaction.
        Open the desk on the explorer and read <span className="mono-inline">PayoutSettled</span>;
        no trust in this UI is required. TUSD8 token: <span className="mono-inline">{TUSD8}</span>.
      </div>
    </main>
  );
}
