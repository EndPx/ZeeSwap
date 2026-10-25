import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRuntime, digest, validateMetadata, validateDatabase } from './runtime.mjs';
import { stageContext, projectFiles } from './stage-context.mjs';
import { singleBlockClient } from '../../indexers/zeer/bounded-prep-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
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
    await writeFile(resolve(app, name), name === 'package.json' ? JSON.stringify({ dependencies: { '@zeer-dev/chef': '0.6.1' } }) : 'fixture\r\n');
    files[name] = await digest(resolve(app, name));
  }
  const sdkDirectory = resolve(app, 'node_modules/@zeer-dev/chef/dist');
  await mkdir(sdkDirectory, { recursive: true });
  await writeFile(resolve(sdkDirectory, '../package.json'), '{"version":"0.6.1"}');
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
  return { app, privateDir, env, sdk, prep, bounded: { singleBlockClient }, identity: { uid: 986, gid: 978 }, pins, savePins, calls, requests, prepOptions, status };
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
