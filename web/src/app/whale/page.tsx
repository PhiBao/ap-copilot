"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { createPublicClient, http, formatEther, formatUnits, parseAbi, type Address } from "viem";
import { aevumTestnet } from "@aevum-kit/aevum";
import { TUSD8 } from "@/lib/contracts";

export default function Whale() {
  const { address, chainId } = useAccount();
  const [out, setOut] = useState("loading…");
  useEffect(() => {
    if (!address) { setOut("connect a wallet"); return; }
    (async () => {
      const client = createPublicClient({ chain: aevumTestnet, transport: http() });
      const eth = await client.getBalance({ address });
      const tusd = await client.readContract({ address: TUSD8, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [address] });
      setOut(`chainId=${chainId} address=${address} eth=${formatEther(eth)} tusd8=${formatUnits(tusd, 6)}`);
    })().catch((e) => setOut(String(e).slice(0, 200)));
  }, [address, chainId]);
  return <main className="shell"><h1>Account</h1><p className="mono" style={{ wordBreak: "break-all" }}>{out}</p></main>;
}
