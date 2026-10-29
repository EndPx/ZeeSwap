# Pinned legacy Main PostgreSQL preload — 29 October 2026

This adapter keeps the original profile `76711023...` and native guard command
bytes unchanged while relocating their actual Main connections. It does not
change DNS, present a VPS as a Neon endpoint, activate a policy, authorize a
broadcast or synthesize a destination result for an origin transaction ID.

## Exact process scope

Only the Main policy-worker unit receives this preload environment. Its Python
supervisor inherits it, and the original reverse/refund native guard Node children
inherit it in turn. Main API, Envio, Chef, Bridge and Root administrative commands
must not receive this unit-specific preload.

The Root-pinned overlay manifest admits exactly three main-thread file entries:

1. The fresh release's exact, hash-pinned
   `api/scripts/work-linux-testnet-policy.ts`: proof-bound **passthrough**, using
   the normal central resolver and `VPS_PRIMARY_REQUIRED` mode.
2. Original `linux-live-20261024/app/api/scripts/reverse-linux-broadcast-guard.ts`.
3. Original `linux-live-20261024/app/api/scripts/refund-linux-broadcast-guard.ts`.

The latter two can map only `zee_app_worker_20261023`. Unknown main entries,
eval/print/stdin main programs, unpinned passthrough scripts, arbitrary roles,
admin credentials and native pg drivers are refused. Additional Node child entry
points require another explicitly reviewed inventory; no pattern allows them.

The real `tsx` loader uses an internal worker thread and inherits NODE_OPTIONS.
Such threads validate the same Root inputs but receive database constructors
that refuse all connections. This allows source loading without granting a
blanket worker-thread database bypass.

## Shared proof and actual connection fence

The preload calls the shared `loadMainDatabaseTransport` and
`verifyMainDatabaseClient` kernel. It does not define another relocation receipt
schema or edit `db.ts`. It verifies the original operator-profile raw hash,
the profile's exact immutable runtime pin, the protected source runtime bytes,
the actual CA pin, credential pin and Root relocation proof. The receipt's
`executionOverlay` must equal this exact overlay-manifest path and raw SHA.

The old connection must match the frozen original Main host, database, worker
role and original password. The effective connection is visibly
`127.0.0.1:55435`, with the same role/database and the proof's credential and CA.
Connection-string parsing cannot replace the enforced SSL object. Custom streams,
connections, replication and session-option bypasses are refused.

Before exposing a connected client or sending business SQL, the adapter requires
an encrypted, authorized TLS socket and the shared kernel's actual SQL identity
check: database, restricted role, PostgreSQL version, `pg_stat_ssl` and
`pg_control_system()` system identifier. Wrong identity destroys/refuses the
connection. The protected proof/manifest/runtime inputs are rechecked before
business queries. Source host strings remain archive facts; no alias claims they
are the physical destination.

Both `pg.Client` and `pg.Pool` are patched in the **actual old pg 8.23.1 module
instance**, resolved from its canonical package. The overlay pins its package
JSON, CJS entry, Client implementation and pg-pool implementation. Pool's captured
original Client constructor is overridden by an immutable `options.Client`; its
verification callback is wrapped without suppressing caller verification or
changing callback failures into success. Standard SQL string/config queries,
Client/Pool Promise APIs and callbacks are covered. Custom Query submit objects
are deliberately unsupported.

Legacy references to `pg_xact_status`, commit-timestamp transaction functions and
role/session-authorization switches fail closed before business transmission.
This is deliberately conservative: it does not invent an old-cluster answer or
silently reinterpret an ID in the new cluster. New code uses the shared kernel's
explicit origin-classification path. A legacy guard that needs an archival XID
query stops for review rather than receiving a fabricated success.

## Root preparation and environment

Stage the final reviewed public release, including the three
`api/src/legacy-pg-transport-*.mjs` modules, the shared kernel and the preparation
script. They are explicit NODE_OPTIONS/CLI roots; the normal worker's static
import closure does not discover these files automatically.

Run this preparation command **outside** the worker's preload environment:

