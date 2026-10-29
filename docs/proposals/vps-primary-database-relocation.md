# VPS PostgreSQL primary transport and origin provenance

The user explicitly selected PostgreSQL on the existing VPS as primary for Main,
Bridge, Chef and Envio. This is a database relocation with a new physical cluster,
not a reset of financial history or permission to start old actors. Infrastructure
and actual dump/restore are separate operator work. No laptop Docker or PostgreSQL
is required.

## Main boundary

Keep operator profile `76711023...8251`, original immutable runtime/registry,
wallet/key paths, source fingerprint, payload/lookup keys and the logical
`br-broad-pine-ao79wemx` / `zee_app_20261023` crypto namespace unchanged.
Validate those origin facts first, then resolve actual destination URLs through
a separately pinned Root relocation receipt. Effective runtime `host` is
`127.0.0.1`; the preserved origin host is explicitly historical metadata.
No DNS alias or provider relabelling is used.

The Main destination is PostgreSQL 18.6 at TLS loopback port 55435, with the same
logical database and API/worker/reader/admin role names. Original user-schema
owners, function bodies, memberships and ACLs are retained. The deliberate
destination-only identity ACL grants EXECUTE on `pg_control_system()` to those
roles, without granting superuser, pg_monitor or other elevated role flags.

`main-database-relocation.ts` validates source/dump/semantic snapshot/schema/ACL
pins, destination system identifier, exact physical endpoint, CA and execution
overlay pins. The service-readable credential file contains version/API/worker
URLs and optional reader URL. An admin password is never included in that file.
Local admin has a separate protected credential and downloaded CA/proof pins.

`db.connect` uses explicit pinned CA verification and fences every newly acquired
connection with actual database, role, `pg_control_system().system_identifier`,
server version and its own `pg_stat_ssl` row before business queries. The mode
`VPS_PRIMARY_REQUIRED` refuses missing transport proof or unbound URLs.

Selectors are `ZEESWAP_MAIN_DATABASE_TRANSPORT_PROOF` at
`/opt/zeeswap-testnet/state/database-relocation/main-primary.private.json` and
`ZEESWAP_MAIN_DATABASE_TRANSPORT_SHA256`. The receipt status is
`ROOT_MAIN_DATABASE_RELOCATION_COMMITTED_EXACT`. Its source/destination semantic
snapshot, schema and schema-ACL hashes must agree. System-column xmin and cluster
transaction IDs are explicitly excluded from semantic restore equivalence.
Logical columns such as created_xid remain immutable archival data.

## Original transaction outcomes

Classify every required original XID on the origin while it is reachable and
quiesced. Bind each classification to its original intent and completed-receipt
raw hashes, and retain that classification manifest with the dump. Never query
the new cluster for an old numeric XID or present a classification as a new-server
`pg_xact_status` result.

The shared resolver returns a tagged `ARCHIVED_ORIGIN_CLUSTER` result without
issuing any destination query. New intents include the actual destination system
identifier; only those scoped intents query destination transaction status.
Unknown unscoped old transactions refuse. Fresh fees and activation retain their
existing exact current-cluster XID/CAS/ledger behavior.

Prior-opening continuation validates the old receipt/classification as origin
evidence and compares the exact pinned destination restored baseline, financial
books and retained headers. The final source freeze is epoch 233 even though
the historical R8 intent recorded epoch 232: that old intent remains untouched.
The relocation proof explicitly binds frozen control 233 to restored control
233 with a newly measured xmin; the logical Base checkpoint still matches R8.
Its next fresh approval binds the current destination xmin.
An old origin intent cannot run destination `finish`.

## Active code inventory

| Surface | Transport/provenance action |
| --- | --- |
| `linux-testnet-profile.ts` | Verify frozen origin bytes/roles, then explicit Main resolver; return origin and effective runtime separately. |
| `linux-envio-profile.ts` | Same Main resolution for app consumers; old source credential is still archived and needs its separate Source store overlay. |
| `db.ts` | Actual TLS/cluster/role fence before pool hands out a client. |
| `linux-control.ts` | Admit destination admin URL only when registered against the explicit relocation proof. |
| `launch-testnet-service-policy.ts` | Metadata receipts use tagged origin classification; canonical audit binds transport provenance. |
| local service admin | Separate admin credential/CA/proof pins; source classifications are not destination mutation reconciliation. |
| scoped opening | Original prior receipt can be origin-scoped; newly generated intents record destination incarnation. |
| old pinned Native Node guards | Need the separate verified execution preload; never modify frozen original files or lie about DNS. |
| tracked Python wallet/profile code | No direct psycopg usage found; original pinned guard subprocesses inherit environment, allowing the explicit pinned Node preload. |

The legacy preload must select the exact installed pg 8.23.1 module and exact
old Main entry/host/database/role, verify Root execution pins, create real TLS
destination connections and fence their actual system identifier. It must reject
origin-XID queries, not synthesize committed statuses. This bounded execution adapter has separate code and tests from the Main
proof and loader kernel.

## Source stores and cutover order

Envio's tracked revision is `pg_snapshot_xmax(pg_current_snapshot())`, so logical
restore cannot preserve its transaction lineage. Preserve its entities,
checkpoints, sequences and projection bytes, but issue an explicit new store
incarnation/generation. Archive old Source snapshots/permits; do not resume their
packet chains against a reset revision. Bind app admission to the new generation
through explicit closed metadata qualification.

