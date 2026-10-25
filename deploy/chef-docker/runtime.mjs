import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectFiles } from './stage-context.mjs';

export class RuntimeError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new RuntimeError(code); };
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const metadataKeys = ['ZEESWAP_CHEF_PROJECT', 'ZEESWAP_CHEF_ACCOUNT_ID', 'ZEESWAP_CHEF_KEY_FINGERPRINT', 'ZEESWAP_CHEF_BIRTHDAY', 'ZEESWAP_CHEF_PREP_URL'];
export async function regularFile(path, limit = 1024 * 1024) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) fail('INVALID_RUNTIME_FILE');
  return readFile(path);
}
export async function digest(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail('INVALID_RUNTIME_FILE');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function validateMetadata(metadata) {
  if (!metadata || Object.keys(metadata).length !== metadataKeys.length
    || metadataKeys.some(key => typeof metadata[key] !== 'string' || !metadata[key] || /REPLACE|CHANGE_ME/.test(metadata[key]))
    || !/^zeeswap_shadow_[a-z0-9_]+$/.test(metadata.ZEESWAP_CHEF_PROJECT)
    || !/^[a-zA-Z0-9_-]{1,64}$/.test(metadata.ZEESWAP_CHEF_ACCOUNT_ID)
    || !sha(metadata.ZEESWAP_CHEF_KEY_FINGERPRINT)
    || !/^(0|[1-9][0-9]*)$/.test(metadata.ZEESWAP_CHEF_BIRTHDAY)
    || Number(metadata.ZEESWAP_CHEF_BIRTHDAY) > 0xfffffffe) fail('INVALID_METADATA');
  const source = new URL(metadata.ZEESWAP_CHEF_PREP_URL);
  if (source.protocol !== 'https:' || source.username || source.password || source.hash || source.search) fail('INVALID_PREP_SOURCE');
  return metadata;
}
export function validateDatabase(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')
    || !url.username || !url.password || url.pathname.length < 2
    || !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) fail('REMOTE_NEON_TLS_REQUIRED');
  return value;
}
export async function verifySourceRecovery({ pins, status, metadata, client, now = () => Date.now() / 1000 }) {
  const proof = pins.sourceRecovery, checkpoint = status?.checkpoint;
  const uint = value => Number.isSafeInteger(value) && value >= 0;
  const validTime = () => proof && uint(proof.issuedAt) && uint(proof.expiresAt)
    && proof.issuedAt <= now() + 5 && proof.expiresAt > now()
    && proof.expiresAt > proof.issuedAt && proof.expiresAt - proof.issuedAt <= 7200;
  if (proof?.version !== 1 || !validTime() || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(proof.generation ?? '')
    || !uint(proof.maxInitialGap) || proof.maxInitialGap < 1 || proof.maxInitialGap > 4096
    || !/^(0|[1-9][0-9]*)$/.test(proof.prepEpoch ?? '')
    || !uint(proof.checkpoint?.height) || proof.checkpoint.height > 0xfffffffe
    || proof.checkpoint.height < Number(metadata.ZEESWAP_CHEF_BIRTHDAY) || !sha(proof.checkpoint?.hash)
    || proof.checkpoint.status !== 'reconciling' || proof.checkpoint.reconcileKind !== 'source') fail('SOURCE_RECOVERY_PINS_INVALID');
  if (status?.project !== metadata.ZEESWAP_CHEF_PROJECT || status.fingerprint !== pins.projectFingerprint
    || status.state !== 'reconciling' || status.readGate !== 'reconciling'
    || status.diagnostic?.projectGeneration !== proof.generation
    || checkpoint?.height !== proof.checkpoint.height || checkpoint.hash !== proof.checkpoint.hash
    || checkpoint.status !== 'reconciling' || checkpoint.reconcileKind !== 'source'
    || status.source?.identityMatches !== true) fail('SOURCE_RECOVERY_IDENTITY_MISMATCH');
  const source = await client.getHeight({ timeoutMs: 5000 });
  const age = now() - source.source_observed_at;
  if (source.network !== 'testnet' || source.payload_kind !== 'full-v1' || source.ready !== true
    || source.source_mode !== 'follower' || source.epoch !== proof.prepEpoch
    || !uint(source.source_observed_at) || age < -5 || age > 60
    || !uint(source.source_height) || !uint(source.indexed_height) || !uint(source.archive_height)
    || !uint(source.start_block) || source.start_block > Number(metadata.ZEESWAP_CHEF_BIRTHDAY)
    || source.source_height < source.indexed_height || source.indexed_height < source.archive_height
    || !uint(source.lag_blocks) || source.lag_blocks > 6 || source.lag_blocks !== source.source_height - source.indexed_height
    || source.source_height - source.archive_height > 6
    || source.archive_height < checkpoint.height || source.source_height - checkpoint.height < 0
    || source.source_height - checkpoint.height > proof.maxInitialGap) fail('SOURCE_RECOVERY_SOURCE_NOT_READY');
  const page = await client.get({ from_block: checkpoint.height, to_block: checkpoint.height + 1, limit: 1,
    field_selection: { block: ['height', 'hash', 'previous_hash', 'time'], transaction: [] } }, { timeoutMs: 5000 });
  if (page.network !== 'testnet' || page.epoch !== proof.prepEpoch || page.next_block !== checkpoint.height + 1
    || page.data?.blocks?.length !== 1 || page.data.blocks[0].height !== checkpoint.height
    || page.data.blocks[0].hash !== checkpoint.hash || !validTime()
    || now() - source.source_observed_at < -5 || now() - source.source_observed_at > 60) fail('SOURCE_RECOVERY_HEADER_MISMATCH');
}
export async function runRuntime(args = process.argv.slice(2), options = {}) {
  if (args.length !== 1 || !['api', 'check', 'follower'].includes(args[0])) fail('INVALID_ROLE');
  const role = args[0], env = options.env ?? process.env;
  if (role === 'follower' && env.CHEF_ENABLE_FOLLOWER !== 'reviewed-cutover') fail('FOLLOWER_OPT_IN_REQUIRED');
  const app = options.app ?? '/app', privateDir = options.privateDir ?? '/run/chef';
  const metadata = validateMetadata(JSON.parse(await regularFile(resolve(privateDir, 'metadata.json'))));
  const pins = JSON.parse(await regularFile(resolve(privateDir, 'pins.json')));
  const identity = options.identity ?? { uid: process.getuid?.(), gid: process.getgid?.() };
  if (!Number.isInteger(pins.uid) || pins.uid <= 0 || !Number.isInteger(pins.gid) || pins.gid <= 0
    || identity.uid !== pins.uid || identity.gid !== pins.gid) fail('RUNTIME_IDENTITY_MISMATCH');
  const expectedFiles = [...projectFiles, 'runtime.mjs', 'stage-context.mjs'];
  if (pins.version !== 1 || !sha(pins.projectFingerprint) || !sha(pins.sdkCliSha256)
    || !pins.files || Object.keys(pins.files).length !== expectedFiles.length
    || expectedFiles.some(name => !sha(pins.files[name]))) fail('INVALID_REVIEWED_PINS');
  for (const name of expectedFiles) {
    if (await digest(resolve(app, name)) !== pins.files[name]) fail('RUNTIME_PIN_MISMATCH');
  }
  const chefPackage = JSON.parse(await regularFile(resolve(app, 'node_modules/@zeer-dev/chef/package.json')));
  const manifest = JSON.parse(await regularFile(resolve(app, 'package.json')));
  if (chefPackage.version !== '0.7.0' || manifest.dependencies?.['@zeer-dev/chef'] !== '0.7.0') fail('CHEF_VERSION_MISMATCH');
  const cliPath = resolve(app, 'node_modules/@zeer-dev/chef/dist/cli.js');
  if (await digest(cliPath) !== pins.sdkCliSha256) fail('SDK_PIN_MISMATCH');
  // Metadata is a strict allowlist. Never load the legacy private chef.env into the API.
  for (const key of Object.keys(env)) if (key.startsWith('ZEESWAP_CHEF_') || key === 'CHEF_API_TOKEN') delete env[key];
  Object.assign(env, metadata);
  const secret = async (name, optional = false) => {
    let bytes;
    try { bytes = await regularFile(resolve(privateDir, name), 16384); }
    catch (error) { if (optional && error.code === 'ENOENT') return undefined; throw error; }
    const value = bytes.toString('utf8').replace(/\r?\n$/, '');
    if (!value && optional) return undefined;
    if (!value || /[\s\0]/.test(value)) fail('INVALID_SECRET_FILE');
    return value;
  };
  env.ZEESWAP_CHEF_DATABASE_URL = validateDatabase(await secret('database-url'));
  // Config/SDK use process.env. Isolated environments are for unit tests with an injected runner only.
  if (env !== process.env && !options.sdk) fail('INJECTED_RUNNER_REQUIRED');
  const sdk = options.sdk ?? {
    ...(await import(pathToFileURL(resolve(app, 'node_modules/@zeer-dev/chef/dist/project.js')).href)),
    ...(await import(pathToFileURL(cliPath).href)),
    ...(await import(pathToFileURL(resolve(app, 'node_modules/@zeer-dev/chef/dist/cli-error.js')).href)),
  };
  const config = resolve(app, 'chef.config.ts');
  const project = await sdk.loadProject(config);
  if (sdk.projectFingerprint(project, metadata.ZEESWAP_CHEF_PREP_URL) !== pins.projectFingerprint) fail('PROJECT_FINGERPRINT_MISMATCH');
  if (role === 'api') {
    env.CHEF_API_TOKEN = await secret('api-token');
    if (Buffer.byteLength(env.CHEF_API_TOKEN) < 16) fail('API_TOKEN_TOO_SHORT');
    await sdk.main(['serve', '--config', config, '--listen', '0.0.0.0', '--port', '39375', '--json']);
    return;
  }
  const prepToken = await secret('prep-token', true);
  if (prepToken !== undefined) env.ZEESWAP_CHEF_PREP_TOKEN = prepToken;
  if (role === 'check') {
    await sdk.main(['status', '--config', config, '--json']);
    return;
  }
  const scanner = resolve(privateDir, 'zeer-scanner');
  if (!sha(pins.scannerSha256) || await digest(scanner) !== pins.scannerSha256) fail('SCANNER_PIN_MISMATCH');
  if (pins.scannerPlatform !== `${process.platform}-${process.arch}`) fail('SCANNER_PLATFORM_MISMATCH');
  // Hash pinning proves bytes, not ABI/protocol compatibility; the operator must test those before cutover.
  env.ZEESWAP_CHEF_SCANNER_EXECUTABLE = scanner;
  env.ZEESWAP_CHEF_UFVK_FILE = resolve(privateDir, 'testnet.ufvk');
  const keyInfo = await lstat(env.ZEESWAP_CHEF_UFVK_FILE);
  if (!keyInfo.isFile() || keyInfo.isSymbolicLink() || keyInfo.size < 1 || keyInfo.size > 16384) fail('INVALID_UFVK_FILE');
  const { PrepClient } = options.prep ?? await import('@zeer-dev/prep-client');
  const { singleBlockClient } = options.bounded ?? await import(pathToFileURL(resolve(app, 'bounded-prep-client.mjs')).href);
  const client = singleBlockClient(new PrepClient({ url: metadata.ZEESWAP_CHEF_PREP_URL, ...(prepToken !== undefined ? { token: prepToken } : {}) }));
  let status;
  try {
    await sdk.main(['status', '--config', config, '--json'], { client, write: text => { status = JSON.parse(text); } });
  } catch (error) {
    // Only the SDK's exact typed reconciliation diagnostic may reach the stricter recovery gate.
    if (!sdk.CliError || !(error instanceof sdk.CliError) || error.code !== 'RECONCILIATION_REQUIRED'
      || status?.state !== 'reconciliation_needed') throw error;
  }
  const ready = status?.fingerprint === pins.projectFingerprint && status.project === metadata.ZEESWAP_CHEF_PROJECT
    && ['caught_up', 'backfill'].includes(status.state) && status.readGate === 'ready'
    && status.source?.availability === 'available' && status.source.identityMatches === true
    && status.source.checkpointAheadOfPrep === false && Number.isSafeInteger(status.checkpoint?.height)
    && sha(status.checkpoint?.hash);
  if (!ready && env.CHEF_SOURCE_RECOVERY === 'reviewed-source-only') {
    await verifySourceRecovery({ pins, status, metadata, client, now: options.now });
  } else if (!ready) fail('FOLLOWER_PREFLIGHT_NOT_READY');
  // Official CLI owns source epochs, canonicality, writer locks, commit and signal cleanup.
  // Fixed single-block requests retain the deployed response-size protection.
  await sdk.main(['sync', '--config', config, '--follow', '--json'], { client });
}
export async function runtimeFailure(error, app = '/app') {
  if (error instanceof RuntimeError) return { error: { code: error.code } };
  try {
    // Use the published SDK's fixed vocabulary and retry advice; never serialize third-party messages.
    const { cliFailure } = await import(pathToFileURL(resolve(app, 'node_modules/@zeer-dev/chef/dist/cli-output.js')).href);
    return cliFailure(error, error?.code);
  } catch { return { error: { code: 'CHEF_CONTAINER_FAILED' } }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRuntime().catch(async error => {
    // Third-party errors may contain credentials, SQL or private scanner details.
    console.error(JSON.stringify(await runtimeFailure(error)));
    process.exitCode = 1;
  });
}
