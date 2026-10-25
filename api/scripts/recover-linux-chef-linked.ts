/** Explicit Root metadata-only recovery of a complete Chef suffix. No financial ingestion. */
import {readFile,open,lstat,realpath,mkdir,rename,unlink,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type pg from 'pg';
import {connect} from '../src/db.ts';
import {loadLinuxChefRuntime} from './recover-linux-chef.ts';
import {publishObserverBatch} from '../src/observer-frontiers.ts';
import {validateSnapshot,type Snapshot} from '../src/observer.ts';
import {readContinuationSnapshot,validateContinuationApproval,validateContinuationSnapshot,continuationDigest,readRootContinuationAuthority,readRootNoRepairAudit} from '../src/native-circle-continuation.ts';
import {requireProtectedNoRepairState,type ReconciledApproval,type NoRepairAudit} from '../src/native-circle-reconciled.ts';
import {ChefAdapter,chefSourceTimestamp,parseChefStatus,readJson,safeEndpoint,type CanonicalReader} from '../src/integrations/observation/chef.ts';
import {ChefWalletBridge,localChefDecoder} from '../src/integrations/observation/chef-wallet-bridge.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {chefFinancialCheckHeights,readChefPersistedState,chefPersistedCanonical,type ChefPersistedState} from '../src/integrations/observation/chef-live.ts';
import {withChefRecoveryJournal,validateChefRecoveryJournal,nextChefRecoveryRange} from '../src/integrations/observation/chef-recovery.ts';
import {validateChefLinkedApproval,validateChefLinkedApprovalTime,initialChefLinkedRecovery,nextChefLinkedRecoveryRange,validateChefLinkedRecovery,appendChefLinkedRecoveryProof,extendChefLinkedRecoveryTarget,chefLinkedRecoverySnapshot,classifyChefLinkedCommit,finishChefLinkedFileBoundary,chefLinkedCampaignDirectory,type ChefLinkedApproval,type ChefLinkedJournal,type ChefLinkedCheckpoint,type ChefLinkedControl} from '../src/integrations/observation/chef-linked-recovery.ts';
import {digest,stable,requireThat} from '../src/integrations/observation/types.ts';

const root='/opt/zeeswap-testnet',state=root+'/state',recovery=state+'/chef-recovery',marker=recovery+'/linked-recovery-in-progress';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{requireThat(v,'CHEF_LINKED_'+c);}
type Ref={path:string;sha256:string};
type SqlState={checkpoint:ChefLinkedCheckpoint;control:ChefLinkedControl};
interface Intent{version:1;approvalSha256:string;journalDigest:string;transactionId:string;expectedXmin:string;before:SqlState;after:SqlState;candidateCursor:unknown;candidateCursorSha256:string;candidateSnapshotDigest:string;candidateSnapshot:Snapshot}
export function parseChefLinkedArgs(args:string[]){const [step,path,pin,count]=args;need(['recover','publish','reconcile'].includes(step??'')&&typeof path==='string'&&/^\/opt\/zeeswap-testnet\/state\/chef-recovery\/[A-Za-z0-9._-]+\.private\.json$/.test(path)&&/^[a-f0-9]{64}$/.test(pin??'')&&(step==='recover'?args.length===4&&/^(?:[1-9]|1[0-9]|20)$/.test(count??''):args.length===3),'EXPLICIT_ARGUMENTS');return{step:step!,path:path!,pin:pin!,limit:Number(count??1)};}
export function chefLinkedCanonicalReader(factory:(range?:{fromHeight:number;throughHeight:number})=>CanonicalReader){const dense=chefPersistedCanonical(range=>factory(range));return{...dense,sample:(signal:AbortSignal)=>factory().sample(signal),freshHeader:(h:number,signal:AbortSignal)=>factory().header(h,signal)};}
export function validateChefLinkedPersistedBindings(s:ChefPersistedState,cursor:{processedThrough:number;tipHash:string}){const rows=new Map(s.headers.map(r=>[Number(r.height),r.block_hash]));need(rows.size===s.headers.length&&s.checkpoint&&rows.get(Number(s.checkpoint.scanned_height))===s.checkpoint.tip_hash&&rows.has(Number(s.checkpoint.finalized_height))&&rows.get(cursor.processedThrough)===cursor.tipHash,'PERSISTED_CURSOR_CHECKPOINT_BINDING');for(const [table,key]of [['deposits','block_height'],['reverse_payouts','block_height'],['source_refunds','height']] as const)for(const r of (s.financial as Record<string,any[]>)[table]??[]){if(r[key]===null&&r.block_hash===null)continue;need(Number.isSafeInteger(Number(r[key]))&&rows.get(Number(r[key]))===r.block_hash,'PERSISTED_FINANCIAL_BINDING');}}
/** Observation times remain historical; only Root's issuance verification must be recent. */
export function validateChefLinkedIssuanceEvidence(a:Pick<ChefLinkedApproval,'profileSha256'|'control'|'financialDigest'|'verifiedAt'>&{version?:1|2},nativeNotesDigest:string,inactive:any,capital:any){
 need(inactive.version===1&&inactive.status==='ROOT_NORMAL_CHEF_OBSERVER_STOPPED'&&inactive.normalObserverStopped===true&&inactive.profileSha256===a.profileSha256,'STOPPED_PROOF');
 need(capital.version===1&&capital.status==='ROOT_CHEF_LINKED_RECOVERY_CAPITAL_VERIFIED'&&capital.profileSha256===a.profileSha256&&stable(capital.control)===stable(a.control)&&capital.financialDigest===a.financialDigest&&capital.nativePhysicalZatoshi==='12490000'&&capital.nativeNotesDigest===nativeNotesDigest&&capital.latestOperatorNonce===1&&capital.pendingOperatorNonce===1&&capital.financialWorkersStopped===true&&stable(capital.base)===stable({gasWei:'498993659999835',inventory:'10100000',available:'10000000',reserved:'100000',liability:'100000'}),'CAPITAL_PROOF');
 for(const key of ['nativeObservedAt','baseObservedAt'])need(Number.isFinite(Date.parse(capital[key]))&&Date.parse(capital[key])<=Date.parse(capital.verifiedAt)+5000,'ARCHIVAL_CAPITAL_OBSERVATION_TIME');for(const key of ['nativeProofSha256','baseProofSha256'])need(typeof capital[key]==='string'&&/^[a-f0-9]{64}$/.test(capital[key])&&capital[key]!=='0'.repeat(64),'CAPITAL_PROOF_REFERENCES');
 for(const proof of [inactive,capital]){const age=Date.parse(a.verifiedAt)-Date.parse(proof.verifiedAt);need(Number.isFinite(age)&&age>=-5000&&age<=60000,'ISSUANCE_PROOF_TIME');}
 if(a.version===2)for(const key of ['nativeObservedAt','baseObservedAt']){const age=Date.parse(a.verifiedAt)-Date.parse(chefSourceTimestamp(capital[key]));need(age>=-5000&&age<=60000,'CURRENT_CAPITAL_OBSERVATION_TIME');}
}
/** V2 uses this immutable file only as an archive, never as current financial authority. */
export function validateChefLinkedContinuationAuthority(a:ChefLinkedApproval,value:unknown,now=Date.now()):ReconciledApproval{
 validateChefLinkedApprovalTime(a,now);const p=value as ReconciledApproval;need(p?.version===3,'CLOSED_HISTORY_V3_REQUIRED');
 const at=a.version===2?Date.parse(chefSourceTimestamp(p.verifiedAt)):now;
 if(a.version===2)need(at<=Date.parse(chefSourceTimestamp(a.verifiedAt)),'HISTORICAL_AUTHORITY_TIME');
 validateContinuationApproval(p,at);
 need(a.control.epoch===p.paused.epoch&&a.control.xmin===p.paused.xmin&&(a.version===2||Date.parse(a.expiresAt)<=Date.parse(p.expiresAt)),'CLOSED_HISTORY_V3_REQUIRED');
 return p;
}
/** Current Root audit is distinct from the authority's unchanged archival no-repair audit. */
export function validateChefLinkedFreshAudit(a:ChefLinkedApproval,value:unknown,rawSha256:string,p:ReconciledApproval):NoRepairAudit{
 need(a.version===2,'V2_CURRENT_AUDIT_REQUIRED');const audit=value as NoRepairAudit;
 need(audit?.version===1&&audit.status==='ROOT_CURRENT_PERSISTED_STATE_CANONICAL_NO_REPAIR_AUDITED'&&rawSha256===a.freshCanonicalAudit.sha256&&audit.publicCommit===a.publicCommit&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&a.publicCommit!=='0'.repeat(40),'CURRENT_AUDIT_BINDING');
 need(audit.profileSha256===a.profileSha256&&audit.financialSnapshotSha256===a.financialDigest&&stable(audit.control)===stable(a.control)&&stable(audit.sourceIdentity)===stable(p.sourceIdentity),'CURRENT_AUDIT_IDENTITY');
 const start=Date.parse(chefSourceTimestamp(audit.startedAt)),end=Date.parse(chefSourceTimestamp(audit.completedAt)),issued=Date.parse(chefSourceTimestamp(a.verifiedAt));
 need(end>=start&&end-start<=1200000&&issued>=end&&issued-end<=60000&&audit.sqlMutation===false&&audit.baseOriginalPrefixPreserved===true,'CURRENT_AUDIT_TIME_OR_SCOPE');
 for(const h of [audit.beforePersistentDigest,audit.afterPersistentDigest])need(typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&h!=='0'.repeat(64),'CURRENT_AUDIT_DIGEST');
 need(audit.canonical&&['allPersistedRows','allAddedBaseRows','checkpoints','finalized','cursor','financialAnchors','core'].every(k=>(audit.canonical as any)[k]===true),'CURRENT_AUDIT_CANONICAL');
 const core=audit.sourceCore;need(core?.fingerprint===p.sourceIdentity.chefFingerprint&&[core.before,core.after].every(v=>v?.project===a.identity.project&&v.generation===a.identity.generation&&Number.isSafeInteger(v.checkpoint?.height)&&v.checkpoint.height>=0&&/^[a-f0-9]{64}$/.test(v.checkpoint.hash))&&core.after.checkpoint.height>=core.before.checkpoint.height,'CURRENT_AUDIT_CORE');
 for(const key of ['native','base'] as const){const part=audit.protected?.[key];need(part&&Array.isArray(part.rows)&&part.rows.length>0&&part.rows.length<=20000&&continuationDigest(part.rows)===part.rowDigest,'CURRENT_AUDIT_ROWS');let prior=-1;for(const row of part.rows){need(Number.isSafeInteger(row.height)&&row.height>prior&&typeof row.blockHash==='string'&&/^[a-f0-9]{64}$/.test(row.blockHash),'CURRENT_AUDIT_ROW');prior=row.height;}}
 const protectedCursor=audit.protected.cursor;need(protectedCursor?.sha256===a.baseline.cursor.sha256&&protectedCursor.height===a.baseline.cursor.value.processedThrough&&protectedCursor.hash===a.baseline.cursor.value.tipHash,'CURRENT_AUDIT_CURSOR');
 need(audit.protected.checkpoints?.length===2&&new Set(audit.protected.checkpoints.map(v=>v.network)).size===2&&audit.protected.checkpoints.every(v=>['zcash-testnet','base-sepolia'].includes(v.network)&&Number.isSafeInteger(v.scannedHeight)&&Number.isSafeInteger(v.finalizedHeight)&&v.finalizedHeight>=0&&v.scannedHeight>=v.finalizedHeight&&typeof v.tipHash==='string'&&/^[a-f0-9]{64}$/.test(v.tipHash)&&Number.isFinite(Date.parse(v.observedAt))),'CURRENT_AUDIT_CHECKPOINTS');
 const native=audit.protected.checkpoints.find(v=>v.network==='zcash-testnet')!;need(native.scannedHeight===Number(a.baseline.checkpoint.scanned_height)&&native.finalizedHeight===Number(a.baseline.checkpoint.finalized_height)&&native.tipHash===a.baseline.checkpoint.tip_hash&&Date.parse(native.observedAt)===Date.parse(a.baseline.checkpoint.observed_at),'CURRENT_AUDIT_NATIVE_CHECKPOINT');
 return audit;
}
export async function requireChefLinkedFreshAuditState(client:Pick<pg.PoolClient,'query'>,audit:NoRepairAudit){
 const rows=(await client.query('SELECT network,height::text,block_hash FROM zee.chain_observations ORDER BY network,height LIMIT 40001')).rows;need(rows.length<=40000,'CURRENT_AUDIT_ROW_BOUND');
 const byHeight=new Map(rows.map(row=>[row.network+':'+row.height,row.block_hash]));need(byHeight.size===rows.length,'CURRENT_AUDIT_ROW_DUPLICATE');
 for(const [key,network] of [['native','zcash-testnet'],['base','base-sepolia']] as const)for(const old of audit.protected[key].rows)need(byHeight.get(network+':'+old.height)===old.blockHash,'CURRENT_AUDIT_PREFIX_CHANGED');
}
async function exists(p:string){try{await lstat(p);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
async function syncDir(p:string){const f=await open(p,'r');try{await f.sync();}finally{await f.close();}}
async function bytes(p:string,owner:number,max=30000000){const s=await lstat(p);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===owner&&(s.mode&0o777)===0o600&&s.size>0&&s.size<=max&&await realpath(p)===p,'PRIVATE_FILE');return readFile(p);}
async function pinned(r:Ref,owner=0,max=30000000){need(r&&r.path.startsWith(state+'/')&&!r.path.includes('/../')&&/^[a-f0-9]{64}$/.test(r.sha256),'PIN_REF');const b=await bytes(r.path,owner,max);need(sha(b)===r.sha256,'PIN_CHANGED');return b;}
async function freshFile(p:string,b:Buffer){const f=await open(p,'wx',0o600);try{await f.writeFile(b);await f.sync();}finally{await f.close();}await syncDir(p.slice(0,p.lastIndexOf('/')));}
async function atomic(p:string,b:Buffer,service=false,fence=async()=>{}){const t=p+'.'+randomUUID()+'.tmp',f=await open(t,'wx',0o600);try{await f.writeFile(b);if(service)await f.chown(986,978);await f.sync();}finally{await f.close();}await fence();await rename(t,p);await syncDir(p.slice(0,p.lastIndexOf('/')));}
const json=(v:unknown)=>Buffer.from(JSON.stringify(v)+'\n');

export async function runChefLinkedRecovery(options:ReturnType<typeof parseChefLinkedArgs>){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.env.HOME===root+'/home'&&process.execPath==='/usr/bin/node'&&process.versions.node.split('.')[0]==='24','ROOT_NATIVE_ONLY');
 const approvalRaw=await bytes(options.path,0,262144);need(sha(approvalRaw)===options.pin,'APPROVAL_RAW_SHA');const a=JSON.parse(approvalRaw.toString()) as ChefLinkedApproval;
 const loaded=await loadLinuxChefRuntime(root+'/secrets/chef-runtime.private.json'),{c,env,policy,openingCapital,runtime,profile,profileSha256}=loaded;
 const continuationRaw=await readRootContinuationAuthority(a.continuationAuthority.path);need(sha(continuationRaw)===a.continuationAuthority.sha256,'CONTINUATION_RAW_SHA');const continuation=validateChefLinkedContinuationAuthority(a,JSON.parse(continuationRaw.toString()));
 const handoffPath=root+'/secrets/relocation-applied-proof.private.json',handoffStat=await lstat(handoffPath);need(handoffStat.isFile()&&!handoffStat.isSymbolicLink()&&[0,986].includes(handoffStat.uid)&&(handoffStat.mode&0o027)===0&&await realpath(handoffPath)===handoffPath,'HANDOFF_FILE');const handoffRaw=await readFile(handoffPath),handoff=JSON.parse(handoffRaw.toString());need(sha(handoffRaw)===a.handoffSha256&&handoff.profileSha256===profileSha256,'HANDOFF_BINDING');
 const auditPath=state+'/continuation-preflight/epoch10-full-canonical-audit-r2.private.json';
 const audit=await readRootNoRepairAudit(auditPath,continuation);
 const freshAudit=a.version===2?validateChefLinkedFreshAudit(a,JSON.parse((await pinned(a.freshCanonicalAudit,0,8388608)).toString()),a.freshCanonicalAudit.sha256,continuation):undefined;
 const pool=connect(runtime.workerUrl,2),lease=await pool.connect();let lost=false;lease.on('error',()=>{lost=true;});
 const directory=chefLinkedCampaignDirectory(state,options.pin),journalPath=directory+'/coverage.private.json',intentPath=directory+'/publication-intent.private.json',completionPath=directory+'/completed.private.json',markerRaw=Buffer.from('chef-linked:'+options.pin+'\n');
 const canonical=(range?:{fromHeight:number;throughHeight:number})=>localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,range);
 async function fence(){validateChefLinkedApprovalTime(a);need(!lost,'LEASE_LOST');await lease.query('SELECT 1');validateChefLinkedApprovalTime(a);need(!lost,'LEASE_LOST');}
 async function sql(client:Pick<pg.PoolClient,'query'>):Promise<SqlState>{const scope=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];need(scope?.database==='zee_app_20261023'&&scope.role==='zee_app_worker_20261023','CONNECTED_WORKER_SCOPE');const control=(await client.query('SELECT epoch::text,xmin::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];const cp=(await client.query("SELECT scanned_height::text,finalized_height::text,tip_hash,finalized_time,observed_at,xmin::text FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];need(cp,'CHECKPOINT_REQUIRED');return{control,checkpoint:{...cp,finalized_time:new Date(cp.finalized_time).toISOString(),observed_at:new Date(cp.observed_at).toISOString()}};}
 async function source(){const signal=AbortSignal.timeout(15000),r=await fetch(new URL('/status',safeEndpoint(c.sourceUrl)),{headers:{authorization:'Bearer '+env.CHEF_API_TOKEN},signal,redirect:'error'});need(r.ok,'SOURCE_HTTP');const s=parseChefStatus(await readJson(r,signal),c.project,Date.now());need(s.generation===a.identity.generation,'GENERATION_CHANGED');return s;}
 async function staticEvidence(){
  need(sha(await bytes(options.path,0,262144))===options.pin,'APPROVAL_CHANGED');const raw=await readRootContinuationAuthority(a.continuationAuthority.path);need(sha(raw)===a.continuationAuthority.sha256,'CONTINUATION_CHANGED');validateChefLinkedContinuationAuthority(a,JSON.parse(raw.toString()));
  if(a.version===2)validateChefLinkedFreshAudit(a,JSON.parse((await pinned(a.freshCanonicalAudit,0,8388608)).toString()),a.freshCanonicalAudit.sha256,continuation);
  const inactive=JSON.parse((await pinned(a.observerInactiveProof,0,262144)).toString()),capital=JSON.parse((await pinned(a.capitalProof,0,262144)).toString());
  validateChefLinkedIssuanceEvidence(a,continuation.nativeNotesDigest,inactive,capital);
  const procs=await readdir('/proc');need(procs.length<=10000,'PROCESS_BOUND');for(const pid of procs)if(/^[0-9]+$/.test(pid)){let command='';try{command=await readFile('/proc/'+pid+'/cmdline','utf8');}catch{continue;}need(!/(?:observe-linux-chef|dispatch-linux-testnet|reverse-linux-testnet|refund-linux-testnet)\.ts/.test(command),'APP_WRITER_RUNNING');}
  need(sha(await bytes(a.legacyJournal.path,986))===a.legacyJournal.sha256,'LEGACY_JOURNAL_CHANGED');
 }
 async function guard(client:Pick<pg.PoolClient,'query'>=lease,allowAfter?:SqlState){await fence();await staticEvidence();const current=await sql(client),snapshot=await readContinuationSnapshot(client);validateContinuationSnapshot(snapshot,continuation);need(continuationDigest(snapshot)===a.financialDigest,'FINANCIAL_HISTORY_CHANGED');await requireProtectedNoRepairState(client,continuation,audit);if(freshAudit)await requireChefLinkedFreshAuditState(client,freshAudit);need((await client.query('SELECT count(*)::text n FROM zee.root_native_circle_authorizations')).rows[0]?.n==='0','ADMISSION_AUTH_ALREADY_MINTED');
  const expected=allowAfter??{control:a.control,checkpoint:a.baseline.checkpoint};need(stable(current)===stable(expected),'BASELINE_OR_CONTROL_CHANGED');if(!allowAfter)need(sha(await bytes(a.baseline.cursor.path,986))===a.baseline.cursor.sha256,'CURSOR_BASELINE_CHANGED');
  validateChefLinkedApproval(a,{stateRoot:state,profileSha256,handoffSha256:sha(handoffRaw),openingProofSha256:profile.immutable.openingProof.sha256,financialDigest:continuation.postRefundSnapshotSha256,control:a.control,baseline:a.baseline,legacyJournal:a.legacyJournal,identity:{project:c.project,generation:continuation.sourceIdentity.chefGeneration,policy}});
  await fence();return current;
 }
 async function canonicalPersisted(){const before=await readChefPersistedState(lease),active=JSON.parse((await bytes(a.baseline.cursor.path,986)).toString());validateChefLinkedPersistedBindings(before,active);const headers=chefPersistedCanonical(range=>canonical(range)),signal=AbortSignal.timeout(90000),rows=before.headers;await headers.prefetchPersisted(rows.map(r=>Number(r.height)),signal);for(const r of rows){const h=await headers.header(Number(r.height),signal);need(h.hash===r.block_hash,'PERSISTED_CANONICAL_CONFLICT');}need(stable(await readChefPersistedState(lease))===stable(before),'PERSISTED_STATE_CHANGED_DURING_VERIFY');}
 try{return await withChefRecoveryJournal(recovery,async io=>{
  const legacy=await io.read();need(legacy,'LEGACY_JOURNAL_REQUIRED');const old=await canonical().header(legacy.target.height,AbortSignal.timeout(15000));validateChefRecoveryJournal(legacy,a.identity,old);need(nextChefRecoveryRange(legacy)===null,'LEGACY_COMPLETE_REQUIRED');
  await staticEvidence();await canonicalPersisted();
  if(!await exists(directory)){need(options.step==='recover','NEW_CAMPAIGN_RECOVER_ONLY');await guard();need(sha(await bytes(a.baseline.cursor.path,986))===a.baseline.cursor.sha256,'CURSOR_BASELINE_RAW');await mkdir(directory,{mode:0o700});await syncDir(recovery);await freshFile(directory+'/original-cursor.bin',await bytes(a.baseline.cursor.path,986));}
  const ds=await lstat(directory);need(ds.isDirectory()&&!ds.isSymbolicLink()&&ds.uid===0&&(ds.mode&0o777)===0o700&&await realpath(directory)===directory,'CAMPAIGN_DIRECTORY');
  if(await exists(completionPath)&&!await exists(marker))throw Error('CHEF_LINKED_ALREADY_COMPLETED_NO_REPLAY');
  if(await exists(marker))need((await bytes(marker,0,4096)).equals(markerRaw),'OTHER_CAMPAIGN_MARKER');else await freshFile(marker,markerRaw);
  const original=await bytes(directory+'/original-cursor.bin',0);need(sha(original)===a.baseline.cursor.sha256&&stable(JSON.parse(original.toString()))===stable(a.baseline.cursor.value),'ORIGINAL_CURSOR_CHANGED');
  let j:ChefLinkedJournal;
  if(await exists(journalPath))j=JSON.parse((await bytes(journalPath,0)).toString());else{need(options.step==='recover'&&!await exists(intentPath),'NEW_JOURNAL_RECOVER_ONLY');await guard();const s=await source(),target=await canonical().header(s.checkpoint.height,AbortSignal.timeout(15000));need(target.hash===s.checkpoint.hash,'CANONICAL_CHECKPOINT_MISMATCH');j=initialChefLinkedRecovery(a,options.pin,target);await freshFile(journalPath,json(j));}
  async function finish(intent:Intent){
   need(intent.version===1&&intent.approvalSha256===options.pin&&intent.journalDigest===digest(j)&&stable(intent.before)===stable({control:a.control,checkpoint:a.baseline.checkpoint})&&/^[1-9][0-9]*$/.test(intent.transactionId)&&intent.expectedXmin===(BigInt(intent.transactionId)%4294967296n).toString(),'INTENT_BINDING');
   const snapshot=intent.candidateSnapshot;/* Original observedAt remains in intent/SQL; this validates archived shape only. */validateSnapshot({...snapshot,observedAt:new Date().toISOString()});need(snapshot.outputs.length===0&&digest(snapshot)===intent.candidateSnapshotDigest&&snapshot.scannedHeight===j.target.height&&snapshot.tipHash===j.target.hash,'INTENT_SNAPSHOT_BINDING');
   const expectedCursor={version:1,identityDigest:a.baseline.cursor.value.identityDigest,processedThrough:j.target.height,tipHash:j.target.hash,snapshotDigest:digest(snapshot)},candidate=json(intent.candidateCursor);need(stable(intent.candidateCursor)===stable(expectedCursor)&&sha(candidate)===intent.candidateCursorSha256&&stable(intent.after.control)===stable(a.control)&&intent.after.checkpoint.xmin===intent.expectedXmin&&intent.after.checkpoint.scanned_height===String(j.target.height)&&intent.after.checkpoint.tip_hash===j.target.hash&&intent.after.checkpoint.finalized_height===String(j.target.height-9)&&intent.after.checkpoint.observed_at===snapshot.observedAt,'CANDIDATE_BINDING');
   await lease.query('BEGIN');try{await lease.query('SELECT zee.lock_observer_cycle()');const current=await sql(lease);const status=(await lease.query('SELECT pg_xact_status($1::xid8) AS status',[intent.transactionId])).rows[0]?.status;need(classifyChefLinkedCommit(status,current,intent.before,intent.after)==='COMMITTED_EXACT','COMMIT_NOT_EXACT_NO_REPLAY');await guard(lease,intent.after);await fence();
    let active:Buffer;const receipt={version:1,status:'CHEF_LINKED_COMMITTED_EXACT',approvalSha256:options.pin,intentDigest:digest(intent),checkpoint:intent.after.checkpoint,cursorSha256:intent.candidateCursorSha256,financialAction:false};
    await finishChefLinkedFileBoundary(status,current,intent.before,intent.after,{leaseGuard:fence,
     async readCursor(){active=await bytes(a.baseline.cursor.path,986);need([a.baseline.cursor.sha256,intent.candidateCursorSha256].includes(sha(active)),'CURSOR_INTERVENTION');},
     async installCursor(){if(sha(active)!==intent.candidateCursorSha256)await atomic(a.baseline.cursor.path,candidate,true,fence);need(sha(await bytes(a.baseline.cursor.path,986))===intent.candidateCursorSha256,'CURSOR_INSTALL');},
     async writeCompletion(){if(await exists(completionPath))need(stable(JSON.parse((await bytes(completionPath,0)).toString()))===stable(receipt),'COMPLETION_CHANGED');else await freshFile(completionPath,json(receipt));need((await bytes(marker,0,4096)).equals(markerRaw),'MARKER_CHANGED');},
     async removeMarker(){await unlink(marker);await syncDir(recovery);},
    });await lease.query('COMMIT');return receipt;
   }catch(e){await lease.query('ROLLBACK').catch(()=>{});throw e;}
  }
  if(await exists(intentPath)){need(options.step==='reconcile','PENDING_INTENT_RECONCILE_ONLY');return finish(JSON.parse((await bytes(intentPath,0)).toString()));}
  need(options.step!=='reconcile','NO_INTENT');await guard();need(sha(await bytes(a.baseline.cursor.path,986))===a.baseline.cursor.sha256,'CURSOR_CHANGED');
  let checked=await canonical().header(j.target.height,AbortSignal.timeout(15000));validateChefLinkedRecovery(j,a,options.pin,checked);
  if(options.step==='recover'){
   for(let n=0;n<options.limit;n++){await guard();const s=await source(),target=await canonical().header(s.checkpoint.height,AbortSignal.timeout(15000));need(target.hash===s.checkpoint.hash,'CANONICAL_CHECKPOINT_MISMATCH');if(!nextChefLinkedRecoveryRange(j)&&target.height>j.target.height){j=extendChefLinkedRecoveryTarget(j,a,options.pin,checked,target);checked=target;await atomic(journalPath,json(j));}const range=nextChefLinkedRecoveryRange(j);if(!range)break;
    const bridge=new ChefWalletBridge(localChefDecoder(c.pythonPath,[c.receiptScript,'--config',c.decoderConfigPath]),openingCapital),result=await new ChefAdapter({url:c.sourceUrl,token:env.CHEF_API_TOKEN!,project:c.project,policy,canonical:canonical(range),classify:bridge.classify}).traverse(range.fromHeight,range.throughHeight);need(result.status==='READY_SHADOW','SOURCE_NOT_READY');const historical=result.historicalWitness?{witness:result.historicalWitness,project:c.project}:undefined;const full=bridge.snapshot(result.batch,policy,Date.now(),historical);await guard();checked=await canonical().header(j.target.height,AbortSignal.timeout(15000));j=appendChefLinkedRecoveryProof(j,a,options.pin,checked,result.batch,full,Date.now(),result.historicalWitness);await atomic(journalPath,json(j));console.log(JSON.stringify({status:'CHEF_LINKED_PRIVATE_CHUNK',proofs:j.proofs.length,through:result.batch.coverage.through.height,sqlMutation:false}));
   }return{status:'CHEF_LINKED_PRIVATE_RECOVERY_STOPPED',proofs:j.proofs.length,complete:nextChefLinkedRecoveryRange(j)===null,financialAction:false};
  }
  await canonicalPersisted();const snapshot=await chefLinkedRecoverySnapshot(j,a,options.pin,chefLinkedCanonicalReader(canonical),await chefFinancialCheckHeights(pool),async()=>{const s=await source();return{generation:s.generation,checkpoint:{height:s.checkpoint.height,hash:s.checkpoint.hash}};},AbortSignal.timeout(30000));
  need(snapshot.outputs.length===0,'UNEXPECTED_OUTPUTS');await guard();const final=snapshot.blocks.find(b=>b.height===snapshot.scannedHeight-9);need(final,'FINALIZED_HEADER');
  let intent:Intent|undefined;
  try{await publishObserverBatch(pool,'root-chef-linked-suffix',[{network:'zcash-testnet',height:snapshot.scannedHeight,hash:snapshot.tipHash,finalizedHeight:final.height,finalizedTime:new Date(final.time),observedAt:new Date(snapshot.observedAt)}],snapshot.blocks.map(b=>({network:'zcash-testnet',...b,time:new Date(b.time)})),undefined,async client=>{
   const before=await guard(client);validateSnapshot(snapshot);const xid=String((await client.query('SELECT pg_current_xact_id()::text AS id')).rows[0].id);need(/^[1-9][0-9]*$/.test(xid),'XID_REQUIRED');const expectedXmin=(BigInt(xid)%4294967296n).toString(),candidateCursor={version:1,identityDigest:a.baseline.cursor.value.identityDigest,processedThrough:snapshot.scannedHeight,tipHash:snapshot.tipHash,snapshotDigest:digest(snapshot)};
   intent={version:1,approvalSha256:options.pin,journalDigest:digest(j),transactionId:xid,expectedXmin,before,after:{control:a.control,checkpoint:{scanned_height:String(snapshot.scannedHeight),finalized_height:String(final.height),tip_hash:snapshot.tipHash,finalized_time:new Date(final.time).toISOString(),observed_at:new Date(snapshot.observedAt).toISOString(),xmin:expectedXmin}},candidateCursor,candidateCursorSha256:sha(json(candidateCursor)),candidateSnapshotDigest:digest(snapshot),candidateSnapshot:snapshot};await freshFile(intentPath,json(intent));await fence();
  });}catch(error){if(!intent)throw error;/* Durable intent is reconciled once; SQL is never replayed. */}
  need(intent,'DURABLE_INTENT_REQUIRED');return finish(intent);
 });}finally{lease.release(lost?Error('LEASE_LOST'):undefined);await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await runChefLinkedRecovery(parseChefLinkedArgs(process.argv.slice(2)))));}catch(e){const code=(e as {code?:unknown}).code,message=e instanceof Error?e.message:'';console.error(JSON.stringify({status:'CHEF_LINKED_BLOCKED_NO_REPLAY',code:typeof code==='string'&&/^[A-Z0-9_]+$/.test(code)?code:/^[A-Z0-9_]+$/.test(message)?message:'CHEF_LINKED_FAILED',financialAction:false}));process.exitCode=1;}}
