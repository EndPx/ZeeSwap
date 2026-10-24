import test from 'node:test';
import {canonicalRpc} from '../../src/integrations/observation/canonical-rpc.ts';
import {mkdtemp,writeFile,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {exportSelectedEnvioRange,validateSelectedExport,verifySelectedExport,type SelectedEnvioExport,type VerifiedEnvioSelection} from '../../src/integrations/observation/envio-selected-export.ts';
import {envioRecoveryTransport,requireNoEnvioRecovery,requireEnvioRecoveryPrefunding,initialEnvioRecovery,nextEnvioRecoveryRange,appendEnvioRecovery,validateEnvioRecovery,recheckEnvioRecovery,completeEnvioRecovery,recoverySqlOutcome,type RecoverySql} from '../../src/integrations/observation/envio-recovery.ts';
import {envioAdmissionFrom} from '../../src/integrations/observation/envio-live.ts';
import {publishObserverBatch} from '../../src/observer-frontiers.ts';
import {contentDigest,digest,type Policy,type BaseEvent} from '../../src/integrations/observation/types.ts';
const policy:Policy={adapter:'envio-hyperindex',network:'eip155:84532',birthday:100,registryDigest:'1'.repeat(64),projectionDigest:'2'.repeat(64),abiDigest:'3'.repeat(64),canonicalSourceId:'independent-fixture-rpc',contract:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),maxBlocks:1000};
const time=new Date().toISOString(),now=Date.parse(time),hash=(h:number)=>'0x'+h.toString(16).padStart(64,'0'),header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
const identity={policy,generation:'original-live-generation',profileSha256:'a'.repeat(64),handoffSha256:'b'.repeat(64)};
const original={version:2 as const,hints:[],checkpoint:{height:500,hash:hash(500),generation:identity.generation,projectionDigest:policy.projectionDigest}};
const sql:RecoverySql={height:550,hash:hash(550).slice(2),finalizedHeight:400,finalizedTime:time,observedAt:time};
function initial(){return initialEnvioRecovery(identity,original,'c'.repeat(64),sql);}
function selected(from:number,through:number,producer=2000):SelectedEnvioExport{
 const headers=Array.from({length:through-from+1},(_,n)=>header(from+n)),observations:BaseEvent[]=[];
 return{protocol:'zee-envio-selected-export-v1',isolation:'repeatable-read-read-only',snapshotToken:'fixture-snapshot',expiresAt:new Date(now+30000).toISOString(),producer:{generation:identity.generation,revision:'42',through:header(producer),recoveryFloor:producer-199,sourceSampledAt:time,sourceHead:header(producer+2),projectionDigest:policy.projectionDigest,registryDigest:policy.registryDigest,complete:true},range:{fromHeight:from,through:header(through),headers,observations,contentDigest:contentDigest({headers,observations}),readStartedAt:time,readCompletedAt:time}};
}
function verified(from:number,through:number,producer=2000):VerifiedEnvioSelection{return{...selected(from,through,producer),verification:{sourceId:policy.canonicalSourceId,checkedAt:time,head:header(producer+5),finalized:header(400)}};}
function canonical(fork=-1){return{headerBatchSize:10,async sample(){return{sourceId:policy.canonicalSourceId,checkedAt:time,head:header(2005),finalized:header(400)};},async header(h:number){return h===fork?{...header(h),hash:hash(h+99999)}:header(h);},async headers(h:readonly number[]){return Promise.all(h.map(n=>this.header(n)));}};}
test('retained historical selection below true producer undo floor is exact and independently verified',async()=>{
 const s=selected(469,724);assert.equal(validateSelectedExport(s,policy,now).producer.recoveryFloor,1801);
 const calls:number[]=[];const c=canonical();const read=c.headers.bind(c);c.headers=async hs=>{calls.push(...hs);return read(hs);};
 await verifySelectedExport(s,policy,c);assert.deepEqual(calls,Array.from({length:256},(_,i)=>469+i));
 await assert.rejects(verifySelectedExport(s,policy,canonical(501)),/SELECTED_CANONICAL_REORG/);
});
test('missing retained row, stale producer, changed metadata/digest and selected overrun fail closed',()=>{
 const gap=selected(469,724);gap.range.headers.splice(55,1);assert.throws(()=>validateSelectedExport(gap,policy,now),/HISTORY_GAP/);
 const stale=selected(469,724);stale.producer.sourceSampledAt=new Date(now-61000).toISOString();assert.throws(()=>validateSelectedExport(stale,policy,now),/STALE/);
 const changed=selected(469,724);changed.producer.projectionDigest='f'.repeat(64);assert.throws(()=>validateSelectedExport(changed,policy,now),/PRODUCER_CHECKPOINT/);
 const tooBig=selected(469,725);assert.throws(()=>validateSelectedExport(tooBig,policy,now),/RANGE_BOUND/);
 const badDigest=selected(469,724);badDigest.range.contentDigest='0'.repeat(64);assert.throws(()=>validateSelectedExport(badDigest,policy,now),/CONTENT_DIGEST/);
});
test('SELECT-only selected export uses one repeatable-read MVCC snapshot and actual producer metadata',async()=>{
 const expected=selected(469,724),queries:string[]=[],params:unknown[][]=[];
 const client={async query(q:string,v:unknown[]=[]){queries.push(q);params.push(v);if(q.includes('current_setting'))return{rows:[{isolation:'repeatable read',read_only:'on'}]};if(q.includes('checkpoint'))return{rows:[{payload:expected.producer}]};if(q.includes('headers'))return{rows:expected.range.headers.map(payload=>({payload}))};return{rows:[]};}} as unknown as Parameters<typeof exportSelectedEnvioRange>[0];
 const schema={schema:'fixture',checkpointTable:'checkpoint',headersTable:'headers',eventsTable:'events',streamId:'base-v1'};
 const out=await exportSelectedEnvioRange(client,schema,policy,469,'latest',()=>now);assert.equal(out.producer.recoveryFloor,1801);assert.equal(out.range.through.height,724);assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(queries.at(-1),'COMMIT');assert.ok(queries.every(q=>!/INSERT|UPDATE|DELETE|CREATE|TRUNCATE/.test(q)));
 assert.deepEqual(params[queries.findIndex(q=>q.includes('FROM "fixture"."headers"'))],[schema.streamId,469,724]);
 expected.range.headers.pop();await assert.rejects(exportSelectedEnvioRange(client,schema,policy,469,724,()=>now),/HISTORY_GAP/);assert.equal(queries.at(-1),'ROLLBACK');
});
test('whole gap >1000 resumes from hash-linked overlap without changing admission or SQL baseline',()=>{
 let j=initial();const originalBytes=JSON.stringify(j.originalAdmission),sqlBytes=JSON.stringify(j.originalSql);
 assert.throws(()=>envioAdmissionFrom(policy,2000,550,original,0),/ENVIO_ADMISSION_GAP/);
 let chunks=0;while(j.proofs.at(-1)?.selection.range.through.height!==2000){const r=nextEnvioRecoveryRange(j,2000);j=appendEnvioRecovery(j,verified(r.from,r.through),now);chunks++;if(chunks===4){j=JSON.parse(JSON.stringify(j));validateEnvioRecovery(j,identity);assert.throws(()=>completeEnvioRecovery(j,now),/CURRENT_TAIL/);}}
 assert.ok(chunks>5);assert.equal(JSON.stringify(j.originalAdmission),originalBytes);assert.equal(JSON.stringify(j.originalSql),sqlBytes);
 const complete=completeEnvioRecovery(j,now);assert.equal(complete.admission.checkpoint?.height,2000);assert.deepEqual(complete.admission.hints,original.hints);assert.equal(complete.sql.observedAt,time);
 assert.doesNotThrow(()=>envioAdmissionFrom(policy,2025,2000,complete.admission,0));
});
test('partial proof is not publishable and original nonempty hints are explicitly refused rather than discarded',()=>{
 assert.throws(()=>initialEnvioRecovery(identity,{...original,hints:[{orderId:'never-discard',txHash:hash(700) as `0x${string}`,height:700}]},'c'.repeat(64),sql),/EMPTY_ORIGINAL/);
 const j=appendEnvioRecovery(initial(),verified(469,724),now);assert.throws(()=>completeEnvioRecovery(j,now),/CURRENT_TAIL/);assert.equal(j.originalAdmission.checkpoint!.height,500);
});
test('resume rejects changed chain, overlap, generation, skipped range and proof tampering',async()=>{
 const j=appendEnvioRecovery(initial(),verified(469,724),now);await recheckEnvioRecovery(j,canonical());await assert.rejects(recheckEnvioRecovery(j,canonical(724)),/CANONICAL_REORG/);await assert.rejects(recheckEnvioRecovery(j,canonical(500)),/CANONICAL_REORG/);
 const skipped=verified(694,949);assert.throws(()=>appendEnvioRecovery(j,skipped,now),/RECOVERY_GAP/);
 const fork=verified(693,948);fork.range.headers[0]!.time=new Date(now-1000).toISOString();fork.range.contentDigest=contentDigest(fork.range);assert.throws(()=>appendEnvioRecovery(j,fork,now));
 const generation=verified(693,948);generation.producer.generation='replacement';assert.throws(()=>appendEnvioRecovery(j,generation,now),/GENERATION/);
 const tamper=structuredClone(j);tamper.proofs[0]!.selection.range.headers[0]!.time=new Date(now-1000).toISOString();assert.throws(()=>validateEnvioRecovery(tamper,identity),/PROOF_CHANGED/);
});
test('final tail requires real sampled <=40 lag, canonical finality and original unrenewed freshness',()=>{
 let j=initial();for(;;){const r=nextEnvioRecoveryRange(j,700);j=appendEnvioRecovery(j,verified(r.from,r.through,700),now);if(r.through===700)break;}
 assert.doesNotThrow(()=>completeEnvioRecovery(j,now));assert.throws(()=>completeEnvioRecovery(j,now+61000),/EXPIRED|STALE/);
 const lag=structuredClone(j),last=lag.proofs.at(-1)!;last.selection.producer.sourceHead=header(741);last.selection.verification.head=header(750);last.proofDigest=digest({selection:last.selection,previousDigest:last.previousDigest});assert.throws(()=>completeEnvioRecovery(lag,now),/CURRENT_TAIL/);
});
test('publication guard holds runtime lock before any write and failed prefunding guard rolls back',async()=>{
 const calls:string[]=[];const client={async query(q:string){calls.push(q);return{rows:[]};},release(){}};
 const pool={async connect(){return client;}} as unknown as pg.Pool;
 await assert.rejects(publishObserverBatch(pool,'prefunding-fixture',[],[],undefined,async c=>{assert.equal(calls.at(-1),'SELECT zee.lock_observer_cycle()');await c.query('FIXTURE_CHECK_BOOKS');throw Error('CUSTOMER_BOOKS');}),/CUSTOMER_BOOKS/);
 assert.deepEqual(calls,['BEGIN','SELECT zee.lock_observer_cycle()','FIXTURE_CHECK_BOOKS','ROLLBACK']);
});
test('unknown COMMIT reconciles exact complete checkpoint; intervention never becomes an automatic replay',()=>{
 const candidate={...sql,height:2000,hash:hash(2000).slice(2)};
 assert.equal(recoverySqlOutcome(sql,sql,candidate),'ORIGINAL');assert.equal(recoverySqlOutcome(candidate,sql,candidate),'COMMITTED');
 for(const changed of [{...candidate,observedAt:new Date(now+1).toISOString()},{...candidate,finalizedHeight:401},{...candidate,height:2001}])assert.throws(()=>recoverySqlOutcome(changed,sql,candidate),/INTERVENTION/);
});

