import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { Snapshot } from "../../observer.ts";
import { validateSnapshot } from "../../observer.ts";
import type { PrivacyClassifier } from "./chef.ts";
import { digest, object, requireThat, text, validateRange, validateChefHistoricalRange, type ChefHistoricalWitness, type Policy, type ReplaceRange, type ZcashNote } from "./types.ts";

export type DecodedChefNote = {
  txid: string; index: number; pool: string; amount: string; receiver: string;
  memo: string | null; shieldedSource: boolean; receiverBytes: string; memoHex: string;
};
/** Implementation must retrieve mined raw bytes and invoke chef_decrypt in the
 * maintained local SDK reader. It never receives signing authority. */
export type DecodeChefTransaction = (txid: string, height: number, signal: AbortSignal) => Promise<{ rawHex: string; blockHash: string; notes: DecodedChefNote[] }>;
export type OpeningCapitalExclusion = {txid:string;pool:"ironwood";index:number;amount:string;receiver:string;height:number;blockHash:string;proofDigest:string};

export function localChefDecoder(command: string, args: string[]): DecodeChefTransaction {
  return (txid, height, signal) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, signal });
    let output = "", failed = false;
    const fail = () => { failed = true; reject(new Error("CHEF_LOCAL_DECODE_FAILED")); };
    child.on("error", fail); child.stdin.on("error", fail);
    child.stderr.resume();
    child.stdout.on("data", data => { output += data; if (Buffer.byteLength(output) > 6_000_000) { child.kill(); fail(); } });
    child.on("close", code => { if (failed) return; if (code !== 0) { fail(); return; }
      try { const value = object(JSON.parse(output), ["rawHex", "blockHash", "notes"]); resolve(value as { rawHex: string; blockHash: string; notes: DecodedChefNote[] }); } catch { fail(); }
    });
    child.stdin.end(JSON.stringify({ txid, height }));
  });
}

/** Bind Chef's receipt bytes to an independently fetched, txid-checked and
 * UFVK-decrypted output before supplying a source privacy classification. */
