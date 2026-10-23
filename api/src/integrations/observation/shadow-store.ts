import { open, mkdir, readFile, rename, rm, rmdir, lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, parse } from "node:path";
import { randomUUID } from "node:crypto";
import { businessIdentity, digest, economicIdentity, hex, object, occurrenceIdentity, parseHeader, parseObservation, requireThat, stable, text, utc, validatePolicy, validateRange, type Observation, type Policy, type ReplaceRange, type Header } from "./types.ts";

export type Occurrence = { row: Observation; canonical: boolean; firstSeenAt: string; lastSeenAt: string };
export type Exposure = { occurrenceId: string; businessId: string; effect: "prepared" | "signed" | "submitted" | "delivered" | "refunded"; detectedAt: string };
export type ShadowState = {
  mode: "SHADOW"; version: 1; policyDigest: string; sealedThrough: number;
  checkpoint: ReplaceRange["coverage"] | null; headers: Header[];
  occurrences: Occurrence[]; exposures: Exposure[]; lastBatchDigest: string | null;
};
/** Caller supplies a reviewed local journal snapshot; this module never reads or mutates financial books. */
export type KnownEffects = ReadonlyMap<string, Exposure["effect"]>;
const initialState = (policy: Policy): ShadowState => ({ mode: "SHADOW", version: 1, policyDigest: digest(policy), sealedThrough: policy.birthday - 1, checkpoint: null, headers: [], occurrences: [], exposures: [], lastBatchDigest: null });
export function reduceReplacement(previous: ShadowState, candidate: unknown, policy: Policy, now: number, knownEffects: KnownEffects = new Map()): ShadowState {
  const batch = validateRange(candidate, policy, now), c = batch.coverage, old = previous.checkpoint;
  requireThat(previous.mode === "SHADOW" && previous.policyDigest === digest(policy), "WRONG_SHADOW_STREAM");
  if (old) {
    requireThat(c.generation === old.generation, "BLOCK_GENERATION_CHANGED");
    requireThat(BigInt(c.revision) >= BigInt(old.revision), "BLOCK_REVISION_REGRESSION");
    requireThat(c.recoveryFloor >= old.recoveryFloor, "BLOCK_RECOVERY_FLOOR_REGRESSION");
    requireThat(c.sourceHead.height >= old.sourceHead.height, "BLOCK_SOURCE_HEAD_REGRESSION");
    if (c.sourceHead.height === old.sourceHead.height) requireThat(c.sourceHead.hash === old.sourceHead.hash || BigInt(c.revision) > BigInt(old.revision), "BLOCK_SOURCE_HASH_CONFLICT");
    if (c.generation === old.generation && c.revision === old.revision) {
      requireThat(c.through.hash === old.through.hash && c.through.height === old.through.height && c.recoveryFloor === old.recoveryFloor, "BLOCK_REVISION_CONTENT_CONFLICT");
      if (c.fromHeight === old.fromHeight) requireThat(c.contentDigest === old.contentDigest, "BLOCK_REVISION_CONTENT_CONFLICT");
    }
  }
  // Every turn replaces all unsealed history, including a shortened branch's removed suffix.
  requireThat(c.fromHeight === Math.max(policy.birthday, previous.sealedThrough + 1), "INCOMPLETE_MUTABLE_TAIL");
  requireThat(c.through.height >= previous.sealedThrough, "BLOCK_DEEP_REORG");
  const boundary = previous.headers.find(h => h.height === previous.sealedThrough);
  if (boundary) requireThat(batch.headers[0]!.parentHash === boundary.hash, "BLOCK_DEEP_REORG");
  const nowIso = new Date(now).toISOString();
  const nextIds = new Set(batch.observations.map(occurrenceIdentity));
  const occurrences = previous.occurrences.map(entry => ({ ...entry }));
  const exposures = [...previous.exposures];
  for (const entry of occurrences) {
    if (entry.canonical && entry.row.block.height >= c.fromHeight && !nextIds.has(occurrenceIdentity(entry.row))) {
      entry.canonical = false; entry.lastSeenAt = nowIso;
      const effect = knownEffects.get(businessIdentity(entry.row));
      if (effect && !exposures.some(e => e.occurrenceId === occurrenceIdentity(entry.row) && e.effect === effect)) exposures.push({ occurrenceId: occurrenceIdentity(entry.row), businessId: businessIdentity(entry.row), effect, detectedAt: nowIso });
    }
  }
  for (const row of batch.observations) {
    for (const entry of occurrences) {
      if (row.kind === "zcash-note" && entry.row.kind === "zcash-note" && economicIdentity(row) === economicIdentity(entry.row)) {
        const immutable = (note: typeof row) => ({ network: note.network, txid: note.txid, pool: note.pool, outputIndex: note.outputIndex, amountAtomic: note.amountAtomic, receiverBytes: note.receiverBytes, memoHex: note.memoHex, scope: note.scope, origin: note.origin, coinbase: note.coinbase });
        requireThat(stable(immutable(row)) === stable(immutable(entry.row)), "CONFLICTING_ECONOMIC_OUTPUT");
      }
      if (row.kind === "base-contract-event" && entry.row.kind === "base-contract-event" && row.settlementId !== null && businessIdentity(row) === businessIdentity(entry.row)) {
        const effect = (event: typeof row) => ({ contract: event.contract, token: event.token, event: event.event, settlementId: event.settlementId, amountAtomic: event.amountAtomic, decoded: event.decoded });
        requireThat(stable(effect(row)) === stable(effect(entry.row)), "CONFLICTING_BUSINESS_EFFECT");
      }
    }
    const existing = occurrences.find(e => occurrenceIdentity(e.row) === occurrenceIdentity(row));
    if (existing) {
      // Key/account rotation must not create value; conflicting immutable amount/receiver is a fault.
      const stripAudit = (r: Observation) => r.kind === "zcash-note" ? { ...r, receiptId: null, accountFingerprint: null, privacyEvidenceDigest: null, sourcePrivacy: null } : r;
      requireThat(stable(stripAudit(existing.row)) === stable(stripAudit(row)), "CONFLICTING_OCCURRENCE");
      existing.row = row; existing.canonical = true; existing.lastSeenAt = nowIso;
    } else occurrences.push({ row, canonical: true, firstSeenAt: nowIso, lastSeenAt: nowIso });
  }
  const economic = new Set<string>(), business = new Set<string>();
  for (const entry of occurrences.filter(e => e.canonical)) {
    const key = economicIdentity(entry.row); requireThat(!economic.has(key), "DUPLICATE_CANONICAL_VALUE"); economic.add(key);
    const effect = businessIdentity(entry.row); requireThat(!business.has(effect), "CONFLICTING_BUSINESS_EFFECT"); business.add(effect);
  }
  requireThat(occurrences.length <= (policy.maxHistory ?? 10_000), "BACKPRESSURE_HISTORY");
  const headers = [...previous.headers.filter(h => h.height < c.fromHeight), ...batch.headers];
  requireThat(headers.length <= (policy.maxBlocks ?? 1000), "BACKPRESSURE_ANCHORS");
  // Only history strictly below the verified retained undo floor can be sealed.
  const sealedThrough = Math.max(previous.sealedThrough, Math.min(c.recoveryFloor - 1, c.through.height - 1));
  return { ...previous, sealedThrough, checkpoint: c, headers, occurrences, exposures, lastBatchDigest: digest(c) };
}