test('root prefunding gate rejects activation, wrong branch role, any customer row and active lease',()=>{
 const control={db:'zee_app_20261023',role:'zee_app_worker_20261023',accepting_orders:false,dispatch_enabled:false,reconciliation_required:true,epoch:'0'},counts={quotes:'0',orders:'0',deposits:'0',obligations:'0',operations:'0',leases:'0'};
 assert.doesNotThrow(()=>requireEnvioRecoveryPrefunding(control,counts));
 for(const field of ['quotes','orders','deposits','obligations','operations','leases'])assert.throws(()=>requireEnvioRecoveryPrefunding(control,{...counts,[field]:'1'}),/CUSTOMER_BOOKS_OR_LEASES/);
 for(const change of [{epoch:'1'},{accepting_orders:true},{dispatch_enabled:true},{reconciliation_required:false},{role:'zee_app_admin_20261023'},{db:'old-g5'}])assert.throws(()=>requireEnvioRecoveryPrefunding({...control,...change},counts),/PAUSED_EPOCH_ZERO/);
});

test('SQL COMMIT response loss leaves original admission untouched and exact checkpoint resolves without another SQL write',async()=>{
 let writes=0,actual=sql;const candidate={...sql,height:2000,hash:hash(2000).slice(2)};
 const client={async query(q:string){if(q.includes('FOR UPDATE'))return{rows:[{network:'base-sepolia',scanned_height:sql.height,tip_hash:sql.hash,finalized_height:sql.finalizedHeight,finalized_time:sql.finalizedTime,observed_at:sql.observedAt}]};if(q.includes('INSERT INTO zee.scanner_checkpoints')){writes++;actual=candidate;}if(q.includes('SELECT epoch'))return{rows:[{epoch:'0'}]};if(q==='COMMIT')throw Error('SIMULATED_COMMIT_RESPONSE_LOSS');return{rows:[]};},release(){}};
 const pool={async connect(){return client;}} as unknown as pg.Pool,originalAdmission=JSON.stringify(original);
 await assert.rejects(publishObserverBatch(pool,'fixture',[{network:'base-sepolia',height:candidate.height,hash:candidate.hash,finalizedHeight:candidate.finalizedHeight,finalizedTime:new Date(candidate.finalizedTime),observedAt:new Date(candidate.observedAt)}]),/RESPONSE_LOSS/);
 assert.equal(JSON.stringify(original),originalAdmission);assert.equal(recoverySqlOutcome(actual,sql,candidate),'COMMITTED');assert.equal(writes,1);
});
test('a valid selected financial event requires root review before append or publication; it cannot be lost as empty hints',()=>{
 const s=verified(469,724),id=hash(12345),event:BaseEvent={kind:'base-contract-event',chainId:84532,contract:policy.contract!,token:policy.token!,abiDigest:policy.abiDigest!,txHash:hash(8888),transactionIndex:0,logIndex:0,block:header(500),event:'Funded',settlementId:id,amountAtomic:'100000',decoded:{id,payer:'0x'+'33'.repeat(20),amount:'100000',cancellationAvailableAt:'9999999999'}};
 s.range.observations=[event];s.range.contentDigest=contentDigest(s.range);
 const {verification,...raw}=s;assert.doesNotThrow(()=>validateSelectedExport(raw,policy,now));assert.throws(()=>appendEnvioRecovery(initial(),s,now),/EVENTS_REQUIRE_ROOT_REVIEW/);
 const j=appendEnvioRecovery(initial(),verified(469,724),now),last=j.proofs[0]!;last.selection=s;last.proofDigest=digest({selection:s,previousDigest:last.previousDigest});assert.throws(()=>completeEnvioRecovery(j,now),/EVENTS_REQUIRE_ROOT_REVIEW/);
});

