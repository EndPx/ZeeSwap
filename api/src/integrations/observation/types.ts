import { createHash } from "node:crypto";

export class ObservationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function requireThat(value: unknown, code: string): asserts value {
  if (!value) throw new ObservationError(code);
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "INVALID_OBJECT");
  const row = value as Record<string, unknown>;
  requireThat(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), "INVALID_FIELDS");
  return row;
}
export function text(value: unknown): string {
  requireThat(typeof value === "string" && value.length > 0 && value.length <= 2048 && !value.includes("\0"), "INVALID_TEXT"); return value;
}
export function height(value: unknown): number {
  requireThat(Number.isSafeInteger(value) && Number(value) >= 0, "INVALID_HEIGHT"); return value as number;
}
export function decimal(value: unknown, max: bigint = 10n ** 78n - 1n): string {
  requireThat(typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) <= max, "INVALID_AMOUNT"); return value;
}
export function hex(value: unknown, bytes: number, prefix = false): string {
  requireThat(typeof value === "string" && new RegExp(`^${prefix ? "0x" : ""}[0-9a-f]{${bytes * 2}}$`).test(value), "INVALID_HEX"); return value;
}
export function utc(value: unknown): string {
  requireThat(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), "INVALID_UTC");
  const ms = Date.parse(value);
  requireThat(Number.isFinite(ms) && new Date(ms).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z"), "INVALID_UTC"); return value;
}
export const digest = (value: unknown): string => createHash("sha256").update(stable(value)).digest("hex");
export function stable(value: unknown): string {
  return JSON.stringify(sort(value));
}
function sort(value: unknown): unknown {
  return Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, sort(entry)])) : value;
}
export type Header = { height: number; hash: string; parentHash: string; time: string };
export type Coverage = {
  protocol: "zee-observation-v1"; adapter: "zeer-chef" | "envio-hyperindex"; network: string;
  registryDigest: string; projectionDigest: string; generation: string; revision: string;
  fromHeight: number; through: Header; complete: true; readStartedAt: string; readCompletedAt: string;
  sourceSampledAt: string; sourceHead: Header; recoveryFloor: number; canonicalCheckAt: string;
  canonicalSourceId: string; contentDigest: string;
};
export type ZcashNote = {
  kind: "zcash-note"; network: "zcash-testnet"; receiptId: string; txid: string; pool: "orchard" | "ironwood";
  outputIndex: number; block: Header; amountAtomic: string; receiverBytes: string; memoHex: string;
  accountFingerprint: string; scope: "external" | "internal"; origin: "unknown"; coinbase: boolean;
  sourcePrivacy: "shielded" | "mixed" | "transparent" | "unknown"; privacyEvidenceDigest: string;
};
export const eventFields = {
  Funded: ["id", "payer", "amount", "cancellationAvailableAt"], PayoutCommitted: ["id"],
  PayoutReserved: ["id", "recipient", "amount"], Paid: ["id", "recipient", "amount"],
  EscrowSettled: ["id", "amount"], Refunded: ["id", "recipient", "amount"], SettlementCancelled: ["id"],
  InventoryDeposited: ["from", "amount"], InventoryWithdrawn: ["to", "amount"],
  EscrowAborted: ["id", "refundRecipient", "amount", "nonce", "recoveryProofDigest"],
} as const;
export type BaseEvent = {
  kind: "base-contract-event"; chainId: 84532; contract: string; abiDigest: string; txHash: string;
  transactionIndex: number; logIndex: number; block: Header; event: keyof typeof eventFields;
  settlementId: string | null; token: string; amountAtomic: string | null; decoded: Record<string, string>;
};
export type Observation = ZcashNote | BaseEvent;
export type ReplaceRange = { coverage: Coverage; headers: Header[]; observations: Observation[] };
/** Full current checkpoint evidence is separate from a selected historical page.
 * Its undo horizon is never rewritten into an artificial historical floor. */