export class ShadowStore {
  readonly path: string;
  constructor(path: string, private readonly policy: Policy) {
    validatePolicy(policy);
    requireThat(isAbsolute(path), "ABSOLUTE_PRIVATE_PATH_REQUIRED"); this.path = resolve(path);
    // Deliberately use a separate private runtime root. Never accept an operator DB/wallet filename.
    requireThat(this.path.replaceAll("\\", "/").includes("/.deploy-local/observation-shadow/") && this.path.endsWith(".json"), "PRIVATE_SHADOW_PATH_REQUIRED");
  }
  private async assertPrivatePath(): Promise<void> {
    let path = this.path;
    while (path !== parse(path).root) {
      try { const entry = await lstat(path); requireThat(!entry.isSymbolicLink(), "SYMLINK_SHADOW_PATH");
        if (process.platform !== "win32" && path.replaceAll("\\", "/").includes("/.deploy-local/observation-shadow")) requireThat((entry.mode & 0o077) === 0, "UNPROTECTED_SHADOW_PATH");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      path = dirname(path);
    }
  }
  async read(): Promise<ShadowState> {
    await this.assertPrivatePath();
    let raw: string;
    try { raw = await readFile(this.path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialState(this.policy); throw error; }
    requireThat(Buffer.byteLength(raw) <= 32_000_000, "BACKPRESSURE_STATE");
    const envelope = object(JSON.parse(raw), ["state", "digest"]); requireThat(envelope.digest === digest(envelope.state), "CORRUPT_SHADOW_STATE");
    const s = object(envelope.state, ["mode", "version", "policyDigest", "sealedThrough", "checkpoint", "headers", "occurrences", "exposures", "lastBatchDigest"]);
    requireThat(s.mode === "SHADOW" && s.version === 1 && s.policyDigest === digest(this.policy), "WRONG_SHADOW_STREAM");
    requireThat(Number.isSafeInteger(s.sealedThrough) && Number(s.sealedThrough) >= this.policy.birthday - 1, "CORRUPT_SHADOW_STATE");
    requireThat(Array.isArray(s.headers) && Array.isArray(s.occurrences) && Array.isArray(s.exposures), "CORRUPT_SHADOW_STATE");
    requireThat(s.headers.length <= (this.policy.maxBlocks ?? 1000) && s.occurrences.length <= (this.policy.maxHistory ?? 10_000), "BACKPRESSURE_STATE");
    for (const value of s.occurrences) { const e = object(value, ["row", "canonical", "firstSeenAt", "lastSeenAt"]); parseObservation(e.row, this.policy); requireThat(typeof e.canonical === "boolean", "CORRUPT_SHADOW_STATE"); utc(e.firstSeenAt); utc(e.lastSeenAt); }
    const state = s as ShadowState;
    state.headers.forEach((header, index) => { parseHeader(header, this.policy.network); requireThat(header.height === this.policy.birthday + index && (index === 0 || header.parentHash === state.headers[index - 1]!.hash), "CORRUPT_SHADOW_HEADERS"); });
    for (const value of state.exposures) {
      const exposure = object(value, ["occurrenceId", "businessId", "effect", "detectedAt"]);
      text(exposure.occurrenceId); text(exposure.businessId); utc(exposure.detectedAt);
      requireThat(["prepared", "signed", "submitted", "delivered", "refunded"].includes(String(exposure.effect)), "CORRUPT_SHADOW_EXPOSURE");
    }
    if (state.checkpoint !== null) {
      hex(state.lastBatchDigest, 32);
      const c = state.checkpoint;
      // Validate the recorded snapshot at its original sample time. Reading an
      // old mirror is allowed; publishing/diagnostic readiness still checks now.
      const originalTime = Math.max(Date.parse(utc(c.readCompletedAt)), Date.parse(utc(c.canonicalCheckAt)), Date.parse(utc(c.sourceSampledAt)));
      const recorded = validateRange({ coverage: c, headers: state.headers.filter(h => h.height >= c.fromHeight), observations: state.occurrences.filter(e => e.canonical && e.row.block.height >= c.fromHeight).map(e => e.row) }, this.policy, originalTime);
      requireThat(state.sealedThrough < c.through.height && digest(recorded.coverage) === state.lastBatchDigest, "CORRUPT_SHADOW_CHECKPOINT");
    } else requireThat(state.headers.length === 0 && state.occurrences.length === 0 && state.lastBatchDigest === null, "CORRUPT_SHADOW_STATE");
    return state;
  }
  /** Exclusive process lock + compare-and-swap + fsync(temp) + atomic rename. Never force-clear a stale lock. */
  async publish(candidate: unknown, expectedCheckpoint: string | null, now = Date.now(), knownEffects: KnownEffects = new Map(), fault?: (phase: "before-rename" | "after-rename") => void): Promise<ShadowState> {
    await this.assertPrivatePath();
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await this.assertPrivatePath();
    const lock = `${this.path}.lock`; await mkdir(lock, { mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const before = await this.read(); requireThat((before.checkpoint ? digest(before.checkpoint) : null) === expectedCheckpoint, "CHECKPOINT_CHANGED");
      const next = reduceReplacement(before, candidate, this.policy, now, knownEffects);
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(stable({ state: next, digest: digest(next) })); await handle.sync(); } finally { await handle.close(); }
      fault?.("before-rename"); await rename(temporary, this.path); fault?.("after-rename");
      // Directory fsync is available on POSIX. Windows rename gives atomic visibility;
      // its power-loss durability still depends on filesystem/platform guarantees.
      if (process.platform !== "win32") { const dir = await open(dirname(this.path), "r"); try { await dir.sync(); } finally { await dir.close(); } }
      return next;
    } finally { await rm(temporary, { force: true }); await rmdir(lock); }
  }
}
