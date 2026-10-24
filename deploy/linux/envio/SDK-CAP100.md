# Reviewed Envio scheduler cap, not yet applied

The observed stock 3.14.0 runtime preloaded 5000 callbacks before its next
commit. Its six block effects per second created a long gap between checkpoints;
SQL writing itself took 0.217 seconds and reported no blocking sessions.
This artifact changes only processing batch size, preserving original YAML,
handlers, public configuration identity, projection digest, generation, schema,
birthday and rollback floor. It does not improve the six-blocks-per-second
throughput ceiling or change RPC rate. A live freshness window remains required.

The runtime must be described as **Envio 3.14.0 with modified cap100 scheduler**,
not as an unchanged stock runtime. Record the exact additional runtime hash in
the deployment inventory. The group-header alternative remains unimplemented.

## Exact artifact

Target relative to the isolated project:
`node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs`.

- Stock: 15497 bytes; SHA-256
  `0e0e1b8985c0c4b37fde11bcd915a803e9efa76fea521ac380613d7626712f77`.
- Modified: 15571 bytes; SHA-256
  `eab1bb2c44294b25a456a367c90eb0c4d87b0b2f2f2f51259144e7be7de64f9f`.

The only added statement, immediately after the existing internal `patchConfig`
application in `startIndexer`, is:

```js
config$2 = {...config$2, batchSize: Math.min(config$2.batchSize, 100)};
```

Stock execution already awaited `Persistence.initForRun` and typechecking before
this seam. State creation subsequently consumes the capped copy, including the
block-callback generation budget derived from batch size. The original config
object and `config.envioInfo` are not rewritten. Reorg detection, entity writes,
checkpoint transactions and storage-resume validation retain their existing
implementation. This is an internal SDK seam, not a supported CLI/environment
flag. Do not add `full_batch_size` to YAML or edit `envio_info` as a substitute.

## Explicit parent/operator application

First review/publish this helper and verify its release artifact. Stop only the
isolated Envio engine, confirm its process group has exited, and retain private
pre-change progress/generation/floor evidence. Keep all customer controls paused.
No helper command stops or starts a service or connects to a database.

As root, create the canonical archive directory
`/opt/zeeswap-testnet/state/envio-engine/sdk-originals` with mode0700. Inspect the
stock path through `sdk-cap100.mjs check` before calling `apply`. Full command:

```sh
/usr/bin/node /opt/zeeswap-testnet/current/app/deploy/linux/envio/sdk-cap100.mjs apply /opt/zeeswap-testnet/state/envio-engine/project/node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs /opt/zeeswap-testnet/state/envio-engine/sdk-originals/Main.res.mjs.stock-0e0e1b8985c0c4b37fde11bcd915a803e9efa76fea521ac380613d7626712f77
```

The CLI requires Linux/root and these exact paths. The helper refuses any unknown
or already modified source and any existing archive. It writes/fsyncs an
exclusive original archive, then writes/fsyncs a same-directory temporary file
and atomically renames it over the target. It never truncates the existing inode:
pnpm's shared hardlink store must retain stock bytes. It verifies both resulting
hashes and syncs directory entries. On a partial failure preserve the archive and
inspect both bytes; do not delete/retry blindly. Never modify the shared store.

After successful application, root creates protected
`/opt/zeeswap-testnet/secrets/envio-sdk-runtime.sha256` containing the modified
hash, two spaces and the exact target path, followed by newline. Install the
separate `zeeswap-envio-engine-cap100.conf` as
`/etc/systemd/system/zeeswap-envio-engine.service.d/10-sdk-cap100.conf`. This
additive drop-in checks the runtime hash before every service start. It does not
replace the published `run-engine.sh`. Review/root daemon reload and an explicit
engine start remain operator actions. No automatic restart/activation is added.

After startup verify original producer generation, committed progress and floor
preservation, nominal max batch100 in metrics, bounded effect queue, recurring
atomic commits and unchanged RPC effect limit. Measure actual source growth and
catch-up rate separately. Five minutes of sustained canonical freshness must
pass after catch-up before considering consumer/intake readiness. The earlier
5,000-item batch's single commit is not a passing freshness window.

## Focused checks

Run `node --test deploy/linux/envio/sdk-cap100.test.mjs` with
`ENVIO_STOCK_MAIN_PATH` pointing to the exact archived stock file. The tests use
disposable fixtures and actual filesystem hardlinks, never the installed SDK.
They check exact byte delta/hash/seam ordering; preservation of the store link
and stock archive; refusal of repeated application, conflicting archive and
unknown preimages. Missing stock fixture causes those fixture-dependent tests
to skip and does not count as verification. Actual VPS application and freshness
must be reported separately from local tests.

Local verification on 24 October: Node 24/Linux ran all four tests against the
exact installed stock source, **4 passed, 0 failed, 0 skipped**. Only disposable
temporary fixtures were modified; the installed stock SDK remained unchanged.
Working-candidate publication secret scanning reported zero findings, and tracked
diff whitespace checking passed. No remote operation or service action occurred.
