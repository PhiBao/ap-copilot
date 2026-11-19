"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useNetwork } from "./network";

export interface Desk {
  registry: Address;
  policy: Address;
  label: string;
  /** Block the desk's policy was created at, so payout scans can start there. */
  fromBlock?: bigint;
  /** Block the registry was created at, so payee-label scans can start there. */
  registryFromBlock?: bigint;
}

const key = (chainId: number) => `ledgerly:desk:${chainId}`;

function read(chainId: number): Desk | null {
  try {
    const raw = localStorage.getItem(key(chainId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Desk;
    if (!d.registry || !d.policy) return null;
    return {
      ...d,
      fromBlock: d.fromBlock ? BigInt(d.fromBlock) : undefined,
      registryFromBlock: d.registryFromBlock ? BigInt(d.registryFromBlock) : undefined,
    };
  } catch {
    return null;
  }
}

export function saveDesk(chainId: number, desk: Desk) {
  try {
    localStorage.setItem(key(chainId), JSON.stringify({ ...desk, fromBlock: desk.fromBlock?.toString() }));
  } catch {
    // Storage can be blocked. The desk still works for this session.
  }
}

export function clearDesk(chainId: number) {
  try { localStorage.removeItem(key(chainId)); } catch { /* ignore */ }
}

/**
 * The desk the app is currently pointed at.
 * A desk created from this browser (or selected here) overrides the demo desk in env.
 */
export function useDesk() {
  const { net } = useNetwork();
  const [override, setOverride] = useState<Desk | null>(null);

  useEffect(() => { setOverride(read(net.chain.id)); }, [net.chain.id]);

  const envDesk: Desk | null = net.registry && net.policy
    ? {
        registry: net.registry,
        policy: net.policy,
        label: "QDay demo desk",
        fromBlock: net.deployBlock,
        registryFromBlock: net.registryDeployBlock,
      }
    : null;

  const desk = override ?? envDesk;

  const use = useCallback((d: Desk | null) => {
    if (d) saveDesk(net.chain.id, d);
    else clearDesk(net.chain.id);
    setOverride(d);
  }, [net.chain.id]);

  return { desk, envDesk, use };
}
