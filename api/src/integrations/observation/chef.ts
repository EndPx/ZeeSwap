import { performance } from "node:perf_hooks";
import { contentDigest, decimal, digest, fresh, height, hex, object, ObservationError, parseHeader, parseObservation, requireThat, stable, text, utc, validateRange, validateChefHistoricalRange, type ChefHistoricalWitness, type Header, type Policy, type ReplaceRange, type ZcashNote } from "./types.ts";

/** A changed sampled tip is distinct from a persisted-anchor conflict. */
export class ChefCanonicalHeadChanged extends ObservationError {
 recheckFailure?:unknown;
 constructor(readonly expected:Header,readonly actual:Header,readonly phase:'traversal'|'anchor-recheck') {super('CANONICAL_HEAD_CHANGED');this.name='ChefCanonicalHeadChanged';}
}
export function requireChefCanonicalHead(expected:Header,actual:Header,phase:'traversal'|'anchor-recheck'){
 if(stable(actual)!==stable(expected))throw new ChefCanonicalHeadChanged(expected,actual,phase);
}
export type CanonicalHeaderOrigin={kind:'prefetch-cache'|'fresh'|'unknown';fromHeight?:number;throughHeight?:number;sampledHeadHeight?:number};
/** A comparison witness, not an attribution of which source is wrong. */
export class SourceCheckpointMismatch extends ObservationError {
 readonly phase='traversal';recheckFailure?:unknown;freshCanonicalHeader?:Header;freshCanonicalFailure?:unknown;
 constructor(readonly expectedCore:{height:number;hash:string;generation:string;revision:string;project:string},readonly actualHeader:Header,readonly origin:CanonicalHeaderOrigin){super('CANONICAL_CHECKPOINT_MISMATCH');this.name='SourceCheckpointMismatch';}
}
export type CanonicalSample = { sourceId: string; checkedAt: string; head: Header; finalized?: Header };
/** Implement with an independently configured canonical RPC/header source. No signing methods. */
export interface CanonicalReader {
  sample(signal: AbortSignal): Promise<CanonicalSample>;
  header(height: number, signal: AbortSignal): Promise<Header>;
  headers?(heights: readonly number[], signal: AbortSignal): Promise<Header[]>;
  readonly headerBatchSize?:number;
  headerOrigin?(height:number):CanonicalHeaderOrigin;
}
export type PrivacyClassifier = (note: Readonly<ZcashNote>, signal: AbortSignal) => Promise<Pick<ZcashNote, "sourcePrivacy" | "privacyEvidenceDigest">>;
export type ChefConfig = {
  url: string; token: string; project: string; policy: Policy; canonical: CanonicalReader;
  classify?: PrivacyClassifier; fetch?: typeof fetch; now?: () => number; monotonic?: () => number;
};
type Status = {
  project: string; generation: string; revision: string;
  checkpoint: { height: number; hash: string; anchorHash: string | null; status: "ready"; undoFloor: number };
  lastCommitAt: string | null;
  source: { status: "available"; checkedAt: string; prepIndexedHeight: number; sourceObservedHeight: number; sourceObservedAt: number };
};
/** PostgreSQL-backed Chef source samples can use RFC3339 offsets and six
 * fractional digits. Preserve the represented instant; never renew it at read. */
