import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executionProfileDigest, validateExecutionProfile, applyExecutionProfile, verifyCanonicalReorg } from './runtime.mjs';
import { catchupPayloadClient } from '../../indexers/zeer/bounded-prep-client.mjs';

const sdkRoot = resolve('indexers/zeer/node_modules/@zeer-dev/chef/dist');
const { main } = await import(pathToFileURL(resolve(sdkRoot, 'cli.js')));
const { loadProject, projectFingerprint } = await import(pathToFileURL(resolve(sdkRoot, 'project.js')));
const { syncStep } = await import(pathToFileURL(resolve(sdkRoot, 'runtime.js')));
const { receiptId } = await import(pathToFileURL(resolve(sdkRoot, 'receipts.js')));
const { PrepError, PrepClient } = await import(pathToFileURL(resolve('indexers/zeer/node_modules/@zeer-dev/prep-client/src/index.js')));
const { projectNote } = await import(pathToFileURL(resolve('indexers/zeer/projection.ts')));
const h = n => n.toString(16).padStart(64, '0'), fp = 'b'.repeat(64);
const block = height => ({ height, hash: h(height), previous_hash: h(height - 1), time: 1700000000 });
function pins(n = 16) {
  const p = { version: 1, purpose: 'REVIEWED_BOUNDED_CATCHUP', pageSize: n, batchSize: n, maxPayloadBlocks: n, dispatchIntervalMs: 600 };
  p.digest = executionProfileDigest(fp, p);
  return { projectFingerprint: fp, maxPayloadBlocks: n, prepDispatchIntervalMs: 600, executionProfile: p };
}
function source(end = 300) { return { network: 'testnet', payload_kind: 'full-v1', source_mode: 'follower', ready: true,
  source_observed_at: 1800000000, source_height: end, indexed_height: end, archive_height: end, start_block: 1, epoch: '35', lag_blocks: 0 }; }
function transport(end = 300, transactions = false) {
  return { getHeight: async () => source(end), get: async q => ({ network: 'testnet', epoch: '35', from_block: q.from_block,
    to_block: q.to_block, next_block: q.to_block, data: { blocks: Array.from({ length: q.to_block - q.from_block }, (_, i) => block(q.from_block + i)),
      transactions: transactions ? Array.from({ length: q.to_block - q.from_block }, (_, i) => ({ txid: h(q.from_block + i), block_height: q.from_block + i,
        index: 0, version: 1, locktime: 0, raw: '00' })) : [] } }) };
}
function memoryStore(kind = 'reorg') {
  let cp = { height: 99, hash: h(99), anchorHash: h(0), undoFloor: 99, status: 'reconciling', reconcileKind: kind };
  let entities = new Map(), history = new Map(); const groups = [], committed = [];
  const store = { groups, committed, get entities() { return entities; }, checkpoint: async () => ({ ...cp }),
    acquire: async () => {}, close: async () => {}, recordSourceObservation: async () => {},
    markReconciling: async kind => { cp.status = 'reconciling'; cp.reconcileKind = kind ?? 'reorg'; },
    markReady: async () => { cp.status = 'ready'; delete cp.reconcileKind; },
    blockHash: async height => h(height),
    rollback: async height => { const saved = history.get(height); assert.ok(saved); cp = { ...saved.cp }; entities = new Map(saved.entities); },
    async applyBatch(blocks, handler) {
      const before = { cp: { ...cp }, entities: new Map(entities), history: new Map(history) };
      try {
        for (const b of blocks) {
          assert.equal(b.height, cp.height + 1); assert.equal(b.previousHash, cp.hash);
          await handler(b, { set: async (_name, data) => { entities.set(data.id, data); } });
          cp.height = b.height; cp.hash = b.hash; history.set(b.height, { cp: { ...cp }, entities: new Map(entities) });
        }
        groups.push(blocks.length); committed.push(...blocks.map(b => b.height));
      } catch (error) { cp = before.cp; entities = before.entities; history = before.history; throw error; }
    },
    async apply(b, handler) { return store.applyBatch([b], (_b, entities) => handler(entities)); },
  };
  return store;
}