export type ChefHistoricalWitness = {
  kind: "chef-historical-v1"; project: string; generation: string; revision: string;
  actualCheckpoint: Header; actualUndoFloor: number; selectedFrom: number; selectedThrough: Header;
  selectedContentDigest: string; canonicalSourceId: string; checkedAt: string;
};
export type Policy = {
  adapter: Coverage["adapter"]; network: "zcash-testnet" | "eip155:84532";
  registryDigest: string; projectionDigest: string; canonicalSourceId: string;
  accountFingerprint?: string; contract?: string; token?: string; abiDigest?: string;
  contractVersion?: "v1" | "v2";
  birthday: number; maxBlocks?: number; maxObservations?: number; maxHistory?: number;
};
export function validatePolicy(policy: Policy): void {
  const optional = ["accountFingerprint", "contract", "token", "abiDigest", "contractVersion", "maxBlocks", "maxObservations", "maxHistory"];
  object(policy, ["adapter", "network", "registryDigest", "projectionDigest", "canonicalSourceId", "birthday", ...optional.filter(key => Object.hasOwn(policy, key))]);
  height(policy.birthday); hex(policy.registryDigest, 32); hex(policy.projectionDigest, 32); text(policy.canonicalSourceId);
  requireThat(policy.adapter === "zeer-chef" && policy.network === "zcash-testnet" || policy.adapter === "envio-hyperindex" && policy.network === "eip155:84532", "INVALID_POLICY_NETWORK");
  if (policy.adapter === "zeer-chef") text(policy.accountFingerprint);
  else { hex(policy.contract, 20, true); hex(policy.token, 20, true); hex(policy.abiDigest, 32); requireThat(policy.contractVersion === undefined || ["v1", "v2"].includes(policy.contractVersion), "INVALID_CONTRACT_VERSION"); }
  for (const field of ["maxBlocks", "maxObservations", "maxHistory"] as const) if (policy[field] !== undefined) requireThat(Number.isSafeInteger(policy[field]) && policy[field]! > 0 && policy[field]! <= (field === "maxHistory" ? 10000 : 1000), "INVALID_LIMIT");
}
export function parseHeader(value: unknown, network: Policy["network"]): Header {
  const r = object(value, ["height", "hash", "parentHash", "time"]);
  return { height: height(r.height), hash: hex(r.hash, 32, network === "eip155:84532"), parentHash: hex(r.parentHash, 32, network === "eip155:84532"), time: utc(r.time) };
}
export function parseObservation(value: unknown, policy: Policy): Observation {
  const kind = (value as { kind?: unknown })?.kind;
  if (kind === "zcash-note") {
    requireThat(policy.adapter === "zeer-chef" && policy.network === "zcash-testnet", "WRONG_NETWORK");
    const r = object(value, ["kind", "network", "receiptId", "txid", "pool", "outputIndex", "block", "amountAtomic", "receiverBytes", "memoHex", "accountFingerprint", "scope", "origin", "coinbase", "sourcePrivacy", "privacyEvidenceDigest"]);
    requireThat(r.network === policy.network && ["orchard", "ironwood"].includes(String(r.pool)) && ["external", "internal"].includes(String(r.scope)) && r.origin === "unknown" && typeof r.coinbase === "boolean", "INVALID_NOTE");
    requireThat(["shielded", "mixed", "transparent", "unknown"].includes(String(r.sourcePrivacy)), "INVALID_PRIVACY");
    requireThat(text(r.accountFingerprint) === policy.accountFingerprint, "WRONG_ACCOUNT");
    text(r.receiptId); hex(r.txid, 32); height(r.outputIndex); decimal(r.amountAtomic, 2_100_000_000_000_000n);
    hex(r.receiverBytes, 43); hex(r.memoHex, 512); hex(r.privacyEvidenceDigest, 32);
    return { ...r, block: parseHeader(r.block, policy.network) } as ZcashNote;
  }
  requireThat(kind === "base-contract-event" && policy.adapter === "envio-hyperindex" && policy.network === "eip155:84532", "INVALID_KIND");
  const r = object(value, ["kind", "chainId", "contract", "abiDigest", "txHash", "transactionIndex", "logIndex", "block", "event", "settlementId", "token", "amountAtomic", "decoded"]);
  requireThat(r.chainId === 84532 && r.contract === policy.contract && r.token === policy.token && r.abiDigest === policy.abiDigest, "WRONG_CONTRACT_TOKEN_ABI");
  hex(r.contract, 20, true); hex(r.token, 20, true); hex(r.abiDigest, 32); hex(r.txHash, 32, true); height(r.transactionIndex); height(r.logIndex);
  requireThat(typeof r.event === "string" && Object.hasOwn(eventFields, r.event), "INVALID_EVENT");
  requireThat(r.event !== "EscrowAborted" || policy.contractVersion === "v2", "V2_EVENT_DISABLED");
  const decoded = object(r.decoded, eventFields[r.event as keyof typeof eventFields]);
  for (const [key, entry] of Object.entries(decoded)) {
    if (key === "id" || key === "recoveryProofDigest") hex(entry, 32, true);
    else if (["payer", "recipient", "refundRecipient", "from", "to"].includes(key)) hex(entry, 20, true);
    else decimal(entry, 2n ** 256n - 1n);
  }
  requireThat(r.settlementId === (decoded.id ?? null) && r.amountAtomic === (decoded.amount ?? null), "EVENT_AMOUNT_OR_ID_MISMATCH");
  return { ...r, block: parseHeader(r.block, policy.network) } as BaseEvent;
}
export function economicIdentity(row: Observation): string {
  return row.kind === "zcash-note" ? `${row.network}:${row.txid}:${row.pool}:${row.outputIndex}`
    : `84532:${row.contract}:${row.txHash}:${row.logIndex}`;
}
export const occurrenceIdentity = (row: Observation): string => `${economicIdentity(row)}:${row.block.height}:${row.block.hash}`;
export const businessIdentity = (row: Observation): string => row.kind === "base-contract-event" && row.settlementId !== null ? `${row.contract}:${row.settlementId}:${row.event}` : economicIdentity(row);
export function contentDigest(batch: Pick<ReplaceRange, "headers" | "observations">): string {
  return digest({ headers: batch.headers, observations: [...batch.observations].sort((a, b) => occurrenceIdentity(a) < occurrenceIdentity(b) ? -1 : occurrenceIdentity(a) > occurrenceIdentity(b) ? 1 : 0) });
}
export function fresh(value: string, now: number): void {
  const age = now - Date.parse(utc(value)); requireThat(age >= -5000 && age <= 60_000, "STALE_SOURCE");
}
export function validateRange(value: unknown, policy: Policy, now: number): ReplaceRange {
  return validateRangeContents(value, policy, now);
}
/** Explicit historical Chef proof admission. Ordinary range validation remains
 * strict; callers must retain the complete witness beside the selected range. */
