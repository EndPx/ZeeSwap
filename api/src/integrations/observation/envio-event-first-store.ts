import type {PoolClient} from 'pg';
import {validatePolicy,requireThat,height,type Policy,type BaseEvent} from './types.ts';
import {EVENT_FIRST_MAX_EXPORT_BLOCKS,validateEventFirstState,type EventFirstSnapshot,type EventFirstState} from './envio-event-first.ts';
const id=(v:string)=>{requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(v),'EVENT_FIRST_SCHEMA');return '"'+v+'"';};
/** Returns operator-reviewed DDL only. It never executes or replaces an old v1 view. */
export function eventFirstProducerViews(schema:string,p:Policy,generation:string){
 validatePolicy(p);requireThat(p.adapter==='envio-hyperindex'&&(p.contractVersion??'v1')==='v1'&&/^[a-zA-Z0-9_-]{1,100}$/.test(generation),'EVENT_FIRST_IDENTITY');const s=id(schema);
 return `CREATE OR REPLACE VIEW ${s}.zee_event_first_state AS
SELECT 'base-v1'::text stream_id,jsonb_build_object(
'generation','${generation}','projectionDigest','${p.projectionDigest}','registryDigest','${p.registryDigest}',
'revision',pg_snapshot_xmax(pg_current_snapshot())::text,
'progress',jsonb_build_object('height',c.progress_block,'checkpointId',c.checkpoint_id::text),
'checkpoint',jsonb_build_object('chainId',cp.chain_id,'id',cp.id::text,'height',cp.block_number,'hash',cp.block_hash),
'processor',jsonb_build_object('height',t."blockNumber",'observedAt',t."sourceSampledAt"),
'recoveryFloor',COALESCE((SELECT MIN(block_number)+1 FROM ${s}.envio_checkpoints WHERE chain_id=84532),c.progress_block+1)) payload
FROM ${s}.envio_chains c
JOIN ${s}."BlockVisit" t ON t.id='84532:source-tip' AND t."chainId"=c.id AND t."coverageComplete"=false AND t."headerJson" IS NULL AND t."sourceHeadJson" IS NULL
LEFT JOIN ${s}.envio_checkpoints cp ON cp.id=c.checkpoint_id AND cp.chain_id=c.id
WHERE c.id=84532 AND c.start_block=${p.birthday};
CREATE OR REPLACE VIEW ${s}.zee_event_first_events AS
SELECT id,"blockNumber" block_height,"transactionIndex" transaction_index,"logIndex" log_index,
jsonb_build_object('kind','base-contract-event','chainId',84532,'contract',contract,'abiDigest','${p.abiDigest}',
'txHash',"txHash",'transactionIndex',"transactionIndex",'logIndex',"logIndex",
'block',jsonb_build_object('height',"blockNumber",'hash',"blockHash",'parentHash',"blockParentHash",'time',
to_char(to_timestamp("blockTimestamp") AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
'event',"eventName",'settlementId',"settlementId",'token',token,'amountAtomic',"amountAtomic"::text,'decoded',"decodedJson"::jsonb) payload
FROM ${s}."SettlementEvent" WHERE "chainId"=84532 AND contract='${p.contract}' AND token='${p.token}' AND "contractVersion"='v1';`;
}
type Client=Pick<PoolClient,'query'>;
/** State and bounded event rows are captured together, then closed before remote RPC work. */
export async function readEventFirstSnapshot(c:Client,schema:string,p:Policy,generation:string,from:number,to:number,signal:AbortSignal):Promise<EventFirstSnapshot>{
 height(from);height(to);requireThat(from>=p.birthday&&to>=from&&to-from+1<=EVENT_FIRST_MAX_EXPORT_BLOCKS,'EVENT_FIRST_RANGE_BOUND');const s=id(schema);await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{await c.query("SET LOCAL statement_timeout='5000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");signal.throwIfAborted();
  const state=await stateInSnapshot(c,s,p,generation),rows=(await c.query(`SELECT payload FROM ${s}.zee_event_first_events WHERE block_height >= $1 AND block_height <= $2 ORDER BY block_height,transaction_index,log_index,id LIMIT $3`,[from,to,(p.maxObservations??1000)+1])).rows;
  requireThat(rows.length<=(p.maxObservations??1000),'EVENT_FIRST_EVENT_LIMIT');signal.throwIfAborted();await c.query('COMMIT');return{state,events:rows.map(r=>r.payload) as BaseEvent[]};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
async function stateInSnapshot(c:Client,s:string,p:Policy,generation:string){const rows=(await c.query(`SELECT payload FROM ${s}.zee_event_first_state WHERE stream_id='base-v1'`)).rows;requireThat(rows.length===1,'EVENT_FIRST_SOURCE_UNREADY');return validateEventFirstState(rows[0].payload,p,generation);}
export async function readEventFirstFence(c:Client,schema:string,p:Policy,generation:string,signal:AbortSignal):Promise<EventFirstState>{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{await c.query("SET LOCAL statement_timeout='5000ms'");signal.throwIfAborted();const state=await stateInSnapshot(c,id(schema),p,generation);signal.throwIfAborted();await c.query('COMMIT');return state;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
