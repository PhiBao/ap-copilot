import { parseAbi, type Address } from "viem";

export const TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";

export const payeeRegistryAbi = parseAbi([
  "constructor(uint64 minChangeDelay,address owner,address guardian)",
  "function minChangeDelay() view returns (uint64)",
  "function activeAccount(bytes32 payeeId) view returns (address)",
  "function isActive(bytes32 payeeId) view returns (bool)",
  "function payee(bytes32 payeeId) view returns ((address account,string label,uint64 registeredAt,uint8 status,uint64 changeRequestedAt,address pendingAccount,string pendingLabel))",
  "function payeeIdOf(address account) view returns (bytes32)",
  "function canApplyChange(bytes32 payeeId) view returns (bool)",
  "function register(bytes32 payeeId,address account,string label)",
  "function requestChange(bytes32 payeeId,address toAccount,string label)",
  "function applyChange(bytes32 payeeId)",
  "function cancelChange(bytes32 payeeId)",
  "function freeze(bytes32 payeeId)",
  "function unfreeze(bytes32 payeeId)",
  "event PayeeRegistered(bytes32 indexed payeeId,address indexed account,string label,uint64 at)",
  "event ChangeRequested(bytes32 indexed payeeId,address indexed fromAccount,address indexed toAccount,uint64 applyAt)",
  "event ChangeApplied(bytes32 indexed payeeId,address indexed account,uint64 at)",
  "event PayeeFrozen(bytes32 indexed payeeId,address indexed account,uint64 at)",
]);

export const policyAbi = parseAbi([
  "constructor(address token,address registry,address owner)",
  "function token() view returns (address)",
  "function registry() view returns (address)",
  "function owner() view returns (address)",
  "function state() view returns (uint256 perPaymentCap,uint256 dailyCap,uint256 lifetimeCap,uint64 expiresAt,bool revoked,uint256 spentToday,uint64 spentDayStart,uint256 lifetimeSpent,uint64 createdAt)",
  "function settled(bytes32 batchId) view returns (bool)",
  "function settledReference(bytes32 refHash) view returns (bool)",
  "function remainingDaily() view returns (uint256)",
  "function remainingLifetime() view returns (uint256)",
  "function lifetimeSpent() view returns (uint256)",
  "function batchDigest(bytes32 batchId,(bytes32 payeeId,uint256 amount,string ref)[] payouts,uint256 nonce,uint64 validUntil) view returns (bytes32)",
  "function configure(uint256 perPaymentCap,uint256 dailyCap,uint256 lifetimeCap,uint64 expiresAt)",
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function revoke()",
  "function executeBatch(bytes32 batchId,(bytes32 payeeId,uint256 amount,string ref)[] payouts)",
  "function executeBatchSigned(bytes32 batchId,(bytes32 payeeId,uint256 amount,string ref)[] payouts,uint256 nonce,uint64 validUntil,uint8 v,bytes32 r,bytes32 s)",
  "event PayoutSettled(bytes32 indexed batchId,bytes32 indexed payeeId,address indexed to,uint256 amount,string ref)",
  "event BatchSettled(bytes32 indexed batchId,address indexed by,uint256 payoutCount,uint256 total)",
  "event PolicyRevoked(address indexed owner,uint64 at)",
  "event Deposited(address indexed owner,uint256 amount)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

/** Keccak of a payee id string, matching the contract's bytes32 ids. */
export function payeeId(label: string): `0x${string}` {
  // viem's keccak256 is used by callers; this placeholder is replaced in the app.
  return label as `0x${string}`;
}
