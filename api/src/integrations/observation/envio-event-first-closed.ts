/** Separate V2 closed-history authority. Collection is read-only; only a fresh,
 * independently qualified publication permit can update observer metadata. */
import type pg from 'pg';
import {continuationDigest,continuationTables} from '../../native-circle-continuation.ts';
import type {ClosedSnapshot,ClosedPin,ClosedIntent} from './envio-closed-recovery.ts';
import {classifyClosedCommit} from './envio-closed-recovery.ts';
import {rawSha} from './envio-linked-campaign.ts';
import type {SourceCutoverIdentity} from './envio-source-cutover.ts';
import {validateEventFirstExport,verifyEventFirstExport,type EventFirstVerifiedExport,type EventFirstReader} from './envio-event-first.ts';
import {digest,stable,parseHeader,validatePolicy,requireThat,type Header} from './types.ts';
import type {EnvioAdmissionState} from './envio-live.ts';
function need(v:unknown,c:string):asserts v{requireThat(v,'ENVIO_CLOSED_V2_'+c);}
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
export const V2_CAPS={packetBlocks:64,packetBytes:8000000,packetMs:30000,segmentPackets:256,maxPackets:16384,maxBlocks:1000000,maxBytes:536870912,invocationPackets:20,invocationMs:300000,methodsPerSecond:24} as const;
export type V2CollectionPermit={version:2;status:'ROOT_ENVIO_EVENT_FIRST_CLOSED_COLLECTION_V2';collectionOnly:true;sqlPublication:false;admissionMutation:false;financialAction:false;
 campaignId:string;verifiedAt:string;expiresAt:string;publicCommit:string;branchId:'br-broad-pine-ao79wemx';database:'zee_app_20261023';identity:SourceCutoverIdentity;
 baseline:ClosedSnapshot;baselineSha256:string;originalAdmission:ClosedPin;originalAdmissionPlaintextDigest:string;selector:ClosedPin;closedAuthority:ClosedPin;archivePins:ClosedPin[];codePins:ClosedPin[];
 allowedEventDigests:string[];caps:typeof V2_CAPS};