```sh
/usr/bin/node /opt/zeeswap-testnet/releases/FINAL_RELEASE/app/api/scripts/prepare-legacy-pg-preload-manifest.mjs FINAL_40_CHARACTER_COMMIT
```

The preparation script reads only the original profile/runtime pins and public
code/dependency files. It opens no database and starts no worker. It creates a
new, fsynced manifest with exclusive `wx` semantics at:

```text
/opt/zeeswap-testnet/state/database-relocation/legacy-pg-preload.private.json
```

It refuses overwriting an earlier manifest. Preserve any earlier failed/successful
version and its proof before preparing a separately reviewed successor. The
directory is root:G978 0750, and the manifest is root:G978 0640. This shared file
contains only code/path/hash metadata, never URLs/passwords: the normal API must
also read the receipt's overlay pin. Destination admin credentials must remain
in their separate root-only file and must not be added to a group-readable
API/worker credential file.

The manifest contains version/status/public commit, original profile/runtime
pins, public file pins, three exact entries, and the four actual pg file selectors.
Its maximum is 300 files; the minimal current manifest pins eleven public files.
Public files and containing directories must be root-owned, non-writable by
group/other and free of symlink relocation. The source profile/runtime retain
their existing protected permissions and crypto namespace.

Create the shared relocation receipt **after** preparing that manifest, binding
`receipt.executionOverlay` to its printed path and raw hash. The manifest does
not embed the receipt hash, so there is no circular hash dependency. Root then
sets the following only on the Main policy-worker unit, substituting exact paths
and hashes from its reviewed artifacts:

```ini
Environment="ZEESWAP_DATABASE_RUNTIME_MODE=VPS_PRIMARY_REQUIRED"
Environment="ZEESWAP_MAIN_DATABASE_TRANSPORT_PROOF=/opt/zeeswap-testnet/state/database-relocation/main-primary.private.json"
Environment="ZEESWAP_MAIN_DATABASE_TRANSPORT_SHA256=ROOT_RECEIPT_RAW_SHA256"
Environment="ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST=/opt/zeeswap-testnet/state/database-relocation/legacy-pg-preload.private.json"
Environment="ZEESWAP_LEGACY_PG_PRELOAD_SHA256=ROOT_OVERLAY_MANIFEST_RAW_SHA256"
Environment="NODE_OPTIONS=--import=/opt/zeeswap-testnet/releases/FINAL_RELEASE/app/api/src/legacy-pg-transport-preload.mjs"
```

No experimental transform flag is needed. The shared kernel deliberately imports
only Node built-ins, so Node 24 can load it before the original command-line
`--import tsx` hook. A regression test loads that actual kernel before patching
pg and checks both CJS and ESM named/default exports, catching premature pg ESM
capture or incompatible pre-tsx syntax.

This environment is not an instruction to start the unit. Root still qualifies
the actual VPS TLS path and the exact guarded process tree before financial use.
Do not invoke a real native guard against a live order merely to test transport:
some guard branches perform signing-state bookkeeping after their checks.

## Verification

```sh
pnpm --dir api exec tsx --test test/legacy-pg-transport.test.mjs test/main-database-relocation.test.ts
pnpm typecheck
node --check api/src/legacy-pg-transport-preload.mjs
node --check api/src/legacy-pg-transport-adapter.mjs
node --check api/src/legacy-pg-transport-manifest.mjs
node --check api/scripts/prepare-legacy-pg-preload-manifest.mjs
```

Fifteen combined local tests passed, zero failures/skips: eight shim tests and
seven shared-kernel tests at the verification checkpoint. They include the real
pg 8.23.1 Pool captured-constructor path, user verification failure, callbacks,
queued business SQL, identity failure, role/XID rejection, exact connection scope,
manifest entry denial, actual Node 24 plus tsx startup and worker-thread denial.
The wire test uses synthetic hooks and opens no database connection.

API TypeScript checking, module syntax checks and native Node 24 import of the
shared kernel passed. Actual private-file permissions, production preload dispatch
and VPS TLS/database behavior remain unperformed by this coding task. No VPS
mutation, credential logging, policy activation, signing or broadcast occurred.
