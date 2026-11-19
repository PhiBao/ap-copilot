"use client";

// Ops-only utility. Hidden unless NEXT_PUBLIC_ENABLE_DEPLOY=1.
// Deploys the two contracts from the connected browser wallet — no private key
// ever leaves the extension. After each deploy, copy the address from the
// wallet's transaction receipt / explorer and paste it into the fields below.
import { useState } from "react";
import { useAccount, useDeployContract, useWriteContract } from "wagmi";
import { keccak256, toHex, parseUnits, type Address, isAddress } from "viem";
import { payeeRegistryAbi, policyAbi, erc20Abi, TUSD8 } from "@/lib/contracts";
import { PAYEEREGISTRY_BYTECODE } from "@/lib/payeeregistry-bytecode";
import { POLICY_BYTECODE } from "@/lib/policy-bytecode";
import { deployEnabled } from "@/lib/env";
import { clearDeployIntent, readDeployIntent, saveDeployIntent, singleWalletRequest } from "@/lib/wallet";
import { useEffect } from "react";
import { useNetwork } from "@/lib/network";

export default function Deploy() {
  const { address } = useAccount();
  const { deployContractAsync, isPending: deploying } = useDeployContract();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [registry, setRegistry] = useState("");
  const [policy, setPolicy] = useState("");
  const [step, setStep] = useState("idle");
  const [error, setError] = useState("");
  const { net } = useNetwork();
  const [pending, setPending] = useState<{ kind: "registry" | "policy"; hash: `0x${string}` } | null>(null);

  useEffect(() => {
    const i = readDeployIntent(net.chain.id);
    if (i) setPending({ kind: i.kind, hash: i.hash });
  }, [net.chain.id]);

  if (!deployEnabled) {
    return <main className="shell"><h1>Not available.</h1><p className="muted">Deployment utility is disabled.</p></main>;
  }

  async function deploy(which: "registry" | "policy") {
    setError("");
    if (!address) { setError("Connect a wallet first."); return; }
    try {
      const h = await singleWalletRequest(() => which === "registry"
        ? deployContractAsync({ abi: payeeRegistryAbi, bytecode: PAYEEREGISTRY_BYTECODE, args: [3600n, address, address] })
        : deployContractAsync({ abi: policyAbi, bytecode: POLICY_BYTECODE, args: [TUSD8, isAddress(registry) ? registry : TUSD8, address] }));
      setPending({ kind: which, hash: h });
      saveDeployIntent(net.chain.id, { kind: which, hash: h, at: Date.now() });
      setStep(`${which} deploy tx: ${h.slice(0, 18)}… — copy the contract address from the explorer`);
    } catch (e) { setError((e as Error).message.slice(0, 220)); }
  }

  async function seed() {
    setError("");
    if (!address || !isAddress(registry) || !isAddress(policy)) { setError("Paste both deployed addresses first."); return; }
    try {
      // Demo book: the three payees used in the example batch.
      const demo = [
        { label: "Studio North Ltd", account: "0x3333333333333333333333333333333333333333" as Address },
        { label: "Bright Design Co", account: "0x4444444444444444444444444444444444444444" as Address },
        { label: "Rivera Consulting", account: "0x5555555555555555555555555555555555555555" as Address },
      ];
      for (const d of demo) {
        try {
          await writeContractAsync({
            address: registry as Address, abi: payeeRegistryAbi, functionName: "register",
            args: [keccak256(toHex(d.label)), d.account, d.label],
          });
        } catch { /* already registered — fine */ }
      }
      setStep("demo payees ready");
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
      await writeContractAsync({ address: policy as Address, abi: policyAbi, functionName: "configure", args: [parseUnits("0.5", 6), parseUnits("1", 6), parseUnits("5", 6), expiry] });
      setStep("policy configured");
      await writeContractAsync({ address: TUSD8, abi: erc20Abi, functionName: "approve", args: [policy as Address, parseUnits("0.1", 6)] });
      await writeContractAsync({ address: policy as Address, abi: policyAbi, functionName: "deposit", args: [parseUnits("0.1", 6)] });
      setStep("deposited — approve again on the Batch page to settle");
      await writeContractAsync({ address: TUSD8, abi: erc20Abi, functionName: "approve", args: [policy as Address, parseUnits("0.1", 6)] });
      setStep("ready: settle a batch on the Batch page");
    } catch (e) { setError((e as Error).message.slice(0, 220)); }
  }

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder="0x…" className="mono" />
    </label>
  );

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Ops only · wallet-signed deployment</p>
        <h1>Deploy to Aevum.</h1>
        <p className="lede">Connected as {address ?? "none"}. Every action signs in your wallet; no key leaves the extension.</p>
      </div>
      <div className="panel panel-pad">
        <button className="btn" onClick={() => deploy("registry")} disabled={!address || deploying || !!pending}>1 · Deploy PayeeRegistry</button>
        {field("PayeeRegistry address", registry, setRegistry)}
        <div className="spacer" />
        <button className="btn" onClick={() => deploy("policy")} disabled={!address || !isAddress(registry) || deploying || !!pending}>2 · Deploy Policy</button>
        {field("Policy address", policy, setPolicy)}
        <div className="spacer" />
        <button className="btn btn-copper" onClick={seed} disabled={!isAddress(registry) || !isAddress(policy) || writing}>3 · Configure caps and deposit 0.1 tUSD8</button>
        {pending && (
          <div className="notice" style={{ fontSize: 12 }}>
            Pending deploy <span className="mono">{pending.hash.slice(0, 14)}…</span>{" "}
            <button className="link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => { clearDeployIntent(net.chain.id); setPending(null); }}>
              Clear
            </button>
          </div>
        )}
        <p className="hint">Step: {step}</p>
        {error && <p className="form-error">{error}</p>}
        <div className="notice">
          After deploying, set <span className="kbd">NEXT_PUBLIC_REGISTRY_AEVUM</span> and{" "}
          <span className="kbd">NEXT_PUBLIC_POLICY_AEVUM</span> in the Vercel environment and redeploy so
          the main app reads the live contracts.
        </div>
      </div>
    </main>
  );
}
