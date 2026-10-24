import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { exportEnvioRange } from '../src/integrations/observation/envio.ts';
import { requireThat, validatePolicy, type Policy } from '../src/integrations/observation/types.ts';

const config = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as {
  policy: Policy; schema: string; databaseUrlEnv: string; tokenEnv: string; port: number;
};
validatePolicy(config.policy);
const token = process.env[config.tokenEnv], connectionString = process.env[config.databaseUrlEnv];
requireThat(token && token.length >= 32 && connectionString && Number.isInteger(config.port), 'EXPORT_CONFIG_REQUIRED');
const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
const role = await pool.query("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname=current_user");
requireThat(role.rows.length === 1 && Object.values(role.rows[0]).every(value => value === false), 'SELECT_ONLY_PRINCIPAL_REQUIRED');
const rights = await pool.query("SELECT has_schema_privilege(current_user,$1,'CREATE') AS writable", [config.schema]);
requireThat(rights.rows[0]?.writable === false, 'SELECT_ONLY_PRINCIPAL_REQUIRED');
const tableRights = await pool.query("SELECT bool_or(has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')) AS writable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','v','m','p')", [config.schema]);
requireThat(tableRights.rows[0]?.writable === false, 'SELECT_ONLY_PRINCIPAL_REQUIRED');
createServer(async (request, response) => {
  response.setHeader('cache-control', 'no-store');
  const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401).end(); return; }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method !== 'GET' || !['/zee-observation/export','/zee-observation/status'].includes(url.pathname)) { response.writeHead(404).end(); return; }
  const raw = url.searchParams.get('from');
  if (url.pathname.endsWith('/export') && (!raw || !/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))) { response.writeHead(400).end(); return; }
  const client = await pool.connect().catch(() => null);
  if (!client) { response.writeHead(503).end(); return; }
  try {
    if (url.pathname.endsWith('/status')) {
      requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(config.schema),'INVALID_SCHEMA');
      const status=await client.query(`SELECT payload FROM "${config.schema}".zee_checkpoint WHERE stream_id='base-v1'`);
      requireThat(status.rows.length===1,'COHERENT_CHECKPOINT_REQUIRED');
      response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({protocol:'zee-envio-status-v1',checkpoint:status.rows[0].payload}));return;
    }
    const result = await exportEnvioRange(client, { schema: config.schema, checkpointTable: 'zee_checkpoint', headersTable: 'zee_headers', eventsTable: 'zee_events', streamId: 'base-v1' }, config.policy, Number(raw));
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch { response.writeHead(503, { 'content-type': 'application/json' }).end('{"status":"WAIT_ENVIO_EXPORT"}'); }
  finally { client.release(); }
}).listen(config.port, '127.0.0.1', () => console.log(JSON.stringify({ status: 'ENVIO_EXPORT_LISTENING', port: config.port, financialDispatchEnabled: false })));