export function chefSourceTimestamp(value: unknown): string {
  requireThat(typeof value === "string", "INVALID_CHEF_SOURCE_TIME");
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.exec(value);
  requireThat(match, "INVALID_CHEF_SOURCE_TIME");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  requireThat(calendar.getUTCFullYear() === year && calendar.getUTCMonth() + 1 === month && calendar.getUTCDate() === day
    && calendar.getUTCHours() === hour && calendar.getUTCMinutes() === minute && calendar.getUTCSeconds() === second, "INVALID_CHEF_SOURCE_TIME");
  const parsed = Date.parse(value); requireThat(Number.isFinite(parsed), "INVALID_CHEF_SOURCE_TIME");
  return new Date(parsed).toISOString();
}
export function parseChefStatus(value: unknown, project: string, now: number): Status {
  const r = object(value, ["project", "generation", "revision", "checkpoint", "lastCommitAt", "source"]);
  requireThat(r.project === project, "WRONG_PROJECT"); text(r.generation); decimal(r.revision);
  const raw = r.checkpoint as Record<string, unknown>;
  const checkpoint = object(raw, ["height", "hash", "anchorHash", "status", "undoFloor", ...(raw && Object.hasOwn(raw, "reconcileKind") ? ["reconcileKind"] : [])]);
  requireThat(checkpoint.status === "ready", "WAIT_SOURCE_UNREADY");
  if (checkpoint.reconcileKind !== undefined) requireThat(["source", "reorg", "unknown"].includes(String(checkpoint.reconcileKind)), "INVALID_RECONCILE_KIND");
  height(checkpoint.height); hex(checkpoint.hash, 32); height(checkpoint.undoFloor);
  if (checkpoint.anchorHash !== null) hex(checkpoint.anchorHash, 32);
  requireThat(Number(checkpoint.undoFloor) <= Number(checkpoint.height), "UNKNOWN_RECOVERY_HORIZON");
  if (r.lastCommitAt !== null) utc(r.lastCommitAt);
  const source = object(r.source, ["status", "checkedAt", "prepIndexedHeight", "sourceObservedHeight", "sourceObservedAt"]);
  requireThat(source.status === "available", "WAIT_SOURCE_UNAVAILABLE");
  source.checkedAt = chefSourceTimestamp(source.checkedAt);
  fresh(utc(source.checkedAt), now); height(source.prepIndexedHeight); height(source.sourceObservedHeight); height(source.sourceObservedAt);
  requireThat(Number(source.sourceObservedAt) <= 8_640_000_000_000, "INVALID_SOURCE_TIME");
  fresh(new Date(Number(source.sourceObservedAt) * 1000).toISOString(), now);
  requireThat(Number(source.prepIndexedHeight) >= Number(checkpoint.height) && Number(source.sourceObservedHeight) >= Number(source.prepIndexedHeight), "SOURCE_HEAD_REGRESSION");
  return r as Status;
}
const identity = (status: Status): string => stable([status.project, status.generation, status.revision, status.checkpoint]);

export const noteSelection = "id network txid pool outputIndex blockHeight blockHash valueZat receiverBytes memoHex accountFingerprint scope origin coinbase";
/** Chef 0.6.1 accepts an indexed Int followed by a same-direction ID tie breaker. */
export const chefQuery = `query ZeeSwapNotes($from: Int!, $through: Int!, $after: ID) { ReadableNoteList(first: 100, after: $after, range: {blockHeight: {gte: $from, lte: $through}}, orderBy: [{blockHeight: ASC}, {id: ASC}]) { items { ${noteSelection} } nextCursor } }`;

export function safeEndpoint(input: string): URL {
  const url = new URL(input);
  requireThat(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && (url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)), "UNSAFE_ENDPOINT");
  return url;
}
export async function readJson(response: Response, signal: AbortSignal, maxBytes = 2_000_000): Promise<unknown> {
  requireThat(response.body !== null, "EMPTY_HTTP_BODY");
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; size += part.value.byteLength; requireThat(size <= maxBytes, "HTTP_BACKPRESSURE"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ObservationError("INVALID_HTTP_JSON"); }
}
export type TraversalResult = { status: "READY_SHADOW"; batch: ReplaceRange; historicalWitness?: ChefHistoricalWitness; restarts: number } | { status: "WAIT_RANGE_UNSTABLE" | "WAIT_SOURCE_UNAVAILABLE"; retryAfterMs: number; restarts: number };

