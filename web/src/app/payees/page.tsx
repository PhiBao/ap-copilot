"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toHex, type Address } from "viem";
import { payeeRegistryAbi } from "@/lib/contracts";
import { listRegisteredPayeeIds } from "@/lib/payee-events";
import { usePublicClient } from "wagmi";
import { useNetwork } from "@/lib/network";

interface PayeeRow {
  id: `0x${string}`;
  label: string;
  account: Address;
  status: number; // 1 active, 2 pending, 3 frozen
  pendingAccount?: Address;
  changeRequestedAt?: bigint;
}

export default function Payees() {
  const { net } = useNetwork();
  const { address } = useAccount();
  const registry = net.registry;
  const publicClient = usePublicClient({ chainId: net.chain.id });
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<PayeeRow[]>([]);

  // Known ids from local metadata; on-chain state is the source of truth.
  const [knownIds, setKnownIds] = useState<`0x${string}`[]>([]);
  useEffect(() => {
    if (!publicClient || !registry) return;
    listRegisteredPayeeIds(publicClient as never, registry, net.deployBlock ?? 0n)
      .then((onchain) => {
        // Merge on-chain book with anything registered from this browser.
        setKnownIds((prev) => [...new Set([...onchain, ...prev])]);
        try { localStorage.setItem(`ledgerly:payees:${net.key}`, JSON.stringify(onchain)); } catch { /* ignore */ }
      })
      .catch(() => {});
  }, [publicClient, registry, net.deployBlock, net.key]);

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
    address: registry,
    abi: payeeRegistryAbi,
    functionName: "payee" as const,
    args: [id] as const,
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
        changeRequestedAt: p.changeRequestedAt > 0n ? p.changeRequestedAt : undefined,
      }];
    }));
  }, [results, knownIds]);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => { if (isSuccess) refetch(); }, [isSuccess, refetch]);

  async function register() {
    setError("");
    if (!registry || !address) { setError("Connect a wallet first."); return; }
    if (!label.trim() || !account.startsWith("0x") || account.length !== 42) {
      setError("Enter a payee name and a valid 0x address.");
      return;
    }
    try {
      const id = keccak256(toHex(label.trim()));
      const h = await writeContractAsync({
        address: registry, abi: payeeRegistryAbi,
        functionName: "register", args: [id, account as Address, label.trim()],
      });
      setHash(h);
      if (!knownIds.includes(id)) saveIds([...knownIds, id]);
      setLabel(""); setAccount("");
    } catch (e) { setError((e as Error).message.slice(0, 200)); }
  }

  async function action(fn: "freeze" | "unfreeze" | "applyChange" | "cancelChange", id: `0x${string}`) {
    setError("");
    if (!registry) return;
    try {
      const h = await writeContractAsync({ address: registry, abi: payeeRegistryAbi, functionName: fn, args: [id] });
      setHash(h);
    } catch (e) { setError((e as Error).message.slice(0, 200)); }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Step 01 · verified payees</p>
        <h1>One name. One address.</h1>
        <p className="lede">
          Every payee has an id derived from its name and exactly one active payout address.
          An address change waits in a public window of {delay !== undefined ? `${Number(delay) / 3600}h` : "…"}
          — until then, payments still go to the old address. A dispute freezes it outright.
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
              <span className="hint">Check this out-of-band. Ledgerly binds it on-chain; it cannot attest to real-world identity.</span>
            </label>
            <button className="btn btn-copper" onClick={register} disabled={isPending || confirming}>Register payee</button>
            {error && <p className="form-error">{error}</p>}
            {isPending && <p className="hint">Sign the transaction…</p>}
            {confirming && <p className="hint">Confirming on Aevum…</p>}
            {isSuccess && hash && <p className="form-ok">Confirmed. <a className="link mono" href={`${net.chain.blockExplorers?.default.url}/tx/${hash}`} target="_blank" rel="noreferrer">{hash.slice(0, 18)}…</a></p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">The book</span><span className="badge badge-neutral">{rows.length} payees</span></div>
          {rows.length === 0 ? (
            <div className="panel-pad"><p className="muted" style={{ margin: 0 }}>No payees yet. Register one, or load a committed book shared by your team.</p></div>
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
                        {r.pendingAccount && <div className="hint mono" title={r.pendingAccount}>→ {r.pendingAccount.slice(0, 10)}…</div>}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {r.status === 1 && <button className="btn btn-secondary btn-sm" onClick={() => action("freeze", r.id)}>Freeze</button>}
                          {r.status === 3 && <button className="btn btn-secondary btn-sm" onClick={() => action("unfreeze", r.id)}>Unfreeze</button>}
                          {r.status === 2 && <button className="btn btn-sm" onClick={() => action("applyChange", r.id)}>Apply change</button>}
                          {r.status === 2 && <button className="btn btn-secondary btn-sm" onClick={() => action("cancelChange", r.id)}>Cancel</button>}
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

      <div className="notice">
        <strong>Change requests are the security boundary.</strong> When someone submits a changed
        address, the old one stays live for the entire window. Ledgerly shows the pending change in
        the batch review and refuses to pay the new address until the delay is over. Freeze is
        instant and beats the queue.
      </div>
    </main>
  );
}
