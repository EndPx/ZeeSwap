import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { PrivateData } from '../../src/private-data.ts';
import { PostgresRouteStore, ROUTE_PG_ROLE, ROUTE_PG_SCHEMA, type PostgresRouteConfig, type RoutePgClient, type RoutePgPool } from '../../src/integrations/routes/postgres-store.ts';

// Compile-time compatibility with the established pg driver, without connecting.
const establishedDriver = (pool: Pool): RoutePgPool => pool;
void establishedDriver;
const keys = new PrivateData(Buffer.alloc(32, 0x11), Buffer.alloc(32, 0x22));
const config: PostgresRouteConfig = {
  optIn: 'ISOLATED_ROUTE_SCHEMA_V1', schema: ROUTE_PG_SCHEMA, expectedRole: ROUTE_PG_ROLE,
  expectedDatabase: 'isolated_route_fixture', instanceId: '12345678-1234-1234-1234-123456789abc',
  deploymentDigest: 'ab'.repeat(32), streamId: 'route:fixture:one',
};
type Row = { schema_version: number; revision: string; payload: Buffer };

/** Transaction-aware fake SQL server. It implements staged commit/rollback and
 * per-row blocking locks; it is not evidence of real PG/Neon lock or privilege behavior. */
class Database implements RoutePgPool {
  rows = new Map<string, Row>();
  queries: { sql: string; values?: unknown[] }[] = [];
  releases: boolean[] = [];
  connections = 0;
  identity = {
    database_name: config.expectedDatabase, provisioned_database: config.expectedDatabase, role_name: ROUTE_PG_ROLE,
    schema_version: 1, instance_id: config.instanceId, deployment_digest: config.deploymentDigest,
    rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolinherit: false,
  };
  conflictNextUpdate = false;
  failNextUpdate = false;
  commitUnknown = false;
  beginUnknown = false;
  private locks = new Map<string, Promise<void>>();
  private async lock(key: string): Promise<() => void> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const pending = new Promise<void>(resolve => { unlock = resolve; });
    this.locks.set(key, pending);
    await previous;
    return () => { unlock(); if (this.locks.get(key) === pending) this.locks.delete(key); };
  }
  async connect(): Promise<RoutePgClient> {
    this.connections++;
    let active = false;
    const changes = new Map<string, Row>(), unlocks = new Map<string, () => void>();
    const releaseLocks = () => { for (const unlock of unlocks.values()) unlock(); unlocks.clear(); };
    const lock = async (key: string) => { if (!unlocks.has(key)) unlocks.set(key, await this.lock(key)); };
    return {
      query: async (sql, values) => {
        this.queries.push({ sql, values });
        const result = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
        if (sql.startsWith('BEGIN')) {
          active = true;
          if (this.beginUnknown) { this.beginUnknown = false; throw new Error('lost begin response'); }
          return result();
        }
        assert.ok(active, 'query must be scoped to one transaction');
        if (sql.startsWith('SET LOCAL')) return result();
        if (sql.includes('pg_catalog.pg_roles')) return result([{ ...this.identity }]);
        if (sql.startsWith('INSERT INTO')) {
          const stream = values![0] as string; await lock(stream);
          if (!this.rows.has(stream)) {
            changes.set(stream, { schema_version: 1, revision: '0', payload: Buffer.from(values![1] as Buffer) });
            return result([{ stream_id: stream }]);
          }
          return result([], 0);
        }
        if (sql.startsWith('SELECT schema_version')) {
          const stream = values![0] as string;
          if (sql.includes('FOR UPDATE')) await lock(stream);
          const row = changes.get(stream) ?? this.rows.get(stream);
          return result(row ? [{ ...row, payload: Buffer.from(row.payload) }] : []);
        }
        if (sql.startsWith('UPDATE')) {
          assert.match(sql, /revision = \$4 AND schema_version = 1/);
          const stream = values![0] as string;
          assert.ok(unlocks.has(stream), 'row lock is held before write');
          if (this.failNextUpdate) { this.failNextUpdate = false; throw new Error('PRIVATE_SQL_DETAIL_memo'); }
          const before = this.rows.get(stream);
          if (this.conflictNextUpdate || before?.revision !== values![3]) { this.conflictNextUpdate = false; return result([], 0); }
          changes.set(stream, { schema_version: 1, revision: values![1] as string, payload: Buffer.from(values![2] as Buffer) });
          return result([{ revision: values![1] }]);
        }
        if (sql === 'COMMIT') {
          for (const [key, row] of changes) this.rows.set(key, row);
          changes.clear(); active = false; releaseLocks();
          if (this.commitUnknown) { this.commitUnknown = false; throw new Error('connection lost after real commit'); }
          return result();
        }
        if (sql === 'ROLLBACK') { changes.clear(); active = false; releaseLocks(); return result(); }
        throw new Error(`Unexpected fake SQL: ${sql}`);
      },
      release: destroy => { releaseLocks(); this.releases.push(destroy === true); },
    };
  }
}