Chef uses `zee_chef_20261023` / `zee_chef_owner_20261023` on the same live origin.
Inspect its actual revision mechanism: preserve a stored monotonic counter when
possible, otherwise introduce a new explicit store incarnation and rebind the
watch-only cursor/journal identity under verified metadata authority. Viewing
keys, project/account identity and receipt decryption scope stay unchanged.

Quiesce all writers and signers; capture origin transaction classifications and
whole-store semantic/schema/ACL/sequence snapshots; encrypt/dump; restore only
the named destination databases; qualify restricted-role TLS and actual cluster
identity; issue exact transport/execution/store proofs; start read-only followers;
verify real progress and canonicality; prepare fresh bounded policy/capital/window
proofs. Main's existing 0020/0021 installation is restored and catalog-verified,
not reinstalled or relabelled as a new destination transaction. Fees remain 10000
until the existing separately verified +30000 allocation runs exactly once.

Bridge is a distinct logical database/crypto scope even when empty. It needs its
own restored or explicitly fresh-schema proof and exact roles; Main's proof
cannot silently authorize Bridge, Chef or Envio connections.

## Implemented Main stage

The proof/transport kernel, explicit loader selectors, both Main runtime loaders,
pool startup fence, local admin registration and scoped origin-transaction
resolution are implemented. Service launch metadata and prior-opening metadata
no longer ask a new cluster about an old origin XID. New installation, allocation,
activation and opening intents carry their actual destination system identifier.
Existing archived receipts retain their original fields.

Twenty focused tests and API TypeScript passed. Tests verify unchanged keys and
logical namespace, actual endpoint labels, TLS/cluster/role mismatch refusal,
zero destination queries for archived classifications, explicit destination
incarnation for fresh transaction queries, pool identity fencing before business
queries, no unbound connection in required-primary mode and restored semantic
prior-opening comparison with new physical xmin. They use local synthetic clients;
actual restricted-role PostgreSQL TLS/restore qualification remains required on
the named destination before any runtime cutover or signing.

The origin classification is a separately pinned typed file linked to actual
source capture SHA `bc8d9ec2...105fc`. The destination restored baseline is also
a separately pinned file with its actual control/checkpoint xmin, semantic row
digest and system identifier. Both files are validated before service URLs can
be registered; archived outcomes issue zero destination queries.

Local administrative configuration adds `databaseTransport: {proof: LOCAL_PIN,
ca: LOCAL_PIN, classification: LOCAL_PIN, baseline: LOCAL_PIN}`. Its separate new admin profile names the actual forwarded
127.0.0.1:55435 destination with `sslmode=verify-full`. The source administrative
credential remains local/archive-only. The service-readable credential file may
include `readerUrl` when the frozen runtime requires that restricted reader;
it still cannot contain an admin URL or crypto-key replacement.

## SDK host wiring

The host observation loader verifies the archived original selector, Source
config and code manifest first, then applies the separately pinned SDK physical
store relocation, then validates the independent consumer approval against the
new store generation. It retains `originSource` and `originCredential` as archive
facts and returns the effective Source/export credential separately. Required
SDK-primary mode cannot fall back to a legacy selector.

Exporter startup accepts the new fixed sdk-primary profile path only when its
raw pin exactly matches the SDK relocation receipt. It obtains the effective
export-role URL from that proof, applies explicit CA-verified pool options and
the actual system/database-OID/role/TLS fence before any HTTP listener starts.
Read-only catalog checks use a CASE around table-only privilege functions so
sequences cannot cause eager planner errors.

The worker's audited import closure now includes the Main transport kernel:
48 mandatory source/assets entries. Twenty-three focused SDK/profile/exporter/
transport/worker-closure tests and API TypeScript passed for this wiring stage.
No VPS, restore, Source restart, policy or financial mutation was performed for
these local tests.

## Operator restore checkpoint — 29 October 2026

Root created the isolated PostgreSQL 18.6 primary with TLS enabled and a
loopback-only host listener. Encrypted backups were created for all four live
stores and copied to separate local private storage. The original source writers
were stopped for capture. Existing unrelated containers and databases were not
reused or removed.

Actual destination readback matched every captured raw application row, schema
definition and application ACL for Main (29 tables, 4,646 rows), Envio (48 tables,
5,123 counted rows across parent/partition relations), Chef (15 tables, 321 rows)
and the empty bridge store (one table, zero rows). Six source Main role-membership
edges were independently restored; matching object ACLs alone was insufficient
for inherited access. Legacy ACL grantee roles have no destination login.

The Main API, worker and reader, and the dedicated bridge runtime role completed
actual CA-verified TLS connections and returned the expected database, role,
PostgreSQL version and cluster identifier. These checks establish restoration
and connection identity, not public financial activation. SDK source incarnation,
runtime cutover, fresh chain observation and financial policy qualification
remain separate execution gates.

The backup reader needed explicitly recorded SELECT permissions on the migration
registry and two sequence metadata objects. The restricted bridge reader needed
USAGE on an empty public schema. These read-only source metadata deltas were
reviewed by the operator; no financial row, spending key or source administrator
credential was transferred through those grants. Source administrator credentials
remained local. Destination identity-function grants are recorded separately from
application ACL equivalence.
