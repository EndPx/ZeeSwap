# Linux Envio transport draft

These separate files prepare the pre-funding relocation. They have not been
installed or started on the VPS. The frozen Windows observer, its admission
journals and original producer views remain unchanged. No signing adapter is
loaded by either new TypeScript entry point. Continuous source freshness remains
an open acceptance gate; local profile tests do not prove a live deployment.

Public artifacts live under `deploy/linux/envio/`, within the release packager's
`deploy/linux/**` allowlist. The engine unit points to
`/opt/zeeswap-testnet/current/app/deploy/linux/envio/run-engine.sh`.

## Preserve producer state

The operator must first publish the reviewed source revision, keep intake and
dispatch disabled, verify zero quotes/orders/deposits/obligations/operations and
epoch 0, prove original opening capital and wallet identity, and stop the local
Envio engine and application observer. Preserve every original admission file
byte-for-byte, record SHA-256 and size, and transfer protected archive copies.
Do not delete the originals. Retain the archive schema and all historical rows.

The single remote engine resumes the existing Neon `zee_envio_20261023` database,
`envio_live_final` schema, chain 84532 and birthday **49128651**. Never run
`db-migrate`, reset, re-install views or regenerate the producer generation during
this handoff. Preserve the exact producer profile's registry/ABI/projection
digests and generation. Projection digest is
`91dad6a1a769d95f7ccfa8286e5bf2d55bf01225e1e86f9adbf9f2bcc1662e27`.

Stage a verified Linux project at
`/opt/zeeswap-testnet/state/envio-engine/project`, including its reviewed source,
locked Envio **3.14.0**, TypeScript **6.0.3**, generated runtime and original
`live.yaml`. Codegen validation is a separate build step; it is not a database
migration. Record project/config/artifact hashes and verify the runtime against
the published source before starting. The engine working tree is separate from
the immutable API release because upstream tooling may write runtime files.
The engine script compares `live.yaml` to the approved `ENVIO_CONFIG_SHA256` and
the protected `/secrets/envio-live.yaml` copy. It does not create either file.

The protected `envio-engine.private.env` must contain the existing owner
`ENVIO_PG_HOST`, `ENVIO_PG_PORT`, `ENVIO_PG_DATABASE=zee_envio_20261023`,
`ENVIO_PG_SCHEMA=envio_live_final`, `ENVIO_PG_USER=zee_envio_owner_20261023`,
password, existing API token if required, `ENVIO_INDEXER_PORT=9899`, and approved
`ENVIO_CONFIG_SHA256` and `ENVIO_PNPM_CLI_SHA256`. No credentials belong in unit
files. The script uses the VPS's verified `/usr/bin/node` (Node 24;
SHA-256 `e237a2839d0cbdc9a9a2adda1a184afc0f5b20306ffbe923af5686550472d8a8`),
verified remote TLS, at most two database connections and a 256 MiB heap. It
disables Hasura/TUI and uses no Docker or local database. The isolated pinned
pnpm entry is `/opt/zeeswap-testnet/tools/pnpm-10.21.0/bin/pnpm.cjs`, invoked with
`/usr/bin/node`; global pnpm is never selected. Install the complete public pnpm
tool artifact before startup, verify its per-file manifest, and set the CLI hash
to `b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9`.
The launcher checks the CLI hash and exact version 10.21.0 before executing only
the already-installed local Envio binary. Package-manager version downloading is
disabled and no install/dlx/codegen/network bootstrap is performed at startup.

Dependency installation is a separate operator build step using the frozen
lockfile and a previously prepared store. Use the isolated CLI with
`install --offline --frozen-lockfile`; missing cached dependencies must fail.
The public source artifact intentionally excludes project `node_modules`, so
source extraction alone cannot start an indexer. Existing shared pnpm 9 is not
changed. Both HTTP export and observer units also execute `/usr/bin/node`.

## Explicit new consumer admission

The laptop admission frontier is now far beyond its 1000-block recovery bound.
Do not reuse it as a fresh frontier or silently reset it. A new Linux consumer
is allowed only through the parent's explicitly approved pre-funding relocation.
All original journals are retained as pinned private `oldAdmissionArchives`.
The source birthday, views, generation and database are preserved; only the
separate application consumer starts with a recorded empty admission journal.
It initially verifies a 32-block tail because no accepted customer exists.
After initialization the usual contiguous admission, 32-block replay, retained
financial anchors, previous-admission hash and hard 1000-block gap apply.
Post-intake gaps require manual contiguous recovery; no reset command exists.

Create root-protected `/opt/zeeswap-testnet/secrets/linux-envio-profile.private.json`
with the `LinuxEnvioProfile` interface in `api/src/linux-envio-profile.ts`:

