# SDK datastore relocation: Envio and Chef

Root uses these artifacts to move the existing SDK stores to the same reviewed
VPS PostgreSQL primary as Main. They do not initialize a new SDK project, reset
entities/progress, move wallets/keys, start a writer or activate financial work.
Docker remains VPS-only. All existing origin proofs, configurations, cursors and
transaction classifications remain archived under their original identities.

## Revision semantics inspected

The actual Envio event-first view in
[`envio-event-first-store.ts`](../../api/src/integrations/observation/envio-event-first-store.ts)
uses `pg_snapshot_xmax(pg_current_snapshot())` as its revision. That numeric
domain belongs to the PostgreSQL store incarnation. It is not portable across a
logical restore and is not itself a committed transaction ID. Envio therefore
requires a new generation, even when every raw SDK row is preserved.

Chef 0.7.0 was inspected in both the adjacent Zeer source checkout at commit
`c7c926ecc337740e794a48d5fd655e8a14d4ae16` and this repository's installed 0.7.0
distribution. Its `state.generation` is an explicit UUID and `data_revision` is
an explicit bigint. The `advance_revision` trigger increments the previous
counter only when checkpoint height/hash changes; it is not a PostgreSQL XID.
Its cursor HMAC identity is project, generation, revision and checkpoint
height/hash. The project fingerprint includes config/schema/source/account
identity, not the resolved database URL value. See the exact
[store implementation](https://github.com/EndPx/zeer/blob/c7c926ecc337740e794a48d5fd655e8a14d4ae16/packages/chef/src/store.ts)
and [cursor implementation](https://github.com/EndPx/zeer/blob/c7c926ecc337740e794a48d5fd655e8a14d4ae16/packages/chef/src/consumption.ts).

Chef's logical generation/counter/checkpoint can consequently be preserved after
an exact restore, with the same API cursor token and trigger. Its new physical
store is still recorded explicitly. Normal subsequent progress increments the
counter and invalidates old snapshots normally. No Zeer Core source was changed.

## Root receipt and private inputs

The shared typed receipt is `SdkDatastoreRelocationReceipt` in
[`sdk-datastore-relocation.ts`](../../api/src/sdk-datastore-relocation.ts).
It is loaded only through these paired selectors:

```text
ZEESWAP_SDK_DATASTORE_MODE=VPS_PRIMARY_REQUIRED
ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF=/opt/zeeswap-testnet/state/database-relocation/sdk-stores.private.json
ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256=ROOT_ACTUAL_RECEIPT_RAW_SHA256
```

Missing proof fails closed in required-primary mode. Root owns the receipt and
readback files, group 978, with mode 0640; containing metadata directories are
root:G978 0750. No owner password or viewing key belongs in the receipt.

Required receipt facts include:

| Boundary | Required evidence |
| --- | --- |
| Original authority | Original operator profile `76711023...`, Linux Envio profile/raw selected source-config pins, original Source generation, registry/projection/full-policy digest |
| Actual primary | PostgreSQL 18.6, real cluster system identifier, each actual SDK database OID, CA raw pin and explicit identity-function grant hash |
| Data equivalence | Exact raw entity, progress, semantic, non-producer schema and application owner/ACL digests plus table count, origin versus restored |
| Envio physical incarnation | Digest of cluster identity, database/OID/schema and the actual restore-readback proof hash; deterministic new generation |
| Envio source presentation | New source-config pin and reviewed view-only DDL pin; all policy/verifier/contract/token/ABI/birthday fields unchanged |
| Chef logical identity | Original project/schema/fingerprint, UUID generation, bigint revision, retained checkpoint, original API-token-value hash and `pg_get_functiondef(advance_revision())` hash |
| Credentials | Separate export-loopback, engine-health reader, engine environment and Chef-only credential pins; application/readers load export credentials only |
| Old transaction evidence | Origin SDK classification-file pin, with actual origin host/database and intent/completed pins; explicitly tagged archive results |

Database OIDs are part of the physical identity, so dropping/recreating a database
on the same cluster cannot silently reuse an incarnation. A new restore needs
a fresh readback proof and generation; never recycle an earlier proof after a
different restore event. Record a unique restore-event identifier in the private
readback dossier. Do not classify an origin `snapshot_xmax` revision as though
it were a committed transaction.

Schema/ACL equality may use the actual frozen post-restore baseline before the
new producer-view generation and identity grants are applied. Preserve that
readback raw pin and record the subsequent approved view/grant deltas separately.
Alternatively, an after-delta comparison must exclude only those explicit
producer-view/system-grant changes. Raw SDK tables, retained checkpoints,
progress, entities, undo/recovery data, contracts and projections remain exact;
do not declare all final schema bytes unchanged.

## Readback file shapes

Each `restoreProof` raw pin identifies a metadata-only JSON object:

```text
version: 1
status: ROOT_SDK_RESTORE_READBACK_VERIFIED
kind: envio | chef
database: exact original SDK database name
databaseOid: actual new database OID as decimal text
systemIdentifier: actual new cluster identifier as decimal text
snapshot: same Snapshot fields as receipt.envio.restored or receipt.chef.restored
```

The Chef readback also carries `logical`, exactly matching generation, revision,
checkpoint, fingerprint, tokenSha256 and revisionTriggerSha256 from the receipt.
Use actual captured digests, not example strings. The helper checks those files
and their raw pins; an empty target cannot satisfy the positive table count and
equivalence checks. Standardize the readback/classification files beneath
`/opt/zeeswap-testnet/state/database-relocation/sdk-stores` so only metadata is
mounted through the Compose overlay's curated metadata stage. If the actual
SDK-store directory also contains engine/Chef credential files, do not mount
that whole source directory. Copy only the two readbacks and the origin
classification file, preserving exact raw hashes, into a new root:G9780750
`SDK_DATASTORE_METADATA_STAGE`. It mounts at the receipt's metadata pathname
inside containers. Mount the export/Chef credential leaf separately at the exact
`SDK_ENVIO_EXPORT_CREDENTIAL_TARGET` or `SDK_CHEF_CREDENTIAL_TARGET` path from
the receipt. No API/export container receives owner secrets by directory mount.

`receipt.example.json` contains the complete field layout. Its target identifiers
and table counts reflect Root's supplied restore checkpoint; its `ROOT_*`
placeholders are deliberately invalid and cannot serve as a runtime proof.
Root reported actual all-data/schema/ACL equality for Envio (5,123 rows, 48 tables,
database OID 18189) and Chef (321 rows, 15 tables, OID 18964) on cluster
7701863382450487342. This coding task did not independently query those databases.

For a concrete digest recipe, sort the existing catalog's per-table
`{schema,name,rowCount,rowHash}` metadata and hash canonical JSON for the semantic
digest. For Chef entities use its `entities` tables; progress/state coverage must
include `state`, `blocks`, `undo` and namespace markers across all preserved
projects. For Envio progress coverage include at least `envio_chains`,
`envio_checkpoints` and `BlockVisit`, including the source-tip row; preserve the
remaining raw entity tables in the entity digest. Use exactly the same selected
table sets and canonicalization on origin and destination, and record that
recipe. Schema/owner/ACL digests come from the actual catalog comparison at the pinned
frozen restore baseline (or the explicit after-delta exclusion recipe above),
not from row counts alone.

Capture the active Chef schema's generation, `data_revision::text`, checkpoint
height/hash and fingerprint from its `state` row. Compute the trigger digest from
the exact UTF-8 value returned by
`pg_get_functiondef('ACTIVE_SCHEMA.advance_revision()'::regprocedure)`, including
its returned newline. Compute tokenSha256 from the existing API token value
after the wrapper's single trailing-newline removal; never print that value.

The origin-classification file has version 1, status
`ROOT_SDK_ORIGIN_TRANSACTIONS_ARCHIVED`, destinationSystemIdentifier and bounded
`records`. Each actual record binds kind, origin database/host, transactionId,
committed/aborted status, intentSha256 and nullable completedSha256. An empty list
is appropriate only when no SDK transaction intent requires classification; it
does not assert complete origin history. The archival helper returns
`ARCHIVED_ORIGIN_SDK_CLUSTER`, never a destination `pg_xact_status` answer.

## Envio configuration and view preparation

1. Stop and verify quiescence of the original SDK writer/exporter before final
   capture. Preserve the original project and all source files/pins. Restore the
   exact `zee_envio_20261023` dataset into the reviewed primary using the separate
   backup/restore workflow; independently compare all raw SDK tables/progress.
2. Capture the actual destination cluster/database OID and readback file. Prepare
   a root-pinned config using `source-preparation.example.json`, then run:

   ```sh
   /usr/bin/node --import tsx api/scripts/prepare-sdk-store-source-config.ts ROOT_CONFIG_PATH ROOT_CONFIG_RAW_SHA256
   ```

   This creates new source-config bytes and view-only SQL in a fresh private
   output directory. It executes no SQL. The generation is
   `envio314-event-first-PROJECTION_PREFIX-store-INCARNATION_PREFIX`; the raw
   producer projection recipe and code hashes stay unchanged.
3. Review the generated `CREATE OR REPLACE VIEW` statements and execute them
   only on the new SDK database. They change the source generation literal and
   continue deriving revisions from the new store's actual snapshot. They do not
   delete or recreate raw SDK tables/progress. Verify the resulting view owner,
   ACL, full payload policy and new generation; archive the old views/profiles.
4. Install the new effective profile at
   `secrets/sdk-primary/envio-export-profile.private.json` and create fresh v3
   descriptors from `engine-datastore-primary-config.example.json` and
   `export-datastore-primary-config.example.json`. Preserve actual source
   PublicNode certificate/verifier identity; consumer Official RPC approval is
   separate and must bind the **new** generation.
5. Prepare separate credential files. Export/API use the export role at
   `127.0.0.1:55435`; engine health uses that same restricted role at
   `postgres:5432` in its isolated network. Engine execution uses the preserved
   `zee_envio_owner_20261023` identity. Do not put the engine-owner credential in
   the host/API export file. Every URI uses verify-full; Node pool construction
   passes the pinned CA explicitly rather than letting URI SSL parsing replace it.
6. In the new engine environment preserve all reviewed settings and set exact
   host `postgres`, port 5432, database `zee_envio_20261023`, schema
   `envio_live_final`, owner role and `ENVIO_PG_SSL_MODE=verify-full`. Build a new
   pinned `source-combined-ca.pem` containing the original public system trust
   bundle and the destination trust certificate. The wrapper verifies both are
   present, retaining PublicNode HTTPS trust and destination database trust.
   Set `NODE_EXTRA_CA_CERTS` to that exact fixed bundle path in the new engine
   environment. The wrapper permits only this path and requires it to match the
   pinned primary `systemCa`; legacy descriptors cannot adopt an unproven extra
   trust bundle. Children receive it before their Node startup. Neither database
   hostname verification nor RPC certificate verification is disabled.
   Do not embed the completed SDK receipt's raw hash in this engine environment
   or the effective export profile: the receipt itself pins those files. The
   wrapper injects the receipt selectors from its later descriptor, avoiding a
   circular hash dependency. Prepare readbacks, generated profile/views,
   credentials/environment and CA first; then the receipt; then descriptors.
7. Rebuild/qualify the wrapper image and recreate the related engine/export
   containers with base + event-first + datastore-primary Compose overlays.
   Use **new supervision directories and descriptors**, not old identity/fatal
   latch directories. The new network is external `zeeswap_app_db_v1`; the
   exporter retains host networking and loopback HTTP 8099. Do not reset the SDK,
   change its birthday/schema/contract, clear a latch or resume an old actor.

The producer and read-only health pools verify actual database, database OID,
role, cluster identifier, TLS, version and absence of elevated role flags before
reading SDK state. Engine startup verifies its actual owner connection before
spawning the existing native SDK. Health/canonical source clocks and source
readiness are not renewed by the relocation receipt or container heartbeat.

Host observation-loader wiring is deliberately separate: it validates the old
completed selector first, then applies this relocation receipt, then loads the
new-generation independent-reader approval. Retain `originSource` and
`originCredential` as archive facts. Old Main admission/cursor identities must be
rebound only through their separately approved metadata publication; changing a
configuration file is not permission to alias an old cursor to the new Source.

## Chef configuration

Restore the exact `zee_chef_20261023` schema/data/ACLs and record the new physical
cluster/database OID. Preserve the actual project, fingerprint, logical generation,
revision, checkpoint, API token value and counter trigger. Do not run init,
migrate, reset or a Core generation update.

Prepare a Chef-only credential JSON with just `databaseUrl`, using the exact
`zee_chef_owner_20261023` role at `postgres:5432`, verify-full and
`sslrootcert=/opt/zeeswap-testnet/secrets/app-postgres-ca.pem`. The copied
`/run/chef/database-url` value must equal this pinned credential. Keep Prep URL,
account, birthday, schema/config bytes, UFVK/scanner and original SDK CLI pins.

Use fresh runtime pins for the changed wrapper. Add
`datastoreModule: {path: '/app/sdk-datastore-relocation.ts', sha256: ACTUAL_PUBLIC_HELPER_SHA}`
to the protected pins JSON, and mount the reviewed helper read-only using
`compose.datastore-primary.yaml` after the existing normal overlay. This changes
consumer implementation/configuration only; no Zeer Core source is patched.

Before starting the official SDK, the wrapper verifies the physical database and
logical counter baseline/trigger. It requires the same UUID generation and a
revision at least as high as the verified restore baseline, allowing normal
subsequent commits. Every new SDK pool connection gets the physical identity
verification callback. API startup also checks the original token **value** hash
(after removal of one trailing newline), preserving HMAC cursor identity. The
usual explicit follower opt-in, freshness/read-gate and canonical checks remain.

The source API may remain reconciling/stale after an exact database restore.
That is not repaired by relabeling its heartbeat, resetting its project or
declaring financial readiness. Start only the approved one-writer process and
verify ordinary actual progress through the original protocol.

## Acceptance and current verification

Record the destination-only EXECUTE grants for `pg_control_system()` in each SDK
database for its preserved owner/export roles (see `destination-identity-grants.sql`), without granting pg_monitor or
changing global role flags. Keep source schema/ACL equivalence and this deliberate
system-function ACL delta distinct.

The local API typecheck and seven focused SDK proof tests passed. Combined Docker
wrapper regressions passed 46 tests; four actual Linux process-group tests were
skipped on Windows. These checks did not start Docker, query a database, create a
view, change credentials, start a writer or perform financial work. Root must
qualify actual container mounts, CA/native-driver behavior, raw data/progress
equivalence, source freshness and the explicit consumer rebind before activation.