test('strict independent catchup profile digest admits only paired 16/64 and preserves absent legacy', () => {
  assert.equal(validateExecutionProfile({}), undefined);
  assert.equal(pins().executionProfile.digest, 'd3cf151fd80dc1200a8e618fce1ef6660563363275b1e898f033c71fe87b98e8');
  for (const n of [16, 64]) assert.equal(validateExecutionProfile(pins(n)).pageSize, n);
  for (const mutate of [p => p.executionProfile.batchSize = 1, p => p.executionProfile.pageSize = 32,
    p => p.maxPayloadBlocks = 2, p => p.prepDispatchIntervalMs = 1000, p => p.executionProfile.digest = h(0),
    p => p.executionProfile.extra = true, p => p.executionProfile = null]) {
    const p = pins(); mutate(p); assert.throws(() => validateExecutionProfile(p), /EXECUTION_PROFILE_INVALID/);
  }
});

test('explicit catchup 413 subdivision is typed, logarithmically bounded, cancellable and preserves every other error', async () => {
  for (const cap of [16, 64]) {
    const attempts = [], response = {}, controller = new AbortController(), options = Object.freeze({ signal: controller.signal });
    const fields = {}, filter = {}, query = Object.freeze({ from_block: 100, to_block: 164, limit: 64, field_selection: fields, transaction_filter: filter });
    const c = catchupPayloadClient({ get: async (q, o) => { assert.equal(o, options); assert.equal(q.field_selection, fields);
      assert.equal(q.transaction_filter, filter); attempts.push(q.limit); if (q.limit > 1) throw new PrepError('RESPONSE_TOO_LARGE', 413); return response; } }, cap, PrepError);
    assert.equal(await c.get(query, options), response);
    assert.equal(attempts.length, Math.log2(cap) + 1); assert.equal(attempts.at(-1), 1); assert.equal(query.limit, 64);
    for (const error of [new PrepError('RATE_LIMITED', 429), new PrepError('REORG', 409), new PrepError('INVALID_SERVER_RESPONSE'), Object.assign(Error(), { status: 413 })]) {
      let count = 0; const c = catchupPayloadClient({ get: async () => { count++; throw error; } }, cap, PrepError);
      await assert.rejects(c.get(query, options), e => e === error); assert.equal(count, 1);
    }
    const reason = Error('stop'); let count = 0;
    const cancelled = catchupPayloadClient({ get: async () => { count++; controller.abort(reason); throw new PrepError('TOO_LARGE', 413); } }, cap, PrepError);
    await assert.rejects(cancelled.get(query, options), e => e === reason); assert.equal(count, 1);
    await assert.rejects(cancelled.get(query, options), e => e === reason); assert.equal(count, 1);
  }
  const terminal = new PrepError('TOO_LARGE', 413), c = catchupPayloadClient({ get: async () => { throw terminal; } }, 16, PrepError);
  await assert.rejects(c.get({ from_block: 100, to_block: 101, limit: 1 }), e => e === terminal);
});

