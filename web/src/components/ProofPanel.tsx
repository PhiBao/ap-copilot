"use client";

import { useReadContract } from "wagmi";
import { policyAbi } from "@/lib/contracts";
import { useDesk } from "@/lib/desk";
import { fromUnits } from "@/lib/intake";

/** Live on-chain state. Refreshes on every block; no fixtures. */
export function ProofPanel() {
  const { desk } = useDesk();
  const { data: st } = useReadContract({
    address: desk?.policy,
    abi: policyAbi,
    functionName: "state",
    query: { enabled: !!desk?.policy, refetchInterval: 4000 },
  });
  const { data: rev } = useReadContract({
    address: desk?.policy,
    abi: policyAbi,
    functionName: "remainingDaily",
    query: { enabled: !!desk?.policy, refetchInterval: 4000 },
  });

  return (
    <div className="hero-proof">
      <div className="panel-head" style={{ borderColor: "rgba(255,255,255,0.12)", padding: "0 0 12px" }}>
        <span className="panel-title">Live policy · Aevum 44005</span>
        <span className="badge badge-ok" style={{ background: "rgba(120,180,130,0.16)", color: "#a8d8b0" }}>
          {st?.[4] ? "Revoked" : "Active"}
        </span>
      </div>
      <div className="proof-row">
        <span className="proof-key">Per-payment cap</span>
        <span className="proof-val">{st ? fromUnits(st[0]) : "—"} tUSD8</span>
      </div>
      <div className="proof-row">
        <span className="proof-key">Daily cap</span>
        <span className="proof-val">{st ? fromUnits(st[1]) : "—"} tUSD8</span>
      </div>
      <div className="proof-row">
        <span className="proof-key">Remaining today</span>
        <span className="proof-val">{rev !== undefined ? fromUnits(rev) : "—"} tUSD8</span>
      </div>
      <div className="proof-row">
        <span className="proof-key">Lifetime settled</span>
        <span className="proof-val">{st ? fromUnits(st[7]) : "—"} tUSD8</span>
      </div>
      <div className="proof-row">
        <span className="proof-key">Expires</span>
        <span className="proof-val">{st && st[3] > 0n ? new Date(Number(st[3]) * 1000).toISOString().slice(0, 10) : "never"}</span>
      </div>
      <p className="hint" style={{ color: "#8f8c83", marginTop: 16, marginBottom: 0 }}>
        Read directly from the deployed contract. Every batch writes a{" "}
        <span className="mono">PayoutSettled</span> event with the payee, amount and reference.
      </p>
    </div>
  );
}