export class ChefWalletBridge {
  private readonly decoded = new Map<string, { note: DecodedChefNote; evidence: string }>();
  excludedOpeningCapitalCount=0;
  constructor(private readonly decode: DecodeChefTransaction, private readonly openingCapital?: OpeningCapitalExclusion) {
    if(openingCapital) requireThat(/^[0-9a-f]{64}$/.test(openingCapital.txid) && /^[0-9a-f]{64}$/.test(openingCapital.proofDigest)
      && openingCapital.pool==="ironwood" && openingCapital.amount==="12500000" && Number.isSafeInteger(openingCapital.index) && openingCapital.index>=0
      && Number.isSafeInteger(openingCapital.height) && openingCapital.height>=4532047 && /^[0-9a-f]{64}$/.test(openingCapital.blockHash),"INVALID_OPENING_CAPITAL_EXCLUSION");
  }
  readonly classify: PrivacyClassifier = async (note, signal) => {
    if (note.scope !== "external" || note.coinbase) return { sourcePrivacy: "unknown", privacyEvidenceDigest: digest({ classifier: "excluded-change-or-coinbase", txid: note.txid }) };
    const result = await this.decode(note.txid, note.block.height, signal);
    requireThat(result.blockHash === note.block.hash, "CHEF_RAW_CANONICAL_BLOCK_MISMATCH");
    requireThat(/^(?:[0-9a-f]{2})+$/.test(result.rawHex) && result.rawHex.length <= 4_000_000 && Array.isArray(result.notes), "CHEF_RAW_TRANSACTION_REQUIRED");
    const matches = result.notes.filter(row => row.txid === note.txid && row.pool === note.pool && row.index === note.outputIndex);
    requireThat(matches.length === 1, "CHEF_DECRYPTED_OUTPUT_MISSING_OR_DUPLICATE");
    const row = matches[0]!;
    object(row, ["txid", "index", "pool", "amount", "receiver", "memo", "shieldedSource", "receiverBytes", "memoHex"]);
    requireThat(row.amount === note.amountAtomic && row.receiverBytes === note.receiverBytes && row.memoHex === note.memoHex
      && typeof row.shieldedSource === "boolean" && (row.memo === null || typeof row.memo === "string" && Buffer.byteLength(row.memo) <= 512), "CHEF_DECRYPTED_OUTPUT_MISMATCH");
    text(row.receiver);
    const evidence = digest({ classifier: "zeeswap-sdk-nu7-single-pool-v1", txid: note.txid,
      rawSha256: createHash("sha256").update(Buffer.from(result.rawHex, "hex")).digest("hex"),
      height: note.block.height, blockHash: note.block.hash, pool: note.pool, outputIndex: note.outputIndex,
      receiverBytes: row.receiverBytes, memoHex: row.memoHex, amount: row.amount, shieldedSource: row.shieldedSource });
    this.decoded.set(this.key(note), { note: row, evidence });
    return { sourcePrivacy: row.shieldedSource ? "shielded" : "mixed", privacyEvidenceDigest: evidence };
  };
  private key(note: Readonly<ZcashNote>) { return `${note.txid}:${note.pool}:${note.outputIndex}:${note.block.hash}`; }
  /** Only a fully checked coherent range becomes the existing observer DTO.
   * The caller still applies existing SQL order matching and confirmation gates. */
  snapshot(value: ReplaceRange, policy: Policy, now = Date.now(), historical?: {witness: ChefHistoricalWitness; project: string}): Snapshot {
    const batch = historical ? validateChefHistoricalRange(value, policy, now, historical.witness, historical.project) : validateRange(value, policy, now), head = batch.coverage.through;
    requireThat(policy.adapter === "zeer-chef" && batch.headers.some(h => h.height === Math.max(0, head.height - 9)), "CHEF_CONFIRMATION_WINDOW_REQUIRED");
    const outputs: Snapshot["outputs"] = [];
    this.excludedOpeningCapitalCount=0;
    for (const observation of batch.observations) {
      requireThat(observation.kind === "zcash-note", "CHEF_NOTE_REQUIRED");
      // Change is retained by Chef, but never treated as an incoming customer payment.
      if (observation.scope !== "external" || observation.coinbase) continue;
      const decoded = this.decoded.get(this.key(observation));
      requireThat(decoded && decoded.evidence === observation.privacyEvidenceDigest
        && observation.sourcePrivacy === (decoded.note.shieldedSource ? "shielded" : "mixed"), "CHEF_CLASSIFICATION_REQUIRED");
      const capital=this.openingCapital;
      if(capital && observation.txid===capital.txid && observation.pool===capital.pool && observation.outputIndex===capital.index) {
        requireThat(observation.amountAtomic===capital.amount && decoded.note.receiver===capital.receiver && observation.block.height===capital.height
          && observation.block.hash===capital.blockHash && observation.sourcePrivacy==="shielded", "OPENING_CAPITAL_EXCLUSION_MISMATCH");
        this.excludedOpeningCapitalCount++;
        continue;
      }
      outputs.push({ txid: observation.txid, index: observation.outputIndex, pool: observation.pool,
        amount: decoded.note.amount, receiver: decoded.note.receiver, memo: decoded.note.memo,
        height: observation.block.height, blockHash: observation.block.hash, blockTime: observation.block.time,
        shieldedSource: decoded.note.shieldedSource });
    }
    return validateSnapshot({ schemaVersion: 1, network: "zcash-testnet", consensusBranch: "77190ad9",
      observedAt: batch.coverage.readCompletedAt, scannedHeight: head.height, tipHash: head.hash,
      blocks: batch.headers.map(({ height, hash, time }) => ({ height, hash, time })), outputs });
  }
}