export function validateChefHistoricalRange(value: unknown, policy: Policy, now: number, witness: ChefHistoricalWitness, project: string): ReplaceRange {
  requireThat(policy.adapter === "zeer-chef" && policy.network === "zcash-testnet", "CHEF_HISTORY_POLICY");
  const w = object(witness, ["kind", "project", "generation", "revision", "actualCheckpoint", "actualUndoFloor", "selectedFrom", "selectedThrough", "selectedContentDigest", "canonicalSourceId", "checkedAt"]);
  const r = object(value, ["coverage", "headers", "observations"]), c = r.coverage as Coverage;
  const checkpoint = parseHeader(w.actualCheckpoint, policy.network), selected = parseHeader(w.selectedThrough, policy.network);
  height(w.actualUndoFloor); height(w.selectedFrom); text(w.project); text(w.generation); decimal(w.revision); hex(w.selectedContentDigest, 32); fresh(utc(w.checkedAt), now);
  requireThat(w.kind === "chef-historical-v1" && w.project === project && w.generation === c.generation && w.revision === c.revision
    && w.canonicalSourceId === policy.canonicalSourceId && w.checkedAt === c.canonicalCheckAt, "CHEF_HISTORY_IDENTITY_MISMATCH");
  requireThat(w.actualUndoFloor === c.recoveryFloor && Number(w.actualUndoFloor) <= checkpoint.height
    && w.selectedFrom === c.fromHeight && stable(selected) === stable(c.through) && w.selectedContentDigest === c.contentDigest
    && selected.height <= checkpoint.height && checkpoint.height <= c.sourceHead.height, "CHEF_HISTORY_CHECKPOINT_MISMATCH");
  if (selected.height === checkpoint.height) requireThat(stable(selected) === stable(checkpoint), "CHEF_HISTORY_CHECKPOINT_MISMATCH");
  if (checkpoint.height === c.sourceHead.height) requireThat(stable(checkpoint) === stable(c.sourceHead), "CHEF_HISTORY_CHECKPOINT_MISMATCH");
  return validateRangeContents(value, policy, now, checkpoint);
}
function validateRangeContents(value: unknown, policy: Policy, now: number, historicalCheckpoint?: Header): ReplaceRange {
  validatePolicy(policy);
  const r = object(value, ["coverage", "headers", "observations"]);
  const c = object(r.coverage, ["protocol", "adapter", "network", "registryDigest", "projectionDigest", "generation", "revision", "fromHeight", "through", "complete", "readStartedAt", "readCompletedAt", "sourceSampledAt", "sourceHead", "recoveryFloor", "canonicalCheckAt", "canonicalSourceId", "contentDigest"]);
  requireThat(c.protocol === "zee-observation-v1" && c.adapter === policy.adapter && c.network === policy.network && c.registryDigest === policy.registryDigest && c.projectionDigest === policy.projectionDigest && c.canonicalSourceId === policy.canonicalSourceId && c.complete === true, "INCOMPATIBLE_COVERAGE");
  hex(c.registryDigest, 32); hex(c.projectionDigest, 32); hex(c.contentDigest, 32); text(c.generation); decimal(c.revision); height(c.fromHeight); height(c.recoveryFloor);
  const through = parseHeader(c.through, policy.network), sourceHead = parseHeader(c.sourceHead, policy.network);
  const started = Date.parse(utc(c.readStartedAt)), completed = Date.parse(utc(c.readCompletedAt));
  requireThat(started <= completed && completed - started <= 30_000 && completed <= now + 5000, "READ_BUDGET");
  fresh(c.readCompletedAt as string, now); fresh(c.sourceSampledAt as string, now); fresh(c.canonicalCheckAt as string, now);
  requireThat(Number(c.fromHeight) >= policy.birthday && Number(c.fromHeight) <= through.height && through.height <= sourceHead.height
    && Number(c.recoveryFloor) <= (historicalCheckpoint?.height ?? through.height) + 1, "INVALID_RANGE");
  requireThat(Array.isArray(r.headers) && Array.isArray(r.observations), "INVALID_ARRAY");
  requireThat(r.headers.length <= (policy.maxBlocks ?? 1000) && r.observations.length <= (policy.maxObservations ?? 1000), "BACKPRESSURE");
  const headers = r.headers.map(h => parseHeader(h, policy.network));
  requireThat(headers.length === through.height - Number(c.fromHeight) + 1, "COVERAGE_GAP");
  headers.forEach((h, index) => requireThat(h.height === Number(c.fromHeight) + index && (index === 0 || h.parentHash === headers[index - 1]!.hash), "HEADER_GAP_OR_FORK"));
  requireThat(stable(headers.at(-1)) === stable(through), "CHECKPOINT_MISMATCH");
  const observations = r.observations.map(row => parseObservation(row, policy));
  const seen = new Set<string>();
  for (const row of observations) {
    requireThat(stable(headers[row.block.height - Number(c.fromHeight)]) === stable(row.block), "OBSERVATION_HEADER_MISMATCH");
    const key = economicIdentity(row); requireThat(!seen.has(key), "DUPLICATE_ECONOMIC_OUTPUT"); seen.add(key);
  }
  const batch = { coverage: { ...c, through, sourceHead } as Coverage, headers, observations };
  requireThat(contentDigest(batch) === c.contentDigest, "CONTENT_DIGEST_MISMATCH"); return batch;
}
/** Diagnostic readiness only. The SHADOW store never grants signing authority. */
export function diagnosticEligible(row: Observation, batch: ReplaceRange, now: number, finalized?: Header): boolean {
  try { fresh(batch.coverage.readCompletedAt, now); fresh(batch.coverage.sourceSampledAt, now); fresh(batch.coverage.canonicalCheckAt, now); }
  catch { return false; }
  if (row.kind === "zcash-note") return row.sourcePrivacy === "shielded" && row.scope === "external" && !row.coinbase && batch.coverage.through.height >= row.block.height + 9 && batch.coverage.sourceHead.height >= row.block.height + 9;
  return finalized !== undefined && row.block.height <= finalized.height && batch.coverage.through.height >= finalized.height && batch.coverage.sourceHead.height >= finalized.height;
}
