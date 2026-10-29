import pg from 'pg';
import {mainDatabaseTransportFor,verifyMainDatabaseClient,type MainDatabaseTransport} from './main-database-relocation.ts';
export function fenceMainDatabasePool(pool:pg.Pool,context:Pick<MainDatabaseTransport,'receipt'>,role:string){
  const acquire=pool.connect.bind(pool),verified=new WeakSet<object>();
  pool.connect=((callback?:any)=>{const run=(done:any)=>acquire((error,client,release)=>{if(error||!client){done(error);return;}const check=verified.has(client)?Promise.resolve():verifyMainDatabaseClient(client,context,role).then(()=>{verified.add(client);});check.then(()=>done(undefined,client,release),failure=>{release(failure);done(failure);});});if(callback){run(callback);return;}return new Promise<pg.PoolClient>((resolve,reject)=>run((error:any,client:pg.PoolClient)=>error?reject(error):resolve(client)));})as typeof pool.connect;return pool;
}

export function connect(url: string, max = 4): pg.Pool {
  const transport=mainDatabaseTransportFor(url);if(process.env.ZEESWAP_DATABASE_RUNTIME_MODE==='VPS_PRIMARY_REQUIRED'&&!transport)throw Error('UNBOUND_VPS_PRIMARY_DATABASE');
  const parsed = new URL(transport?.effectiveUrl??url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Postgres URL required');
  // Explicit TLS settings must not be replaced by pg's sslmode URL parsing.
  const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)), user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password), max,
    ssl: { rejectUnauthorized: true, servername: parsed.hostname,...(transport?{ca:transport.context.caPem}:{}) },
    connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
    statement_timeout: 15000, application_name: 'zeeswap-database' });
  // pg discards failed idle clients; handling this event prevents a cold/idle
  // disconnect from crashing the process. Active query failures still propagate.
  pool.on('error', () => console.error('Database idle connection closed; pool will reconnect'));
  if(transport)fenceMainDatabasePool(pool,transport.context,decodeURIComponent(parsed.username));
  return pool;
}

export async function transaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
