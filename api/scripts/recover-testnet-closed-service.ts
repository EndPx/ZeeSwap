/** Root closed-state qualification and two-phase control recovery. No signer or wallet calls. */
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {connect} from '../src/db.ts';
import {loadLinuxForward} from '../src/linux-forward-dispatch.ts';
import {workerExecutionPins} from '../src/testnet-policy-execution.ts';
import {requireNoSourceRecoveryMarker} from './check-testnet-policy-idle-restart.ts';
import {stable} from '../src/integrations/observation/types.ts';
import {registerLocalMainAdminTransport} from '../src/main-database-relocation.ts';
import {validateAdminTarget} from '../src/linux-control.ts';
import {PrivateData} from '../src/private-data.ts';
import {verifyDynamicClosedJournalTrees} from '../src/testnet-closed-journals.ts';
import {requireApiRootMetadataPermissions} from '../src/api-root-metadata.ts';
const ROOT='/opt/zeeswap-testnet',run=promisify(execFile),sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
type Pin={path:string;sha256:string};
type Tree={path:string;files:{relativePath:string;sha256:string}[]};
export type ClosedAuthority={version:1;purpose:'ROOT_CLOSED_SERVICE_RECOVERY';policy:Pin;workerConfig:Pin;executionManifest:Pin;executionApproval:Pin;sourceIdentityDigest:string;journalTrees:Tree[];recoveryCodePins:Pin[];adminProfile:Pin;databaseTransport:{proof:Pin;ca:Pin;baseline:Pin;classification:Pin}};
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CLOSED_RECOVERY_'+c);}
const transportPaths={proof:ROOT+'/state/database-relocation/main-primary.private.json',ca:ROOT+'/secrets/app-postgres-ca.pem',baseline:ROOT+'/state/database-relocation/main-restored-baseline.private.json',classification:ROOT+'/state/database-relocation/main-origin-classifications.private.json'};
export function requireClosedTransportMetadataPermissions(field:keyof typeof transportPaths,path:string,stat:{uid:number;gid:number;mode:number}){
 need(Object.hasOwn(transportPaths,field)&&path===transportPaths[field],'TRANSPORT_METADATA_PATH');
 requireApiRootMetadataPermissions(stat);
}
async function pin(p:Pin,secret=false){
 need(p&&p.path.startsWith(ROOT+'/')&&resolve(p.path)===p.path&&/^[a-f0-9]{64}$/.test(p.sha256),'PIN');
 for(let d=dirname(p.path);d.startsWith(ROOT);d=dirname(d)){const s=await lstat(d);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0&&await realpath(d)===d,'DIRECTORY');}
 const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&(secret?0o077:0o022))===0&&s.size<=16000000&&await realpath(p.path)===p.path,'FILE');
 const b=await readFile(p.path);need(sha(b)===p.sha256,'PIN_CHANGED');return b;
}
/** Review pins include historical finalized journals; every unexpected entry refuses. */
export async function verifyClosedJournalTrees(trees:Tree[]){
 need(Array.isArray(trees)&&trees.length>=1&&trees.length<=12,'JOURNAL_TREES');
 for(const tree of trees){
  need(tree.path.startsWith(ROOT+'/state/')&&resolve(tree.path)===tree.path&&Array.isArray(tree.files)&&tree.files.length<=4096,'JOURNAL_ROOT');
  const found:{relativePath:string;sha256:string}[]=[];
  async function walk(path:string,relative:string){
   const st=await lstat(path);need(!st.isSymbolicLink()&&(st.mode&0o022)===0&&await realpath(path)===path,'JOURNAL_PROTECTION');
   if(st.isDirectory()){const names=await readdir(path);need(names.length<=4096,'JOURNAL_BOUND');for(const name of names)await walk(path+'/'+name,relative?relative+'/'+name:name);}
   else{need(st.isFile()&&st.size<=16000000,'JOURNAL_FILE');found.push({relativePath:relative,sha256:sha(await readFile(path))});need(found.length<=4096,'JOURNAL_BOUND');}
  }
  try{await walk(tree.path,'');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;need(tree.files.length===0,'JOURNAL_MISSING');}
  const sort=(a:{relativePath:string},b:{relativePath:string})=>a.relativePath.localeCompare(b.relativePath);
  need(stable(found.sort(sort))===stable([...tree.files].sort(sort)),'JOURNAL_CHANGED');
 }
}
export async function closedServiceAction(authorityPin:Pin,action:'inspect'|'gate'|'pause'|'resume'|'intake',execute=false){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.env.NODE_OPTIONS===undefined,'ROOT');
 need(['inspect','gate','pause','resume','intake'].includes(action),'ACTION');
 need(action==='inspect'||action==='gate'||execute,'EXECUTE_REQUIRED');
 const raw=await pin(authorityPin,true),a=JSON.parse(raw.toString()) as ClosedAuthority;
 need(a.version===1&&a.purpose==='ROOT_CLOSED_SERVICE_RECOVERY'&&/^[a-f0-9]{64}$/.test(a.sourceIdentityDigest),'AUTHORITY');
 const own=await realpath(fileURLToPath(import.meta.url)),suffix='/api/scripts/recover-testnet-closed-service.ts',recoveryRoot=own.slice(0,-suffix.length);
 need(own.endsWith(suffix)&&/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{0,79}\/app$/.test(recoveryRoot)&&Array.isArray(a.recoveryCodePins)&&a.recoveryCodePins.length>=3&&a.recoveryCodePins.length<=10,'RECOVERY_CODE_ROOT');
 need([own,recoveryRoot+'/api/src/testnet-closed-journals.ts',recoveryRoot+'/api/src/api-root-metadata.ts'].every(path=>a.recoveryCodePins.some(p=>p.path===path))&&new Set(a.recoveryCodePins.map(p=>p.path)).size===a.recoveryCodePins.length,'RECOVERY_REQUIRED_CODE');
 const recoveryCode=async()=>{for(const code of a.recoveryCodePins){need(code.path.startsWith(recoveryRoot+'/api/'),'RECOVERY_CODE_PATH');for(let directory=dirname(code.path);directory.startsWith(ROOT);directory=dirname(directory)){need((await lstat(directory)).uid===0,'RECOVERY_CODE_OWNER');}await pin(code);}};
 await recoveryCode();
 need(a.workerConfig.path===ROOT+'/secrets/testnet-policy-worker.private.json','CONFIG_PATH');
 const c=JSON.parse((await pin(a.workerConfig,true)).toString()),p=JSON.parse((await pin(a.policy)).toString());
 need(c.enabled===true&&c.mode==='ROOT_BOUNDED_TESTNET_SERVICE_WORKER'&&c.policy.path===a.policy.path&&c.policy.sha256===a.policy.sha256&&p.activeEpoch==='242'&&p.sourceIdentityDigest===a.sourceIdentityDigest,'POLICY');
 need(stable(c.executionManifest)===stable(a.executionManifest)&&stable(c.forwardFastExecution)===stable(a.executionApproval),'EXECUTION_BINDING');
 const manifest=JSON.parse((await pin(a.executionManifest,true)).toString());for(const file of workerExecutionPins(manifest,c.executionRoot,c.publicCommit))await pin(file);
 const approval=JSON.parse((await pin(a.executionApproval,true)).toString());need(approval.policySha256===a.policy.sha256&&approval.executionRoot===c.executionRoot&&approval.publicCommit===c.publicCommit&&stable(approval.executionManifest)===stable(a.executionManifest),'EXECUTION_APPROVAL');
 const forward=await loadLinuxForward(ROOT+'/secrets/forward-profile.private.json');need(forward.verified.profileSha256===p.profileSha256,'PROFILE');
 const pool=connect(forward.verified.runtime.workerUrl,1),db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='10s'");
  const who=(await db.query('SELECT current_database() db,current_user role,(pg_control_system()).system_identifier::text system')).rows[0];
  need(who.db==='zee_app_20261023'&&who.role==='zee_app_worker_20261023'&&who.system==='7701863382450487342','DB_IDENTITY');
  const h=(s:string)=>Buffer.from(s,'hex'),args=[h(authorityPin.sha256),h(a.policy.sha256),h(a.workerConfig.sha256),h(a.executionManifest.sha256),h(a.executionApproval.sha256),h(a.sourceIdentityDigest)];
  const authorized=(await db.query('SELECT EXISTS(SELECT 1 FROM zee.testnet_closed_recovery_authorizations WHERE authorization_sha256=$1 AND policy_sha256=$2 AND worker_config_sha256=$3 AND execution_manifest_sha256=$4 AND execution_approval_sha256=$5 AND source_identity_digest=$6) ok',args)).rows[0].ok;
  need(authorized,'SQL_AUTHORITY');
  const s=(await db.query(`SELECT epoch::text,xmin::text,accepting_orders,dispatch_enabled,reconciliation_required,
   zee.testnet_policy_execution_epoch($1)::text effective,zee.testnet_policy_closed_books() closed,
   zee.testnet_policy_nonexpiring($1) lifetime,zee.testnet_unfunded_reuse_enabled($1) reuse,
   EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid=20261026 AND granted) lease,
   (SELECT count(*)=2 FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds') fresh
   FROM zee.runtime_control WHERE singleton`,[h(a.policy.sha256)])).rows[0];
  need(s?.closed===true&&s.lifetime===true&&s.reuse===true,'NOT_CLOSED');
  const paused=BigInt(s.epoch)>BigInt(s.effective)&&!s.accepting_orders&&!s.dispatch_enabled&&s.reconciliation_required;
  const warm=s.epoch===s.effective&&!s.accepting_orders&&s.dispatch_enabled&&!s.reconciliation_required;
  const open=s.epoch===s.effective&&s.accepting_orders&&s.dispatch_enabled&&!s.reconciliation_required;
  need(paused||warm||open,'CONTROL');
  const runtime=forward.verified.runtime,keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
  const journalDigest=(await verifyDynamicClosedJournalTrees(a.journalTrees,db,keys,forward.verified.registry)).digest;
  if(action!=='intake'){
   if(action!=='inspect'&&action!=='pause'){need(s.lease===false,'WORKER_LEASE');const unit=await run('/bin/systemctl',['show','zeeswap-testnet-policy-worker.service','--property=ActiveState','--property=MainPID'],{timeout:10000,maxBuffer:4096});need(/MainPID=0(?:\n|$)/.test(unit.stdout)&&/ActiveState=(inactive|failed)(?:\n|$)/.test(unit.stdout),'WORKER_PROCESS');}
  }
  if(action==='gate'){need(warm||open,'DISPATCH_NOT_READY');need(s.fresh,'SOURCE_STALE');await requireNoSourceRecoveryMarker();}
  if(action==='resume'||action==='intake'){need(s.fresh,'SOURCE_STALE');await requireNoSourceRecoveryMarker();}
  need((await verifyDynamicClosedJournalTrees(a.journalTrees,db,keys,forward.verified.registry)).digest===journalDigest,'JOURNAL_CHANGED_DURING_QUALIFICATION');
  await recoveryCode();await pin(authorityPin,true);await pin(a.workerConfig,true);await db.query('ROLLBACK');
  if(action==='resume'&&paused||action==='intake'&&warm||action==='pause'&&!paused){
   // The admin connection is acquired only for the two explicit, Root-only SQL functions.
   const metadata=async(field:keyof typeof transportPaths)=>{const p=a.databaseTransport[field];requireClosedTransportMetadataPermissions(field,p.path,await lstat(p.path));return pin(p);};
   const config=JSON.parse((await pin(a.adminProfile,true)).toString()),t=a.databaseTransport,receipt=JSON.parse((await metadata('proof')).toString()),ca=await metadata('ca'),baseline=JSON.parse((await metadata('baseline')).toString()),classification=JSON.parse((await metadata('classification')).toString());
   need(t.ca.sha256===receipt.tls.ca.sha256&&t.baseline.sha256===receipt.destination.restoredBaselineFile.sha256&&t.classification.sha256===receipt.origin.classificationFile.sha256,'ADMIN_TRANSPORT_PINS');
   registerLocalMainAdminTransport(receipt,t.proof,ca.toString(),config.adminUrl,baseline,classification);
   const admin=connect(validateAdminTarget(config),1);try{
    if(action==='pause')await admin.query('SELECT zee.pause_testnet_closed_execution($1,$2,$3)',[h(authorityPin.sha256),s.epoch,s.xmin]);
    else if(action==='resume')await admin.query('SELECT zee.resume_testnet_closed_execution($1,$2,$3,$4,$5,$6,$7,$8)',[h(authorityPin.sha256),s.epoch,s.xmin,h(sha(stable({authority:authorityPin.sha256,control:s,journalDigest}))),h(a.workerConfig.sha256),h(a.executionManifest.sha256),h(a.executionApproval.sha256),h(a.sourceIdentityDigest)]);
    else await admin.query('SELECT zee.enable_testnet_closed_intake($1,$2,$3)',[h(authorityPin.sha256),s.epoch,s.xmin]);
   }finally{await admin.end();}
  }
  return{status:action==='gate'?'POLICY_CLOSED_IDLE_RESTART_ALLOWED':action==='pause'?'CLOSED_SERVICE_PAUSED':action==='resume'?'CLOSED_SERVICE_DISPATCH_PREPARED':action==='intake'?'CLOSED_SERVICE_INTAKE_CHECKED':'CLOSED_SERVICE_QUALIFIED',paused,warm,open,sourceFresh:s.fresh,financialWorkerLease:s.lease,financialAction:false};
 }finally{await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[path,hash,action,...rest]=process.argv.slice(2);closedServiceAction({path:path!,sha256:hash!},action as any,rest.length===1&&rest[0]==='--execute').then(v=>console.log(JSON.stringify(v))).catch(e=>{const code=/^CLOSED_RECOVERY_[A-Z0-9_]+$/.test(e.message)?e.message:'CLOSED_RECOVERY_PRIVATE_FAILURE';console.error(JSON.stringify({status:'CLOSED_SERVICE_REFUSED',code,financialAction:false}));process.exitCode=1;});}
