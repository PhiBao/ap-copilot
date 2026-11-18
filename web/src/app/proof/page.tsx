"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address } from "viem";
import { policyAbi, payeeRegistryAbi, erc20Abi, TUSD8 } from "@/lib/contracts";
import { useNetwork } from "@/lib/network";
import { fromUnits } from "@/lib/intake";
import { Steps } from "@/components/Steps";

const payoutEvent = parseAbiItem("event PayoutSettled(bytes32 indexed batchId,bytes32 indexed payeeId,address indexed to,uint256 amount,string ref)");

interface Payout {
  batchId: string;
  payeeId: string;
  to: Address;
  amount: bigint;
  ref: string;
  txHash: string;
  block: bigint;
}

interface ExportLine {
  reference: string;
  payee: string;
  account: string;
  amount: string;
  status: string;
}

export default function Proof() {
  const { net } = useNetwork();
  const publicClient = usePublicClient({ chainId: net.chain.id });
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportLines, setExportLines] = useState<ExportLine[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ledgerly:export:${net.key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setExportLines(parsed.lines.map((l: { reference: string; payee: string; account?: string; amount: string }) => ({
          ...l, account: l.account ?? "", status: "pending",
        })));
      }
    } catch { /* ignore */ }
  }, [net.key]);

  const discrepancies = useMemo(() => {
    const onchainByRef = new Map(payouts.map((p) => [p.ref, p]));
    return exportLines.map((l) => {
      const on = onchainByRef.get(l.reference);
      if (!on) return { ...l, status: "unsettled", matched: false };
      const amountMatches = fromUnits(on.amount) === l.amount;
      const accountMatches = !l.account || l.account.toLowerCase() === on.to.toLowerCase();
      return {
        ...l, account: on.to,
        status: amountMatches && accountMatches ? "matched" : "discrepancy",
        matched: amountMatches && accountMatches,
      };
    });
  }, [exportLines, payouts]);

  async function refresh() {
    setError(""); setLoading(true);
    try {
      if (!publicClient || !net.policy) throw new Error("No client or policy address.");
      const latest = await publicClient.getBlockNumber();
      // Aevum caps eth_getLogs to 1,000 blocks per call.
      const start = net.deployBlock ?? (latest > 5000n ? latest - 5000n : 0n);
      const all: Payout[] = [];
      for (let from = start; from <= latest; from += 1000n) {
        const to = from + 999n > latest ? latest : from + 999n;
        const logs = await publicClient.getLogs({
          address: net.policy, event: payoutEvent, fromBlock: from, toBlock: to,
        });
        for (const log of logs) {
          const a = log.args as { batchId: string; payeeId: string; to: Address; amount: bigint; ref: string };
          all.push({
            batchId: a.batchId, payeeId: a.payeeId, to: a.to, amount: a.amount, ref: a.ref,
            txHash: log.transactionHash ?? "", block: log.blockNumber ?? 0n,
          });
        }
      }
      setPayouts(all);
    } catch (e) { setError((e as Error).message.slice(0, 220)); }
    setLoading(false);
  }

  function downloadCSV() {
    const header = "reference,payee,account,amount,status\n";
    const rows = discrepancies.map((l) =>
      [l.reference, `"${l.payee.replace(/"/g, '""')}"`, l.account, l.amount, l.status].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ledgerly-reconciliation-${net.key}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Step 05 · proof & reconciliation</p>
        <h1>Show the receipts.</h1>
        <p className="lede">
          Every payout is an on-chain event: batch id, payee id, destination address, amount,
          invoice reference, transaction hash. Ledgerly matches your staged books to those events
          and flags anything that does not line up.
        </p>
      </div>

      <Steps current={5} />

      <div className="row" style={{ marginBottom: 22 }}>
        <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Reading chain…" : "Refresh on-chain proof"}</button>
        <button className="btn btn-secondary" onClick={downloadCSV} disabled={!discrepancies.length}>Download reconciliation CSV</button>
        {net.chain.blockExplorers?.default && (
          <a className="btn btn-secondary" href={`${net.chain.blockExplorers.default.url}/address/${net.policy}`} target="_blank" rel="noreferrer">Policy on explorer ↗</a>
        )}
      </div>
      {error && <div className="notice notice-bad">{error}</div>}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">On-chain payouts</span><span className="badge badge-neutral">{payouts.length} events</span></div>
          {payouts.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>No payouts read yet. Settle a batch, then refresh.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ref</th><th>To</th><th className="num">Amount</th><th>Tx</th></tr></thead>
                <tbody>
                  {payouts.map((p, i) => (
                    <tr key={`${p.txHash}-${i}`}>
                      <td className="mono">{p.ref}</td>
                      <td className="mono truncate" title={p.to}>{p.to.slice(0, 8)}…{p.to.slice(-5)}</td>
                      <td className="num">{fromUnits(p.amount)}</td>
                      <td><a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${p.txHash}`} target="_blank" rel="noreferrer">{p.txHash.slice(0, 10)}…</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Book reconciliation</span><span className="badge badge-neutral">{discrepancies.length} lines</span></div>
          {discrepancies.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>Stage a batch to populate your books.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ref</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {discrepancies.map((l, i) => (
                    <tr key={`${l.reference}-${i}`}>
                      <td className="mono">{l.reference}<div className="faint" style={{ fontSize: 11 }}>{l.payee}</div></td>
                      <td className="num">{l.amount}</td>
                      <td><span className={`badge ${l.status === "matched" ? "badge-ok" : "badge-bad"}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="notice notice-ok">
        <strong>What a judge can verify independently:</strong> open the policy address on the Aevum
        explorer, read <span className="mono-inline">PayoutSettled</span> events, and compare the
        destination address and amount to the exported CSV. No trust in our UI required.
      </div>
    </main>
  );
}
