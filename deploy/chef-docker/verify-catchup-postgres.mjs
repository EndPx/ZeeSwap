import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Explicit disposable database only. Root creates/drops it; this script never drops anything.
const expectedDatabase = 'zeer_catchup_verify_20261116';
let activeTest = 'db-url-scope', control, scopedUrl, parsedScope;
const stores = [];
const emit = (name, status, counts = {}) => console.log(JSON.stringify({ test: name, status, ...counts }));
const h = n => n.toString(16).padStart(64, '0');
const blocks = Array.from({ length: 64 }, (_, i) => ({ height: 100 + i, hash: h(100 + i), previousHash: h(99 + i), time: 1700000000 }));
async function verify() {
  const url = process.env.CHEF_CATCHUP_TEST_DATABASE_URL;
  assert.ok(url, 'explicit test URL required');
  const parsed = new URL(url);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
  assert.equal(decodeURIComponent(parsed.pathname), `/${expectedDatabase}`);
  const unixScope = parsed.hostname === '' && parsed.searchParams.get('host') === '/run/pg-socket';
  const tcpScope = parsed.hostname === 'zeeswap-app-postgres-v1' && parsed.port === '5432'
    && decodeURIComponent(parsed.username) === expectedDatabase && /^[0-9a-f]{64}$/.test(decodeURIComponent(parsed.password))
    && parsed.searchParams.get('sslmode') === 'verify-full' && parsed.searchParams.get('sslrootcert') === '/run/pg-ca.pem'
    && [...parsed.searchParams.keys()].every(key => ['sslmode', 'sslrootcert'].includes(key));
  assert.ok(unixScope || tcpScope, 'explicit test socket or scoped verified-TLS profile required');
  scopedUrl = url; parsedScope = parsed;
  activeTest = 'sdk-import';
  const sdk = resolve('/app/node_modules/@zeer-dev/chef');
  const require = createRequire(resolve(sdk, 'package.json'));
  const { Pool } = require('pg');
  const { PostgresStore } = await import(pathToFileURL(resolve(sdk, 'dist/store.js')));
  const { parseModel } = await import(pathToFileURL(resolve(sdk, 'dist/schema.js')));
  activeTest = 'database-connect';
  control = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
  const identity = await control.query('SELECT current_database() AS name');
  activeTest = 'database-identity';
  assert.equal(identity.rows[0].name, expectedDatabase);
  activeTest = 'fixture-schema-scope';
  const projects = ['catchup_pg_batch_one', 'catchup_pg_batch_64'];
  // Refuse stale fixture state instead of silently deleting/reusing a previous run.
  for (const project of projects) {
    const found = await control.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [`chef_${project}`]);
    assert.equal(found.rowCount, 0);
  }
  emit('database-scope', 'PASS');
  const model = parseModel('type Note { id: ID! blockHeight: Int! amount: BigInt! }');
  const options = project => ({ project, model, fingerprint: 'b'.repeat(64), network: 'testnet', startHeight: 100, reorgWindow: 200 });
  for (const project of projects) {
    const store = new PostgresStore(url, options(project)); stores.push(store);
    await store.migrate(); await store.acquire();
  }
  const [one, batch] = stores;
  const snapshot = async store => {
    const result = {};
    for (const [table, order] of [['state', 'singleton'], ['entities', 'entity,id'], ['undo', 'height,entity,id'], ['blocks', 'height']]) {
      result[table] = (await control.query(`SELECT to_jsonb(t) AS row FROM "${store.namespace}".${table} t ORDER BY ${order}`)).rows.map(r => r.row);
    }
    return result;
  };
  const amount = height => (1234567890123456n + BigInt(height)).toString();
  const handler = async (block, entities) => entities.set('Note', { id: `note-${block.height % 8}`, blockHeight: block.height, amount: amount(block.height) });
  const initial = await snapshot(batch);
  for (const [name, sentinel] of [['middle-handler-rollback', Error('fixture middle failure')], ['interrupted-group-rollback', new DOMException('fixture interruption', 'AbortError')]]) {
    activeTest = name;
    await assert.rejects(batch.applyBatch(blocks, async (block, entities) => {
      await handler(block, entities);
      if (block.height === 131) throw sentinel;
    }), error => error === sentinel);
    assert.deepEqual(await snapshot(batch), initial);
    emit(activeTest, 'PASS', { attemptedBlocks: 64, committedBlocks: 0 });
  }
  activeTest = 'retry-atomic-batch';
  await batch.applyBatch(blocks, handler);
  assert.equal((await batch.checkpoint()).height, 163);
  emit(activeTest, 'PASS', { committedBlocks: 64 });
  activeTest = 'batch-one-versus-64';
  for (const block of blocks) await one.apply(block, entities => handler(block, entities));
  const a = await snapshot(one), b = await snapshot(batch);
  for (const table of ['entities', 'undo', 'blocks']) assert.deepEqual(a[table], b[table]);
  assert.deepEqual(await one.checkpoint(), await batch.checkpoint());
  assert.equal(a.entities.length, 8); assert.equal(a.undo.length, 64); assert.equal(a.blocks.length, 64);
  // Data revisions/commit clocks intentionally differ between 64 transactions and one.
  emit(activeTest, 'PASS', { entityRows: 8, undoRows: 64, blockRows: 64 });
  activeTest = 'retained-ancestor-rollback-replay';
  const expected = Array.from({ length: 8 }, (_, i) => {
    const height = 156 + i;
    return { entity: 'Note', id: `note-${height % 8}`, data: { id: `note-${height % 8}`, blockHeight: height, amount: amount(height) } };
  }).sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(b.entities, expected);
  await batch.markReconciling('reorg');
  await batch.rollback(131, h(131));
  assert.equal((await batch.checkpoint()).height, 131);
  const rolled = await snapshot(batch);
  assert.equal(rolled.blocks.length, 32); assert.equal(rolled.undo.length, 32);
  const expectedRolled = Array.from({ length: 8 }, (_, i) => {
    const height = 124 + i;
    return { entity: 'Note', id: `note-${height % 8}`, data: { id: `note-${height % 8}`, blockHeight: height, amount: amount(height) } };
  }).sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(rolled.entities, expectedRolled);
  await batch.applyBatch(blocks.slice(32), handler); await batch.markReady();
  const replay = await snapshot(batch);
  assert.deepEqual(replay.entities, expected);
  for (const table of ['entities', 'undo', 'blocks']) assert.deepEqual(replay[table], b[table]);
  assert.deepEqual(await batch.checkpoint(), await one.checkpoint());
  emit(activeTest, 'PASS', { replayedBlocks: 32, entityRows: 8 });
  activeTest = 'replacement-branch-per-block-undo';
  await batch.markReconciling('reorg'); await batch.rollback(131, h(131));
  const replacement = blocks.slice(32).map((block, index) => ({ ...block, hash: h(1000 + block.height),
    previousHash: index === 0 ? h(131) : h(999 + block.height) }));
  const replacementHandler = async (block, entities) => entities.set('Note', { id: `note-${block.height % 8}`,
    blockHeight: block.height, amount: amount(1000 + block.height) });
  await batch.applyBatch(replacement, replacementHandler);
  const replacementExpected = expected.map(row => ({ ...row, data: { ...row.data, amount: amount(1000 + row.data.blockHeight) } }));
  assert.deepEqual((await snapshot(batch)).entities, replacementExpected);
  assert.equal((await batch.checkpoint()).hash, h(1163));
  await batch.rollback(147, h(1147));
  const intermediateExpected = Array.from({ length: 8 }, (_, i) => {
    const height = 140 + i;
    return { entity: 'Note', id: `note-${height % 8}`, data: { id: `note-${height % 8}`, blockHeight: height, amount: amount(1000 + height) } };
  }).sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual((await snapshot(batch)).entities, intermediateExpected);
  await batch.applyBatch(replacement.slice(16), replacementHandler); await batch.markReady();
  assert.deepEqual((await snapshot(batch)).entities, replacementExpected);
  emit(activeTest, 'PASS', { replacementBlocks: 32, replayedBlocks: 16, entityRows: 8 });
  activeTest = 'exclusive-writer-and-clean-release';
  const competitor = new PostgresStore(url, options(projects[1])); stores.push(competitor);
  await assert.rejects(competitor.acquire(), /already has an active writer/);
  for (const store of stores) await store.close();
  for (const project of projects) {
    const name = `chef_${project}`;
    assert.equal((await control.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [name])).rows[0].locked, true);
    assert.equal((await control.query('SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked', [name])).rows[0].unlocked, true);
  }
  emit(activeTest, 'PASS', { projects: 2 });
  emit('postgres-catchup-qualification', 'PASS', { checks: 8 });
}
try { await verify(); }
catch (error) {
  const diagnostic = {};
  if (scopedUrl && ['sdk-import', 'database-connect', 'database-identity', 'fixture-schema-scope'].includes(activeTest)) {
    diagnostic.errorName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error?.name ?? '') ? error.name : 'Error';
    if (/^[A-Z0-9_]{1,64}$/.test(error?.code ?? '')) diagnostic.errorCode = error.code;
    let message = String(error?.message ?? 'Unknown initialization error').replaceAll(scopedUrl, '[URL]');
    for (const secret of [parsedScope.password, decodeURIComponent(parsedScope.password), parsedScope.username,
      decodeURIComponent(parsedScope.username), parsedScope.searchParams.get('password'), parsedScope.searchParams.get('user')]) {
      if (secret) message = message.replaceAll(secret, '[REDACTED]');
    }
    diagnostic.message = message.replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/gi, '[URL]').replace(/[\r\n\t]/g, ' ').slice(0, 240);
  }
  emit(activeTest, 'FAIL', diagnostic); process.exitCode = 1;
}
finally {
  for (const store of stores) { try { await store.close(); } catch { process.exitCode = 1; } }
  if (control) { try { await control.end(); } catch { process.exitCode = 1; } }
}
