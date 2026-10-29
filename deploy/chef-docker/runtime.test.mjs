import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRuntime, digest, validateMetadata, validateDatabase, verifySourceRecovery, runtimeFailure,bindChefDatastorePg } from './runtime.mjs';
import { stageContext, projectFiles } from './stage-context.mjs';
import { fixedPayloadClient } from '../../indexers/zeer/bounded-prep-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
test('Chef-owned Pool verifies every new physical connection and refuses an unapproved URL without changing Core',async()=>{
 let checked=0;class Pool{constructor(options){this.options=options;}}
 const pg={Pool},module={verifySdkDatastoreClient:async(_c,_r,kind,role)=>{assert.equal(kind,'chef');assert.equal(role,'zee_chef_owner_20261023');checked++;}},loaded={receipt:{}};
 bindChefDatastorePg(pg,module,loaded,'approved-url');const pool=new pg.Pool({connectionString:'approved-url'});await new Promise((resolve,reject)=>pool.options.verify({},error=>error?reject(error):resolve()));assert.equal(checked,1);assert.throws(()=>new pg.Pool({connectionString:'old-neon-url'}),/POOL_SCOPE/);
});
const metadata = {
  ZEESWAP_CHEF_PROJECT: 'zeeswap_shadow_fixture', ZEESWAP_CHEF_ACCOUNT_ID: 'fixture',
  ZEESWAP_CHEF_KEY_FINGERPRINT: 'a'.repeat(64), ZEESWAP_CHEF_BIRTHDAY: '1',
  ZEESWAP_CHEF_PREP_URL: 'https://example.invalid/api/prep',
};
async function fixture(t) {
  const app = await mkdtemp(resolve(tmpdir(), 'zeeswap-chef-docker-'));
  t.after(() => rm(app, { recursive: true, force: true }));
  const privateDir = resolve(app, 'private');
  await mkdir(privateDir);
  const files = {};
  for (const name of [...projectFiles, 'runtime.mjs', 'stage-context.mjs']) {
    await writeFile(resolve(app, name), name === 'package.json' ? JSON.stringify({ dependencies: { '@zeer-dev/chef': '0.7.0' } }) : 'fixture\r\n');
    files[name] = await digest(resolve(app, name));
  }
  const sdkDirectory = resolve(app, 'node_modules/@zeer-dev/chef/dist');
  await mkdir(sdkDirectory, { recursive: true });
  await writeFile(resolve(sdkDirectory, '../package.json'), '{"version":"0.7.0"}');
  await writeFile(resolve(sdkDirectory, 'cli.js'), 'fixture');
  const pins = { version: 1, uid: 986, gid: 978, projectFingerprint: 'b'.repeat(64), files,
    sdkCliSha256: await digest(resolve(sdkDirectory, 'cli.js')), scannerSha256: 'c'.repeat(64), scannerPlatform: `${process.platform}-${process.arch}` };
  const savePins = () => writeFile(resolve(privateDir, 'pins.json'), JSON.stringify(pins));
  await savePins();
  await writeFile(resolve(privateDir, 'metadata.json'), JSON.stringify(metadata));
  await writeFile(resolve(privateDir, 'database-url'), 'postgresql://fixture:fixture@ep-fixture.neon.tech/fixture?sslmode=require\n');
  await writeFile(resolve(privateDir, 'api-token'), 'fixture-token-only-123456789');
  const calls = [], env = { CHEF_ENABLE_FOLLOWER: 'reviewed-cutover', ZEESWAP_CHEF_UFVK_FILE: 'must-be-cleared', ZEESWAP_CHEF_SCANNER_EXECUTABLE: 'must-be-cleared' };
  const status = { project: metadata.ZEESWAP_CHEF_PROJECT, fingerprint: pins.projectFingerprint, state: 'caught_up', readGate: 'ready',
    source: { availability: 'available', identityMatches: true, checkpointAheadOfPrep: false }, checkpoint: { height: 1, hash: 'd'.repeat(64) } };
  const sdk = { loadProject: async () => ({}), projectFingerprint: () => pins.projectFingerprint,
    main: async (args, dependencies) => { calls.push(args); if (args[0] === 'status') dependencies?.write?.(JSON.stringify(status));
      if (args[0] === 'sync') await dependencies.client.get({ from_block: 1, to_block: 17, limit: 16 }); } };
  const requests = [], prepOptions = [];
  const prep = { PrepClient: class { constructor(options) { prepOptions.push(options); } async get(query) { requests.push(query); return {}; } } };
  return { app, privateDir, env, sdk, prep, bounded: { fixedPayloadClient }, identity: { uid: 986, gid: 978 }, pins, savePins, calls, requests, prepOptions, status };
}
test('API starts authenticated serve with metadata only, without scanner, UFVK or Prep token files', async t => {
  const f = await fixture(t);
  await runRuntime(['api'], f);
  assert.deepEqual(f.calls.map(call => call[0]), ['serve']);
  assert.deepEqual(f.calls[0].slice(-5), ['--listen', '0.0.0.0', '--port', '39375', '--json']);
  assert.equal(f.env.ZEESWAP_CHEF_UFVK_FILE, undefined);
  assert.equal(f.env.ZEESWAP_CHEF_SCANNER_EXECUTABLE, undefined);
  assert.equal(f.env.ZEESWAP_CHEF_PREP_TOKEN, undefined);
});
test('writer requires explicit opt in before reading any files', async () => {
  await assert.rejects(runRuntime(['follower'], { env: {}, privateDir: '/absent' }), /FOLLOWER_OPT_IN_REQUIRED/);
});
test('commands cannot initialize, migrate, reset, codegen or choose a finite skip target', async () => {
  for (const args of [['migrate'], ['init'], ['dev'], ['reset'], ['codegen'], ['follower', '--to', '123']]) {
    await assert.rejects(runRuntime(args), /INVALID_ROLE/);
  }
});
test('changed config bytes fail before SDK/database invocation', async t => {
  const f = await fixture(t);
  await writeFile(resolve(f.app, 'chef.config.ts'), 'changed');
  await assert.rejects(runRuntime(['api'], f), /RUNTIME_PIN_MISMATCH/);
  assert.deepEqual(f.calls, []);
});
test('SDK, UID and source identity mismatches fail closed', async t => {
  const f = await fixture(t);
  await assert.rejects(runRuntime(['api'], { ...f, identity: { uid: 0, gid: 0 } }), /RUNTIME_IDENTITY_MISMATCH/);
  await writeFile(resolve(f.app, 'node_modules/@zeer-dev/chef/dist/cli.js'), 'changed');
  await assert.rejects(runRuntime(['api'], f), /SDK_PIN_MISMATCH/);
  await writeFile(resolve(f.app, 'node_modules/@zeer-dev/chef/dist/cli.js'), 'fixture');
  f.sdk.projectFingerprint = () => 'e'.repeat(64);
  await assert.rejects(runRuntime(['api'], f), /PROJECT_FINGERPRINT_MISMATCH/);
  assert.deepEqual(f.calls, []);
});
test('a previously deployed 0.6.1 SDK is refused by the reviewed 0.7.0 wrapper', async t => {
  const f = await fixture(t);
  await writeFile(resolve(f.app, 'node_modules/@zeer-dev/chef/package.json'), '{"version":"0.6.1"}');
  await assert.rejects(runRuntime(['api'], f), /CHEF_VERSION_MISMATCH/);
  assert.deepEqual(f.calls, []);
});
async function scannerFixture(f) {
  await writeFile(resolve(f.privateDir, 'prep-token'), 'fixture-prep-token');
  await writeFile(resolve(f.privateDir, 'zeer-scanner'), 'synthetic-scanner-not-executable');
  await writeFile(resolve(f.privateDir, 'testnet.ufvk'), 'synthetic-not-a-real-key');
  f.pins.scannerSha256 = await digest(resolve(f.privateDir, 'zeer-scanner'));
  await f.savePins();
}
test('follower retains fixed single-block transport through the official CLI seam', async t => {
  const f = await fixture(t); await scannerFixture(f);
  await runRuntime(['follower'], f);
  assert.deepEqual(f.calls.map(call => call[0]), ['status', 'sync']);
  assert.ok(f.calls[1].includes('--follow'));
  assert.deepEqual(f.requests, [{ from_block: 1, to_block: 2, limit: 1 }]);
  assert.equal(f.prepOptions[0].token, 'fixture-prep-token');
  assert.equal(f.env.ZEESWAP_CHEF_PREP_TOKEN, 'fixture-prep-token');
});
test('only explicit private cap two enables two-block transport; cap one retains default', async t => {
  for (const cap of [1, 2]) {
    const f = await fixture(t); await scannerFixture(f); f.pins.maxPayloadBlocks = cap; await f.savePins();
    await runRuntime(['follower'], f);
    assert.deepEqual(f.requests, [{ from_block: 1, to_block: 1 + cap, limit: cap }]);
  }
});
test('unsupported private transport caps refuse before SDK or writer invocation', async t => {
  const f = await fixture(t); await scannerFixture(f);
  for (const cap of [0, 3, 16, '2', null, true]) {
    f.pins.maxPayloadBlocks = cap; await f.savePins();
    await assert.rejects(runRuntime(['follower'], f), /FIXED_PAYLOAD_CAP_INVALID/);
    assert.deepEqual(f.calls, []);
  }
});
test('public Prep follower accepts an empty optional token without sending authentication', async t => {
  const f = await fixture(t); await scannerFixture(f);
  await writeFile(resolve(f.privateDir, 'prep-token'), '\n');
  await runRuntime(['follower'], f);
  assert.equal(f.env.ZEESWAP_CHEF_PREP_TOKEN, undefined);
  assert.deepEqual(f.prepOptions, [{ url: metadata.ZEESWAP_CHEF_PREP_URL }]);
  assert.deepEqual(f.calls.map(call => call[0]), ['status', 'sync']);
});
test('read-only check accepts a missing optional Prep token; other credentials stay required', async t => {
  const f = await fixture(t);
  await runRuntime(['check'], f);
  assert.equal(f.env.ZEESWAP_CHEF_PREP_TOKEN, undefined);
  assert.deepEqual(f.calls.map(call => call[0]), ['status']);
  await writeFile(resolve(f.privateDir, 'prep-token'), ' \n');
  await assert.rejects(runRuntime(['check'], f), /INVALID_SECRET_FILE/);
  await writeFile(resolve(f.privateDir, 'api-token'), '');
  await assert.rejects(runRuntime(['api'], f), /INVALID_SECRET_FILE/);
});
test('missing/changed scanner and unreconciled checkpoint cannot start writer', async t => {
  const f = await fixture(t); await scannerFixture(f);
  f.pins.scannerSha256 = '0'.repeat(64); await f.savePins();
  await assert.rejects(runRuntime(['follower'], f), /SCANNER_PIN_MISMATCH/);
  assert.deepEqual(f.calls, []);
  f.pins.scannerSha256 = await digest(resolve(f.privateDir, 'zeer-scanner')); await f.savePins();
  f.status.readGate = 'reconciling';
  await assert.rejects(runRuntime(['follower'], f), /FOLLOWER_PREFLIGHT_NOT_READY/);
  assert.deepEqual(f.calls.map(call => call[0]), ['status']);
});
test('fatal SDK failure propagates once with no restart loop', async t => {
  const f = await fixture(t); await scannerFixture(f);
  const main = f.sdk.main;
  f.sdk.main = async (args, deps) => { await main(args, deps); if (args[0] === 'sync') throw Error('fixture-fatal'); };
  await assert.rejects(runRuntime(['follower'], f), /fixture-fatal/);
  assert.deepEqual(f.calls.map(call => call[0]), ['status', 'sync']);
});
test('metadata rejects key material and TLS database must be remote Neon', () => {
  assert.throws(() => validateMetadata({ ...metadata, ZEESWAP_CHEF_UFVK_FILE: '/secret' }), /INVALID_METADATA/);
  assert.throws(() => validateDatabase('postgresql://u:p@localhost/db?sslmode=require'), /REMOTE_NEON_TLS_REQUIRED/);
  assert.throws(() => validateDatabase('postgresql://u:p@ep-test.neon.tech/db?sslmode=disable'), /REMOTE_NEON_TLS_REQUIRED/);
});
test('staging copies only approved bytes, records hashes and refuses existing output', async t => {
  const root = await mkdtemp(resolve(tmpdir(), 'zeeswap-stage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = resolve(root, 'source'); await mkdir(source);
  for (const name of projectFiles) await writeFile(resolve(source, name), 'byte-exact\r\n');
  await writeFile(resolve(source, '.env'), 'must-not-copy');
  const destination = resolve(root, 'destination');
  const files = await stageContext(source, destination);
  assert.deepEqual(await readFile(resolve(destination, 'chef.config.ts')), Buffer.from('byte-exact\r\n'));
  assert.equal(files['chef.config.ts'], await digest(resolve(destination, 'chef.config.ts')));
  await assert.rejects(readFile(resolve(destination, '.env')), { code: 'ENOENT' });
  await assert.rejects(stageContext(source, destination), { code: 'EEXIST' });
});
test('static deployment contract excludes database service, implicit build and default writer', async () => {
  const compose = await readFile(resolve(here, 'compose.yaml'), 'utf8');
  assert.match(compose, /profiles: \[writer\]/);
  assert.match(compose, /restart: "no"/);
  assert.match(compose, /127\.0\.0\.1:39375:39375/);
  assert.doesNotMatch(compose, /env_file:|build:|postgres:/);
  const api = compose.split('  api:')[1].split('  follower:')[0];
  assert.doesNotMatch(api, /ufvk|scanner|prep-token/);
  const ignore = await readFile(resolve(here, '.dockerignore'), 'utf8');
  assert.ok(ignore.startsWith('**\n'));
  assert.doesNotMatch(ignore, /!.*(?:\.env|ufvk|wallet|receipt|database)/);
});
test('Compose requires a pre-created reviewed external network without allocating a default subnet', async () => {
  const compose = await readFile(resolve(here, 'compose.yaml'), 'utf8');
  assert.match(compose, /networks:\s*\n  default:\s*\n    external: true\s*\n    name: \$\{CHEF_DOCKER_NETWORK:\?Set reviewed user-defined network\}/);
  assert.doesNotMatch(compose, /network_mode:|\bipam:|\bsubnet:|\bdriver:\s*bridge/);
});
function recoveryFixture() {
  const now = 1800000000, generation = '11111111-2222-3333-4444-555555555555', hash = 'd'.repeat(64);
  const checkpoint = { height: 100, hash, status: 'reconciling', reconcileKind: 'source' };
  const pins = { projectFingerprint: 'b'.repeat(64), sourceRecovery: { version: 1, generation,
    checkpoint: { ...checkpoint }, issuedAt: now - 10, expiresAt: now + 7100, maxInitialGap: 4096, prepEpoch: '35' } };
  const status = { project: metadata.ZEESWAP_CHEF_PROJECT, fingerprint: pins.projectFingerprint,
    checkpoint: { ...checkpoint }, state: 'reconciling', readGate: 'reconciling', diagnostic: { projectGeneration: generation }, source: { identityMatches: true } };
  const source = { network: 'testnet', payload_kind: 'full-v1', ready: true, source_mode: 'follower', epoch: '35',
    source_observed_at: now, source_height: 200, indexed_height: 199, archive_height: 199, start_block: 1, lag_blocks: 1 };
  const page = { network: 'testnet', epoch: '35', next_block: 101, data: { blocks: [{ height: 100, hash }] } };
  const reads = [];
  const client = { getHeight: async () => { reads.push('height'); return source; }, get: async () => { reads.push('header'); return page; } };
  return { pins, status, metadata, client, now: () => now, source, page, reads };
}
test('source-only proof validates actual fresh Prep and exact retained header before official replay', async () => {
  const f = recoveryFixture(); await verifySourceRecovery(f);
  assert.deepEqual(f.reads, ['height', 'header']);
});
test('source-only proof rejects generation, checkpoint, kind, expiry and oversized authority', async () => {
  const cases = [
    f => { f.status.diagnostic.projectGeneration = 'other'; },
    f => { f.status.checkpoint.height++; }, f => { f.status.checkpoint.hash = 'e'.repeat(64); },
    f => { f.status.checkpoint.reconcileKind = 'reorg'; }, f => { f.status.checkpoint.reconcileKind = 'unknown'; },
    f => { f.status.checkpoint.status = 'blocked'; },
    f => { f.pins.sourceRecovery.expiresAt = f.now(); },
    f => { f.pins.sourceRecovery.expiresAt = f.now() + 7201; },
    f => { f.pins.sourceRecovery.maxInitialGap = 4097; },
  ];
  for (const mutate of cases) { const f = recoveryFixture(); mutate(f); await assert.rejects(verifySourceRecovery(f)); assert.deepEqual(f.reads, []); }
});
test('source-only proof refuses stale/future source, lag, missing history, epoch and actual head gap', async () => {
  const cases = [
    f => { f.source.source_observed_at -= 61; }, f => { f.source.source_observed_at += 6; },
    f => { f.source.epoch = '36'; }, f => { f.source.ready = false; },
    f => { f.source.source_height += 6; f.source.lag_blocks += 6; },
    f => { f.source.start_block = 2; }, f => { f.source.archive_height = 99; },
    f => { f.source.source_height = 5000; f.source.indexed_height = 5000; f.source.archive_height = 5000; f.source.lag_blocks = 0; },
    f => { f.source.source_height = 2000; f.source.indexed_height = 2000; f.source.archive_height = 1000;
      f.source.lag_blocks = 0; f.status.checkpoint.height = 1000; f.pins.sourceRecovery.checkpoint.height = 1000; },
    f => { f.source.source_mode = 'historical_snapshot'; }, f => { f.source.network = 'mainnet'; },
  ];
  for (const mutate of cases) { const f = recoveryFixture(); mutate(f); await assert.rejects(verifySourceRecovery(f), /SOURCE_RECOVERY_SOURCE_NOT_READY/); assert.deepEqual(f.reads, ['height']); }
});
test('source-only proof rejects changed canonical header or source epoch', async () => {
  for (const mutate of [f => { f.page.data.blocks[0].hash = 'e'.repeat(64); }, f => { f.page.epoch = '36'; }]) {
    const f = recoveryFixture(); mutate(f); await assert.rejects(verifySourceRecovery(f), /SOURCE_RECOVERY_HEADER_MISMATCH/);
  }
});
test('source-only proof rechecks observation freshness after the checkpoint header response', async () => {
  const f = recoveryFixture(); let clock = f.now(); f.now = () => clock;
  f.source.source_observed_at = clock - 59;
  f.client.get = async () => { clock += 2; return f.page; };
  await assert.rejects(verifySourceRecovery(f), /SOURCE_RECOVERY_HEADER_MISMATCH/);
});
test('reconciling follower needs separate source-only opt-in and executes official follow only after proof', async t => {
  const f = await fixture(t); await scannerFixture(f); const r = recoveryFixture();
  Object.assign(f.status, r.status); f.pins.sourceRecovery = r.pins.sourceRecovery; await f.savePins();
  const queries = [];
  f.now = r.now;
  f.prep = { PrepClient: class { async getHeight() { return r.source; } async get(query) {
    queries.push(query); return query.from_block === 100 ? r.page : {};
  } } };
  await assert.rejects(runRuntime(['follower'], f), /FOLLOWER_PREFLIGHT_NOT_READY/);
  assert.deepEqual(queries, []);
  f.env.CHEF_SOURCE_RECOVERY = 'reviewed-source-only';
  await runRuntime(['follower'], f);
  assert.deepEqual(f.calls.map(call => call[0]), ['status', 'status', 'sync']);
  assert.equal(queries[0].from_block, 100); assert.equal(queries[0].to_block, 101);
});
test('source recovery never swallows untyped or unrelated status errors', async t => {
  const f = await fixture(t); await scannerFixture(f);
  f.env.CHEF_SOURCE_RECOVERY = 'reviewed-source-only';
  const sentinel = Error('RECONCILIATION_REQUIRED'); sentinel.code = 'RECONCILIATION_REQUIRED';
  f.sdk.main = async () => { throw sentinel; };
  await assert.rejects(runRuntime(['follower'], f), error => error === sentinel);
});
test('typed reconciliation errors require the exact captured state and still cannot bypass source proof', async t => {
  const f = await fixture(t); await scannerFixture(f); f.env.CHEF_SOURCE_RECOVERY = 'reviewed-source-only';
  class CliError extends Error { constructor(code) { super(code); this.code = code; } }
  f.sdk.CliError = CliError;
  for (const [code, state] of [['PREP_UNAUTHORIZED', 'reconciliation_needed'], ['RECONCILIATION_REQUIRED', 'reconciling']]) {
    const sentinel = new CliError(code);
    f.sdk.main = async (_args, dependencies) => { dependencies.write(JSON.stringify({ ...f.status, state })); throw sentinel; };
    await assert.rejects(runRuntime(['follower'], f), error => error === sentinel);
  }
  f.sdk.main = async (_args, dependencies) => {
    dependencies.write(JSON.stringify({ ...f.status, state: 'reconciliation_needed' })); throw new CliError('RECONCILIATION_REQUIRED');
  };
  await assert.rejects(runRuntime(['follower'], f), /SOURCE_RECOVERY_PINS_INVALID/);
});
test('published SDK failure advice survives without exposing arbitrary error messages or retrying', async () => {
  const app = resolve(here, '../../indexers/zeer');
  const auth = await runtimeFailure(Object.assign(Error('private-credential-not-for-output'), { code: 'PREP_UNAUTHORIZED' }), app);
  assert.equal(auth.error.code, 'PREP_UNAUTHORIZED');
  assert.deepEqual(auth.action, { category: 'fix_authentication', retryPolicy: 'after_operator_correction' });
  const unknown = await runtimeFailure(Error('private-credential-not-for-output'), app);
  assert.equal(unknown.error.code, 'CHEF_COMMAND_FAILED');
  assert.doesNotMatch(JSON.stringify([auth, unknown]), /private-credential/);
});
