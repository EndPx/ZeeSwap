import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { readJson, safeEndpoint, type CanonicalReader } from "./chef.ts";
import { contentDigest, fresh, height, object, parseHeader, requireThat, stable, text, utc, validateRange, type Policy, type ReplaceRange } from "./types.ts";

export type CoherentExport = {
  protocol: "zee-envio-export-v1"; isolation: "repeatable-read-read-only";
  snapshotToken: string; expiresAt: string; batch: ReplaceRange;
};
/** This is a ZeeSwap-owned export protocol, NOT a claimed HyperIndex endpoint. */
export async function consumeEnvioExport(value: unknown, policy: Policy, canonical: CanonicalReader, now = Date.now(), signal = AbortSignal.timeout(30_000), clock: () => number = () => performance.now(), verificationSourceId = policy.canonicalSourceId): Promise<ReplaceRange> {
  const localStarted = clock();
  const r = object(value, ["protocol", "isolation", "snapshotToken", "expiresAt", "batch"]);
  requireThat(policy.adapter === "envio-hyperindex" && r.protocol === "zee-envio-export-v1" && r.isolation === "repeatable-read-read-only", "COHERENT_EXPORT_REQUIRED");
  text(r.snapshotToken); requireThat(Date.parse(utc(r.expiresAt)) > now && Date.parse(r.expiresAt as string) <= now + 60_000, "SNAPSHOT_EXPIRED");
  const batch = validateRange(r.batch, policy, now);
  const sample = await canonical.sample(signal);
  fresh(sample.checkedAt, now); requireThat(sample.sourceId === verificationSourceId, "WRONG_CANONICAL_SOURCE");
  const head = parseHeader(sample.head, policy.network);
  requireThat(head.height >= batch.coverage.sourceHead.height && head.height >= batch.coverage.through.height, "SOURCE_HEAD_REGRESSION");
  requireThat(stable(await canonical.header(batch.coverage.sourceHead.height, signal)) === stable(batch.coverage.sourceHead), "SOURCE_HASH_CONFLICT");
  // Network latency must fit the same 30s budget even for the retained reorg
  // tail. Bound parallel reads; every header still gets an exact comparison.
  const pageSize = canonical.headers ? canonical.headerBatchSize??50 : 8;
  requireThat(Number.isSafeInteger(pageSize)&&pageSize>=1&&pageSize<=50,'CANONICAL_BATCH_LIMIT');
  for (let index = 0; index < batch.headers.length; index += pageSize*(canonical.headers?2:1)) {
    const expected = batch.headers.slice(index,index+pageSize*(canonical.headers?2:1));
    let actual;
    if(canonical.headers){
      // At most two batches overlap network latency. The canonical client's
      // method limiter still paces every request/retry; drain both on failure.
      const pages=[expected.slice(0,pageSize),expected.slice(pageSize)].filter(page=>page.length);
      const reads=await Promise.allSettled(pages.map(page=>canonical.headers!(page.map(header=>header.height),signal)));
      const failed=reads.find(read=>read.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
      actual=reads.flatMap(read=>read.status==='fulfilled'?read.value:[]);
    }else actual=await Promise.all(expected.map(header=>canonical.header(header.height,signal)));
    requireThat(actual.length===expected.length && actual.every((header,i)=>stable(header)===stable(expected[i])), "CANONICAL_HEADER_MISMATCH");
  }
  requireThat(sample.finalized !== undefined, "FINALIZED_HEADER_REQUIRED");
  const finalized = parseHeader(sample.finalized, policy.network);
  requireThat(finalized.height <= head.height && stable(await canonical.header(finalized.height, signal)) === stable(finalized), "FINALIZED_HEADER_CONFLICT");
  // Keep the producer's source freshness. Canonical validation does not relabel stale input.
  batch.coverage.canonicalCheckAt = sample.checkedAt;
  signal.throwIfAborted(); const completed = now + clock() - localStarted;
  requireThat(completed - Date.parse(batch.coverage.readStartedAt) <= 30_000, "READ_BUDGET");
  requireThat(Date.parse(r.expiresAt as string) > completed, "SNAPSHOT_EXPIRED");
  return validateRange(batch, policy, completed);
}
export async function fetchEnvioExport(url: string, token: string, fromHeight: number, policy: Policy, canonical: CanonicalReader, now = Date.now(), fetcher: typeof fetch = fetch, verificationSourceId = policy.canonicalSourceId): Promise<ReplaceRange> {
  const started = performance.now();
  const endpoint = safeEndpoint(url); height(fromHeight); requireThat(token.length > 0, "AUTH_REQUIRED");
  const signal = AbortSignal.timeout(30_000);
  const response = await fetcher(new URL(`/zee-observation/export?from=${fromHeight}`, endpoint), { headers: { authorization: `Bearer ${token}` }, redirect: "error", signal });
  requireThat(response.ok, response.status === 409 || response.status === 503 ? "WAIT_ENVIO_EXPORT" : "ENVIO_HTTP_ERROR");
  const payload = await readJson(response, signal, 8_000_000);
  const batch = await consumeEnvioExport(payload, policy, canonical, now + performance.now() - started, signal, undefined, verificationSourceId);
  requireThat(batch.coverage.fromHeight === fromHeight, "EXPORT_RANGE_MISMATCH"); return batch;
}

/** Explicit local schema contract. These tables/views must be maintained by a
 * reviewed indexer integration in the SAME transaction as its rollback state.
 * An ordinary live GraphQL event table does not satisfy this contract.
 * No default table names are assumed for an upstream HyperIndex deployment. */
export type EnvioExportSchema = { schema: string; checkpointTable: string; headersTable: string; eventsTable: string; streamId: string };
const identifier = (value: string): string => { requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(value), "INVALID_SQL_IDENTIFIER"); return `"${value}"`; };
export interface ReadOnlyClient { query: PoolClient["query"] }

