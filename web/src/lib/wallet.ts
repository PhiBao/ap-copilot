"use client";

/**
 * One wallet request at a time, across the whole app.
 *
 * A page can render two buttons, a user can double-click, or two tabs can both
 * ask to deploy. Without a lock that becomes two MetaMask prompts and two
 * transactions. This makes the second call fail with a sentence instead.
 */
let locked = false;

export function walletIsBusy(): boolean {
  return locked;
}

export function walletErrorMessage(): string {
  return "A wallet request is already open. Finish or reject it in your wallet first.";
}

export async function singleWalletRequest<T>(fn: () => Promise<T>): Promise<T> {
  if (locked) throw new Error(walletErrorMessage());
  locked = true;
  try {
    return await fn();
  } finally {
    locked = false;
  }
}

/**
 * A deploy intent survives a reload. If a deployment transaction was already
 * sent, the app resumes waiting for it instead of sending another one.
 */
export interface DeployIntent {
  kind: "registry" | "policy";
  hash: `0x${string}`;
  at: number;
}

const intentKey = (chainId: number) => `ledgerly:deploy:${chainId}`;

export function readDeployIntent(chainId: number): DeployIntent | null {
  try {
    const raw = localStorage.getItem(intentKey(chainId));
    return raw ? (JSON.parse(raw) as DeployIntent) : null;
  } catch {
    return null;
  }
}

export function saveDeployIntent(chainId: number, intent: DeployIntent) {
  try { localStorage.setItem(intentKey(chainId), JSON.stringify(intent)); } catch { /* ignore */ }
}

export function clearDeployIntent(chainId: number) {
  try { localStorage.removeItem(intentKey(chainId)); } catch { /* ignore */ }
}
