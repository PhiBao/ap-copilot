"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { policyAbi, erc20Abi, TUSD8 } from "@/lib/contracts";
import { useDesk } from "@/lib/desk";
import { explainError } from "@/lib/errors";
import { fromUnits } from "@/lib/intake";

function toDateInput(ts: bigint | undefined): string {
  if (!ts || ts === 0n) return "";
  return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
}

export default function Admin() {
  const { desk } = useDesk();
  const { address, isConnected } = useAccount();
  const policy = desk?.policy;

  const [perPayment, setPerPayment] = useState("");
  const [daily, setDaily] = useState("");
  const [lifetime, setLifetime] = useState("");
  const [expiry, setExpiry] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const { data: st, refetch } = useReadContract({
    address: policy, abi: policyAbi, functionName: "state",
    query: { enabled: !!policy, refetchInterval: 5000 },
  });
  const { data: owner } = useReadContract({
    address: policy, abi: policyAbi, functionName: "owner",
    query: { enabled: !!policy },
  });
  const { data: policyBalance } = useReadContract({
    address: TUSD8, abi: erc20Abi, functionName: "balanceOf",
    args: policy ? [policy] : undefined,
    query: { enabled: !!policy, refetchInterval: 5000 },
  });
  const { data: walletBalance } = useReadContract({
    address: TUSD8, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
  const { data: allowance } = useReadContract({
    address: TUSD8, abi: erc20Abi, functionName: "allowance",
    args: address && policy ? [address, policy] : undefined,
    query: { enabled: !!address && !!policy, refetchInterval: 5000 },
  });

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  const revoked = st?.[4] ?? false;

  // Fill the form once. Polling must not overwrite what the operator is typing.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!st || hydrated) return;
    setPerPayment(st[0] === 0n ? "0" : fromUnits(st[0]));
    setDaily(st[1] === 0n ? "0" : fromUnits(st[1]));
    setLifetime(st[2] === 0n ? "0" : fromUnits(st[2]));
    setExpiry(toDateInput(st[3]));
    setHydrated(true);
  }, [st, hydrated]);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useEffect(() => { if (isSuccess) refetch(); }, [isSuccess, refetch]);

  async function run(fn: () => Promise<`0x${string}`>, message: string) {
    setError(""); setOk("");
    try {
      const h = await fn();
      setHash(h);
      setOk(`${message} Sent ${h.slice(0, 12)}…`);
    } catch (e) { setError(explainError(e)); }
  }

  function saveLimits() {
    if (!policy) return;
    const expiryTs = expiry ? BigInt(Math.floor(new Date(`${expiry}T23:59:59Z`).getTime() / 1000)) : 0n;
    run(() => writeContractAsync({
      address: policy, abi: policyAbi, functionName: "configure",
      args: [parseUnits(perPayment || "0", 6), parseUnits(daily || "0", 6), parseUnits(lifetime || "0", 6), expiryTs],
    }), "Limits update");
  }

  function deposit() {
    if (!policy || !address) return;
    const units = parseUnits(depositAmount || "0", 6);
    if ((allowance ?? 0n) < units) {
      run(() => writeContractAsync({ address: TUSD8, abi: erc20Abi, functionName: "approve", args: [policy, units] }), "Approval");
      return;
    }
    run(() => writeContractAsync({ address: policy, abi: policyAbi, functionName: "deposit", args: [units] }), "Deposit");
  }

  function withdraw() {
    if (!policy) return;
    run(() => writeContractAsync({ address: policy, abi: policyAbi, functionName: "withdraw", args: [parseUnits(withdrawAmount || "0", 6)] }), "Withdrawal");
  }

  function revoke() {
    if (!policy || confirmRevoke !== "REVOKE") { setError('Type REVOKE in the box to confirm.'); return; }
    run(() => writeContractAsync({ address: policy, abi: policyAbi, functionName: "revoke" }), "Revocation");
  }

  if (!desk) {
    return <main className="shell"><h1>No desk yet.</h1><p className="lede"><Link className="link" href="/new">Create one in two transactions →</Link></p></main>;
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Desk admin</p>
        <h1>The controls.</h1>
        <p className="lede">
          Caps, budget and revocation for <span className="mono">{desk.label}</span>. Only the
          owner wallet can change these; everyone else sees the live state.
        </p>
      </div>

      {!isOwner && (
        <div className="notice">
          Read-only. Connected wallet is not the desk owner ({owner?.slice(0, 10)}…). Switch wallets to change anything.
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat"><div className="stat-label">Budget</div><div className="stat-value">{policyBalance !== undefined ? fromUnits(policyBalance) : "—"} <small>tUSD8</small></div></div>
        <div className="stat"><div className="stat-label">Lifetime spent</div><div className="stat-value">{st ? fromUnits(st[7]) : "—"} <small>tUSD8</small></div></div>
        <div className="stat"><div className="stat-label">Status</div><div className="stat-value" style={{ color: revoked ? "var(--red)" : "var(--green)" }}>{revoked ? "Revoked" : "Active"}</div></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Caps and expiry</span></div>
          <div className="panel-pad">
            <label className="field"><span className="field-label">Per payment (tUSD8)</span><input value={perPayment} onChange={(e) => setPerPayment(e.target.value)} disabled={!isOwner} /></label>
            <label className="field"><span className="field-label">Per day (tUSD8)</span><input value={daily} onChange={(e) => setDaily(e.target.value)} disabled={!isOwner} /></label>
            <label className="field"><span className="field-label">Lifetime (tUSD8, 0 = unlimited)</span><input value={lifetime} onChange={(e) => setLifetime(e.target.value)} disabled={!isOwner} /></label>
            <label className="field"><span className="field-label">Expires</span><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!isOwner} /></label>
            <button className="btn" onClick={saveLimits} disabled={!isOwner || isPending || revoked}>Save limits</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Budget</span></div>
          <div className="panel-pad">
            <p className="hint">Wallet balance: {walletBalance !== undefined ? fromUnits(walletBalance) : "—"} tUSD8</p>
            <label className="field"><span className="field-label">Deposit (tUSD8)</span><input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={!isOwner || revoked} /></label>
            <button className="btn" onClick={deposit} disabled={!isOwner || isPending || revoked}>Deposit</button>
            {allowance !== undefined && allowance < parseUnits(depositAmount || "0", 6) && <p className="hint">First click approves, second click deposits.</p>}
            <div className="divider" />
            <label className="field"><span className="field-label">Withdraw (tUSD8)</span><input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={!isOwner} /></label>
            <button className="btn btn-secondary" onClick={withdraw} disabled={!isOwner || isPending}>Withdraw</button>
          </div>
        </div>
      </div>

      <div className="spacer" />
      <div className="panel">
        <div className="panel-head"><span className="panel-title" style={{ color: "var(--red)" }}>Revoke</span></div>
        <div className="panel-pad">
          <p className="muted" style={{ marginTop: 0 }}>Revocation is instant and permanent: no payout can settle after it. Funds stay in the contract and can still be withdrawn by the owner.</p>
          <div className="row">
            <input value={confirmRevoke} onChange={(e) => setConfirmRevoke(e.target.value)} placeholder='Type REVOKE' className="mono" style={{ maxWidth: 220 }} disabled={!isOwner || revoked} />
            <button className="btn btn-danger" onClick={revoke} disabled={!isOwner || isPending || revoked}>Revoke policy</button>
          </div>
        </div>
      </div>

      {(error || ok) && (
        <div className={error ? "notice notice-bad" : "notice notice-ok"}>
          {error || ok}
          {confirming && " Confirming…"}
        </div>
      )}
    </main>
  );
}
