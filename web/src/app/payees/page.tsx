"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toHex, type Address } from "viem";
import { payeeRegistryAbi } from "@/lib/contracts";
import { listRegisteredPayeeIds } from "@/lib/payee-events";
import { useNetwork } from "@/lib/network";
import { useDesk } from "@/lib/desk";
import { explainError } from "@/lib/errors";
import { singleWalletRequest } from "@/lib/wallet";

interface PayeeRow {
  id: `0x${string}`;
  label: string;
  account: Address;
  status: number; // 1 active, 2 pending, 3 frozen
  pendingAccount?: Address;
  applyAt?: number;
}

function countdown(applyAt: number | undefined, now: number): string {
  if (!applyAt) return "";
  const left = applyAt - now;
  if (left <= 0) return "ready to apply";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return `applies in ${h}h ${m}m`;
}

export default function Payees() {
  const { net } = useNetwork();
  const { desk } = useDesk();
  const registry = desk?.registry;
  const publicClient = usePublicClient({ chainId: net.chain.id });
  const { address } = useAccount();

  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PayeeRow[]>([]);
  const [knownIds, setKnownIds] = useState<`0x${string}`[]>([]);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Change-request form
  const [changeId, setChangeId] = useState("");
  const [changeAccount, setChangeAccount] = useState("");
  const [changeLabel, setChangeLabel] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!publicClient || !registry) return;
    listRegisteredPayeeIds(publicClient as never, registry, desk?.registryFromBlock ?? desk?.fromBlock ?? net.deployBlock ?? 0n)
      .then((onchain) => {
        setKnownIds((prev) => [...new Set([...onchain, ...prev])]);
        try { localStorage.setItem(`ledgerly:payees:${net.key}`, JSON.stringify(onchain)); } catch { /* ignore */ }
      })
      .catch(() => {});
  }, [publicClient, registry, desk?.registryFromBlock, desk?.fromBlock, net.deployBlock, net.key]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ledgerly:payees:${net.key}`);
      if (raw) setKnownIds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [net.key]);

  const saveIds = useCallback((ids: `0x${string}`[]) => {
    setKnownIds(ids);
    try { localStorage.setItem(`ledgerly:payees:${net.key}`, JSON.stringify(ids)); } catch { /* ignore */ }
  }, [net.key]);

  const { data: delay } = useReadContract({
    address: registry, abi: payeeRegistryAbi, functionName: "minChangeDelay",
    query: { enabled: !!registry },
  });

  const contracts = knownIds.map((id) => ({
    address: registry, abi: payeeRegistryAbi, functionName: "payee" as const, args: [id] as const,
  }));
  const { data: results, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!registry && knownIds.length > 0 },
  });

  useEffect(() => {
    if (!results) return;
    setRows(results.flatMap((r, i) => {
      if (r.status !== "success" || !r.result) return [];
      const p = r.result as unknown as { account: Address; label: string; registeredAt: bigint; status: number; changeRequestedAt: bigint; pendingAccount: Address; pendingLabel: string };
      if (p.status === 0) return [];
      return [{
        id: knownIds[i],
        label: p.label,
        account: p.account,
        status: p.status,
        pendingAccount: p.pendingAccount !== "0x0000000000000000000000000000000000000000" ? p.pendingAccount : undefined,
        applyAt: p.status === 2 && p.changeRequestedAt > 0n ? Number(p.changeRequestedAt) + Number(delay ?? 0n) : undefined,
      }];
    }));
  }, [results, knownIds, delay]);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => { if (isSuccess) { refetch(); setError(""); } }, [isSuccess, refetch]);

  const busy = isPending || confirming;

  async function send(fn: () => Promise<`0x${string}`>) {
    setError("");
    try { setHash(await singleWalletRequest(fn)); } catch (e) { setError(explainError(e)); }
  }

  function register() {
    if (!registry || !address) { setError("Connect a wallet first."); return; }
    if (!label.trim() || !/^0x[0-9a-fA-F]{40}$/.test(account)) { setError("Enter a payee name and a valid 0x address."); return; }
    const id = keccak256(toHex(label.trim()));
    if (!knownIds.includes(id)) saveIds([...knownIds, id]);
    send(() => writeContractAsync({
      address: registry, abi: payeeRegistryAbi, functionName: "register",
      args: [id, account as Address, label.trim()],
    })).then(() => { setLabel(""); setAccount(""); });
  }

  function requestChange() {
    if (!registry) return;
    if (!changeId) { setError("Pick a payee to change."); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(changeAccount)) { setError("Enter a valid new 0x address."); return; }
    const row = rows.find((r) => r.id === changeId);
    send(() => writeContractAsync({
      address: registry, abi: payeeRegistryAbi, functionName: "requestChange",
      args: [changeId as `0x${string}`, changeAccount as Address, changeLabel.trim() || row?.label || ""],
    })).then(() => { setChangeAccount(""); setChangeLabel(""); });
  }

  function action(fn: "freeze" | "unfreeze" | "applyChange" | "cancelChange", id: `0x${string}`) {
    if (!registry) return;
    send(() => writeContractAsync({ address: registry, abi: payeeRegistryAbi, functionName: fn, args: [id] }));
  }

  const active = rows.filter((r) => r.status === 1);
  const selected = rows.find((r) => r.id === changeId);

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Step 01 · verified payees</p>
        <h1>One name. One address.</h1>
        <p className="lede">
          Every payee has an id derived from its name and exactly one active payout address.
          A change waits {delay !== undefined ? `${Number(delay) / 3600}h` : "…"} in public while the old
          address stays payable — and a guardian can freeze it instantly.
        </p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Register a payee</span></div>
          <div className="panel-pad">
            <label className="field">
              <span className="field-label">Payee name (exact, as on the invoice)</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Studio North Ltd" />
            </label>
            <label className="field">
              <span className="field-label">Verified payout address</span>
              <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="0x…" className="mono" />
              <span className="hint">Confirm this out-of-band before binding it. Ledgerly cannot attest to real-world identity.</span>
            </label>
            <button className="btn btn-copper" onClick={register} disabled={busy}>Register payee</button>
          </div>

          <div className="panel-head" style={{ borderTop: "1px solid var(--rule)" }}><span className="panel-title">Request an address change</span></div>
          <div className="panel-pad">
            <label className="field">
              <span className="field-label">Payee</span>
              <select value={changeId} onChange={(e) => { setChangeId(e.target.value); const r = rows.find((x) => x.id === e.target.value); setChangeLabel(r?.label ?? ""); }}>
                <option value="">Choose…</option>
                {active.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">New payout address</span>
              <input value={changeAccount} onChange={(e) => setChangeAccount(e.target.value)} placeholder="0x…" className="mono" />
            </label>
            <label className="field">
              <span className="field-label">New label (optional)</span>
              <input value={changeLabel} onChange={(e) => setChangeLabel(e.target.value)} />
            </label>
            <button className="btn" onClick={requestChange} disabled={busy || !changeId}>Request change</button>
            {selected && (
              <p className="hint">
                The old address keeps receiving payments until the window ends. Anyone can see the
                pending change here and freeze it if it was not expected.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">The book</span><span className="badge badge-neutral">{rows.length} payees</span></div>
          {rows.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>No payees yet. Register one, or <a className="link" href="/new">create a desk</a>.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Payee</th><th>Active address</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.label}</strong><br /><span className="faint mono" style={{ fontSize: 10 }}>{r.id.slice(0, 12)}…</span></td>
                      <td className="mono truncate" title={r.account}>{r.account.slice(0, 10)}…{r.account.slice(-6)}</td>
                      <td>
                        <span className={`badge ${r.status === 1 ? "badge-ok" : r.status === 2 ? "badge-warn" : "badge-bad"}`}>
                          {r.status === 1 ? "Active" : r.status === 2 ? "Change pending" : "Frozen"}
                        </span>
                        {r.pendingAccount && (
                          <div className="hint">
                            → <span className="mono" title={r.pendingAccount}>{r.pendingAccount.slice(0, 10)}…</span>
                            <br />{countdown(r.applyAt, now)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {r.status === 1 && <button className="btn btn-secondary btn-sm" onClick={() => action("freeze", r.id)} disabled={busy}>Freeze</button>}
                          {r.status === 3 && <button className="btn btn-secondary btn-sm" onClick={() => action("unfreeze", r.id)} disabled={busy}>Unfreeze</button>}
                          {r.status === 2 && (
                            <button className="btn btn-sm" onClick={() => action("applyChange", r.id)} disabled={busy || (r.applyAt ?? 0) > now} title={countdown(r.applyAt, now)}>
                              Apply
                            </button>
                          )}
                          {r.status === 2 && <button className="btn btn-secondary btn-sm" onClick={() => action("cancelChange", r.id)} disabled={busy}>Cancel</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {error && <div className="notice notice-bad">{error}</div>}
      {isSuccess && hash && (
        <div className="notice notice-ok">Confirmed on Aevum. <a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">{hash.slice(0, 16)}…</a></div>
      )}

      <div className="notice">
        <strong>Why the delay matters.</strong> A real "our bank details changed" attack needs one
        click. Here it needs a public request, an hour of visibility, and nobody cancelling it —
        and the old address stays the only payable one until the window closes.
      </div>
    </main>
  );
}
