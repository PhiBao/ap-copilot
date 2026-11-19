import { isAddress, type Address, type Chain } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export type NetworkKey = "aevum" | "fork" | "local";

export interface Network {
  key: NetworkKey;
  label: string;
  chain: Chain;
  registry?: Address;
  policy?: Address;
  deployBlock?: bigint;
  registryDeployBlock?: bigint;
  hasExplorer: boolean;
}

const address = (v: string | undefined): Address | undefined =>
  v && isAddress(v.trim()) ? (v.trim() as Address) : undefined;
const block = (v: string | undefined): bigint | undefined =>
  v && /^\d+$/.test(v.trim()) ? BigInt(v.trim()) : undefined;

const all: Record<NetworkKey, Network> = {
  aevum: {
    key: "aevum",
    label: "Aevum testnet",
    chain: aevumTestnet,
    registry: address(process.env.NEXT_PUBLIC_REGISTRY_AEVUM),
    policy: address(process.env.NEXT_PUBLIC_POLICY_AEVUM),
    deployBlock: block(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_AEVUM),
    registryDeployBlock: block(process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK_AEVUM),
    hasExplorer: true,
  },
  fork: {
    key: "fork",
    label: "Local fork",
    chain: aevumFork,
    registry: address(process.env.NEXT_PUBLIC_REGISTRY_FORK),
    policy: address(process.env.NEXT_PUBLIC_POLICY_FORK),
    deployBlock: block(process.env.NEXT_PUBLIC_DEPLOY_BLOCK_FORK),
    hasExplorer: false,
  },
  local: {
    key: "local",
    label: "Local anvil",
    chain: localAnvil,
    registry: address(process.env.NEXT_PUBLIC_REGISTRY_LOCAL),
    policy: address(process.env.NEXT_PUBLIC_POLICY_LOCAL),
    hasExplorer: false,
  },
};

const requested = (process.env.NEXT_PUBLIC_NETWORKS ?? "aevum")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is NetworkKey => k in all);

export const networks: [Network, ...Network[]] = (() => {
  const keys = [...new Set(requested)];
  const list = (keys.length ? keys : (["aevum"] as NetworkKey[])).map((k) => all[k]);
  return list as [Network, ...Network[]];
})();

export const defaultNetwork = networks[0];

export function networkByChainId(chainId: number | undefined): Network | undefined {
  return networks.find((n) => n.chain.id === chainId);
}

export function networkByKey(key: string | null | undefined): Network | undefined {
  return networks.find((n) => n.key === key);
}

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined;
export const deployEnabled = process.env.NEXT_PUBLIC_ENABLE_DEPLOY === "1";
export const repoUrl = (process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/PhiBao/ledgerly").replace(/\.git$|\/+$/g, "");