export class ChefAdapter {
  private readonly endpoint: URL;
  private readonly now: () => number;
  private readonly monotonic: () => number;
  constructor(private readonly config: ChefConfig) {
    this.endpoint = safeEndpoint(config.url); this.now = config.now ?? Date.now; this.monotonic = config.monotonic ?? (() => performance.now());
    requireThat(config.policy.adapter === "zeer-chef" && config.policy.network === "zcash-testnet" && config.token.length > 0, "INVALID_CHEF_CONFIG");
  }
  private async request(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
    const response = await (this.config.fetch ?? fetch)(new URL(path, this.endpoint), {
      method: body === undefined ? "GET" : "POST", signal, redirect: "error",
      headers: { authorization: `Bearer ${this.config.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 409) { await response.body?.cancel(); throw new ObservationError("CURSOR_INVALIDATED"); }
    if (response.status === 503) { await response.body?.cancel(); throw new ObservationError("WAIT_SOURCE_UNAVAILABLE"); }
    requireThat(response.ok, "CHEF_HTTP_ERROR"); return readJson(response, signal);
  }
  /** Read the complete mutable tail in <=16-block query windows; nothing is published here. */
  async traverse(fromHeight: number, finiteThroughHeight?:number): Promise<TraversalResult> {
    height(fromHeight);if(finiteThroughHeight!==undefined)height(finiteThroughHeight);
    const started = this.monotonic(); const startedAt = new Date(this.now()).toISOString();
    for (let restarts = 0; restarts <= 3; restarts++) {
      const remaining = 30_000 - (this.monotonic() - started);
      if (remaining <= 0) return { status: "WAIT_RANGE_UNSTABLE", retryAfterMs: 5000 + Math.floor(Math.random() * 1000), restarts };
      const signal = AbortSignal.timeout(Math.max(1, Math.floor(remaining)));
      try {
        const before = parseChefStatus(await this.request("/status", signal), this.config.project, this.now());
        const throughHeight = finiteThroughHeight??before.checkpoint.height;
        requireThat(throughHeight<=before.checkpoint.height,"CHEF_FINITE_RANGE_AHEAD");
        requireThat(fromHeight >= this.config.policy.birthday && fromHeight <= throughHeight, "INVALID_RANGE");
        requireThat(throughHeight - fromHeight + 1 <= (this.config.policy.maxBlocks ?? 1000), "BACKPRESSURE");
        const rows: unknown[] = [];
        for (let from = fromHeight; from <= throughHeight; from += 16) {
          const through = Math.min(from + 15, throughHeight); let after: string | null = null;
          const seenCursors = new Set<string>(); let last: { height: number; id: string } | undefined;
          do {
            const response = object(await this.request("/graphql", signal, { query: chefQuery, variables: { from, through, after } }), ["data"]);
            const data = object(response.data, ["ReadableNoteList"]); const page = object(data.ReadableNoteList, ["items", "nextCursor"]);
            requireThat(Array.isArray(page.items) && page.items.length <= 100, "INVALID_PAGE");
            for (const raw of page.items) {
              const row = raw as Record<string, unknown>; const id = text(row.id), h = height(row.blockHeight);
              requireThat(h >= from && h <= through && (!last || h > last.height || h === last.height && id > last.id), "UNORDERED_PAGE");
              last = { height: h, id }; rows.push(raw);
              requireThat(rows.length <= (this.config.policy.maxObservations ?? 1000), "BACKPRESSURE");
            }
            requireThat(page.nextCursor === null || typeof page.nextCursor === "string" && page.nextCursor.length > 0 && page.nextCursor.length <= 2048, "INVALID_CURSOR");
            after = page.nextCursor as string | null;
            if (after !== null) { requireThat(page.items.length > 0 && !seenCursors.has(after), "CURSOR_CYCLE"); seenCursors.add(after); }
          } while (after !== null);
        }
        const after = parseChefStatus(await this.request("/status", signal), this.config.project, this.now());
        if (identity(before) !== identity(after)) throw new ObservationError("CURSOR_INVALIDATED");
        const canonical = await this.config.canonical.sample(signal);
        fresh(utc(canonical.checkedAt), this.now()); requireThat(canonical.sourceId === this.config.policy.canonicalSourceId, "WRONG_CANONICAL_SOURCE");
        const head = parseHeader(canonical.head, this.config.policy.network);
        // Independent providers can observe different fresh tips. Only the
        // independently checked head supplies confirmation coverage; a claimed
        // Prep source tip never substitutes for canonical headers.
        if(head.height < after.checkpoint.height) throw new ObservationError("WAIT_SOURCE_UNAVAILABLE");
        const headers: Header[] = [];
        for (let h = fromHeight; h <= throughHeight; h++) headers.push(parseHeader(await this.config.canonical.header(h, signal), this.config.policy.network));
        const checkpoint=throughHeight===after.checkpoint.height?headers.at(-1)!:parseHeader(await this.config.canonical.header(after.checkpoint.height,signal),this.config.policy.network);
        if(checkpoint.height!==after.checkpoint.height||checkpoint.hash!==after.checkpoint.hash)throw new SourceCheckpointMismatch({height:after.checkpoint.height,hash:after.checkpoint.hash,generation:after.generation,revision:after.revision,project:after.project},checkpoint,this.config.canonical.headerOrigin?.(after.checkpoint.height)??{kind:'unknown'});
        requireChefCanonicalHead(head,await this.config.canonical.header(head.height, signal),'traversal');
        const notes: ZcashNote[] = [];
        for (const value of rows) {
          const r = object(value, noteSelection.split(" "));
          const block = headers[height(r.blockHeight) - fromHeight]; requireThat(block && r.blockHash === block.hash, "CANONICAL_NOTE_MISMATCH");
          let note: ZcashNote = {
            kind: "zcash-note", network: r.network as "zcash-testnet", receiptId: r.id as string, txid: r.txid as string,
            pool: r.pool as ZcashNote["pool"], outputIndex: r.outputIndex as number, block,
            amountAtomic: r.valueZat as string, receiverBytes: r.receiverBytes as string, memoHex: r.memoHex as string,
            accountFingerprint: r.accountFingerprint as string, scope: r.scope as ZcashNote["scope"], origin: r.origin as "unknown", coinbase: r.coinbase as boolean,
            sourcePrivacy: "unknown", privacyEvidenceDigest: digest({ classifier: "unconfigured", txid: r.txid }),
          };
          note = parseObservation(note, this.config.policy) as ZcashNote;
          if (this.config.classify) {
            const classifierInput = structuredClone(note); Object.freeze(classifierInput.block); Object.freeze(classifierInput);
            const result = object(await this.config.classify(classifierInput, signal), ["sourcePrivacy", "privacyEvidenceDigest"]);
            note = { ...note, sourcePrivacy: result.sourcePrivacy as ZcashNote["sourcePrivacy"], privacyEvidenceDigest: result.privacyEvidenceDigest as string };
          }
          notes.push(note);
        }
        requireThat(this.monotonic() - started <= 30_000, "READ_BUDGET");
        const batch: ReplaceRange = { headers, observations: notes, coverage: {
          protocol: "zee-observation-v1", adapter: "zeer-chef", network: this.config.policy.network,
          registryDigest: this.config.policy.registryDigest, projectionDigest: this.config.policy.projectionDigest,
          generation: after.generation, revision: after.revision, fromHeight, through: headers.at(-1)!, complete: true,
          readStartedAt: startedAt, readCompletedAt: new Date(this.now()).toISOString(),
          sourceSampledAt: new Date(Math.min(Date.parse(after.source.checkedAt), after.source.sourceObservedAt * 1000)).toISOString(),
          sourceHead: head, recoveryFloor: after.checkpoint.undoFloor, canonicalCheckAt: canonical.checkedAt,
          canonicalSourceId: canonical.sourceId, contentDigest: contentDigest({ headers, observations: notes }),
        } };
        if (finiteThroughHeight !== undefined) {
          const historicalWitness: ChefHistoricalWitness = { kind: "chef-historical-v1", project: after.project,
            generation: after.generation, revision: after.revision, actualCheckpoint: checkpoint, actualUndoFloor: after.checkpoint.undoFloor,
            selectedFrom: fromHeight, selectedThrough: batch.coverage.through, selectedContentDigest: batch.coverage.contentDigest,
            canonicalSourceId: canonical.sourceId, checkedAt: canonical.checkedAt };
          return { status: "READY_SHADOW", batch: validateChefHistoricalRange(batch, this.config.policy, this.now(), historicalWitness, this.config.project), historicalWitness, restarts };
        }
        return { status: "READY_SHADOW", batch: validateRange(batch, this.config.policy, this.now()), restarts };
      } catch (error) {
        if (error instanceof ObservationError && error.code === "WAIT_SOURCE_UNAVAILABLE") return { status: "WAIT_SOURCE_UNAVAILABLE", retryAfterMs: 5000 + Math.floor(Math.random() * 1000), restarts };
        if (signal.aborted || error instanceof ObservationError && error.code === "CURSOR_INVALIDATED") {
          if (restarts === 3 || signal.aborted) return { status: "WAIT_RANGE_UNSTABLE", retryAfterMs: 5000 + Math.floor(Math.random() * 1000), restarts };
          continue;
        }
        throw error;
      }
    }
    throw new ObservationError("WAIT_RANGE_UNSTABLE");
  }
}
