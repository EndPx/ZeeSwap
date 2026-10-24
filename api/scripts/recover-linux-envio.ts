/** Root-only prefunding recovery; explicit commands, no reset/seed or financial adapter. */
import {readFile,open,mkdir,rename,rmdir,lstat,realpath,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import type pg from 'pg';
import {loadLinuxEnvioProfile,readLinuxEnvioPin} from '../src/linux-envio-profile.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {publishObserverBatch,type CanonicalBlock} from '../src/observer-frontiers.ts';
import {canonicalRpc} from '../src/integrations/observation/canonical-rpc.ts';
import {readJson} from '../src/integrations/observation/chef.ts';
import {fetchSelectedEnvioRange,SELECTED_CANONICAL_BATCHES} from '../src/integrations/observation/envio-selected-export.ts';
import {requiredEnvioAnchors} from '../src/integrations/observation/envio-required-anchors.ts';
import {envioRecoveryTransport,requireEnvioRecoveryPrefunding,initialEnvioRecovery,validateEnvioRecovery,nextEnvioRecoveryRange,appendEnvioRecovery,recheckEnvioRecovery,completeEnvioRecovery,recoverySqlOutcome,type RecoverySql,type EnvioRecoveryJournal} from '../src/integrations/observation/envio-recovery.ts';
import type {EnvioAdmissionState} from '../src/integrations/observation/envio-live.ts';
import {requireThat,stable,digest} from '../src/integrations/observation/types.ts';
const root='/opt/zeeswap-testnet',path=root+'/secrets/linux-envio-profile.private.json';
const args=process.argv.slice(2),step=args[0],limit=Number(args[1]);
requireThat(process.platform==='linux'&&process.getuid?.()===0&&(['recover','publish','reconcile'].includes(step??''))&&(step==='recover'?args.length===2&&Number.isInteger(limit)&&limit>=1&&limit<=20:args.length===1),'ENVIO_RECOVERY_ROOT_EXPLICIT_COMMAND');
const {profile:p,runtime,source,token}=await loadLinuxEnvioProfile(path),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
const recoveryTransport=envioRecoveryTransport(source.policy,process.env.ZEESWAP_RECOVERY_RPC_PACING),recoveryPolicy=recoveryTransport.policy;
console.log(JSON.stringify({status:'ENVIO_RECOVERY_RPC_PRESET',sourceId:recoveryTransport.sourceId,methodsPerSecond:recoveryTransport.maxMethodsPerSecond,headerBatchSize:10,maxOverlappingHeaderBatches:SELECTED_CANONICAL_BATCHES,financialAction:false}));
const identity={profileSha256:p.operatorProfile.sha256,handoffSha256:p.relocationProof.sha256,generation:source.generation,policy:recoveryPolicy};
const handoffStat=await lstat(p.relocationProof.path),handoff=JSON.parse((await readLinuxEnvioPin(p.relocationProof)).toString());
requireThat(handoffStat.uid===0&&handoff.status==='PREFUNDING_RELOCATION_VERIFIED'&&handoff.profileSha256===p.operatorProfile.sha256,'ENVIO_RECOVERY_ROOT_HANDOFF_REQUIRED');
const receipt=JSON.parse(await readFile(p.bootstrapReceiptPath,'utf8'));
requireThat(receipt.purpose==='explicit-empty-prefunding-linux-consumer'&&receipt.handoffSha256===p.relocationProof.sha256&&receipt.producerGeneration===source.generation&&receipt.projectionDigest===source.policy.projectionDigest,'ENVIO_RECOVERY_BOOTSTRAP_BINDING');
const context='envio-funding-hints:br-broad-pine-ao79wemx:zee_app_20261023:v1',directory=root+'/state/envio/prefunding-recovery';
await mkdir(directory,{recursive:true,mode:0o700});
const stat=await lstat(directory);requireThat(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===0&&(stat.mode&0o077)===0&&await realpath(directory)===directory,'ENVIO_RECOVERY_PRIVATE_DIRECTORY');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function durable(file:string,bytes:Buffer,owner?:{uid:number;gid:number}){
 const tmp=file+'.'+randomUUID()+'.tmp',fd=await open(tmp,'wx',0o600);
 try{await fd.writeFile(bytes);if(owner)await fd.chown(owner.uid,owner.gid);await fd.sync();}finally{await fd.close();}
 await rename(tmp,file);const dir=await open(file.slice(0,file.lastIndexOf('/')),'r');try{await dir.sync();}finally{await dir.close();}
}
async function json<T>(file:string):Promise<T|null>{try{const s=await lstat(file);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0,'ENVIO_RECOVERY_PRIVATE_FILE');return JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
async function save(file:string,value:unknown){await durable(file,Buffer.from(JSON.stringify(value)+'\n'));}
const journalPath=directory+'/coverage.private.json',intentPath=directory+'/publication-intent.private.json';
const marker=root+'/state/envio/recovery-in-progress';
async function finish(intent:Intent){
 await save(directory+'/completed.private.json',{version:1,status:'ENVIO_PREFUNDING_RECOVERY_COMMITTED',intentSha256:digest(intent),financialAction:false});
 await unlink(marker);const fd=await open(root+'/state/envio','r');try{await fd.sync();}finally{await fd.close();}
}
const pool=connect(runtime.workerUrl,2),lease=await pool.connect();let locked=false,fileLocked=false;
let leaseLost=false;lease.on('error',()=>{leaseLost=true;});
async function requireLease(){requireThat(!leaseLost,'ENVIO_RECOVERY_LEASE_LOST');await lease.query('SELECT 1');requireThat(!leaseLost,'ENVIO_RECOVERY_LEASE_LOST');}
async function paused(c:pg.Pool|pg.PoolClient){
 const row=(await c.query('SELECT current_database() db,current_user role,accepting_orders,dispatch_enabled,reconciliation_required,epoch::text FROM zee.runtime_control WHERE singleton')).rows[0];
 const counts=(await c.query(`SELECT (SELECT count(*) FROM zee.quotes)::text quotes,(SELECT count(*) FROM zee.orders)::text orders,(SELECT count(*) FROM zee.deposits)::text deposits,(SELECT count(*) FROM zee.obligations)::text obligations,(SELECT count(*) FROM zee.operations)::text operations,(SELECT count(*) FROM zee.outbox_jobs WHERE status='LEASED' AND lease_until>clock_timestamp())::text leases`)).rows[0];
 requireEnvioRecoveryPrefunding(row,counts);await requireLease();
}
async function sql(c:pg.Pool|pg.PoolClient):Promise<RecoverySql>{const r=(await c.query("SELECT scanned_height::text,tip_hash,finalized_height::text,finalized_time,observed_at FROM zee.scanner_checkpoints WHERE network='base-sepolia'")).rows[0];requireThat(r,'ENVIO_RECOVERY_EXISTING_SQL_REQUIRED');return{height:Number(r.scanned_height),hash:r.tip_hash,finalizedHeight:Number(r.finalized_height),finalizedTime:new Date(r.finalized_time).toISOString(),observedAt:new Date(r.observed_at).toISOString()};}
async function admission(){const s=await lstat(p.admissionPath);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===986&&s.gid===978&&(s.mode&0o077)===0&&await realpath(p.admissionPath)===p.admissionPath,'ENVIO_RECOVERY_ADMISSION_OWNER');return readFile(p.admissionPath);}
type Intent={version:1;journalDigest:string;originalAdmissionSha256:string;candidateAdmissionSha256:string;candidateAdmissionBase64:string;originalSql:RecoverySql;candidateSql:RecoverySql};
try{
 locked=(await lease.query('SELECT pg_try_advisory_lock(84532,20261024) locked')).rows[0]?.locked===true;requireThat(locked,'ENVIO_RECOVERY_CONSUMER_RUNNING');
 await mkdir(directory+'/writer.lock',{mode:0o700});fileLocked=true;await paused(lease);
 let journal=await json<EnvioRecoveryJournal>(journalPath),intent=await json<Intent>(intentPath);
 // Root-owned marker intentionally exposes no private payload. Normal consumer
 // checks its presence only, under the same advisory lock.
 try{const fd=await open(marker,'wx',0o600);try{await fd.writeFile('prefunding-recovery\n');await fd.sync();}finally{await fd.close();}}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const s=await lstat(marker);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0,'ENVIO_RECOVERY_MARKER_CHANGED');}
 const markerDirectory=await open(root+'/state/envio','r');try{await markerDirectory.sync();}finally{await markerDirectory.close();}
 const bytes=await admission();
 if(!journal){requireThat(step==='recover'&&!intent,'ENVIO_RECOVERY_INITIALIZE_EXPLICIT');journal=initialEnvioRecovery(identity,keys.open(bytes,context) as EnvioAdmissionState,sha(bytes),await sql(lease));
  const fd=await open(directory+'/original-admission.bin','wx',0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}await save(journalPath,journal);
 }
 validateEnvioRecovery(journal,identity);
 requireThat(sha(await readFile(directory+'/original-admission.bin'))===journal.originalAdmissionSha256,'ENVIO_RECOVERY_ARCHIVE_CHANGED');
 const {policy:_,...canonicalTransport}=recoveryTransport,canonical=canonicalRpc(canonicalTransport);
 async function requiredAnchors(){
  const anchors=await requiredEnvioAnchors(pool,journal!.originalAdmission.hints),blocks:CanonicalBlock[]=[],signal=AbortSignal.timeout(30000);
  for(let n=0;n<anchors.length;n+=10){const page=anchors.slice(n,n+10),headers=await canonical.headers!(page.map(a=>Number(a.height)),signal);requireThat(headers.length===page.length,'ENVIO_RECOVERY_REQUIRED_ANCHOR');for(let i=0;i<page.length;i++){const a=page[i]!,h=headers[i]!;requireThat(h.height===Number(a.height)&&(a.expected_hash===null||a.expected_hash===h.hash.slice(2)),'ENVIO_RECOVERY_REQUIRED_ANCHOR');if(a.persist)blocks.push({network:'base-sepolia',height:h.height,hash:h.hash.slice(2),time:new Date(h.time)});}}
  return blocks;
 }
 await requiredAnchors();
 if(intent){
  requireThat(step==='reconcile'&&intent.version===1&&intent.journalDigest===digest(journal)&&intent.originalAdmissionSha256===journal.originalAdmissionSha256&&stable(intent.originalSql)===stable(journal.originalSql),'ENVIO_RECOVERY_PENDING_INTENT_RECONCILE_ONLY');
  const candidate=Buffer.from(intent.candidateAdmissionBase64,'base64');requireThat(sha(candidate)===intent.candidateAdmissionSha256,'ENVIO_RECOVERY_INTENT_CHANGED');
  const expected=completeEnvioRecovery(journal,Math.max(Date.parse(journal.proofs.at(-1)!.selection.range.readCompletedAt),Date.parse(journal.proofs.at(-1)!.selection.verification.checkedAt)));requireThat(stable(expected.sql)===stable(intent.candidateSql)&&stable(keys.open(candidate,context))===stable(expected.admission),'ENVIO_RECOVERY_INTENT_CHANGED');
  // No SQL write or freshness claim here. Unknown COMMIT is reconciled by exact
  // complete checkpoint identity, including original observation timestamp.
  requireThat(recoverySqlOutcome(await sql(lease),intent.originalSql,intent.candidateSql)==='COMMITTED','ENVIO_RECOVERY_SQL_NOT_COMMITTED_ROOT_REVIEW');
  requireThat([intent.originalAdmissionSha256,intent.candidateAdmissionSha256].includes(sha(bytes)),'ENVIO_RECOVERY_ADMISSION_INTERVENTION');
  await recheckEnvioRecovery(journal,canonical);await paused(lease);if(sha(bytes)!==intent.candidateAdmissionSha256)await durable(p.admissionPath,candidate,{uid:986,gid:978});
  await finish(intent);
 }else{
  requireThat(sha(bytes)===journal.originalAdmissionSha256&&stable(await sql(lease))===stable(journal.originalSql),'ENVIO_RECOVERY_BASELINE_INTERVENTION');
  await recheckEnvioRecovery(journal,canonical);
  if(step==='recover'){
   for(let n=0;n<limit;n++){
    await paused(lease);requireThat(stable(await sql(lease))===stable(journal.originalSql)&&sha(await admission())===journal.originalAdmissionSha256,'ENVIO_RECOVERY_BASELINE_INTERVENTION');
    const signal=AbortSignal.timeout(10000),response=await fetch(p.sourceUrl+'/zee-observation/status',{headers:{authorization:`Bearer ${token}`},redirect:'error',signal});requireThat(response.ok,'WAIT_ENVIO_EXPORT');
    const status=await readJson(response,signal) as {protocol:string;checkpoint:{generation:string;through:{height:number}}};requireThat(status.protocol==='zee-envio-status-v1'&&status.checkpoint.generation===source.generation,'ENVIO_RECOVERY_GENERATION');
    const range=nextEnvioRecoveryRange(journal,status.checkpoint.through.height),prior=journal.proofs.at(-1)?.selection.range.through.height;
    if(prior===status.checkpoint.through.height)break;
    const selection=await fetchSelectedEnvioRange(p.sourceUrl,token,range.from,'latest',recoveryPolicy,canonical);
    await paused(lease);journal=appendEnvioRecovery(journal,selection);await save(journalPath,journal);
    console.log(JSON.stringify({status:'ENVIO_RECOVERY_PRIVATE_CHUNK',through:selection.range.through.height,chunks:journal.proofs.length,sqlMutation:false,financialAction:false}));
   }
  }else{
   requireThat(step==='publish','ENVIO_RECOVERY_NO_INTENT');const blocks=await requiredAnchors(),complete=completeEnvioRecovery(journal);
   // Save exactly one encrypted candidate before SQL. Never reseal on retry.
   const candidate=keys.seal(complete.admission,context);intent={version:1,journalDigest:digest(journal),originalAdmissionSha256:journal.originalAdmissionSha256,candidateAdmissionSha256:sha(candidate),candidateAdmissionBase64:candidate.toString('base64'),originalSql:journal.originalSql,candidateSql:complete.sql};await save(intentPath,intent);
   const sessionPool={connect:async()=>new Proxy(lease,{get(target,key){if(key==='release')return()=>{};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})} as unknown as pg.Pool;
   await publishObserverBatch(sessionPool,'envio-prefunding-complete-gap',[{network:'base-sepolia',height:complete.sql.height,hash:complete.sql.hash,finalizedHeight:complete.sql.finalizedHeight,finalizedTime:new Date(complete.sql.finalizedTime),observedAt:new Date(complete.sql.observedAt)}],[...blocks,{network:'base-sepolia',height:complete.finalized.height,hash:complete.finalized.hash.slice(2),time:new Date(complete.finalized.time)}],undefined,async c=>{
    await paused(c);completeEnvioRecovery(journal!);requireThat(stable(await sql(c))===stable(journal!.originalSql)&&sha(await admission())===journal!.originalAdmissionSha256,'ENVIO_RECOVERY_BASELINE_INTERVENTION');
   });
   requireThat(recoverySqlOutcome(await sql(lease),journal.originalSql,complete.sql)==='COMMITTED','ENVIO_RECOVERY_SQL_RESULT');
   await paused(lease);requireThat(sha(await admission())===journal.originalAdmissionSha256,'ENVIO_RECOVERY_ADMISSION_INTERVENTION');await durable(p.admissionPath,candidate,{uid:986,gid:978});await finish(intent);
  }
 }
 console.log(JSON.stringify({status:'ENVIO_RECOVERY_COMMAND_COMPLETE',step,financialAction:false}));
}finally{if(fileLocked)await rmdir(directory+'/writer.lock');if(locked)await lease.query('SELECT pg_advisory_unlock(84532,20261024)').catch(()=>{});lease.release();await pool.end();}
