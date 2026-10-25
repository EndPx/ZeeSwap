import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChefAdapter, chefQuery, parseChefStatus, type CanonicalReader } from "../../src/integrations/observation/chef.ts";
import { canonicalRpc } from "../../src/integrations/observation/canonical-rpc.ts";
import { consumeEnvioExport, exportEnvioRange, type ReadOnlyClient } from "../../src/integrations/observation/envio.ts";
import { ShadowStore, reduceReplacement, type ShadowState } from "../../src/integrations/observation/shadow-store.ts";
import { runShadow } from "../../src/integrations/observation/shadow-cli.ts";
import { businessIdentity, contentDigest, diagnosticEligible, digest, economicIdentity, parseObservation, validateRange, type BaseEvent, type Header, type Policy, type ReplaceRange, type ZcashNote } from "../../src/integrations/observation/types.ts";

const now = Date.parse("2026-10-23T05:00:00.000Z"), stamp = new Date(now).toISOString();
const hash = (n: number, evm = false) => `${evm ? "0x" : ""}${n.toString(16).padStart(64, "0")}`;
const header = (n: number, fork = 0, evm = false): Header => ({ height: n, hash: hash(n + fork, evm), parentHash: hash(n - 1 + fork, evm), time: stamp });
const policy: Policy = { adapter: "zeer-chef", network: "zcash-testnet", registryDigest: hash(1), projectionDigest: hash(2), canonicalSourceId: "independent-testnet-rpc", accountFingerprint: "test-account", birthday: 100 };
const evmPolicy: Policy = { ...policy, adapter: "envio-hyperindex", network: "eip155:84532", contract: `0x${"11".repeat(20)}`, token: `0x${"22".repeat(20)}`, abiDigest: hash(3), contractVersion: "v1" };
function note(index = 0, h = 100, fork = 0): ZcashNote {
  return { kind: "zcash-note", network: "zcash-testnet", receiptId: `receipt-${index}`, txid: hash(index + 1000), pool: "orchard", outputIndex: index, block: header(h, fork), amountAtomic: "5000", receiverBytes: "11".repeat(43), memoHex: "00".repeat(512), accountFingerprint: "test-account", scope: "external", origin: "unknown", coinbase: false, sourcePrivacy: "unknown", privacyEvidenceDigest: hash(9) };
}
function event(index = 0, h = 100): BaseEvent {
  const id = hash(index + 1000, true);
  return { kind: "base-contract-event", chainId: 84532, contract: evmPolicy.contract!, token: evmPolicy.token!, abiDigest: evmPolicy.abiDigest!, txHash: hash(index + 5000, true), transactionIndex: index, logIndex: index, block: header(h, 0, true), event: "Funded", settlementId: id, amountAtomic: "5000", decoded: { id, payer: `0x${"33".repeat(20)}`, amount: "5000", cancellationAvailableAt: "1792736000" } };
}
function batch(rows: ReplaceRange["observations"] = [note()], through = 110, revision = "1", p = policy, fork = 0): ReplaceRange {
  const headers = Array.from({ length: through - 99 }, (_, i) => header(i + 100, fork, p.network === "eip155:84532"));
  return { headers, observations: rows, coverage: { protocol: "zee-observation-v1", adapter: p.adapter, network: p.network, registryDigest: p.registryDigest, projectionDigest: p.projectionDigest, generation: "generation-one", revision, fromHeight: 100, through: headers.at(-1)!, complete: true, readStartedAt: stamp, readCompletedAt: stamp, sourceSampledAt: stamp, sourceHead: header(120, fork, p.network === "eip155:84532"), recoveryFloor: 100, canonicalCheckAt: stamp, canonicalSourceId: p.canonicalSourceId, contentDigest: contentDigest({ headers, observations: rows }) } };
}
function initial(p = policy): ShadowState { return { mode: "SHADOW", version: 1, policyDigest: digest(p), sealedThrough: 99, checkpoint: null, headers: [], occurrences: [], exposures: [], lastBatchDigest: null }; }
const canonical = (evm = false, changes: Partial<CanonicalReader> = {}): CanonicalReader => ({ sample: async () => ({ sourceId: policy.canonicalSourceId, checkedAt: stamp, head: header(120, 0, evm), ...(evm ? { finalized: header(110, 0, true) } : {}) }), header: async h => header(h, 0, evm), ...changes });
test("Chef independent fresh tips may advance or differ, but never cover a checkpoint beyond the canonical head",async()=>{
 for(const [reported,independent] of [[100,101],[120,110],[100,99]]) {
  const current=status();current.source.sourceObservedHeight=reported!;
  const fetcher:typeof fetch=async(input)=>new Response(JSON.stringify(new URL(String(input)).pathname==="/status"?current:{data:{ReadableNoteList:{items:[projection(note())],nextCursor:null}}}),{status:200});
  const result=await new ChefAdapter({url:"http://127.0.0.1:39375",token:"fixture",project:"private-shadow",policy,now:()=>now,fetch:fetcher,
   canonical:canonical(false,{sample:async()=>({sourceId:policy.canonicalSourceId,checkedAt:stamp,head:header(independent!)})})}).traverse(100);
  if(independent!<100){assert.equal(result.status,"WAIT_SOURCE_UNAVAILABLE");continue;}
  assert.equal(result.status,"READY_SHADOW");if(result.status==="READY_SHADOW")assert.equal(result.batch.coverage.sourceHead.height,independent);
 }
});
function status(revision = "1") {
  return { project: "private-shadow", generation: "generation-one", revision, checkpoint: { height: 100, hash: hash(100), anchorHash: hash(99), status: "ready", undoFloor: 99 }, lastCommitAt: stamp, source: { status: "available", checkedAt: stamp, prepIndexedHeight: 100, sourceObservedHeight: 120, sourceObservedAt: now / 1000 } };
}
test("Chef accepts optional 0.7 artifact metadata without relaxing status or source gates", () => {
  const artifact = { packageName: "@zeer-dev/chef", packageVersion: "0.7.0", buildCommit: "a".repeat(40), sourceState: "modified" };
  assert.equal(parseChefStatus(status(), "private-shadow", now).generation, "generation-one");
  assert.equal(parseChefStatus({ ...status(), artifact }, "private-shadow", now).generation, "generation-one");
  assert.doesNotThrow(() => parseChefStatus({ ...status(), artifact: { ...artifact, packageVersion: "unknown", buildCommit: "unknown", sourceState: "unknown" } }, "private-shadow", now));
  for (const malformed of [null, [], {}, { ...artifact, extra: "not-allowed" }, { ...artifact, packageName: "other" },
    { ...artifact, packageVersion: 7 }, { ...artifact, buildCommit: "bad" }, { ...artifact, sourceState: "attested" }]) {
    assert.throws(() => parseChefStatus({ ...status(), artifact: malformed }, "private-shadow", now));
  }
  assert.throws(() => parseChefStatus({ ...status(), artifact, extra: true }, "private-shadow", now), /INVALID_FIELDS/);
  assert.throws(() => parseChefStatus({ ...status(), artifact, checkpoint: { ...status().checkpoint, status: "reconciling" } }, "private-shadow", now), /WAIT_SOURCE_UNREADY/);
  assert.throws(() => parseChefStatus({ ...status(), artifact, source: { ...status().source, sourceObservedAt: now / 1000 - 120 } }, "private-shadow", now), /STALE_SOURCE/);
});
function projection(n: ZcashNote) {
  return { id: n.receiptId, network: n.network, txid: n.txid, pool: n.pool, outputIndex: n.outputIndex, blockHeight: n.block.height, blockHash: n.block.hash, valueZat: n.amountAtomic, receiverBytes: n.receiverBytes, memoHex: n.memoHex, accountFingerprint: n.accountFingerprint, scope: n.scope, origin: n.origin, coinbase: n.coinbase };
}
async function privateStore() {
  const root = await mkdtemp(join(tmpdir(), "zee-shadow-"));
  const path = join(root, ".deploy-local", "observation-shadow", "mirror.json");
  return { store: new ShadowStore(path, policy), path, close: () => rm(root, { recursive: true, force: true }) };
}
test("A01 real Chef HTTP: 205 same-height rows use all opaque cursors with exact 0.6.1 wire shape", async () => {
  const rows = Array.from({ length: 205 }, (_, i) => projection({ ...note(i), receiptId: `random-${digest(i).slice(0, 20)}` })).sort((a, b) => a.id < b.id ? -1 : 1);
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer fixture-token");
    res.setHeader("content-type", "application/json");
    if (req.url === "/status") { res.end(JSON.stringify(status())); return; }
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    assert.equal(request.query, chefQuery);
    const vars = request.variables; assert.equal(vars.from, 100); assert.equal(vars.through, 100);
    const offset = vars.after === null ? 0 : vars.after === "opaque.first" ? 100 : vars.after === "opaque.second" ? 200 : -1;
    assert.notEqual(offset, -1);
    res.end(JSON.stringify({ data: { ReadableNoteList: { items: rows.slice(offset, offset + 100), nextCursor: offset === 0 ? "opaque.first" : offset === 100 ? "opaque.second" : null } } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const result = await new ChefAdapter({ url: `http://127.0.0.1:${address.port}`, token: "fixture-token", project: "private-shadow", policy, canonical: canonical(), now: () => now }).traverse(100);
    assert.equal(result.status, "READY_SHADOW"); if (result.status !== "READY_SHADOW") return;
    assert.equal(result.batch.observations.length, 205); assert.equal(new Set(result.batch.observations.map(economicIdentity)).size, 205);
    assert.equal(requests.length, 3); assert.deepEqual(requests.map(r => (r.variables as { after: unknown }).after), [null, "opaque.first", "opaque.second"]);
    assert.match(chefQuery, /orderBy: \[\{blockHeight: ASC\}, \{id: ASC\}\]/);
    assert.ok(result.batch.observations.every(r => r.kind === "zcash-note" && r.sourcePrivacy === "unknown"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("A02 revision changes after a page: staging is discarded and a new revision is traversed", async () => {
  let revision = "1", pages = 0, invalidated = false;
  const fetcher = (async (input, init) => {
    if (String(input).endsWith("/status")) return Response.json(status(revision));
    pages++;
    const payload = JSON.parse(String(init?.body));
    if (!invalidated && payload.variables.after !== null) { revision = "2"; invalidated = true; return new Response(null, { status: 409 }); }
    return Response.json({ data: { ReadableNoteList: { items: [projection(note(invalidated ? 9 : 0))], nextCursor: invalidated ? null : "opaque" } } });
  }) as typeof fetch;
  const result = await new ChefAdapter({ url: "http://localhost", token: "token", project: "private-shadow", policy, canonical: canonical(), now: () => now, fetch: fetcher }).traverse(100);
  assert.equal(result.status, "READY_SHADOW"); if (result.status !== "READY_SHADOW") return;
  assert.equal(result.restarts, 1); assert.equal(result.batch.coverage.revision, "2"); assert.deepEqual(result.batch.observations.map(economicIdentity), [economicIdentity(note(9))]); assert.equal(pages, 3);
});
test("A02 end status revision change discards complete staged pages", async () => {
  let calls = 0;
  const fetcher = (async (input) => String(input).endsWith("/status") ? Response.json(status(String(++calls))) : Response.json({ data: { ReadableNoteList: { items: [], nextCursor: null } } })) as typeof fetch;
  const result = await new ChefAdapter({ url: "http://localhost", token: "token", project: "private-shadow", policy, canonical: canonical(), now: () => now, fetch: fetcher }).traverse(100);
  assert.equal(result.status, "WAIT_RANGE_UNSTABLE"); assert.equal(result.restarts, 3); assert.equal(calls, 8);
});
test("A03 repeated 409 and 503 are bounded waits, with no store publication", async () => {
  for (const statusCode of [409, 503]) {
    let calls = 0;
    const fetcher = (async () => { calls++; return new Response(null, { status: statusCode }); }) as typeof fetch;
    const result = await new ChefAdapter({ url: "http://localhost", token: "token", project: "private-shadow", policy, canonical: canonical(), now: () => now, fetch: fetcher }).traverse(100);
    assert.equal(result.status, statusCode === 409 ? "WAIT_RANGE_UNSTABLE" : "WAIT_SOURCE_UNAVAILABLE"); assert.ok(calls <= 4);
    assert.ok(result.retryAfterMs >= 5000 && result.retryAfterMs < 6000);
  }
});
test("A04 shorter canonical branch invalidates previously seen suffix without deleting audit history", () => {
  const before = reduceReplacement(initial(), batch([note(1, 110)]), policy, now);
  const after = reduceReplacement(before, batch([], 105, "2"), policy, now);
  assert.equal(after.checkpoint!.through.height, 105); assert.equal(after.occurrences.length, 1); assert.equal(after.occurrences[0]!.canonical, false);
});
test("A05 same tx/output reinclusion attaches a new occurrence under one economic deposit", () => {
  const original = note(2, 110), included = { ...original, receiptId: "new-receipt-after-key-rotation", block: header(105) };
  assert.equal(economicIdentity({ ...original, accountFingerprint: "rotated-key" }), economicIdentity(original));
  const before = reduceReplacement(initial(), batch([original]), policy, now);
  const after = reduceReplacement(before, batch([included], 105, "2"), policy, now);
  assert.equal(after.occurrences.length, 2); assert.equal(after.occurrences.filter(r => r.canonical).length, 1);
  assert.equal(new Set(after.occurrences.map(r => economicIdentity(r.row))).size, 1);
  assert.throws(() => parseObservation({ ...included, accountFingerprint: "unexpected-key" }, policy), /WRONG_ACCOUNT/);
});
test("A06 fresh status timestamp cannot renew cached upstream liveness", () => {
  const stale = status(); stale.source.sourceObservedAt -= 61;
  assert.throws(() => parseChefStatus(stale, "private-shadow", now), /STALE_SOURCE/);
  const staleFollower = status(); staleFollower.source.checkedAt = new Date(now - 61_000).toISOString();
  assert.throws(() => parseChefStatus(staleFollower, "private-shadow", now), /STALE_SOURCE/);
});
test("A07 missing block hash, privacy and completeness refuse readiness; unknown privacy stays diagnostic", () => {
  for (const mutate of [(b: any) => delete b.observations[0].block.hash, (b: any) => delete b.observations[0].sourcePrivacy, (b: any) => b.coverage.complete = false]) {
    const b = batch(); mutate(b); assert.throws(() => validateRange(b, policy, now));
  }
  const b = batch(); assert.equal(diagnosticEligible(b.observations[0]!, b, now), false);
  const shielded = { ...note(), sourcePrivacy: "shielded" as const }; const complete = batch([shielded]);
  assert.equal(diagnosticEligible(shielded, complete, now), true); assert.equal(diagnosticEligible(shielded, complete, now + 61_000), false);
});
function coherent(b: ReplaceRange) { return { protocol: "zee-envio-export-v1", isolation: "repeatable-read-read-only", snapshotToken: "opaque-token", expiresAt: new Date(now + 30_000).toISOString(), batch: b }; }
test("A08 Envio coherent export rejects mixed deletion/reorg headers and ordinary GraphQL rows", async () => {
  const b = batch([event()], 110, "1", evmPolicy);
  await assert.rejects(consumeEnvioExport({ data: { Funded: [event()] } }, evmPolicy, canonical(true), now), /INVALID_FIELDS/);
  await assert.rejects(consumeEnvioExport(coherent(b), evmPolicy, canonical(true, { header: async h => header(h, h === 100 ? 1 : 0, true) }), now), /CANONICAL_HEADER_MISMATCH/);
  const accepted = await consumeEnvioExport(coherent(b), evmPolicy, canonical(true), now);
  const before = reduceReplacement(initial(evmPolicy), accepted, evmPolicy, now);
  const empty = await consumeEnvioExport(coherent(batch([], 110, "2", evmPolicy)), evmPolicy, canonical(true), now);
  const after = reduceReplacement(before, empty, evmPolicy, now); assert.equal(after.occurrences[0]!.canonical, false);
});
test("A09 canonical complete empty replacement is valid; bad amounts, tokens, extra fields and digest reject", () => {
  assert.equal(validateRange(batch([]), policy, now).observations.length, 0);
  for (const amount of ["01", "-1", "1.0", "1e3", "2100000000000001"]) assert.throws(() => parseObservation({ ...note(), amountAtomic: amount }, policy), /INVALID_AMOUNT/);
  assert.throws(() => parseObservation({ ...event(), token: `0x${"44".repeat(20)}` }, evmPolicy), /WRONG_CONTRACT_TOKEN_ABI/);
  assert.throws(() => parseObservation({ ...note(), privateKey: "must-never-be-accepted" }, policy), /INVALID_FIELDS/);
  const bad = batch(); bad.observations[0]!.amountAtomic = "6000"; assert.throws(() => validateRange(bad, policy, now), /CONTENT_DIGEST_MISMATCH/);
  const committed = { ...event(), event: "PayoutCommitted", amountAtomic: null, decoded: { id: event().settlementId! } };
  assert.equal(parseObservation(committed, evmPolicy).amountAtomic, null);
});
test("A10 finalized head behind receipt exposes progress only and unknown finality refuses", () => {
  const row = event(1, 110), b = batch([row], 110, "1", evmPolicy);
  assert.equal(diagnosticEligible(row, b, now), false); assert.equal(diagnosticEligible(row, b, now, header(109, 0, true)), false);
  assert.equal(diagnosticEligible(row, b, now, header(110, 0, true)), true);
});
test("A11 crash before/after atomic rename preserves all old or all new state; replay and CAS", async () => {
  const s = await privateStore();
  try {
    const first = await s.store.publish(batch(), null, now), expected = digest(first.checkpoint);
    const oldBytes = await readFile(s.path, "utf8");
    await assert.rejects(s.store.publish(batch([], 105, "2"), expected, now, new Map(), phase => { if (phase === "before-rename") throw Error("crash"); }), /crash/);
    assert.equal(await readFile(s.path, "utf8"), oldBytes);
    await assert.rejects(s.store.publish(batch([], 105, "2"), expected, now, new Map(), phase => { if (phase === "after-rename") throw Error("crash"); }), /crash/);
    const recovered = await s.store.read(); assert.equal(recovered.checkpoint!.revision, "2"); assert.equal(recovered.occurrences[0]!.canonical, false);
    const replay = await s.store.publish(batch([], 105, "2"), digest(recovered.checkpoint), now); assert.equal(replay.occurrences.length, 1);
    await assert.rejects(s.store.publish(batch(), expected, now), /CHECKPOINT_CHANGED/);
  } finally { await s.close(); }
});
test("A12 sealed-history fork, generation reset, lower floor and incomplete tail explicitly block", () => {
  const first = batch(); first.coverage.recoveryFloor = 105;
  const before = reduceReplacement(initial(), first, policy, now); assert.equal(before.sealedThrough, 104);
  const reset = batch([], 110, "2"); reset.coverage.generation = "different";
  assert.throws(() => reduceReplacement(before, reset, policy, now), /BLOCK_GENERATION_CHANGED/);
  assert.throws(() => reduceReplacement(before, batch([], 110, "2"), policy, now), /BLOCK_RECOVERY_FLOOR_REGRESSION/);
  const incomplete = batch([], 110, "2"); incomplete.coverage.recoveryFloor = 105;
  assert.throws(() => reduceReplacement(before, incomplete, policy, now), /INCOMPLETE_MUTABLE_TAIL/);
  const deep = batch([], 110, "2", policy, 1); deep.coverage.fromHeight = 105; deep.coverage.recoveryFloor = 105; deep.headers = deep.headers.slice(5); deep.coverage.contentDigest = contentDigest(deep);
  assert.throws(() => reduceReplacement(before, deep, policy, now), /BLOCK_DEEP_REORG/);
});
test("A13 source orphan after delivered customer creates exposure; no payment/outcome is removed or repeated", () => {
  const row = note(); const before = reduceReplacement(initial(), batch([row]), policy, now);
  const journal = new Map([[businessIdentity(row), "delivered" as const]]);
  const after = reduceReplacement(before, batch([], 110, "2"), policy, now, journal);
  assert.equal(after.exposures.length, 1); assert.equal(after.exposures[0]!.effect, "delivered"); assert.equal(journal.get(businessIdentity(row)), "delivered");
  const replay = reduceReplacement(after, batch([], 110, "2"), policy, now, journal); assert.equal(replay.exposures.length, 1);
});
test("A14 observation and retained-anchor limits refuse full batch without truncating", () => {
  assert.throws(() => validateRange(batch([note(), note(1)]), { ...policy, maxObservations: 1 }, now), /BACKPRESSURE/);
  assert.throws(() => validateRange(batch([]), { ...policy, maxBlocks: 10 }, now), /BACKPRESSURE/);
  const p = { ...policy, maxHistory: 1 }; const before = reduceReplacement(initial(p), batch([note()]), p, now);
  assert.throws(() => reduceReplacement(before, batch([note(1)], 110, "2"), p, now), /BACKPRESSURE_HISTORY/);
});
test("Envio reinclusion may change log index, but retains same transition identity and exposure", () => {
  const original = event(); const before = reduceReplacement(initial(evmPolicy), batch([original], 110, "1", evmPolicy), evmPolicy, now);
  const reincluded = { ...original, logIndex: 7, block: header(105, 0, true) };
  const after = reduceReplacement(before, batch([reincluded], 110, "2", evmPolicy), evmPolicy, now, new Map([[businessIdentity(original), "delivered" as const]]));
  assert.equal(after.occurrences.filter(e => e.canonical).length, 1); assert.equal(businessIdentity(original), businessIdentity(reincluded)); assert.equal(after.exposures.length, 1);
  assert.throws(() => reduceReplacement(initial(evmPolicy), batch([original, reincluded], 110, "1", evmPolicy), evmPolicy, now), /CONFLICTING_BUSINESS_EFFECT/);
});
test("V2 EscrowAborted requires explicit V2 policy and exact event schema", () => {
  const row = { ...event(), event: "EscrowAborted", decoded: { id: event().settlementId!, refundRecipient: `0x${"33".repeat(20)}`, amount: "5000", nonce: "1", recoveryProofDigest: hash(8, true) } };
  assert.throws(() => parseObservation(row, evmPolicy), /V2_EVENT_DISABLED/);
  assert.equal((parseObservation(row, { ...evmPolicy, contractVersion: "v2" }) as BaseEvent).event, "EscrowAborted");
});
test("strict UTC, future liveness, duplicate notes, wrong consensus and arbitrary RPC calls refuse", async () => {
  const b = batch(); b.coverage.sourceSampledAt = "2026-02-30T05:00:00.000Z"; assert.throws(() => validateRange(b, policy, now), /INVALID_UTC/);
  const future = batch(); future.coverage.sourceSampledAt = new Date(now + 6000).toISOString(); assert.throws(() => validateRange(future, policy, now), /STALE_SOURCE/);
  assert.throws(() => validateRange(batch([note(), note()]), policy, now), /DUPLICATE_ECONOMIC_OUTPUT/);
  const methods: string[] = [];
  const rpc = canonicalRpc({ url: "http://localhost", network: "zcash-testnet", sourceId: "rpc", consensusBranchId: "12345678", fetch: (async (_u, init) => { const call = JSON.parse(String(init?.body)); methods.push(call.method); return Response.json({ id: 1, result: { chain: "main", consensus: { chaintip: "12345678" } } }); }) as typeof fetch });
  await assert.rejects(rpc.sample(AbortSignal.timeout(1000)), /WRONG_RPC_NETWORK_OR_BRANCH/); assert.deepEqual(methods, ["getblockchaininfo"]);
});
test("Envio exporter uses one read-only repeatable-read snapshot and bounds every SQL statement", async () => {
  const queries: string[] = [], b = batch([event()], 110, "1", evmPolicy);
  const mock = { query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("current_setting")) return { rows: [{ isolation: "repeatable read", read_only: "on" }] };
    if (sql.includes('"checkpoints"')) return { rows: [{ payload: { generation: b.coverage.generation, revision: "1", through: b.coverage.through, recoveryFloor: 100, sourceSampledAt: stamp, sourceHead: b.coverage.sourceHead, projectionDigest: evmPolicy.projectionDigest, registryDigest: evmPolicy.registryDigest, complete: true } }] };
    if (sql.includes('"headers"')) return { rows: b.headers.map(payload => ({ payload })) };
    if (sql.includes('"events"')) return { rows: b.observations.map(payload => ({ id: "one", block_height: 100, transaction_index: 0, log_index: 0, payload })) };
    return { rows: [] };
  } } as unknown as ReadOnlyClient;
  const result = await exportEnvioRange(mock, { schema: "shadow", checkpointTable: "checkpoints", headersTable: "headers", eventsTable: "events", streamId: "test" }, evmPolicy, 100, () => now);
  assert.equal(result.batch.observations.length, 1); assert.equal(queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(queries.at(-1), "COMMIT");
  assert.ok(queries.includes("SET LOCAL statement_timeout = '30000ms'")); assert.ok(queries.includes("SET LOCAL idle_in_transaction_session_timeout = '30000ms'"));
  assert.ok(queries.some(q => q.includes("transaction_index, log_index, id") && q.includes("LIMIT 100")));
  await assert.rejects(exportEnvioRange(mock, { schema: "unsafe;DROP", checkpointTable: "x", headersTable: "x", eventsTable: "x", streamId: "test" }, evmPolicy, 100), /INVALID_SQL_IDENTIFIER/);
});
test("Envio export expiration during canonical network calls cannot publish", async () => {
  let clock = 0;
  const source = canonical(true, { header: async h => { clock += 3100; return header(h, 0, true); } });
  await assert.rejects(consumeEnvioExport(coherent(batch([event()], 110, "1", evmPolicy)), evmPolicy, source, now, AbortSignal.timeout(1000), () => clock), /READ_BUDGET|SNAPSHOT_EXPIRED/);
});
test("SHADOW config rejects signing mode and private store rejects public path", async () => {
  await assert.rejects(runShadow({ mode: "LIVE" }), /INVALID_FIELDS/);
  assert.throws(() => new ShadowStore(join(tmpdir(), "wallet.json"), policy), /PRIVATE_SHADOW_PATH_REQUIRED/);
});
test("one-shot SHADOW CLI runs real authenticated Chef HTTP + read-only zcashd RPC + atomic private mirror", async () => {
  const timestamp = new Date().toISOString(), seconds = Math.floor(Date.parse(timestamp) / 1000);
  const calls: string[] = [], statuses: string[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/status") {
      assert.equal(req.headers.authorization, "Bearer fixture-token");
      const source = status(); source.lastCommitAt = timestamp; source.source.checkedAt = timestamp; source.source.sourceObservedAt = seconds;
      res.end(JSON.stringify(source)); return;
    }
    let raw = ""; for await (const chunk of req) raw += chunk; const payload = JSON.parse(raw);
    if (req.url === "/graphql") {
      assert.equal(req.headers.authorization, "Bearer fixture-token");
      res.end(JSON.stringify({ data: { ReadableNoteList: { items: [projection(note())], nextCursor: null } } })); return;
    }
    assert.equal(req.headers.authorization, "Basic fixture-authorization");
    const method = payload.method; calls.push(method);
    let result;
    if (method === "getblockchaininfo") result = { chain: "test", blocks: 120, bestblockhash: hash(120), consensus: { chaintip: "12345678" } };
    else if (method === "getblockhash") result = hash(payload.params[0]);
    else if (method === "getblockheader") { const h = Number(BigInt(`0x${payload.params[0]}`)); result = { hash: hash(h), height: h, previousblockhash: hash(h - 1), time: seconds }; }
    else assert.fail(`Forbidden RPC method ${method}`);
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  const s = await privateStore(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const config = { mode: "SHADOW", policy, storePath: s.path, sourceUrl: url, tokenEnv: "TEST_CHEF_TOKEN", project: "private-shadow", canonicalRpcUrl: url, canonicalAuthorizationEnv: "TEST_RPC_AUTH", consensusBranchId: "12345678" };
    for (let n = 0; n < 2; n++) {
      const result = await runShadow(config, { TEST_CHEF_TOKEN: "fixture-token", TEST_RPC_AUTH: "Basic fixture-authorization" });
      statuses.push(String(result.status)); assert.equal(result.financialDispatchEnabled, false); assert.equal(result.canonicalObservations, 1);
    }
    assert.deepEqual(statuses, ["PUBLISHED_PRIVATE_MIRROR", "PUBLISHED_PRIVATE_MIRROR"]);
    const recovered = await s.store.read(); assert.equal(recovered.occurrences.length, 1); assert.equal((recovered.occurrences[0]!.row as ZcashNote).sourcePrivacy, "unknown");
    assert.ok(calls.length > 0 && calls.every(method => ["getblockchaininfo", "getblockhash", "getblockheader"].includes(method)));
    assert.ok(!JSON.stringify(statuses).includes(note().memoHex));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await s.close(); }
});
