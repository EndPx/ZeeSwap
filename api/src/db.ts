import pg from 'pg';

export function connect(url: string, max = 4): pg.Pool {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Postgres URL required');
  // Explicit TLS settings must not be replaced by pg's sslmode URL parsing.
  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)), user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), max,
    ssl: { rejectUnauthorized: true, servername: parsed.hostname },
    connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
    statement_timeout: 15000, application_name: 'zeeswap-database' });
  // pg discards failed idle clients; handling this event prevents a cold/idle
  // disconnect from crashing the process. Active query failures still propagate.
  pool.on('error', () => console.error('Database idle connection closed; pool will reconnect'));
  return pool;
}

export async function transaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
