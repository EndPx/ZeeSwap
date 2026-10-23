import type { PrivateData } from '../../private-data.ts';
import { invariant, strict } from './policy.ts';
import { emptyBooks, type RouteStore } from './store.ts';
import type { RouteBooks } from './types.ts';

export const ROUTE_PG_SCHEMA = 'zeeswap_route_integration_v1';
export const ROUTE_PG_ROLE = 'zeeswap_route_integration_writer';
const TABLE = `"${ROUTE_PG_SCHEMA}"."books"`;
const MAX_PAYLOAD = 32_000_000;

/** pg.Pool/PoolClient satisfy these narrow ports. No connection string or global
 * DATABASE_URL is read here. A mock port does not establish PostgreSQL behavior. */
export interface RoutePgClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release(destroy?: boolean): void;
}
export interface RoutePgPool { connect(): Promise<RoutePgClient>; }
export interface PostgresRouteConfig {
  optIn: 'ISOLATED_ROUTE_SCHEMA_V1';
  schema: typeof ROUTE_PG_SCHEMA;
  expectedRole: typeof ROUTE_PG_ROLE;
  expectedDatabase: string;
  instanceId: string;
  deploymentDigest: string;
  streamId: string;
}

const IDENTITY_SQL = `SELECT current_database() AS database_name, current_user AS role_name,
  r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolinherit,
  i.schema_version, i.instance_id::text, i.deployment_digest, i.database_name AS provisioned_database
  FROM pg_catalog.pg_roles r CROSS JOIN "${ROUTE_PG_SCHEMA}"."schema_identity" i
  WHERE r.rolname = current_user AND i.singleton = true`;

function parseRevision(value: unknown): number {
  invariant(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'ROUTE_PG_REVISION_INVALID');
  const units = BigInt(value);
  invariant(units <= BigInt(Number.MAX_SAFE_INTEGER), 'ROUTE_PG_REVISION_OVERFLOW');
  return Number(units);
}
function validateBooks(value: unknown, revision: number): RouteBooks {
  strict(value, Object.keys(emptyBooks()));
  invariant(value.version === 1 && value.revision === revision && typeof value.dispatchPaused === 'boolean', 'ROUTE_PG_BOOK_VERSION');
  for (const field of ['plans','balances','receiptOwners','nonceOwners','locatorOwners','sourceOwners']) {
    invariant(value[field] !== null && typeof value[field] === 'object' && !Array.isArray(value[field]), 'ROUTE_PG_BOOK_SCHEMA');
  }
  invariant(Array.isArray(value.ledger) && Array.isArray(value.incidents), 'ROUTE_PG_BOOK_SCHEMA');
  return value as unknown as RouteBooks;
}

/** Concrete PostgreSQL persistence port; provision the separate schema with the
 * reviewed DDL first. This is not an active-order migration or a dispatch switch.
 * Row locks serialize one stream; independent streams retain independent books.
 * Independent signer recovery is still mandatory after restart/database restore. */
export class PostgresRouteStore implements RouteStore {
  private uncertain = false;
  private constructor(private readonly pool: RoutePgPool, private readonly keys: PrivateData, private readonly config: PostgresRouteConfig) {}

