import { parseAbiItem, type Address } from "viem";

export const payeeRegisteredEvent = parseAbiItem(
  "event PayeeRegistered(bytes32 indexed payeeId,address indexed account,string label,uint64 at)"
);

/** Read every PayeeRegistered event from `fromBlock` to the chain tip, in 1,000-block chunks
 *  (Aevum's eth_getLogs limit). Returns the payee ids in registration order. */
type LogWithArgs = { args?: { payeeId?: `0x${string}` } };

// viem's generic getLogs signature is heavier than we need; keep the shape we use.
export async function listRegisteredPayeeIds(
  client: {
    getLogs: (args: { address: Address; event: unknown; fromBlock: bigint; toBlock: bigint }) => Promise<LogWithArgs[]>;
    getBlockNumber: () => Promise<bigint>;
  },
  registry: Address,
  fromBlock: bigint
): Promise<`0x${string}`[]> {
  const latest = await client.getBlockNumber();
  const ids: `0x${string}`[] = [];
  const seen = new Set<string>();
  for (let from = fromBlock; from <= latest; from += 1000n) {
    const to = from + 999n > latest ? latest : from + 999n;
    const logs = (await client.getLogs({ address: registry, event: payeeRegisteredEvent as never, fromBlock: from, toBlock: to })) as LogWithArgs[];
    for (const log of logs) {
      const id = log.args?.payeeId;
      if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
  }
  return ids;
}
