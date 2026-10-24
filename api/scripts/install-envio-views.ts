import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { envioProducerViews } from '../src/integrations/observation/envio-producer.ts';
import { requireThat, type Policy } from '../src/integrations/observation/types.ts';
const config = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as {schema:string;policy:Policy;generation?:string};
const url = process.env.ENVIO_PRODUCER_DATABASE_URL;
requireThat(url && /^\/zee_envio_[a-z0-9_]+$/.test(new URL(url).pathname), 'ISOLATED_ENVIO_DATABASE_REQUIRED');
const pool = new Pool({connectionString:url,max:1,connectionTimeoutMillis:10000});
try {
  const version = await pool.query('SELECT version() AS version');
  requireThat(String(version.rows[0]?.version).includes('PostgreSQL'), 'POSTGRES_REQUIRED');
  await pool.query(envioProducerViews(config.schema,config.policy,config.generation??`envio314-${config.policy.projectionDigest.slice(0,24)}`));
  // HyperIndex 3.14 grants schema CREATE to PUBLIC on initialization. Remove
  // that implicit writer capability before a dedicated export role connects.
  await pool.query(`REVOKE CREATE ON SCHEMA "${config.schema}" FROM PUBLIC`);
  const result = await pool.query(`SELECT (SELECT count(*) FROM "${config.schema}".zee_headers) AS headers,(SELECT count(*) FROM "${config.schema}".zee_events) AS events,(SELECT payload->>'complete' FROM "${config.schema}".zee_checkpoint) AS complete`);
  console.log(JSON.stringify({status:'ENVIO_VIEWS_INSTALLED',schema:config.schema,...result.rows[0],financialDispatchEnabled:false}));
} finally {await pool.end();}