test('Postgres route store requires isolated explicit config before connecting', async () => {
  const db = new Database();
  for (const bad of [
    { ...config, optIn: 'LIVE' }, { ...config, schema: 'public' }, { ...config, expectedRole: 'neondb_owner' },
    { ...config, instanceId: 'retained-g5' }, { ...config, streamId: 'active-order' },
  ]) await assert.rejects(PostgresRouteStore.open(db, keys, bad as PostgresRouteConfig));
  assert.equal(db.connections, 0);
});

test('wrong database, instance, deployment and privileged role fail before any insertion', async () => {
  for (const mutation of [
    { database_name: 'retained_g5' }, { instance_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
    { deployment_digest: '00'.repeat(32) }, { role_name: 'neondb_owner' },
    { rolsuper: true }, { rolbypassrls: true }, { rolinherit: true }, { rolcreaterole: true },
  ]) {
    const db = new Database(); Object.assign(db.identity, mutation);
    await assert.rejects(PostgresRouteStore.open(db, keys, config), /ROUTE_PG_WRONG_DATABASE_DOMAIN_ROLE|ROUTE_PG_PRIVILEGED_ROLE_FORBIDDEN/);
    assert.equal(db.rows.size, 0); assert.ok(!db.queries.some(q => q.sql.startsWith('INSERT')));
  }
});

test('two independent store instances serialize one stream without losing increments', async () => {
  const db = new Database(), a = await PostgresRouteStore.createNewStream(db, keys, config), b = await PostgresRouteStore.open(db, keys, config);
  const revisions = await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? a : b).transaction(books => {
    books.balances['fixture-units'] = (BigInt(books.balances['fixture-units'] ?? '0') + 7n).toString();
    return books.revision + 1;
  })));
  assert.deepEqual([...revisions].sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i + 1));
  const final = await a.read(); assert.equal(final.revision, 24); assert.equal(final.balances['fixture-units'], '168');
  assert.ok(db.queries.some(q => q.sql.includes('FOR UPDATE')));
  assert.ok(db.queries.some(q => q.sql === 'BEGIN READ ONLY'));
});

test('source private data stays encrypted and returned objects cannot mutate committed books', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  const returned = await store.transaction(books => { books.balances['private-source-reference'] = '123456789'; return books.balances; });
  returned['private-source-reference'] = '0';
  assert.equal((await store.read()).balances['private-source-reference'], '123456789');
  const payload = db.rows.get(config.streamId)!.payload.toString('utf8');
  assert.ok(!payload.includes('private-source-reference')); assert.ok(!payload.includes('123456789'));
});

test('callback error, async callback, illegal revision and uncloneable result all roll back', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  const original = Buffer.from(db.rows.get(config.streamId)!.payload);
  await assert.rejects(store.transaction(books => { books.balances.x = '1'; throw new Error('expected-callback-failure'); }), /expected-callback-failure/);
  await assert.rejects(store.transaction(async books => { books.balances.x = '2'; return 1; }), /ROUTE_ASYNC_TRANSACTION_FORBIDDEN/);
  await assert.rejects(store.transaction(books => { books.revision = 50; }), /ROUTE_PG_BOOK_VERSION/);
  await assert.rejects(store.transaction(books => { books.balances.x = '3'; return () => {}; }), /could not be cloned/);
  assert.equal((await store.read()).revision, 0);
  assert.deepEqual(db.rows.get(config.streamId)!.payload, original);
  assert.ok(db.queries.filter(q => q.sql === 'ROLLBACK').length >= 4);
});

test('revision CAS or SQL error rolls back ciphertext and redacts driver detail', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  db.conflictNextUpdate = true;
  await assert.rejects(store.transaction(books => { books.balances.x = '1'; }), /ROUTE_PG_REVISION_CONFLICT/);
  db.failNextUpdate = true;
  await assert.rejects(store.transaction(books => { books.balances.x = '2'; }), error => {
    assert.equal((error as Error).message, 'ROUTE_PG_QUERY_FAILED'); return true;
  });
  assert.equal((await store.read()).revision, 0);
  assert.deepEqual((await store.read()).balances, {});
});