test('normal observer refuses any pending recovery marker and resumes only after marker removal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zee-recovery-marker-')),marker=join(dir,'recovery-in-progress');
 try{await requireNoEnvioRecovery(marker);await writeFile(marker,'prefunding-recovery\n',{mode:0o600});await assert.rejects(requireNoEnvioRecovery(marker),/ENVIO_RECOVERY_PENDING/);await unlink(marker);await requireNoEnvioRecovery(marker);}finally{await rm(dir,{recursive:true,force:true});}
});

test('recovery-only provider has exact PublicNode identity and24 method pacing while original policy remains byte-identical',()=>{
 const originalPolicy={...policy,canonicalSourceId:'base-sepolia-tenderly-rpc'},before=JSON.stringify(originalPolicy),transport=envioRecoveryTransport(originalPolicy);
 assert.deepEqual({url:transport.url,sourceId:transport.sourceId,network:transport.network,headerBatchSize:transport.headerBatchSize,maxMethodsPerSecond:transport.maxMethodsPerSecond},{url:'https://base-sepolia-rpc.publicnode.com',sourceId:'base-sepolia-recovery-publicnode-v1',network:'eip155:84532',headerBatchSize:10,maxMethodsPerSecond:24});
 assert.equal(JSON.stringify(originalPolicy),before);assert.notEqual(transport.policy,originalPolicy);assert.deepEqual(transport.policy,{...originalPolicy,canonicalSourceId:transport.sourceId});
 assert.throws(()=>envioRecoveryTransport({...originalPolicy,canonicalSourceId:'base-sepolia-recovery-publicnode-v1'}),/ORIGINAL_SOURCE_REQUIRED/);
});


