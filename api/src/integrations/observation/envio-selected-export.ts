/** Explicit retained-history selection; producer rollback floor is never clipped. */
import {randomUUID} from 'node:crypto';
import type {ReadOnlyClient,EnvioExportSchema} from './envio.ts';
import type {CanonicalReader,CanonicalSample} from './chef.ts';
import {readJson,safeEndpoint} from './chef.ts';
import {contentDigest,fresh,height,object,parseHeader,parseObservation,requireThat,stable,text,utc,validatePolicy,type Header,type Policy,type Observation} from './types.ts';
export type ProducerCheckpoint={generation:string;revision:string;through:Header;recoveryFloor:number;sourceSampledAt:string;sourceHead:Header;projectionDigest:string;registryDigest:string;complete:true};
export type SelectedEnvioExport={protocol:'zee-envio-selected-export-v1';isolation:'repeatable-read-read-only';snapshotToken:string;expiresAt:string;producer:ProducerCheckpoint;range:{fromHeight:number;through:Header;headers:Header[];observations:Observation[];contentDigest:string;readStartedAt:string;readCompletedAt:string}};
export type VerifiedEnvioSelection=SelectedEnvioExport&{verification:CanonicalSample};
export const SELECTED_CANONICAL_BATCHES=2;
const id=(s:string)=>{requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(s),'INVALID_SQL_IDENTIFIER');return `"${s}"`;};
export function validateSelectedExport(value:unknown,policy:Policy,now=Date.now()):SelectedEnvioExport{
 validatePolicy(policy);requireThat(policy.adapter==='envio-hyperindex','SELECTED_ENVIO_POLICY');
 const r=object(value,['protocol','isolation','snapshotToken','expiresAt','producer','range']);requireThat(r.protocol==='zee-envio-selected-export-v1'&&r.isolation==='repeatable-read-read-only','SELECTED_EXPORT_PROTOCOL');text(r.snapshotToken);requireThat(Date.parse(utc(r.expiresAt))>now&&Date.parse(r.expiresAt as string)<=now+60000,'SELECTED_EXPORT_EXPIRED');
 const p=object(r.producer,['generation','revision','through','recoveryFloor','sourceSampledAt','sourceHead','projectionDigest','registryDigest','complete']);text(p.generation);requireThat(typeof p.revision==='string'&&/^[0-9]+$/.test(p.revision),'SELECTED_REVISION');
 const producerThrough=parseHeader(p.through,policy.network),sourceHead=parseHeader(p.sourceHead,policy.network);height(p.recoveryFloor);fresh(utc(p.sourceSampledAt),now);
 requireThat(p.complete===true&&p.projectionDigest===policy.projectionDigest&&p.registryDigest===policy.registryDigest&&producerThrough.height>=policy.birthday&&sourceHead.height>=producerThrough.height&&Number(p.recoveryFloor)<=producerThrough.height+1,'SELECTED_PRODUCER_CHECKPOINT');
 const q=object(r.range,['fromHeight','through','headers','observations','contentDigest','readStartedAt','readCompletedAt']);height(q.fromHeight);const through=parseHeader(q.through,policy.network);utc(q.readStartedAt);utc(q.readCompletedAt);
 requireThat(Number(q.fromHeight)>=policy.birthday&&through.height>=Number(q.fromHeight)&&through.height<=producerThrough.height&&through.height-Number(q.fromHeight)+1<=256&&Array.isArray(q.headers)&&Array.isArray(q.observations)&&q.observations.length<=(policy.maxObservations??1000),'SELECTED_RANGE_BOUND');
 requireThat(Date.parse(q.readCompletedAt as string)>=Date.parse(q.readStartedAt as string)&&Date.parse(q.readCompletedAt as string)-Date.parse(q.readStartedAt as string)<=30000&&Date.parse(q.readCompletedAt as string)<=now+5000,'SELECTED_READ_BUDGET');
 const headers=q.headers.map(h=>parseHeader(h,policy.network));requireThat(headers.length===through.height-Number(q.fromHeight)+1&&stable(headers.at(-1))===stable(through),'SELECTED_HISTORY_GAP');
 for(let i=0;i<headers.length;i++)requireThat(headers[i]!.height===Number(q.fromHeight)+i&&(!i||headers[i]!.parentHash===headers[i-1]!.hash),'SELECTED_HEADER_LINK');
 const observations=q.observations.map(o=>parseObservation(o,policy)),byHeight=new Map(headers.map(h=>[h.height,h]));let previous:string|undefined;
 for(const o of observations){requireThat(o.kind==='base-contract-event'&&stable(byHeight.get(o.block.height))===stable(o.block),'SELECTED_EVENT_HEADER');const key=[o.block.height,o.transactionIndex,o.logIndex].map(n=>String(n).padStart(16,'0')).join(':');requireThat(previous===undefined||key>previous,'SELECTED_EVENT_ORDER');previous=key;}
 requireThat(q.contentDigest===contentDigest({headers,observations}),'SELECTED_CONTENT_DIGEST');
 return{...r,producer:{...p,through:producerThrough,sourceHead},range:{...q,through,headers,observations}} as SelectedEnvioExport;
}
export async function exportSelectedEnvioRange(client:ReadOnlyClient,schema:EnvioExportSchema,policy:Policy,from:number,selectedThrough:number|'latest',now=Date.now):Promise<SelectedEnvioExport>{
 validatePolicy(policy);height(from);if(selectedThrough!=='latest')height(selectedThrough);requireThat(from>=policy.birthday&&(selectedThrough==='latest'||selectedThrough>=from&&selectedThrough-from+1<=256),'SELECTED_RANGE_BOUND');text(schema.streamId);
 const table=(s:string)=>`${id(schema.schema)}.${id(s)}`,started=now();let began=false;
 const query=async(sql:string,values:unknown[]=[])=>{const remaining=Math.floor(30000-(now()-started));requireThat(remaining>0,'SELECTED_READ_BUDGET');await client.query(`SET LOCAL statement_timeout='${remaining}ms'`);return client.query(sql,values);};
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;await client.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");
  const settings=await query("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only");requireThat(settings.rows[0]?.isolation==='repeatable read'&&settings.rows[0]?.read_only==='on','READ_ONLY_SNAPSHOT_REQUIRED');
  const state=(await query(`SELECT payload FROM ${table(schema.checkpointTable)} WHERE stream_id=$1`,[schema.streamId])).rows;requireThat(state.length===1,'COHERENT_CHECKPOINT_REQUIRED');
  const producer=state[0]!.payload as ProducerCheckpoint;if(selectedThrough==='latest')selectedThrough=Math.min(producer.through.height,from+255);requireThat(producer.through.height>=selectedThrough&&selectedThrough>=from,'SELECTED_THROUGH_AHEAD_OF_PRODUCER');
  const headers=(await query(`SELECT payload FROM ${table(schema.headersTable)} WHERE stream_id=$1 AND block_height >= $2 AND block_height <= $3 ORDER BY block_height ASC LIMIT 257`,[schema.streamId,from,selectedThrough])).rows.map(r=>r.payload);
  const observations:Observation[]=[];let last:[number,number,number,string]|null=null;
  for(;;){const rows:Record<string,any>[]=(await query(`SELECT id,block_height,transaction_index,log_index,payload FROM ${table(schema.eventsTable)} WHERE stream_id=$1 AND block_height >= $2 AND block_height <= $3 AND ($4::bigint IS NULL OR (block_height,transaction_index,log_index,id)>($4,$5,$6,$7)) ORDER BY block_height,transaction_index,log_index,id LIMIT 100`,[schema.streamId,from,selectedThrough,last?.[0]??null,last?.[1]??null,last?.[2]??null,last?.[3]??null])).rows;requireThat(rows.length<=100,'INVALID_EXPORT_PAGE');
   for(const r of rows){const h=height(Number(r.block_height)),tx=height(Number(r.transaction_index)),log=height(Number(r.log_index)),key=text(r.id);requireThat(h>=from&&h<=selectedThrough&&(!last||h>last[0]||h===last[0]&&(tx>last[1]||tx===last[1]&&(log>last[2]||log===last[2]&&key>last[3])))&&r.payload.block.height===h&&r.payload.transactionIndex===tx&&r.payload.logIndex===log,'SELECTED_EVENT_POSITION');last=[h,tx,log,key];observations.push(r.payload);requireThat(observations.length<=(policy.maxObservations??1000),'BACKPRESSURE');}
   if(rows.length<100)break;
  }
  const completed=now(),result=validateSelectedExport({protocol:'zee-envio-selected-export-v1',isolation:'repeatable-read-read-only',snapshotToken:randomUUID(),expiresAt:new Date(completed+30000).toISOString(),producer,range:{fromHeight:from,through:headers.at(-1),headers,observations,contentDigest:contentDigest({headers,observations}),readStartedAt:new Date(started).toISOString(),readCompletedAt:new Date(completed).toISOString()}},policy,completed);
  requireThat(result.range.through.height===selectedThrough,'SELECTED_HISTORY_GAP');await client.query('COMMIT');began=false;return result;
 }finally{if(began)await client.query('ROLLBACK');}
}
export async function verifySelectedExport(value:unknown,policy:Policy,canonical:CanonicalReader,signal=AbortSignal.timeout(30000),now=Date.now()):Promise<VerifiedEnvioSelection>{
 const started=performance.now(),selected=validateSelectedExport(value,policy,now),sample=await canonical.sample(signal);fresh(sample.checkedAt,Date.now());requireThat(sample.sourceId===policy.canonicalSourceId&&sample.head.height>=selected.producer.sourceHead.height,'SELECTED_CANONICAL_SOURCE');
 requireThat(stable(await canonical.header(selected.producer.sourceHead.height,signal))===stable(selected.producer.sourceHead),'SELECTED_SOURCE_HEAD_REORG');
 const size=canonical.headerBatchSize??10;requireThat(size>=1&&size<=12,'SELECTED_CANONICAL_PAGE');
 for(let i=0;i<selected.range.headers.length;i+=size*(canonical.headers?SELECTED_CANONICAL_BATCHES:1)){
  const page=selected.range.headers.slice(i,i+size*(canonical.headers?SELECTED_CANONICAL_BATCHES:1));let actual:Header[];
  if(canonical.headers){
   const pages=Array.from({length:SELECTED_CANONICAL_BATCHES},(_,n)=>page.slice(n*size,(n+1)*size)).filter(p=>p.length);
   // Bound overlap to two batches. Every request/retry still uses the canonical
   // client's method limiter; drain all outcomes before any failure escapes.
   const reads=await Promise.allSettled(pages.map(p=>canonical.headers!(p.map(h=>h.height),signal)));
   const failed=reads.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
   actual=reads.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  }else actual=await Promise.all(page.map(h=>canonical.header(h.height,signal)));
  requireThat(actual.length===page.length&&actual.every((h,n)=>stable(h)===stable(page[n])),'SELECTED_CANONICAL_REORG');
 }
 requireThat(sample.finalized&&stable(await canonical.header(sample.finalized.height,signal))===stable(sample.finalized)&&stable(await canonical.header(sample.head.height,signal))===stable(sample.head),'SELECTED_FINAL_CANONICAL_RECHECK');
 signal.throwIfAborted();requireThat(performance.now()-started<=30000&&Date.now()-Date.parse(selected.range.readStartedAt)<=30000,'SELECTED_READ_BUDGET');validateSelectedExport(selected,policy,Date.now());return{...selected,verification:sample};
}
export async function fetchSelectedEnvioRange(url:string,token:string,from:number,through:number|'latest',policy:Policy,canonical:CanonicalReader):Promise<VerifiedEnvioSelection>{
 const signal=AbortSignal.timeout(30000),endpoint=safeEndpoint(url);const response=await fetch(new URL(`/zee-observation/export?from=${height(from)}&through=${through==='latest'?'latest':height(through)}`,endpoint),{headers:{authorization:`Bearer ${token}`},redirect:'error',signal});requireThat(response.ok,'WAIT_SELECTED_ENVIO_EXPORT');const selected=await verifySelectedExport(await readJson(response,signal,8000000),policy,canonical,signal);requireThat(selected.range.fromHeight===from&&selected.range.through.height===(through==='latest'?Math.min(selected.producer.through.height,from+255):through),'SELECTED_EXPORT_RANGE_MISMATCH');return selected;
}