/** Caller must provide a dedicated SELECT-only DB principal/connection. The
 * adapter executes no DDL, migration, producer write or payment operation. */
export async function exportEnvioRange(client: ReadOnlyClient, schema: EnvioExportSchema, policy: Policy, fromHeight: number, now = Date.now): Promise<CoherentExport> {
  requireThat(policy.adapter === "envio-hyperindex", "WRONG_ADAPTER"); height(fromHeight); text(schema.streamId);
  const table = (name: string) => `${identifier(schema.schema)}.${identifier(name)}`;
  const checkpointTable = table(schema.checkpointTable), headersTable = table(schema.headersTable), eventsTable = table(schema.eventsTable);
  const started = now(); let began = false;
  const query = async (sql: string, values: unknown[]): Promise<QueryResult<QueryResultRow>> => {
    const remaining = Math.floor(30_000 - (now() - started)); requireThat(remaining > 0 && remaining <= 30_000, "READ_BUDGET");
    await client.query(`SET LOCAL statement_timeout = '${remaining}ms'`);
    return client.query(sql, values);
  };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
    await client.query("SET LOCAL statement_timeout = '30000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30000ms'");
    const settings = await query("SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS read_only", []);
    requireThat(settings.rows.length === 1 && settings.rows[0].isolation === "repeatable read" && settings.rows[0].read_only === "on", "READ_ONLY_SNAPSHOT_REQUIRED");
    const stateRows = await query(`SELECT payload FROM ${checkpointTable} WHERE stream_id = $1`, [schema.streamId]);
    requireThat(stateRows.rows.length === 1, "COHERENT_CHECKPOINT_REQUIRED");
    const state = object(stateRows.rows[0].payload, ["generation", "revision", "through", "recoveryFloor", "sourceSampledAt", "sourceHead", "projectionDigest", "registryDigest", "complete"]);
    requireThat(state.complete === true && state.projectionDigest === policy.projectionDigest && state.registryDigest === policy.registryDigest, "COHERENT_CHECKPOINT_REQUIRED");
    const through = parseHeader(state.through, policy.network); requireThat(through.height >= fromHeight && through.height - fromHeight + 1 <= (policy.maxBlocks ?? 1000), "BACKPRESSURE");
    const headerRows = await query(`SELECT payload FROM ${headersTable} WHERE stream_id = $1 AND block_height >= $2 AND block_height <= $3 ORDER BY block_height ASC LIMIT $4`, [schema.streamId, fromHeight, through.height, (policy.maxBlocks ?? 1000) + 1]);
    // All keyset pages share this transaction's MVCC snapshot, including deletes/reorgs.
    const observations: ReplaceRange["observations"] = []; let last: [number, number, number, string] | null = null;
    for (;;) {
      const page = await query(`SELECT id, block_height, transaction_index, log_index, payload FROM ${eventsTable} WHERE stream_id = $1 AND block_height >= $2 AND block_height <= $3 AND ($4::bigint IS NULL OR (block_height, transaction_index, log_index, id) > ($4, $5, $6, $7)) ORDER BY block_height, transaction_index, log_index, id LIMIT 100`, [schema.streamId, fromHeight, through.height, last?.[0] ?? null, last?.[1] ?? null, last?.[2] ?? null, last?.[3] ?? null]);
      requireThat(page.rows.length <= 100, "INVALID_EXPORT_PAGE");
      for (const row of page.rows) {
        const h = height(Number(row.block_height)), tx = height(Number(row.transaction_index)), log = height(Number(row.log_index)), id = text(row.id);
        requireThat(h >= fromHeight && h <= through.height && (!last || h > last[0] || h === last[0] && (tx > last[1] || tx === last[1] && (log > last[2] || log === last[2] && id > last[3]))), "UNORDERED_EXPORT");
        requireThat(row.payload?.block?.height === h && row.payload?.transactionIndex === tx && row.payload?.logIndex === log, "EXPORT_POSITION_MISMATCH");
        last = [h, tx, log, id]; observations.push(row.payload);
        requireThat(observations.length <= (policy.maxObservations ?? 1000), "BACKPRESSURE");
      }
      if (page.rows.length < 100) break;
    }
    const headers = headerRows.rows.map(row => parseHeader(row.payload, policy.network));
    const completed = now(); requireThat(completed - started <= 30_000, "READ_BUDGET");
    const batch = validateRange({ headers, observations, coverage: {
      protocol: "zee-observation-v1", adapter: policy.adapter, network: policy.network, registryDigest: policy.registryDigest,
      projectionDigest: policy.projectionDigest, generation: state.generation, revision: state.revision, fromHeight, through,
      complete: true, readStartedAt: new Date(started).toISOString(), readCompletedAt: new Date(completed).toISOString(),
      sourceSampledAt: state.sourceSampledAt, sourceHead: state.sourceHead, recoveryFloor: state.recoveryFloor,
      // Unvalidated at producer: consumer MUST independently check canonical headers before publication.
      canonicalCheckAt: state.sourceSampledAt, canonicalSourceId: policy.canonicalSourceId, contentDigest: contentDigest({ headers, observations }),
    } }, policy, completed);
    await client.query("COMMIT"); began = false;
    return { protocol: "zee-envio-export-v1", isolation: "repeatable-read-read-only", snapshotToken: randomUUID(), expiresAt: new Date(completed + 30_000).toISOString(), batch };
  } finally { if (began) await client.query("ROLLBACK"); }
}