- `version:1`, `mode:LINUX_ENVIO_TESTNET`; SHA-256 `{path,sha256}` pins for
  `operatorProfile`, `runtime`, `registry`, `exportProfile`, `exportCredentials`,
  `token`, `relocationProof`, and every `oldAdmissionArchives` entry. All paths
  are beneath `/opt/zeeswap-testnet/secrets/`. Pin original runtime/registry bytes
  matching the Linux operator profile; do not edit opening evidence.
- `operatorProfile` is `linux-operator-profile.private.json`;
  `relocationProof` is `relocation-applied-proof.private.json`, generated by the
  separately reviewed `verify-linux-handoff.ts write-proof` after actual checks.
- `admissionPath:/opt/zeeswap-testnet/state/envio/admission.live.bin` and
  `bootstrapReceiptPath:/opt/zeeswap-testnet/state/envio/bootstrap-receipt.private.json`.
- `sourceUrl:http://127.0.0.1:8099` and
  `canonicalRpcUrl:https://base-sepolia.gateway.tenderly.co`.

`exportProfile` retains the original policy, schema `envio_live_final`, port8099,
and `databaseUrlEnv`/`tokenEnv` variable names. `exportCredentials` privately holds
`databaseUrl` for **zee_envio_export_20261023**, SELECT-only on the three existing
views. The export implementation checks actual role/write privileges and binds
loopback only. Keep all pinned files mode 0640 or 0600 and disallow symlinks.
Create `/state/envio` mode0700 owned by the service user before initialization.

After a fresh root-written handoff proof (maximum age five minutes), the operator
runs exactly once as `zeeswap-testnet`, from the reviewed release API directory:

```sh
/usr/bin/node --import tsx scripts/observe-linux-envio.ts /opt/zeeswap-testnet/secrets/linux-envio-profile.private.json --initialize-empty-consumer
```

This verifies connected app role/database and zero paused epoch0 state under a
read-only repeatable-read transaction, then exclusively creates receipt and
encrypted journal. Existing files cause refusal. Partial initialization requires
operator review; the helper never repairs, removes or overwrites it. A dedicated
session advisory lock `(84532,20261024)` serializes consumers independently of
the shared settlement-operator lock. Ordinary startup requires both files;
missing journal is fatal. Bootstrap itself publishes no SQL checkpoint.

## Operator service commands, after review

The templates deliberately use `Restart=no`; operator review follows any failed
start or gap. Install these three units through the parent deployment workflow,
then start only the observation services, in this order:

```sh
systemctl start zeeswap-envio-engine
systemctl start zeeswap-envio-export
systemctl start zeeswap-envio-observer
systemctl status zeeswap-envio-engine zeeswap-envio-export zeeswap-envio-observer
```

Bounded consumer check, after initialization (do not run alongside the service):

```sh
/usr/bin/node --import tsx scripts/observe-linux-envio.ts /opt/zeeswap-testnet/secrets/linux-envio-profile.private.json --once
```

Stop with `systemctl stop zeeswap-envio-observer zeeswap-envio-export
zeeswap-envio-engine`, verify all groups exited, and preserve journals before any
handoff back. Do not restart the laptop engine while the remote engine writes.
Use protected authenticated GET `/zee-observation/status` and `/zee-observation/export?from=H`
on loopback8099 for diagnostics; do not expose tokens or raw exports publicly.
Require a new bounded five-minute freshness window plus independent checkpoint
and retained-anchor checks before the parent considers intake activation. These
units neither activate controls nor start forward/reverse/refund workers.

## Local checks, 24 October 2026

API typecheck passed. Two profile/admission tests passed: retained old-journal
inventory and safe physical paths; valid recent bound handoff proof versus stale,
future or mismatched proof, each nonzero customer count, enabled dispatch and
changed epoch. These are local negative tests, not VPS execution, real RPC
freshness or financial evidence. Engine/runtime copying, systemd execution,
remote source catch-up, wallet-capital handoff proof and sustained freshness are
still pending operator work.

The working-candidate publication audit also passed with zero secret findings
(51 public candidate files; secret values never printed). `git diff --check`
passed for tracked changes. No files were staged, committed or pushed by this
subagent; the parent owns explicit publication and must rerun the staged audit.

Packaging correction: a direct import of `deploy/linux/package-release.mjs`
verified that its actual `publicReleasePath` filter admits all five files in
`deploy/linux/envio/`; the engine unit's new script reference was also checked.
This local filter check passed. Building the full package from the reviewed
Linux milestone commit remains the parent packaging step after publication.