test('real installed CLI cached config executes 201 blocks in cap/batch groups with original bytes/fingerprint', async t => {
  const dir = await mkdtemp(resolve(tmpdir(), 'chef-catchup-profile-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const config = resolve(dir, 'config.mjs');
  await writeFile(resolve(dir, 'schema.graphql'), 'type Visit { id: ID! }');
  await writeFile(config, `export default {project:'catchup_fixture',network:'testnet',startHeight:100,schema:'schema.graphql',handlerVersion:'fixture',
    prepUrlEnv:'CATCHUP_TEST_PREP',databaseUrlEnv:'CATCHUP_TEST_DB',sync:{pageSize:16,batchSize:1},indexer:{block:()=>{}}};`);
  for (const [k, v] of Object.entries({ CATCHUP_TEST_PREP: 'https://example.invalid/', CATCHUP_TEST_DB: 'fixture' })) {
    const old = process.env[k]; process.env[k] = v; t.after(() => { if (old === undefined) delete process.env[k]; else process.env[k] = old; });
  }
  const project = await loadProject(config), before = await readFile(config), fingerprint = p => projectFingerprint(p, process.env.CATCHUP_TEST_PREP), original = fingerprint(project);
  const filter = project.config.sync.transactionFilter;
  for (const n of [16, 64]) {
    applyExecutionProfile(project, pins(n).executionProfile, fingerprint, original);
    const reloaded = await loadProject(config); assert.equal(reloaded.config, project.config); assert.equal(reloaded.config.sync.batchSize, n);
    assert.equal(fingerprint(reloaded), original); assert.equal(reloaded.config.sync.transactionFilter, filter);
    const s = memoryStore(), results = [];
    await main(['sync', '--config', config, '--to', '300', '--json'], { store: s, client: catchupPayloadClient(transport(), n, PrepError), write: text => results.push(JSON.parse(text)) });
    assert.equal((await s.checkpoint()).status, 'ready'); assert.equal(results.at(-1).state, 'complete');
    assert.deepEqual(s.committed, Array.from({ length: 201 }, (_, i) => i + 100));
    assert.deepEqual(s.groups, n === 64 ? [64, 64, 64, 9] : [...Array(12).fill(16), 9]);
    assert.deepEqual(await readFile(config), before);
  }
});

test('real SDK batch1 and batch64 receipt projection agree; failed group and undo/replay preserve deterministic notes', async () => {
  const accountId = 'fixture', keyFingerprint = 'a'.repeat(64);
  const receiptSource = { accountId, keyFingerprint, identity: h(1), scan: async ({ block, transaction }) => [{
    id: receiptId(accountId, keyFingerprint, transaction.txid, 'ironwood', 0), network: 'testnet', account_id: accountId,
    txid: transaction.txid, height: block.height, pool: 'ironwood', output_index: 0, receiver: 'a'.repeat(86), receiver_type: 'orchard',
    memo_hex: '0'.repeat(1024), value_zat: '1234567890123456', scope: 'external', origin: 'unknown', is_coinbase: false }] };
  const run = async (batchSize, failAt) => {
    const s = memoryStore(), client = catchupPayloadClient(transport(227, true), 64, PrepError);
    const options = { client, store: s, network: 'testnet', startHeight: 100, reorgWindow: 200, pageSize: 64, batchSize,
      receiptSource, indexer: { receipt: async ({ block, receipt, context }) => {
        if (block.height === failAt) throw Error('fixture-handler-failed');
        await context.entities.set('ReadableNote', projectNote({ block, receipt }, accountId, keyFingerprint));
      } } };
    if (failAt) {
      await assert.rejects(syncStep(options, 227), /fixture-handler-failed/); assert.equal((await s.checkpoint()).height, 99); assert.equal(s.entities.size, 0);
      return;
    }
    while ((await s.checkpoint()).height < 227) await syncStep(options, 227);
    const expected = [...s.entities.entries()]; await s.rollback(163);
    while ((await s.checkpoint()).height < 227) await syncStep(options, 227);
    assert.deepEqual([...s.entities.entries()], expected);
    return expected;
  };
  assert.deepEqual(await run(1), await run(64)); await run(64, 120);
});

test('catchup real PrepClient typed 413 yields a valid short page; malformed/epoch pages never auto-succeed', async () => {
  const attempts = [];
  const client = new PrepClient({ url: 'https://example.invalid/', fetch: async (_url, init) => {
    if (!init.body) return Response.json({ ...source(163), revision: '1' });
    const q = JSON.parse(init.body); attempts.push(q.limit);
    if (q.limit > 4) return Response.json({ error: { code: 'RESPONSE_TOO_LARGE' } }, { status: 413 });
    return Response.json({ ...await transport(163).get(q), revision: '1', archive_height: 163, cursor: null });
  } });
  const s = memoryStore(), c = catchupPayloadClient(client, 64, PrepError);
  await syncStep({ client: c, store: s, network: 'testnet', startHeight: 100, reorgWindow: 200, pageSize: 64, batchSize: 64, indexer: { block: () => {} } }, 163);
  assert.deepEqual(s.committed, [100, 101, 102, 103]);
  assert.ok(attempts.join(',').includes('64,32,16,8,4'));
  assert.equal((await s.checkpoint()).status, 'reconciling');
  for (const mutate of [p => p.epoch = '36', p => p.data.blocks.pop(), p => p.next_block++]) {
    const s = memoryStore(), base = transport(163), original = base.get;
    base.get = async q => { const p = await original(q); if (q.limit > 1) mutate(p); return p; };
    await assert.rejects(syncStep({ client: catchupPayloadClient(base, 64, PrepError), store: s, network: 'testnet', startHeight: 100,
      reorgWindow: 200, pageSize: 64, batchSize: 64, indexer: { block: () => {} } }, 163));
    assert.deepEqual(s.committed, []);
  }
});

function reorgFixture() {
  const p = pins(), checkpoint = { height: 100, hash: h(100), status: 'reconciling', reconcileKind: 'reorg', anchorHash: h(0), undoFloor: 98 };
  const generation = '11111111-2222-3333-4444-555555555555', metadata = { ZEESWAP_CHEF_PROJECT: 'fixture', ZEESWAP_CHEF_BIRTHDAY: '1' };
  const journal = { version: 1, projectFingerprint: fp, generation, checkpoint, dataRevision: '9', prepEpoch: '35',
    headers: [98, 99, 100].map(height => ({ height, hash: h(height), previousHash: h(height - 1) })) };
  const journalBytes = Buffer.from(JSON.stringify(journal));
  p.sourceRecovery = { version: 3, purpose: 'CANONICAL_REORG_FINITE_REPLAY', projectFingerprint: fp, executionProfileDigest: p.executionProfile.digest,
    generation, checkpoint: { ...checkpoint }, dataRevision: '9', prepEpoch: '35', issuedAt: 1799999990, expiresAt: 1800007100,
    maxInitialGap: 50000, targetHeight: 200, retainedJournalSha256: createHash('sha256').update(journalBytes).digest('hex') };
  return { pins: p, metadata, journalBytes, journal, now: () => 1800000000, client: transport(),
    status: { project: 'fixture', fingerprint: fp, checkpoint: { ...checkpoint }, state: 'reconciling', readGate: 'reconciling',
      diagnostic: { projectGeneration: generation, dataRevision: '9' }, source: { identityMatches: true } } };
}
test('v3 binds exact retained canonical reorg identity/journal/current header and finite range without freezing step epochs', async () => {
  const f = reorgFixture(), c = await verifyCanonicalReorg(f);
  const changedEpochSource = { ...source(), epoch: '36' };
  f.client.getHeight = async () => changedEpochSource;
  assert.equal(await c.getHeight(), changedEpochSource);
  const packet = { ...await transport().get({ from_block: 101, to_block: 117 }), epoch: '36' };
  f.client.get = async () => packet;
  assert.equal(await c.get({ from_block: 101, to_block: 117 }), packet);
  await assert.rejects(c.get({ from_block: 99, to_block: 100 }), /CANONICAL_REORG_RANGE_EXCEEDED/);
  await assert.rejects(c.get({ from_block: 200, to_block: 202 }), /CANONICAL_REORG_RANGE_EXCEEDED/);
});
test('v3 ready continuation requires its separate exact purpose and cannot widen reorg authority', async () => {
  const readyFixture = () => {
    const f = reorgFixture(); f.pins.sourceRecovery.purpose = 'CANONICAL_READY_FINITE_REPLAY';
    for (const cp of [f.pins.sourceRecovery.checkpoint, f.status.checkpoint, f.journal.checkpoint]) { cp.status = 'ready'; delete cp.reconcileKind; }
    f.status.state = 'backfill'; f.status.readGate = 'ready';
    f.journalBytes = Buffer.from(JSON.stringify(f.journal));
    f.pins.sourceRecovery.retainedJournalSha256 = createHash('sha256').update(f.journalBytes).digest('hex');
    return f;
  };
  for (const state of ['backfill', 'caught_up']) {
    const f = readyFixture(); f.status.state = state;
    const client = await verifyCanonicalReorg(f);
    assert.equal((await client.getHeight()).epoch, '35');
  }
  for (const mutate of [f => f.pins.sourceRecovery.purpose = 'CANONICAL_REORG_FINITE_REPLAY',
    f => f.pins.sourceRecovery.checkpoint.reconcileKind = 'reorg', f => f.pins.sourceRecovery.checkpoint.reconcileKind = null,
    f => f.status.state = 'reconciling', f => f.status.readGate = 'reconciling',
    f => f.status.checkpoint.reconcileKind = 'source', f => f.pins.sourceRecovery = undefined]) {
    const f = readyFixture(); mutate(f); await assert.rejects(verifyCanonicalReorg(f));
  }
  const reorg = reorgFixture(); reorg.pins.sourceRecovery.purpose = 'CANONICAL_READY_FINITE_REPLAY';
  await assert.rejects(verifyCanonicalReorg(reorg), /CANONICAL_REORG_PINS_INVALID/);
});
test('v3 refuses changed checkpoint/generation/revision/profile/journal/kind/expiry and source/header mismatches', async () => {
  for (const mutate of [f => f.pins.sourceRecovery.version = 2, f => f.pins.sourceRecovery.checkpoint.reconcileKind = 'source',
    f => f.pins.sourceRecovery.targetHeight = 50101, f => f.pins.sourceRecovery.expiresAt = 1800007200,
    f => f.status.checkpoint.anchorHash = h(1), f => f.status.diagnostic.dataRevision = '10',
    f => f.status.diagnostic.projectGeneration = 'other', f => f.pins.sourceRecovery.executionProfileDigest = h(1),
    f => f.journalBytes = Buffer.from('{}'), f => f.status.checkpoint.undoFloor++,
    f => f.pins.sourceRecovery.issuedAt = 1800000006]) {
    const f = reorgFixture(); mutate(f); await assert.rejects(verifyCanonicalReorg(f));
  }
  for (const mutate of [s => s.epoch = '36', s => s.source_observed_at -= 61, s => s.ready = false,
    s => { s.source_height += 7; s.lag_blocks = 7; }]) {
    const f = reorgFixture(), s = source(); mutate(s); f.client.getHeight = async () => s;
    await assert.rejects(verifyCanonicalReorg(f), /CANONICAL_REORG_SOURCE_NOT_READY/);
  }
  const f = reorgFixture(); f.client.get = async () => ({ ...await transport().get({ from_block: 100, to_block: 101 }), epoch: '36' });
  await assert.rejects(verifyCanonicalReorg(f), /CANONICAL_REORG_HEADER_MISMATCH/);
  const changed = reorgFixture(); changed.journal.headers[1].previousHash = h(1); changed.journalBytes = Buffer.from(JSON.stringify(changed.journal));
  changed.pins.sourceRecovery.retainedJournalSha256 = createHash('sha256').update(changed.journalBytes).digest('hex');
  await assert.rejects(verifyCanonicalReorg(changed), /CANONICAL_REORG_JOURNAL_MISMATCH/);
});
test('v3 refuses source requests/responses after expiry and metadata becoming stale', async () => {
  const f = reorgFixture(); let clock = f.now(); f.now = () => clock;
  const c = await verifyCanonicalReorg(f); clock = f.pins.sourceRecovery.expiresAt;
  await assert.rejects(c.getHeight(), /CANONICAL_REORG_AUTHORITY_EXPIRED/);
  clock--;
  f.client.get = async () => { clock++; return {}; };
  await assert.rejects(c.get({ from_block: 100, to_block: 101 }), /CANONICAL_REORG_AUTHORITY_EXPIRED/);
  const stale = reorgFixture(); let t = stale.now(); stale.now = () => t;
  const sc = await verifyCanonicalReorg(stale); t += 61;
  await assert.rejects(sc.getHeight(), /CANONICAL_REORG_SOURCE_NOT_READY/);
});
