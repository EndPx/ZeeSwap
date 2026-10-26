# Event-first Envio source rollout

This rollout changes the Base source storage/proof contract. It does not resume
the application consumer, admit an order, renew financial authority or dispatch
funds. The operator performs every VPS/Docker/SQL action. Do not run Docker on
the development laptop.

The 26 October source maintenance is complete: actual source follow and physical
reclamation were verified, and both corrected Docker source services are healthy
with `unless-stopped`. The [evidence record](../evidence/envio-event-first-storage-fix.md)
contains the exact backups, preserved application state, row counts, measured
sizes, qualification refusals/passes and post-cleanup follow. Neon's reported
control-plane size/84% alert meter was not established as refreshed. Application
adoption/recovery and financial activation remain open.

The steps below document the gated procedure. Do not rerun the already committed
view DDL or original DELETE, clear the preserved failed campaign, or restore an
old checkpoint merely to repeat the operation. A post-reclamation repair must
retain the qualified event-first handler and current persisted SDK state; the
old numeric-visit producer is not an automatic rollback target.

1. Preserve the original source checkpoint, all rows and the complete verified
   PG18 backup. Retain the 48-table restore count/digest proof. Stop the legacy
   source engine and make its old unit triggers non-triggerable using the
   reviewed retirement condition. Preserve the original unit files. The old
   exporter must also be stopped before assigning its loopback port to V2.
2. Rehearse the exact new handler/helper against the full restored fixture.
   Keep the schema, YAML handler path and `ZeeSwapEmptyBlockVisits` name. Use
   `envio start --config live.yaml`, without a restart/reset/migration option.
   The [exact v3.14.0 CLI](https://github.com/enviodev/hyperindex/blob/v3.14.0/packages/cli/src/cli_args/clap_definitions.rs)
   automatically refreshes generated TypeScript declarations: permit
   writes only to a **new** `.envio` directory/cache and a **new** isolated
   `envio-env.d.ts` file. Mount handlers, schema, YAML, old SDK and pnpm read-only.
   Root's isolated fixture shares only the fixture Postgres network namespace;
   no indexer metrics port is published.
3. Validate real resume and commits: native SDK progress/checkpoint/hash joins
   must agree with the constant `84532:source-tip` row. Its processor clock must
   be current, `coverageComplete` false and both old header JSON fields null.
   Verify the original event table and legacy numeric rows remain intact.
   A deliberate rehearsal block bound is a stop, not a production health proof.
4. Derive the new projection using `eventFirstProducerIdentity()` from the
   actual mounted bytes of `live.yaml`, `schema.graphql`, the replacement
   `src/handlers/settlement.ts`, `src/headers.ts` and `src/event-first-tip.ts`.
   Use its distinct generation. Keep every other event-selection policy field
   unchanged. Prepare the two new views with `eventFirstProducerViews()` and
   review/apply them explicitly; the runtime never applies DDL. Grant the
   existing export principal SELECT on these new views only.
5. Qualify the V2 source with its real read-only export principal and actual
   canonical RPC reads. `GET /zee-observation/event-first/status` reports SDK
   state; it is not an event-completeness certificate. The bounded authenticated
   `/zee-observation/event-first/export?from=H&through=N` protocol captures at
   most 64 consecutive blocks of SDK
   state/events together, verifies every requested header and compares the full
   exact raw `eth_getLogs` tuples. The independent consumer repeats the RPC
   checks. The smaller advertised range keeps the captured SDK tip compatible
   with the unchanged 40-block lag guard at 24 methods/second on a roughly 5-block/
   second chain; actual provider latency still determines success. It is not a
   latency guarantee. Supported optional provider seconds/milliseconds fields
   must match the independently read canonical header second; unknown extras
   refuse. A pure JSON validator alone cannot attest RPC completeness.

For the Docker source, explicitly combine `compose.yaml` with
`compose.event-first.yaml`. Use the version-2 engine/export descriptor examples
and a newly built immutable image from the six-file public allowlist. The old
version-1 descriptor still requires its original generation/projection and
cannot select the new command accidentally. Root must inspect the actual merged
Compose model before starting any writer.

- `ENVIO_EVENT_FIRST_PUBLIC_PROJECT` is the new public-only project mounted at
  the original in-container project path. The old installed SDK is a separate
  nested read-only mount; create its empty destination mountpoint in advance.
- `ENVIO_EVENT_FIRST_GENERATED` contains only new generated declarations/cache,
  owned by UID 986:GID 978. These are the only added writable source-code paths.
- The Root-pinned engine environment sets `ZEESWAP_EVENT_FIRST=true`. Production
  rejects both rehearsal/max-block variables. The reviewed existing launcher
  retains the original Neon host, database/schema, TLS and SDK checksum checks.
- Pin the host public CA bundle in `systemCa`, mount it read-only, and pass
  `SSL_CERT_FILE` to the actual native child. Node bundled-root tests and loading
  the native addon do not prove native Rust HTTPS. Never disable verification.
- Export uses only its read-only database credential/token and the separately
  pinned V2 profile. It binds the same loopback port 8099. The V2 status/export
  paths are distinct; old V1 completeness is never fabricated after compaction.
- Existing process-group cleanup, sticky fatal latch, resource limits and
  restart policy remain. Health requires a live original child, exact source
  identity, actual committed processor clock, exact SDK checkpoint and fresh
  independent chain/M/head/finality checks. Container-up and heartbeat time
  cannot renew source freshness. Health is not financial readiness.
- Preserve the engine's original missing `NODE_ENV`; its reviewed environment
  factory adds production mode only for export. Do not inject dummy Hasura
  credentials to compensate for an engine startup error. The fatal hold uses a
  referenced idle handle so an unhealthy source cannot exit merely because its
  event loop became empty. Stop it explicitly; retain the original fatal state
  and use a new reviewed campaign rather than automatically clearing a latch.

The completed phased reclamation followed bounded production-source
qualification. Its required actual **production** SDK undo floor must be
past legacy height 50328502 and numeric undo/history must be absent; a fixture
floor cannot substitute. Stop the writer and verify backend absence before the
reviewed exact-row DELETE. Preserve the single tip, events, metadata, native
checkpoints and application history. Classify the original transaction before
any subsequent step if COMMIT acknowledgement is unknown. The later explicit
VACUUM FULL rewrites the live survivors; inspect physical/WAL headroom and actual
before/after sizes. Do not infer reclaimed space merely from DELETE success.
Root completed these steps with a fresh second full backup/48-table verified
restore, original-transaction classification and logical-state checks around
the separate VACUUM FULL. Post-cleanup SDK follow and actual HTTP/RPC proof
confirmed no numeric-row resurrection. All test Postgres containers were stopped.

Application recovery is separate. The original HMAC profile, bootstrap receipt
and archives stay immutable. An explicit completed Root FILE cutover binds the
new identity and unchanged checkpoint. The optional paired selector uses
byte-identical Root:G9780640 archive copies for service reads while retaining
Root0600 originals. Ordinary admission keeps the 32-block overlap, 1000-block gap
limit, 30-second read budget and 60-second source freshness. A larger application
gap requires its own reviewed contiguous recovery. No financial guard changes.
