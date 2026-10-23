# Isolated PostgreSQL route books

[`PostgresRouteStore`](../src/integrations/routes/postgres-store.ts) implements the
existing `RouteStore` port using the established `pg` driver and `PrivateData`
encryption. It is available for a separately selected isolated PostgreSQL/Neon
target. No connection, database provisioning or schema application occurred in
this milestone. The route engine still rejects production dispatch, and existing
API routes and retained G5 databases do not import this store.

## Provisioning boundary

`route-store-v1.sql` is a separate **unapplied** psql provisioning artifact. It is
outside `api/migrations` and is not called by its migration runner. Run it only
against a new isolated integration branch/database using a direct administrative
connection, a fresh instance UUID and reviewed deployment/policy digest. Never
apply it to retained G5 branches, or use their connection strings/roles here.

The script creates the fixed `zeeswap_route_integration_v1` schema and distinct
`zeeswap_route_integration_writer` login role. It deliberately fails on an
existing schema/role instead of adopting or resetting it. Provision the writer's
credentials separately through the chosen platform's credential workflow; the
SQL file contains no password. The role receives schema USAGE, identity SELECT,
books SELECT/INSERT and UPDATE of revision/payload/timestamp only. It receives
no identity write, DELETE, TRUNCATE or schema CREATE privilege. Check existing
role memberships and database-level grants during real provisioning.

For a selected disposable target, the explicit command shape is:

```sh
psql "$ROUTE_STORE_ADMIN_URL" --set=ON_ERROR_STOP=1 \
  --set=route_instance_id="$ROUTE_STORE_INSTANCE_ID" \
  --set=route_deployment_digest="$ROUTE_STORE_DEPLOYMENT_DIGEST" \
  --file=api/integrations/route-store-v1.sql
```

The command is documentation, not an automatically executed setup step.
Neon recommends [direct connections for schema work and pooled connections for
normal application traffic](https://neon.com/docs/connect/connection-pooling).
Runtime operations use one borrowed client and transaction-local timeouts, which
do not rely on session state across a transaction pooler.

## Runtime construction

Pass a dedicated pool explicitly; this module never reads `DATABASE_URL` or any
environment variable. Existing `connect()` from `api/src/db.ts` supplies the pg
pool and verified TLS settings. The pool URL must authenticate as the narrow
writer role. Keep URL and the two independent encryption/lookup keys private.
The `.env.example` lists configuration inputs only; no loader or automatic
activation is installed.

The constructor configuration has no defaults:

```typescript
const config = {
  optIn: 'ISOLATED_ROUTE_SCHEMA_V1',
  schema: 'zeeswap_route_integration_v1',
  expectedRole: 'zeeswap_route_integration_writer',
  expectedDatabase: selectedDatabaseName,
  instanceId: selectedFreshInstanceUuid,
  deploymentDigest: selectedPolicyAndDeploymentDigest,
  streamId: 'route:acceptance:reviewed-run-name',
} as const;

// One explicit initialization, only for a reviewed NEW stream:
const initial = await PostgresRouteStore.createNewStream(pool, privateData, config);

// Normal startup/recovery always opens the EXISTING stream:
const reopened = await PostgresRouteStore.open(pool, privateData, config);
```

Stream prefixes are restricted to `route:fixture:`, `route:shadow:` and
`route:acceptance:`. Initialization fails when the stream already exists;
`open()` never inserts. A missing or restored-away stream is an incident and
must not be replaced by an empty book, including when no transaction was signed.
No constructor option accepts `public` schema, an owner role or an active order
identifier. Every transaction checks current database/role, schema version,
provisioned instance and deployment digest. Privileged/inheriting roles fail.

## Durability, encryption and concurrency

The complete book is one encrypted row per stream. Atomic encrypted snapshots
preserve its per-asset balances, reservations, receipt allocation and operation
state together. AES-GCM authenticated context binds database, instance, schema,
stream, deployment digest and revision. Ciphertext copied between these domains
fails authentication. Only stream ID, schema version, revision, timestamp and
schema identity metadata remain plaintext; use operational stream labels, never
private customer references.

Every mutation uses [`SELECT FOR UPDATE`](https://www.postgresql.org/docs/18/explicit-locking.html)
and a revision-conditioned update within one short transaction. One stream
serializes its competing workers; separate streams hold separate rows. Read
operations use a read-only transaction. Callback results are cloned before
commit. Async callbacks, callback mutation of version/revision, revision overflow,
uncloneable results, crypto failures and update conflicts roll back. SQL errors
are reduced to generic codes without logging query parameters or driver detail.

Callbacks must contain synchronous local book changes only: no provider calls,
RPC, wallet access or signing. An ambiguous BEGIN discards its client. An
ambiguous COMMIT poisons the old store instance, discards the client, reports
`ROUTE_PG_COMMIT_UNKNOWN`, and never automatically repeats the operation. Reopen
the existing stream, inspect its durable revision/effect and run the engine's
independent journal recovery before dispatch. Database restore can restore an
older valid ciphertext; encryption alone cannot detect that rollback or recover
missing liabilities. Retain independent journals and backups. Key rotation and
snapshot/schema upgrades require a separately reviewed migration; no transparent
reset or re-encryption path is supplied.

## Verified scope and remaining gate

On 23 October 2026, API TypeScript checking and 13 isolated PostgreSQL-port tests
passed. The test server models transactional staging, row-lock queues, CAS,
rollback and a lost COMMIT response. Tests cover 24 concurrent increments through
two store instances, role/domain refusals, ciphertext isolation/corruption,
callback rollback, deleted-stream reopening, creation collision and ambiguous
BEGIN/COMMIT. They use no credentials and open no network connection.

Run them with:

```sh
pnpm --filter @zeeswap/api exec tsx --test test/integrations/postgres-route-store.test.ts
pnpm typecheck
```

Mock SQL tests are not proof of PostgreSQL syntax, MVCC, real pg error behavior,
Neon pooling, permission enforcement or database restore. The next persistence
acceptance gate must select a disposable target, apply/review the DDL there,
connect as the writer role, repeat simultaneous writer/rollback/domain tests,
prove forbidden privileges and simulate disconnect/restore with independent
journal recovery. That gate remains open; there is no claim of a live Neon
integration, real provider settlement or completion of the stopped G5 run.