export type V2ResumePermit={version:2;status:'ROOT_ENVIO_EVENT_FIRST_CLOSED_RESUME_V2';collectionSha256:string;manifestSha256:string;verifiedAt:string;expiresAt:string;phase:'pilot'|'reviewed-serial';financialAction:false;sqlPublication:false};
export type V2PacketRecord={version:2;index:number;permitSha256:string;previousDigest:string;packetSha256:string;acquiredAt:string;bytes:number;from:number;through:Header;producer:Header;revision:string;eventCount:number;recordDigest:string};
export type V2Manifest={version:2;collectionSha256:string;count:number;blocks:number;bytes:number;last:Header;lastRecordDigest:string;lastRevision:string|null;segments:{index:number;sha256:string;count:number}[];updatedAt:string};
export type V2PublicationPermit={version:2;status:'ROOT_ENVIO_EVENT_FIRST_CLOSED_PUBLICATION_V2';metadataOnly:true;financialAction:false;collectionSha256:string;manifestSha256:string;verifiedAt:string;expiresAt:string;baselineSha256:string;candidateAdmissionSha256:string;after:Omit<ClosedSnapshot['checkpoint'],'xmin'>;finalized:Header;tailPacketSha256:string;audit:ClosedPin};
export type V2Role='zee_app_reader_20261023'|'zee_app_worker_20261023';
/** Connection identity is truthful and checked separately from world state. */
export function v2StateDigest(s:ClosedSnapshot){const {role,...world}=s;return digest(world);}
export function validateV2ClosedState(s:ClosedSnapshot,requiredRole:V2Role='zee_app_reader_20261023'){
 need(s?.database==='zee_app_20261023'&&s.role===requiredRole&&s.authorizationRows===0,'DATABASE_OR_AUTHORITY');
 const c=s.control;need(c?.accepting_orders===false&&c.dispatch_enabled===false&&c.reconciliation_required===true&&/^[0-9]+$/.test(c.epoch)&&/^[1-9][0-9]*$/.test(c.xmin),'PAUSED_CONTROL');
 need(Object.keys(s.books??{}).sort().join(',')===[...continuationTables].sort().join(',')&&continuationTables.every(t=>Array.isArray(s.books[t])&&s.books[t]!.length<=128),'BOOK_BOUND');
 need(s.books.orders!.every(r=>['SETTLED','REFUNDED','EXPIRED_UNFUNDED'].includes(r.state))&&s.books.reservations!.every(r=>r.released_at!=null)&&s.books.inventory_accounts!.every(r=>String(r.reserved)==='0')&&s.books.obligations!.every(r=>r.state==='DISCHARGED')&&s.books.operations!.every(r=>r.state==='CONFIRMED')&&s.books.outbox_jobs!.every(r=>r.status==='DONE'&&r.lease_owner===null&&r.lease_until===null)&&s.books.chain_transactions!.every(r=>['CONFIRMED','REVERTED','EXPIRED'].includes(r.state))&&['base_attempts','escrow_commits','reverse_payouts','escrow_settlements'].every(t=>s.books[t]!.every(r=>r.confirmed===true))&&s.books.source_refunds!.every(r=>r.confirmed===true&&r.base_confirmed===true),'NOT_FULLY_CLOSED');
 need(Array.isArray(s.rows)&&s.rows.length<=20000&&s.rows.every((r,i)=>Number.isSafeInteger(r.height)&&hash(r.blockHash)&&(!i||r.height>s.rows[i-1]!.height)),'RETAINED_ROWS');
 const b=s.checkpoint;need(Number.isSafeInteger(b?.height)&&hash(b.hash)&&Number.isSafeInteger(b.finalizedHeight)&&b.finalizedHeight<=b.height&&/^[1-9][0-9]*$/.test(b.xmin)&&Number.isFinite(Date.parse(b.observedAt))&&Number.isFinite(Date.parse(b.finalizedTime)),'CHECKPOINT');return s;
}
function pin(p:ClosedPin){need(p&&/^\/opt\/zeeswap-testnet\//.test(p.path)&&!p.path.includes('..')&&!p.path.includes('\\')&&hash(p.sha256),'PIN');}
function lifetime(start:string,end:string,now:number,max:number){const a=Date.parse(start),b=Date.parse(end);need(Number.isFinite(a)&&a<=now&&b>now&&b>a&&b-a<=max,'AUTHORITY_EXPIRED');}
export function validateV2CollectionPermit(a:V2CollectionPermit,now=Date.now()){
 need(a?.version===2&&a.status==='ROOT_ENVIO_EVENT_FIRST_CLOSED_COLLECTION_V2'&&a.collectionOnly===true&&a.sqlPublication===false&&a.admissionMutation===false&&a.financialAction===false&&a.branchId==='br-broad-pine-ao79wemx'&&a.database==='zee_app_20261023','COLLECTION_SCOPE');
 lifetime(a.verifiedAt,a.expiresAt,now,86400000);need(/^[a-zA-Z0-9_-]{1,80}$/.test(a.campaignId)&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&stable(a.caps)===stable(V2_CAPS),'CAPS');
 validatePolicy(a.identity?.policy);need(a.identity.policy.adapter==='envio-hyperindex'&&a.identity.policy.network==='eip155:84532'&&a.identity.policy.canonicalSourceId==='base-sepolia-tenderly-rpc'&&/^[a-zA-Z0-9_-]{1,100}$/.test(a.identity.generation),'IDENTITY');
 validateV2ClosedState(a.baseline,'zee_app_reader_20261023');need(v2StateDigest(a.baseline)===a.baselineSha256&&hash(a.originalAdmissionPlaintextDigest),'BASELINE_DIGEST');
 for(const p of[a.originalAdmission,a.selector,a.closedAuthority,a.identity.exportProfile,a.identity.codeManifest,...a.archivePins,...a.codePins])pin(p);
 need(a.archivePins.length>0&&a.archivePins.length<=200&&a.codePins.length>0&&a.codePins.length<=512&&new Set(a.codePins.map(p=>p.path)).size===a.codePins.length,'PIN_INVENTORY');
 need(Array.isArray(a.allowedEventDigests)&&a.allowedEventDigests.length<=1000&&a.allowedEventDigests.every(hash)&&new Set(a.allowedEventDigests).size===a.allowedEventDigests.length,'KNOWN_EVENT_INVENTORY');return a;
}
export function assertV2Baseline(s:ClosedSnapshot,a:V2CollectionPermit,requiredRole:V2Role='zee_app_reader_20261023'){validateV2ClosedState(s,requiredRole);need(v2StateDigest(s)===a.baselineSha256,'BASELINE_INTERVENED');}
export function initialV2Manifest(a:V2CollectionPermit,permitSha256:string,admission:Buffer,open:(b:Buffer)=>unknown,now=Date.now()):V2Manifest{
 validateV2CollectionPermit(a,now);need(hash(permitSha256)&&rawSha(admission)===a.originalAdmission.sha256,'ORIGINAL_BYTES');const v=open(admission) as EnvioAdmissionState;
 need(v.checkpoint,'ORIGINAL_CHECKPOINT_REQUIRED');need(Object.keys(v).sort().join(',')==='checkpoint,hints,version'&&Object.keys(v.checkpoint).sort().join(',')==='generation,hash,height,projectionDigest'&&digest(v)===a.originalAdmissionPlaintextDigest&&v.version===2&&Array.isArray(v.hints)&&v.hints.length===0&&v.checkpoint.height===a.baseline.checkpoint.height&&v.checkpoint.hash==='0x'+a.baseline.checkpoint.hash&&v.checkpoint.generation===a.identity.generation&&v.checkpoint.projectionDigest===a.identity.policy.projectionDigest,'ORIGINAL_ADMISSION');
 const last={height:v.checkpoint.height,hash:v.checkpoint.hash,parentHash:'0x'+'0'.repeat(64),time:new Date(Date.parse(a.baseline.checkpoint.observedAt)).toISOString()};
 return{version:2,collectionSha256:permitSha256,count:0,blocks:0,bytes:0,last,lastRecordDigest:digest(['envio-event-first-closed-v2',permitSha256,a.baselineSha256,a.originalAdmission.sha256]),lastRevision:null,segments:[],updatedAt:new Date().toISOString()};
}
export function validateV2Resume(r:V2ResumePermit,a:V2CollectionPermit,permitSha:string,m:V2Manifest,now=Date.now()){
 validateV2CollectionPermit(a,now);need(r?.version===2&&r.status==='ROOT_ENVIO_EVENT_FIRST_CLOSED_RESUME_V2'&&r.collectionSha256===permitSha&&r.manifestSha256===digest(m)&&r.financialAction===false&&r.sqlPublication===false&&['pilot','reviewed-serial'].includes(r.phase),'RESUME_BINDING');lifetime(r.verifiedAt,r.expiresAt,now,86400000);need(now-Date.parse(r.verifiedAt)<=60000&&Date.parse(r.expiresAt)<=Date.parse(a.expiresAt),'RESUME_FRESH_OR_DEADLINE');return r;
}
export function appendV2Packet(a:V2CollectionPermit,m:V2Manifest,packet:EventFirstVerifiedExport,raw:Buffer,now=Date.now()){
 validateV2CollectionPermit(a,now);validateEventFirstExport(packet,a.identity.policy,now,'base-sepolia-publicnode-normal-rpc');
 // recoveryFloor is the SDK undo floor, not event-history availability. Preserve
 // it exactly; historical read-only verification never authorizes an SDK rewind.
 need(stable(JSON.parse(raw.toString()))===stable(packet)&&packet.producer.generation===a.identity.generation&&packet.range.fromHeight===m.last.height+1&&packet.range.headers[0]!.parentHash===m.last.hash,'RANGE_SEAM');
 need(m.lastRevision===null||BigInt(packet.producer.revision)>=BigInt(m.lastRevision),'REVISION_REGRESSION');need(packet.range.observations.every(e=>a.allowedEventDigests.includes(digest(e))),'UNRECOGNIZED_EVENT');
 const blocks=packet.range.headers.length;need(raw.length<=V2_CAPS.packetBytes&&m.count<V2_CAPS.maxPackets&&m.blocks+blocks<=V2_CAPS.maxBlocks&&m.bytes+raw.length<=V2_CAPS.maxBytes,'CAMPAIGN_CAP');
 const body={version:2 as const,index:m.count,permitSha256:m.collectionSha256,previousDigest:m.lastRecordDigest,packetSha256:rawSha(raw),acquiredAt:new Date(now).toISOString(),bytes:raw.length,from:packet.range.fromHeight,through:packet.range.through,producer:packet.producer.through,revision:packet.producer.revision,eventCount:packet.range.observations.length};const record:V2PacketRecord={...body,recordDigest:digest(body)};
 return{record,next:{...m,count:m.count+1,blocks:m.blocks+blocks,bytes:m.bytes+raw.length,last:packet.range.through,lastRecordDigest:record.recordDigest,lastRevision:packet.producer.revision,updatedAt:new Date(now).toISOString()} as V2Manifest};
}
/** Old evidence stays old: its exact recorded acquisition boundary is validated;
 * this does not satisfy any current-head or publication freshness requirement. */
export function validateV2ArchivedPacket(a:V2CollectionPermit,m:V2Manifest,record:V2PacketRecord,raw:Buffer){
 const p=JSON.parse(raw.toString()) as EventFirstVerifiedExport;const {recordDigest,...body}=record;need(digest(body)===recordDigest&&rawSha(raw)===record.packetSha256&&raw.length===record.bytes,'ARCHIVE_BYTES');
 const at=Date.parse(record.acquiredAt);need(at>=Date.parse(a.verifiedAt)&&at<Date.parse(a.expiresAt),'ARCHIVE_ACQUISITION');const result=appendV2Packet(a,m,p,raw,at);need(stable(result.record)===stable(record),'ARCHIVE_CHAIN');return result.next;
}
export async function readV2Packet(url:string,token:string,from:number,through:number,a:V2CollectionPermit,reader:EventFirstReader,signal:AbortSignal,request:typeof fetch=fetch){
 need(url==='http://127.0.0.1:8099'&&through>=from&&through-from+1<=64,'FIXED_SOURCE_RANGE');const u=new URL('/zee-observation/event-first/export',url);u.searchParams.set('from',String(from));u.searchParams.set('through',String(through));
 const response=await request(u,{headers:{authorization:'Bearer '+token},redirect:'error',signal});need(response.ok,'SOURCE_HTTP');
 const {readJson}=await import('./chef.ts');const packet=await verifyEventFirstExport(await readJson(response,signal,V2_CAPS.packetBytes),a.identity.policy,reader,signal);
 need(packet.producer.generation===a.identity.generation&&packet.range.fromHeight===from&&packet.range.through.height===through,'SOURCE_EXACT_RANGE');return packet;
}
export function validateV2PublicationPermit(p:V2PublicationPermit,a:V2CollectionPermit,permitSha:string,m:V2Manifest,candidate:Buffer,now=Date.now()){
 // The collection authority may have expired after acquisition. It is archival
 // here; a new, separately fresh Root publication permission is mandatory.
 validateV2CollectionPermit(a,Date.parse(a.verifiedAt));need(p?.version===2&&p.status==='ROOT_ENVIO_EVENT_FIRST_CLOSED_PUBLICATION_V2'&&p.metadataOnly===true&&p.financialAction===false&&p.collectionSha256===permitSha&&p.manifestSha256===digest(m)&&p.baselineSha256===a.baselineSha256&&p.candidateAdmissionSha256===rawSha(candidate)&&hash(p.tailPacketSha256),'PUBLICATION_BINDING');
 lifetime(p.verifiedAt,p.expiresAt,now,900000);pin(p.audit);parseHeader(p.finalized,a.identity.policy.network);need(m.count>0&&p.after.height===m.last.height&&'0x'+p.after.hash===m.last.hash&&p.after.finalizedHeight===p.finalized.height&&p.finalized.height<=m.last.height&&p.finalized.height>=a.baseline.checkpoint.finalizedHeight&&Date.parse(p.after.finalizedTime)===Date.parse(p.finalized.time)&&Number.isFinite(Date.parse(p.after.observedAt)),'PUBLICATION_FRONTIER');return p;
}
export function v2Candidate(a:V2CollectionPermit,m:V2Manifest,original:unknown){const v=structuredClone(original) as EnvioAdmissionState;need(digest(v)===a.originalAdmissionPlaintextDigest&&v.hints.length===0,'CANDIDATE_ORIGINAL');return{...v,checkpoint:{height:m.last.height,hash:m.last.hash,generation:a.identity.generation,projectionDigest:a.identity.policy.projectionDigest}};}
/** Final IO, outside SQL: every saved anchor and the terminal chain are canonical,
 * and the last packet is reacquired/verified now. No archival clock is renewed. */
export async function qualifyV2Publication(a:V2CollectionPermit,m:V2Manifest,tail:EventFirstVerifiedExport,reader:EventFirstReader,signal:AbortSignal){
 const v=await verifyEventFirstExport(tail,a.identity.policy,reader,signal);need(stable(v.range.through)===stable(m.last)&&v.producer.generation===a.identity.generation,'CURRENT_TAIL_REQUIRED');
 for(let n=0;n<a.baseline.rows.length;n+=10){const page=a.baseline.rows.slice(n,n+10),actual=reader.headers?await reader.headers(page.map(r=>r.height),signal):await Promise.all(page.map(r=>reader.header(r.height,signal)));need(actual.every((h,i)=>h.height===page[i]!.height&&h.hash==='0x'+page[i]!.blockHash),'RETAINED_CANONICAL_CONFLICT');}
 const finalized=v.verification.finalized;need(finalized.height<=m.last.height&&finalized.height>=a.baseline.checkpoint.finalizedHeight,'FINALITY');need(stable(await reader.header(m.last.height,signal))===stable(m.last)&&stable(await reader.header(finalized.height,signal))===stable(finalized),'FINAL_END_REORG');const sample=await reader.sample(signal);need(sample.head.height>=m.last.height&&sample.head.height-m.last.height<=40&&sample.finalized&&sample.finalized.height>=finalized.height&&Date.now()-Date.parse(sample.checkedAt)>=0&&Date.now()-Date.parse(sample.checkedAt)<=30000,'CURRENT_TAIL_LAG');signal.throwIfAborted();return{finalized,observedAt:v.producer.sourceSampledAt};
}
/** The fresh tail may report a newer finalized block. SQL still uses the exact
 * permitted original anchor, which must itself be rechecked independently. */
export async function verifyV2PublicationAnchor(p:V2PublicationPermit,reader:EventFirstReader,signal:AbortSignal){const actual=await reader.header(p.finalized.height,signal),sample=await reader.sample(signal);need(stable(actual)===stable(p.finalized)&&sample.sourceId===reader.sourceId&&sample.finalized&&sample.finalized.height>=p.finalized.height&&Date.now()-Date.parse(sample.checkedAt)>=0&&Date.now()-Date.parse(sample.checkedAt)<=30000,'PERMITTED_FINALITY_CHANGED');signal.throwIfAborted();}
/** Only observer metadata is mutated. This function never calls a financial,
 * control, migration, intake or settlement procedure. */
export async function publishV2Metadata(c:Pick<pg.PoolClient,'query'>,guard:()=>Promise<ClosedSnapshot>,a:V2CollectionPermit,permitSha:string,p:V2PublicationPermit,publicationSha:string,m:V2Manifest,original:Buffer,candidate:Buffer,open:(b:Buffer)=>unknown,persist:(i:ClosedIntent)=>Promise<void>,signal:AbortSignal){
 const fresh=()=>{validateV2PublicationPermit(p,a,permitSha,m,candidate);const age=Date.now()-Date.parse(p.after.observedAt);need(age>=0&&age<=60000,'PUBLICATION_SOURCE_STALE');signal.throwIfAborted();};fresh();
 need(hash(publicationSha)&&rawSha(original)===a.originalAdmission.sha256&&stable(open(candidate))===stable(v2Candidate(a,m,open(original))),'CANDIDATE');
 let commitSent=false;await c.query('BEGIN');try{
  await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");await c.query('SELECT zee.lock_observer_cycle()');
  const before=await guard();assertV2Baseline(before,a,'zee_app_worker_20261023');fresh();const xid=String((await c.query('SELECT pg_current_xact_id()::text id')).rows[0]?.id);need(/^[1-9][0-9]*$/.test(xid)&&(await c.query('SELECT pg_xact_status($1::xid8) status',[xid])).rows[0]?.status==='in progress','XID');
  const xmin=(BigInt(xid)%4294967296n).toString(),six=(s:string)=>new Date(s).toISOString().replace(/\.(\d{3})Z$/,'.$1000Z'),after={...p.after,observedAt:six(p.after.observedAt),finalizedTime:six(p.after.finalizedTime),xmin};
  need(after.height>a.baseline.checkpoint.height&&Date.parse(after.observedAt)>=Date.parse(a.baseline.checkpoint.observedAt),'FRONTIER_REGRESSION');
  const rows=new Map(before.rows.map(r=>[r.height,r]));for(const h of[m.last,p.finalized]){need(!rows.has(h.height)||rows.get(h.height)!.blockHash===h.hash.slice(2),'STORED_CONFLICT');rows.set(h.height,{height:h.height,blockHash:h.hash.slice(2)});}
  const intent:ClosedIntent={version:1,purpose:'ENVIO_CLOSED_HISTORY_METADATA_RECOVERY',approvalSha256:publicationSha,journalDigest:digest(m),transactionId:xid,expectedXmin:xmin,control:before.control,financialDigest:continuationDigest(before.books),before:before.checkpoint,after,beforeRows:before.rows,afterRows:[...rows.values()].sort((x,y)=>x.height-y.height),originalAdmissionSha256:a.originalAdmission.sha256,candidateAdmissionSha256:rawSha(candidate),candidateAdmissionBase64:candidate.toString('base64')};
  await persist(intent);fresh();for(const h of[m.last,p.finalized])await c.query("INSERT INTO zee.chain_observations(network,height,block_hash,block_time) VALUES('base-sepolia',$1,$2,$3::timestamptz) ON CONFLICT(network,height) DO NOTHING",[h.height,h.hash.slice(2),h.time]);
  const b=before.checkpoint,result=await c.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4::timestamptz,observed_at=$5::timestamptz WHERE network='base-sepolia' AND xmin::text=$6 AND scanned_height=$7 AND tip_hash=$8 AND finalized_height=$9 AND finalized_time=$10::timestamptz AND observed_at=$11::timestamptz RETURNING xmin::text",[after.height,after.hash,after.finalizedHeight,after.finalizedTime,after.observedAt,b.xmin,b.height,b.hash,b.finalizedHeight,b.finalizedTime,b.observedAt]);
  need(result.rows.length===1&&result.rows[0].xmin===xmin,'CHECKPOINT_CAS');
  // Expected-state comparison inside the still-open transaction, not a claim
  // that this XID committed. Any trigger/intervention can still be rolled back.
  const applied=await guard();validateV2ClosedState(applied,'zee_app_worker_20261023');need(classifyClosedCommit('committed',applied,intent)==='COMMITTED_EXACT','POST_DML_STATE');fresh();commitSent=true;await c.query('COMMIT');return intent;
 }catch(e){if(!commitSent)await c.query('ROLLBACK').catch(()=>{});throw e;}
}
export {classifyClosedCommit as classifyV2Commit};
/** Hold the existing observer row lock across committed readback AND the narrow
 * original-byte file completion. Native FOLLOW may run; an epoch reorg cannot
 * interleave between exact classification and marker removal. */
export async function finishV2UnderObserverLock(c:Pick<pg.PoolClient,'query'>,read:()=>Promise<ClosedSnapshot>,status:string,intent:ClosedIntent,finish:()=>Promise<void>){
 await c.query('BEGIN');try{await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");await c.query('SELECT zee.lock_observer_cycle()');const before=await read();validateV2ClosedState(before,'zee_app_worker_20261023');need(classifyClosedCommit(status,before,intent)==='COMMITTED_EXACT','COMPLETION_STATE');await finish();const after=await read();validateV2ClosedState(after,'zee_app_worker_20261023');need(classifyClosedCommit(status,after,intent)==='COMMITTED_EXACT','COMPLETION_STATE');await c.query('COMMIT');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