test('256-block planning covers observed56498-block gap within1024proofs without shortening it;1025proofs explicitly refuse',()=>{
 const target=500+56498,j=initial();let previous=500,chunks=0;
 while(previous<target){const r=nextEnvioRecoveryRange(j,target);assert.equal(r.from,previous+1-32);assert.equal(r.through,Math.min(target,r.from+255));assert.ok(r.through-r.from+1<=256);previous=r.through;chunks++;j.proofs=[{selection:{range:{through:{height:previous}}}}] as typeof j.proofs;}
 assert.equal(previous,target);assert.ok(chunks<=1024);assert.equal(chunks,253);
 assert.throws(()=>validateEnvioRecovery({...initial(),proofs:Array(1025).fill({})},identity),/IDENTITY_OR_LIMIT/);
});
test('recovery pacing is an explicit24or80preset with stable provider/policy identity and invalid values refused',()=>{
 const originalPolicy={...policy,canonicalSourceId:'base-sepolia-tenderly-rpc'},slow=envioRecoveryTransport(originalPolicy,'24'),fast=envioRecoveryTransport(originalPolicy,'80');
 assert.equal(slow.maxMethodsPerSecond,24);assert.equal(fast.maxMethodsPerSecond,80);assert.equal(envioRecoveryTransport(originalPolicy).maxMethodsPerSecond,24);assert.deepEqual(slow.policy,fast.policy);assert.equal(slow.sourceId,fast.sourceId);assert.equal(slow.url,fast.url);
 for(const value of ['','024','80.0','100','12',' 80','80 '])assert.throws(()=>envioRecoveryTransport(originalPolicy,value),/PACING_PRESET/);
});
test('canonical selection overlaps at most2batches, checks everyheader, and drains all outcomes before failure escapes',async()=>{
 const s=selected(469,724),c=canonical();let active=0,maxActive=0,calls=0,drained=false;const requested:number[]=[];
 c.headers=async hs=>{active++;maxActive=Math.max(maxActive,active);calls++;requested.push(...hs);await new Promise(r=>setTimeout(r,1));active--;return hs.map(header);};
 await verifySelectedExport(s,policy,c);assert.equal(maxActive,2);assert.equal(active,0);assert.deepEqual(requested,Array.from({length:256},(_,n)=>469+n));
 calls=0;let drainedCount=0;c.headers=async hs=>{const n=++calls;if(n===1)throw Error('INJECTED_BATCH_FAILURE');await new Promise(r=>setTimeout(r,5*n));drained=true;drainedCount++;return hs.map(header);};
 await assert.rejects(verifySelectedExport(s,policy,c),/INJECTED_BATCH_FAILURE/);assert.equal(drained,true);assert.equal(drainedCount,1);assert.equal(calls,2);
});


