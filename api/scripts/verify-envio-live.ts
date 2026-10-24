import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { exportEnvioRange, consumeEnvioExport } from '../src/integrations/observation/envio.ts';
import { canonicalRpc } from '../src/integrations/observation/canonical-rpc.ts';
import { requireThat, type Policy } from '../src/integrations/observation/types.ts';
const config = JSON.parse(await readFile(process.argv[2]!, 'utf8')) as {schema:string;policy:Policy};
requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(config.schema),'INVALID_SCHEMA');
const url = process.env.ENVIO_VERIFY_DATABASE_URL;
requireThat(url && /^\/zee_envio_[a-z0-9_]+$/.test(new URL(url).pathname),'ISOLATED_ENVIO_DATABASE_REQUIRED');
const pool = new Pool({connectionString:url,max:1,connectionTimeoutMillis:10000});
const client = await pool.connect();
try {
  const checkpoint = await client.query(`SELECT payload FROM "${config.schema}".zee_checkpoint WHERE stream_id='base-v1'`);
  const state = checkpoint.rows[0]?.payload;
  requireThat(state?.complete===true,'COHERENT_CHECKPOINT_REQUIRED');
  // A bounded diagnostic of the current retained tail; this command does not
  // initialize or skip history in a durable consumer mirror.
  const from = Math.max(config.policy.birthday, state.through.height-199);
  const result = await exportEnvioRange(client,{schema:config.schema,checkpointTable:'zee_checkpoint',headersTable:'zee_headers',eventsTable:'zee_events',streamId:'base-v1'},config.policy,from);
  const batch = await consumeEnvioExport(result,config.policy,canonicalRpc({url:'https://base-sepolia-rpc.publicnode.com',sourceId:config.policy.canonicalSourceId,network:'eip155:84532'}));
  console.log(JSON.stringify({status:'LIVE_COHERENT_CANONICAL_EXPORT_VERIFIED',schema:config.schema,from:batch.coverage.fromHeight,through:batch.coverage.through.height,sourceHead:batch.coverage.sourceHead.height,headers:batch.headers.length,events:batch.observations.length,recoveryFloor:batch.coverage.recoveryFloor,revision:batch.coverage.revision,sourceSampledAt:batch.coverage.sourceSampledAt,financialDispatchEnabled:false}));
} finally {client.release();await pool.end();}
