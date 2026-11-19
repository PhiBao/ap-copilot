"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useDeployContract, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toHex, parseUnits, type Address } from "viem";
import { payeeRegistryAbi, policyAbi, erc20Abi, TUSD8 } from "@/lib/contracts";
import { PAYEEREGISTRY_BYTECODE } from "@/lib/payeeregistry-bytecode";
import { POLICY_BYTECODE } from "@/lib/policy-bytecode";
import { useDesk, saveDesk } from "@/lib/desk";
import { useNetwork } from "@/lib/network";

/**
 * Create your own desk: a payee registry and a funded policy owned by your wallet.
 * Two contract deployments and one deposit. No server, no account, no custody.
 */
export default function NewDesk() {
  const { net } = useNetwork();
  const { desk, use: selectDesk } = useDesk();
  const { address, isConnected } = useAccount();
  const { deployContractAsync, isPending: deploying } = useDeployContract();
  const { writeContractAsync, isPending: writing } = useWriteContract();

  const [registry, setRegistry] = useState("");
  const [policy, setPolicy] = useState("");
  const [step, setStep] = useState<"idle" | "registry" | "policy" | "funding" | "done">("idle");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("0.1");

  const { data: balance } = useReadContract({
    address: TUSD8, abi: erc20Abi, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 6000 },
  });

  async function deployRegistry() {
    setError(""); setStep("registry");
    try {
      const h = await deployContractAsync({
        abi: payeeRegistryAbi, bytecode: PAYEEREGISTRY_BYTECODE,
        // Owner and guardian both start as the connected wallet; split them later if you want.
        args: [3600n, address!, address!],
      });
      setStep("idle");
      setError(`Registry deploy sent (${h.slice(0, 12)}…). Copy its contract address from the explorer into the field below.`);
    } catch (e) { setStep("idle"); setError((e as Error).message.slice(0, 240)); }
  }

  async function deployPolicy() {
    setError(""); setStep("policy");
    if (!registry.startsWith("0x") || registry.length !== 42) { setStep("idle"); setError("Paste the deployed registry address first."); return; }
    try {
      const h = await deployContractAsync({
        abi: policyAbi, bytecode: POLICY_BYTECODE,
        args: [TUSD8, registry as Address, address!],
      });
      setStep("idle");
      setError(`Policy deploy sent (${h.slice(0, 12)}…). Copy its contract address into the field below.`);
    } catch (e) { setStep("idle"); setError((e as Error).message.slice(0, 240)); }
  }

  async function activate() {
    setError(""); setStep("funding");
    if (!registry.startsWith("0x") || !policy.startsWith("0x")) { setStep("idle"); setError("Both addresses are required."); return; }
    try {
      // Sensible starting limits for a small team; change them any time on the Desk admin page.
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
      await writeContractAsync({
        address: policy as Address, abi: policyAbi, functionName: "configure",
        args: [parseUnits("500", 6), parseUnits("1000", 6), parseUnits("5000", 6), expiry],
      });
      const units = parseUnits(amount || "0.1", 6);
      await writeContractAsync({ address: TUSD8, abi: erc20Abi, functionName: "approve", args: [policy as Address, units] });
      await writeContractAsync({ address: policy as Address, abi: policyAbi, functionName: "deposit", args: [units] });
      const d = { registry: registry as Address, policy: policy as Address, label: "My desk", fromBlock: undefined };
      saveDesk(net.chain.id, d);
      selectDesk(d);
      setStep("done");
    } catch (e) { setStep("idle"); setError((e as Error).message.slice(0, 240)); }
  }

  async function registerDemoPayee() {
    setError("");
    if (!address || !registry.startsWith("0x")) return;
    try {
      const label = "Studio North Ltd";
      await writeContractAsync({
        address: registry as Address, abi: payeeRegistryAbi, functionName: "register",
        args: [keccak256(toHex(label)), "0x3333333333333333333333333333333333333333", label],
      });
    } catch (e) { setError((e as Error).message.slice(0, 200)); }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Onboarding</p>
        <h1>Your desk,<br />your keys.</h1>
        <p className="lede">
          Ledgerly has no accounts and no server. Your desk is two contracts you own
          on Aevum, funded with the budget you choose. Walk away and the contracts stay yours.
        </p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">01 · Deploy your contracts</span><span className={`badge ${isConnected ? "badge-ok" : "badge-warn"}`}>{isConnected ? "Wallet connected" : "Connect a wallet"}</span></div>
          <div className="panel-pad">
            <button className="btn" onClick={deployRegistry} disabled={!isConnected || deploying}>Deploy payee registry</button>
            <label className="field" style={{ marginTop: 14 }}>
              <span className="field-label">Registry address</span>
              <input className="mono" value={registry} onChange={(e) => setRegistry(e.target.value)} placeholder="0x…" />
            </label>
            <button className="btn" onClick={deployPolicy} disabled={!registry || deploying}>Deploy policy</button>
            <label className="field" style={{ marginTop: 14 }}>
              <span className="field-label">Policy address</span>
              <input className="mono" value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="0x…" />
            </label>
            <p className="hint">Two wallet transactions. The addresses appear in your wallet's activity and on the Aevum explorer.</p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">02 · Fund and activate</span></div>
          <div className="panel-pad">
            <div className="stat" style={{ marginBottom: 18 }}>
              <div className="stat-label">Your tUSD8 balance</div>
              <div className="stat-value">{balance !== undefined ? (Number(balance) / 1e6).toFixed(4) : "—"} <small>tUSD8</small></div>
              <div className="hint">Faucet: 1 tUSD8 per day, plus tQDAY for gas.</div>
            </div>
            <label className="field">
              <span className="field-label">Opening budget (tUSD8)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="hint">Caps start at 500 / 1,000 / 5,000 tUSD8. Change them on the admin page.</span>
            </label>
            <button className="btn btn-copper" onClick={activate} disabled={!isConnected || writing || !registry || !policy}>
              {step === "funding" ? "Signing…" : "Configure, approve and fund"}
            </button>
            <button className="btn btn-secondary" onClick={registerDemoPayee} disabled={!registry || writing} style={{ marginLeft: 8 }}>
              Add a demo payee
            </button>
            {error && <p className="form-error">{error}</p>}
            {step === "done" && (
              <div className="notice notice-ok">
                Desk active. <Link className="link" href="/batch">Start your first batch →</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {desk && (
        <div className="notice">
          Current desk: <span className="mono">{desk.policy}</span> ({desk.label}).{" "}
          {desk.label !== "QDay demo desk" && (
            <button className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => selectDesk(null)}>
              Switch back to the demo desk
            </button>
          )}
        </div>
      )}
    </main>
  );
}