test('twoway selection drains all aborted batches and retains30second source-read budget',async()=>{
 const c=canonical(),s=selected(469,724);let started=0,settled=0;
 c.headers=async hs=>{started++;try{await new Promise(r=>setTimeout(r,20));signal.throwIfAborted();return hs.map(header);}finally{settled++;}};
 const signal=AbortSignal.timeout(5);await assert.rejects(verifySelectedExport(s,policy,c,signal),/abort|timeout/i);assert.equal(started,2);assert.equal(settled,2);
 const expired=selected(469,724);expired.range.readStartedAt=new Date(now-30001).toISOString();await assert.rejects(verifySelectedExport(expired,policy,canonical()),/SELECTED_READ_BUDGET/);
});
test('twoway verification still shares canonical global method pacing at both24and80, with at most10methods per HTTP',async()=>{
 for(const rate of [24,80]){
  const stamp=new Date(Math.floor(Date.now()/1000)*1000).toISOString(),s=selected(469,508),records:{at:number;count:number}[]=[];
  for(const h of [...s.range.headers,s.range.through,s.producer.through,s.producer.sourceHead])h.time=stamp;s.range.contentDigest=contentDigest(s.range);
  const fetcher:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body)),requests=Array.isArray(body)?body:[body];records.push({at:performance.now(),count:requests.length});assert.ok(requests.length<=10);
   const out=requests.map((r:any)=>{if(r.method==='eth_chainId')return{jsonrpc:'2.0',id:r.id,result:'0x14a34'};assert.equal(r.method,'eth_getBlockByNumber');const h=r.params[0]==='latest'?2005:r.params[0]==='finalized'?400:Number(BigInt(r.params[0]));return{jsonrpc:'2.0',id:r.id,result:{number:'0x'+h.toString(16),hash:hash(h),parentHash:hash(h-1),timestamp:'0x'+Math.floor(Date.parse(stamp)/1000).toString(16)}};});return new Response(JSON.stringify(Array.isArray(body)?out:out[0]),{status:200});
  };
  const c=canonicalRpc({url:'https://base-sepolia-rpc.publicnode.com',sourceId:policy.canonicalSourceId,network:'eip155:84532',headerBatchSize:10,maxMethodsPerSecond:rate,fetch:fetcher});await verifySelectedExport(s,policy,c);
  for(let i=1;i<records.length;i++)assert.ok(records[i]!.at-records[i-1]!.at>=Math.ceil(records[i-1]!.count*1000/rate)-8,'global method reservation still paces overlapping HTTP batches');
 }
});