  private static construct(pool: RoutePgPool, keys: PrivateData, value: PostgresRouteConfig) {
    // Validate before opening any connection. Never accept public/current operator schema or role.
    strict(value, ['optIn','schema','expectedRole','expectedDatabase','instanceId','deploymentDigest','streamId']);
    invariant(value.optIn === 'ISOLATED_ROUTE_SCHEMA_V1' && value.schema === ROUTE_PG_SCHEMA && value.expectedRole === ROUTE_PG_ROLE, 'ROUTE_PG_ISOLATED_OPT_IN_REQUIRED');
    invariant(/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(value.expectedDatabase), 'ROUTE_PG_DATABASE_REQUIRED');
    invariant(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.instanceId), 'ROUTE_PG_INSTANCE_REQUIRED');
    invariant(/^[0-9a-f]{64}$/.test(value.deploymentDigest), 'ROUTE_PG_DOMAIN_REQUIRED');
    invariant(/^route:(fixture|shadow|acceptance):[a-z0-9][a-z0-9._-]{0,63}$/.test(value.streamId), 'ROUTE_PG_STREAM_REQUIRED');
    return new PostgresRouteStore(pool, keys, structuredClone(value));
  }

  /** Open an existing stream only. A missing/restored-away row is never recreated. */
  static async open(pool: RoutePgPool, keys: PrivateData, config: PostgresRouteConfig) {
    const store = this.construct(pool, keys, config);
    await store.read();
    return store;
  }

  /** Explicit one-time initialization for a reviewed NEW stream. Runtime recovery
   * must use open(), never use creation to bypass missing historical liabilities. */
  static async createNewStream(pool: RoutePgPool, keys: PrivateData, config: PostgresRouteConfig) {
    const store = this.construct(pool, keys, config);
    await store.withTransaction(false, async client => {
      const books = emptyBooks();
      const inserted = await store.query(client, `INSERT INTO ${TABLE} (stream_id, schema_version, revision, payload)
        VALUES ($1, 1, 0, $2) ON CONFLICT (stream_id) DO NOTHING RETURNING stream_id`, [store.config.streamId, store.seal(books)]);
      invariant(inserted.rowCount === 1 && inserted.rows.length === 1, 'ROUTE_PG_STREAM_ALREADY_EXISTS');
      store.decode(await store.row(client, false));
    });
    return store;
  }

  private context(revision: number) {
    return JSON.stringify(['zeeswap-route-postgres', 1, this.config.expectedDatabase, this.config.instanceId,
      ROUTE_PG_SCHEMA, this.config.streamId, this.config.deploymentDigest, revision]);
  }
  private seal(books: RouteBooks) {
    const payload = this.keys.seal(books, this.context(books.revision));
    invariant(payload.length <= MAX_PAYLOAD, 'ROUTE_PG_PAYLOAD_LIMIT'); return payload;
  }
  private decode(row: Record<string, unknown>) {
    invariant(row.schema_version === 1, 'ROUTE_PG_SCHEMA_VERSION');
    const revision = parseRevision(row.revision);
    invariant(Buffer.isBuffer(row.payload) && row.payload.length <= MAX_PAYLOAD, 'ROUTE_PG_PAYLOAD_INVALID');
    let value: unknown;
    try { value = this.keys.open(row.payload, this.context(revision)); }
    catch { throw new Error('ROUTE_PG_CIPHERTEXT_INVALID'); }
    return validateBooks(value, revision);
  }
  private async query(client: RoutePgClient, sql: string, values?: unknown[]) {
    try { return await client.query(sql, values); }
    catch { throw new Error('ROUTE_PG_QUERY_FAILED'); } // No SQL/driver detail or private payload in error messages.
  }
  private async identity(client: RoutePgClient) {
    const result = await this.query(client, IDENTITY_SQL), row = result.rows[0];
    invariant(result.rows.length === 1 && row, 'ROUTE_PG_IDENTITY_MISSING');
    invariant(row.database_name === this.config.expectedDatabase && row.provisioned_database === this.config.expectedDatabase
      && row.role_name === ROUTE_PG_ROLE && row.schema_version === 1 && row.instance_id === this.config.instanceId
      && row.deployment_digest === this.config.deploymentDigest, 'ROUTE_PG_WRONG_DATABASE_DOMAIN_ROLE');
    invariant(['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','rolinherit'].every(key => row[key] === false), 'ROUTE_PG_PRIVILEGED_ROLE_FORBIDDEN');
  }
  private async row(client: RoutePgClient, lock: boolean) {
    const result = await this.query(client, `SELECT schema_version, revision::text, payload FROM ${TABLE}
      WHERE stream_id = $1${lock ? ' FOR UPDATE' : ''}`, [this.config.streamId]);
    invariant(result.rows.length === 1, 'ROUTE_PG_STREAM_MISSING'); return result.rows[0]!;
  }
  private async withTransaction<T>(readOnly: boolean, run: (client: RoutePgClient) => Promise<T>): Promise<T> {
    invariant(!this.uncertain, 'ROUTE_PG_REOPEN_AND_RECONCILE_REQUIRED');
    let client: RoutePgClient;
    try { client = await this.pool.connect(); } catch { throw new Error('ROUTE_PG_CONNECTION_FAILED'); }
    let begun = false, committing = false, destroy = false;
    try {
      await this.query(client, readOnly ? 'BEGIN READ ONLY' : 'BEGIN'); begun = true;
      await this.query(client, "SET LOCAL statement_timeout = '10000ms'");
      await this.query(client, "SET LOCAL lock_timeout = '5000ms'");
      await this.query(client, "SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
      await this.identity(client);
      const result = await run(client);
      committing = true; await this.query(client, 'COMMIT'); committing = false; begun = false;
      return result;
    } catch (error) {
      // BEGIN may have reached the server even if its response was lost.
      if (!begun) destroy = true;
      if (committing) { this.uncertain = true; destroy = true; }
      if (begun) { try { await client.query('ROLLBACK'); } catch { destroy = true; } }
      if (committing) throw new Error('ROUTE_PG_COMMIT_UNKNOWN');
      throw error;
    } finally { client.release(destroy); }
  }
  async read(): Promise<RouteBooks> {
    return this.withTransaction(true, async client => structuredClone(this.decode(await this.row(client, false))));
  }
  async transaction<T>(run: (books: RouteBooks) => T): Promise<T> {
    return this.withTransaction(false, async client => {
      const books = this.decode(await this.row(client, true)), before = books.revision;
      const result = run(books);
      const thenable = result !== null && (typeof result === 'object' || typeof result === 'function') && 'then' in result;
      if (thenable) { void Promise.resolve(result).catch(() => {}); throw new Error('ROUTE_ASYNC_TRANSACTION_FORBIDDEN'); }
      validateBooks(books, before);
      invariant(before < Number.MAX_SAFE_INTEGER, 'ROUTE_PG_REVISION_OVERFLOW');
      books.revision = before + 1;
      // Clone before COMMIT: an uncloneable callback result must roll back rather than
      // report failure after having durably changed money/state.
      const detachedResult = structuredClone(result);
      const changed = await this.query(client, `UPDATE ${TABLE} SET revision = $2, payload = $3, updated_at = clock_timestamp()
        WHERE stream_id = $1 AND revision = $4 AND schema_version = 1 RETURNING revision::text`,
      [this.config.streamId, String(books.revision), this.seal(books), String(before)]);
      invariant(changed.rowCount === 1 && changed.rows.length === 1 && changed.rows[0]!.revision === String(books.revision), 'ROUTE_PG_REVISION_CONFLICT');
      return detachedResult;
    });
  }
}
