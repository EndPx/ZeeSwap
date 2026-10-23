/** Raw-note projection only. Receiver bytes and memo bytes retain their original
 * encoding; wallet-aware receiver/memo binding belongs to a future checked bridge. */
export interface ReadableNote {
  id: string; network: string; txid: string; pool: string; outputIndex: number;
  blockHeight: number; blockHash: string; blockTime: number; valueZat: bigint;
  receiverBytes: string; memoHex: string; accountFingerprint: string;
  scope: string; origin: string; coinbase: boolean;
}
export interface Entities { ReadableNote: ReadableNote }
export type ReceiptInput = {
  block: { height: number; hash: string; time: number };
  receipt: { id: string; account_id: string; network: "testnet"; txid: string; pool: "sapling" | "orchard" | "ironwood"; output_index: number; height: number; receiver: string; receiver_type: "sapling" | "orchard"; value_zat: string; memo_hex: string; scope: "external" | "internal"; origin: "unknown"; is_coinbase: boolean };
};
export function projectNote(input: ReceiptInput, accountId: string, fingerprint: string): ReadableNote {
  const { block, receipt } = input;
  if (receipt.network !== "testnet" || receipt.account_id !== accountId || receipt.height !== block.height || !Number.isSafeInteger(block.height) || !/^[0-9a-f]{64}$/.test(block.hash)) throw Error("UNEXPECTED_RECEIPT_IDENTITY");
  if (!/^[0-9a-f]{64}$/.test(receipt.txid) || !receipt.id || Buffer.byteLength(receipt.id) > 256 || receipt.id.includes("\0") || !["external", "internal"].includes(receipt.scope) || receipt.origin !== "unknown" || typeof receipt.is_coinbase !== "boolean") throw Error("INVALID_RECEIPT_IDENTITY");
  if (!["orchard", "ironwood"].includes(receipt.pool) || receipt.receiver_type !== "orchard") throw Error("UNSUPPORTED_RECEIPT_POOL");
  if (!/^(0|[1-9][0-9]{0,15})$/.test(receipt.value_zat) || BigInt(receipt.value_zat) > 2_100_000_000_000_000n || !/^[0-9a-f]{86}$/.test(receipt.receiver) || !/^[0-9a-f]{1024}$/.test(receipt.memo_hex)) throw Error("INVALID_RECEIPT_BYTES_OR_AMOUNT");
  if (!Number.isSafeInteger(receipt.output_index) || receipt.output_index < 0 || !Number.isSafeInteger(block.time) || block.time < 0 || !fingerprint.length) throw Error("INVALID_RECEIPT_POSITION");
  return { id: receipt.id, network: "zcash-testnet", txid: receipt.txid, pool: receipt.pool, outputIndex: receipt.output_index,
    blockHeight: block.height, blockHash: block.hash, blockTime: block.time, valueZat: BigInt(receipt.value_zat),
    receiverBytes: receipt.receiver, memoHex: receipt.memo_hex, accountFingerprint: fingerprint,
    scope: receipt.scope, origin: receipt.origin, coinbase: receipt.is_coinbase };
}