test('stream ciphertext cannot be copied to another namespace or revision', async () => {
  const db = new Database(), one = await PostgresRouteStore.createNewStream(db, keys, config);
  await one.transaction(books => { books.balances.x = '5'; });
  const secondConfig = { ...config, streamId: 'route:fixture:two' };
  const two = await PostgresRouteStore.createNewStream(db, keys, secondConfig);
  db.rows.set(secondConfig.streamId, { ...db.rows.get(config.streamId)! });
  await assert.rejects(two.read(), /ROUTE_PG_CIPHERTEXT_INVALID/);
  db.rows.get(config.streamId)!.revision = '2';
  await assert.rejects(one.read(), /ROUTE_PG_CIPHERTEXT_INVALID/);
});

test('wrong encryption key, corruption and deleted stream refuse without reset', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  const wrong = new PrivateData(Buffer.alloc(32, 0x33), Buffer.alloc(32, 0x44));
  await assert.rejects(PostgresRouteStore.open(db, wrong, config), /ROUTE_PG_CIPHERTEXT_INVALID/);
  db.rows.get(config.streamId)!.payload[30] ^= 0x10;
  await assert.rejects(store.read(), /ROUTE_PG_CIPHERTEXT_INVALID/);
  db.rows.delete(config.streamId);
  await assert.rejects(store.read(), /ROUTE_PG_STREAM_MISSING/);
  const inserts = db.queries.filter(q => q.sql.startsWith('INSERT')).length;
  await assert.rejects(PostgresRouteStore.open(db, keys, config), /ROUTE_PG_STREAM_MISSING/);
  assert.equal(db.queries.filter(q => q.sql.startsWith('INSERT')).length, inserts);
  assert.equal(db.rows.size, 0);
});

test('uncertain COMMIT is never automatically replayed and poisons the old instance', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  db.commitUnknown = true;
  await assert.rejects(store.transaction(books => { books.balances.x = '11'; }), /ROUTE_PG_COMMIT_UNKNOWN/);
  assert.equal(db.rows.get(config.streamId)!.revision, '1');
  await assert.rejects(store.read(), /ROUTE_PG_REOPEN_AND_RECONCILE_REQUIRED/);
  await assert.rejects(store.transaction(() => undefined), /ROUTE_PG_REOPEN_AND_RECONCILE_REQUIRED/);
  assert.equal(db.releases.at(-1), true);
  const reopened = await PostgresRouteStore.open(db, keys, config);
  assert.equal((await reopened.read()).balances.x, '11');
  assert.equal((await reopened.read()).revision, 1); // RouteEngine separately requires journal recovery.
});

test('database identity and role are checked again on every read and transaction', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  db.identity.rolsuper = true;
  await assert.rejects(store.read(), /ROUTE_PG_PRIVILEGED_ROLE_FORBIDDEN/);
  let called = false;
  await assert.rejects(store.transaction(() => { called = true; }), /ROUTE_PG_PRIVILEGED_ROLE_FORBIDDEN/);
  assert.equal(called, false);
});

test('creating an existing stream fails without replacing its ciphertext', async () => {
  const db = new Database(); await PostgresRouteStore.createNewStream(db, keys, config);
  const original = Buffer.from(db.rows.get(config.streamId)!.payload);
  await assert.rejects(PostgresRouteStore.createNewStream(db, keys, config), /ROUTE_PG_STREAM_ALREADY_EXISTS/);
  assert.deepEqual(db.rows.get(config.streamId)!.payload, original);
});

test('ambiguous BEGIN destroys the connection rather than returning a possible open transaction', async () => {
  const db = new Database(), store = await PostgresRouteStore.createNewStream(db, keys, config);
  db.beginUnknown = true;
  await assert.rejects(store.read(), /ROUTE_PG_QUERY_FAILED/);
  assert.equal(db.releases.at(-1), true);
});

test('provisioned instance and deployment digest are authenticated encryption domains', async () => {
  const db = new Database(); await PostgresRouteStore.createNewStream(db, keys, config);
  const alteredInstance = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  db.identity.instance_id = alteredInstance;
  await assert.rejects(PostgresRouteStore.open(db, keys, { ...config, instanceId: alteredInstance }), /ROUTE_PG_CIPHERTEXT_INVALID/);
  db.identity.instance_id = config.instanceId;
  db.identity.deployment_digest = 'cd'.repeat(32);
  await assert.rejects(PostgresRouteStore.open(db, keys, { ...config, deploymentDigest: 'cd'.repeat(32) }), /ROUTE_PG_CIPHERTEXT_INVALID/);
});
