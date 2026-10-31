/** Root-only closed-book allocation/reconciliation. No wallet, signer or broadcasts. */
import {readFile,lstat,realpath,open,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {connect} from '../src/db.ts';
import type pg from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadLinuxForward} from '../src/linux-forward-dispatch.ts';
import {workerExecutionPins,requireContinuousCapitalApproval} from '../src/testnet-policy-execution.ts';
import {registerLocalMainAdminTransport} from '../src/main-database-relocation.ts';
import {validateAdminTarget} from '../src/linux-control.ts';
import {PrivateData} from '../src/private-data.ts';
import {verifyContinuousClosedBooks} from '../src/testnet-continuous-journals.ts';
import {stable} from '../src/integrations/observation/types.ts';
import {requireNoSourceRecoveryMarker} from './check-testnet-policy-idle-restart.ts';
import {requireClosedTransportMetadataPermissions,type ClosedAuthority} from './recover-testnet-closed-service.ts';
import {checkDeliveredRestartCapital} from './check-testnet-delivered-restart.ts';
const ROOT='/opt/zeeswap-testnet',sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
type Pin={path:string;sha256:string};
type Action='inspect'|'publish'|'reconcile'|'closed-inspect'|'closed-gate'|'closed-pause'|'closed-resume'|'closed-intake';
export type ContinuousDemoAuthority={version:1;purpose:'ROOT_CONTINUOUS_TESTNET_DEMO';previousContinuousMode?:Pin;parentClosedAuthority:Pin;humanApprovalSha256:string;capitalProof:Pin;publishBefore:string;intentDirectory:string;successor:{workerConfig:Pin;preparedWorkerConfig:Pin;executionManifest:Pin;executionApproval:Pin;capitalApproval:Pin};codePins:Pin[]};
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CONTINUOUS_DEMO_'+c);}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
async function pin(p:Pin,secret=false){
 need(p&&p.path.startsWith(ROOT+'/')&&resolve(p.path)===p.path&&hash(p.sha256),'PIN');
 for(let dir=dirname(p.path);dir.startsWith(ROOT);dir=dirname(dir)){const s=await lstat(dir);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0&&await realpath(dir)===dir,'DIRECTORY');}
 const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&(secret?0o077:0o022))===0&&s.size<=16000000&&await realpath(p.path)===p.path,'FILE');
 const b=await readFile(p.path);need(sha(b)===p.sha256,'PIN_CHANGED');return b;
}
export function validateContinuousPhysicalProof(v:any,policy:string,parent:string,now=Date.now()){
 need(v?.version===1&&v.status==='ROOT_CONTINUOUS_DEMO_PHYSICAL_CAPITAL_VERIFIED'&&v.policySha256===policy&&v.parentClosedAuthoritySha256===parent&&v.ownershipAndProvenanceVerified===true&&v.pendingCalculatedCount===0,'PHYSICAL_PROVENANCE');
 need(typeof v.observedAt==='string'&&Date.parse(v.observedAt)>=now-60000&&Date.parse(v.observedAt)<=now+5000,'PHYSICAL_FRESHNESS');
 for(const k of ['nativeBalanceZatoshi','baseAvailableAtomic','baseGasWei'])need(typeof v[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(v[k]),'PHYSICAL_INTEGER');
 need(BigInt(v.nativeBalanceZatoshi)>=1200000n&&BigInt(v.baseAvailableAtomic)>=9900000n&&BigInt(v.baseGasWei)>=100000000000000n,'PHYSICAL_TARGET_COVERAGE');
 need(v.nativeCapture&&hash(v.nativeCapture.sha256)&&v.baseCapture&&hash(v.baseCapture.sha256),'PHYSICAL_CAPTURE_PINS');return v;
}
async function durablePrivateFile(path:string,value:unknown){
 const file=await open(path,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
 const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function originalEffects(db:Pick<pg.PoolClient,'query'>,xid:string){
 need(/^[1-9][0-9]*$/.test(xid),'ORIGINAL_XID');const low=(BigInt(xid)%4294967296n).toString();
 const tables=['testnet_continuous_demo_authorizations','testnet_continuous_proceeds','testnet_closed_recovery_generations'] as const,result:Record<string,any[]>={};
 for(const table of tables)result[table]=(await db.query(`SELECT to_jsonb(t) row FROM zee.${table} t WHERE created_xid=$1::xid8 ORDER BY to_jsonb(t)::text`,[xid])).rows.map(r=>r.row);
 result.ledger_entries=(await db.query('SELECT to_jsonb(t) row FROM zee.ledger_entries t WHERE xmin::text=$1 ORDER BY to_jsonb(t)::text',[low])).rows.map(r=>r.row);
 return result;
}
async function privateJson(path:string){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&s.size<=16000000&&await realpath(path)===path,'ORIGINAL_INTENT_FILE');const raw=await readFile(path);return{raw,value:JSON.parse(raw.toString())};}
async function removePending(directory:string){await unlink(directory+'/pending.private.json');const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}}
export function classifyContinuousOriginal(status:unknown,expectedEffects:unknown,actualEffects:unknown,booksClosed:boolean):'pending'|'committed'|'aborted'{
 if(status==='in progress')return 'pending';
 need(status==='committed'||status==='aborted','ORIGINAL_XID_UNKNOWN');
 if(status==='aborted')return 'aborted';
 need(stable(actualEffects)===stable(expectedEffects),'ORIGINAL_EFFECT_CONFLICT');
 return booksClosed?'committed':'pending';
}
async function resolveOriginalIntent(db:Pick<pg.PoolClient,'query'>,directory:string,mode:string,delivered=false){
 need(typeof directory==='string'&&directory.startsWith(ROOT+'/state/')&&resolve(directory)===directory,'INTENT_DIRECTORY');
 const st=await lstat(directory);need(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o777)===0o700&&await realpath(directory)===directory,'INTENT_DIRECTORY');
 let pointer:any;try{pointer=(await privateJson(directory+'/pending.private.json')).value;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}
 need(pointer.version===1&&pointer.modeSha256===mode&&typeof pointer.intentPath==='string'&&dirname(pointer.intentPath)===directory&&hash(pointer.intentSha256),'ORIGINAL_INTENT_POINTER');
 const original=await privateJson(pointer.intentPath),intent=original.value;need(sha(original.raw)===pointer.intentSha256&&intent.version===1&&intent.modeSha256===mode&&/^[1-9][0-9]*$/.test(intent.transactionId),'ORIGINAL_INTENT_BINDING');
 const status=(await db.query('SELECT pg_xact_status($1::xid8) status',[intent.transactionId])).rows[0]?.status;
 const actual=status==='committed'?await originalEffects(db,intent.transactionId):undefined,closed=status==='committed'?(await db.query(delivered?'SELECT NOT zee.testnet_global_slot_busy() yes':'SELECT zee.testnet_policy_closed_books() yes')).rows[0]?.yes===true:false;
 if(classifyContinuousOriginal(status,intent.effects,actual,closed)==='pending')return true;
 const completed=pointer.intentPath.replace('-intent.private.json','-completed.private.json'),record={version:1,transactionId:intent.transactionId,modeSha256:mode,status:status==='committed'?'COMMITTED_EXACT':'ABORTED_EXACT'};
 try{await durablePrivateFile(completed,record);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;need(stable((await privateJson(completed)).value)===stable(record),'ORIGINAL_COMPLETION_CONFLICT');}
 await removePending(directory);return false;
}

export async function acquireContinuousPublicationMutex(db:Pick<pg.PoolClient,'query'>){await db.query('SELECT zee.lock_observer_cycle()');}
export async function continuousDemoAction(modePin:Pin,action:Action,execute=false,context?:{db:pg.PoolClient}){
 need(!context||action==='inspect','BORROWED_INSPECT_ONLY');
 need(typeof process.getuid==='function'&&process.getuid()===0,'ROOT_REQUIRED');need(['inspect','publish','reconcile','closed-inspect','closed-gate','closed-pause','closed-resume','closed-intake'].includes(action)&&(['inspect','closed-inspect','closed-gate'].includes(action)||execute),'ACTION');
 const raw=await pin(modePin,true),a=JSON.parse(raw.toString()) as ContinuousDemoAuthority;
 need(a.version===1&&a.purpose==='ROOT_CONTINUOUS_TESTNET_DEMO'&&hash(a.humanApprovalSha256),'AUTHORITY');
 const own=await realpath(fileURLToPath(import.meta.url)),suffix='/api/scripts/administer-continuous-demo.ts',codeRoot=own.slice(0,-suffix.length);
 need(own.endsWith(suffix)&&/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{0,79}\/app$/.test(codeRoot),'CODE_ROOT');
 const required=[own,codeRoot+'/api/src/testnet-continuous-journals.ts',codeRoot+'/api/src/testnet-closed-journals.ts'];
 need(Array.isArray(a.codePins)&&a.codePins.length>=3&&a.codePins.length<=16&&new Set(a.codePins.map(p=>p.path)).size===a.codePins.length&&required.every(path=>a.codePins.some(p=>p.path===path)),'CODE_PINS');
 for(const p of a.codePins){need(p.path.startsWith(codeRoot+'/api/'),'CODE_PATH');await pin(p);}
 const parent=JSON.parse((await pin(a.parentClosedAuthority,true)).toString()) as ClosedAuthority;
 need(parent.version===1&&parent.purpose==='ROOT_CLOSED_SERVICE_RECOVERY','PARENT');
 if(a.previousContinuousMode){const previous=JSON.parse((await pin(a.previousContinuousMode,true)).toString()) as ContinuousDemoAuthority;need(previous.version===1&&previous.purpose===a.purpose&&stable(previous.parentClosedAuthority)===stable(a.parentClosedAuthority)&&action!=='publish','PREVIOUS_MODE');need(a.codePins.some(p=>p.path===codeRoot+'/api/scripts/check-testnet-delivered-restart.ts'),'DELIVERED_GATE_CODE_PIN');}
 need(a.successor&&a.successor.workerConfig.path==='/opt/zeeswap-testnet/secrets/testnet-policy-worker.private.json'&&a.successor.preparedWorkerConfig.sha256===a.successor.workerConfig.sha256,'SUCCESSOR_CONFIG');
 const selected=action==='publish'?parent:a.successor;
 const policy=JSON.parse((await pin(parent.policy)).toString()),worker=JSON.parse((await pin(selected.workerConfig,true)).toString());
 need(worker.policy.path===parent.policy.path&&worker.policy.sha256===parent.policy.sha256&&policy.sourceIdentityDigest===parent.sourceIdentityDigest,'ORIGINAL_POLICY');
 const manifest=JSON.parse((await pin(selected.executionManifest,true)).toString());for(const p of workerExecutionPins(manifest,worker.executionRoot,worker.publicCommit))await pin(p);
 const execution=JSON.parse((await pin(selected.executionApproval,true)).toString());need(execution.policySha256===parent.policy.sha256&&execution.executionRoot===worker.executionRoot&&execution.publicCommit===worker.publicCommit&&stable(execution.executionManifest)===stable(selected.executionManifest),'ORIGINAL_EXECUTION');
 const future=action==='publish'?JSON.parse((await pin(a.successor.preparedWorkerConfig,true)).toString()):worker;
 need(future.policy.sha256===parent.policy.sha256&&future.policy.path===parent.policy.path&&stable(future.executionManifest)===stable(a.successor.executionManifest)&&stable(future.forwardFastExecution)===stable(a.successor.executionApproval)&&stable(future.continuousCapital)===stable(a.successor.capitalApproval),'SUCCESSOR_TUPLE');
 const futureManifest=JSON.parse((await pin(a.successor.executionManifest,true)).toString());for(const p of workerExecutionPins(futureManifest,future.executionRoot,future.publicCommit))await pin(p);
 const futureExecution=JSON.parse((await pin(a.successor.executionApproval,true)).toString());need(futureExecution.policySha256===parent.policy.sha256&&futureExecution.executionRoot===future.executionRoot&&futureExecution.publicCommit===future.publicCommit&&stable(futureExecution.executionManifest)===stable(a.successor.executionManifest),'SUCCESSOR_EXECUTION');
 const capitalApproval=JSON.parse((await pin(a.successor.capitalApproval,true)).toString());requireContinuousCapitalApproval(capitalApproval,future,parent.policy.sha256,policy.profileSha256);need(stable(capitalApproval.captureScript)===stable(future.captureScript),'SUCCESSOR_CAPTURE');
 await pin(capitalApproval.captureScript);await pin(capitalApproval.originalCaptureScript);
 const forward=await loadLinuxForward(ROOT+'/secrets/forward-profile.private.json');need(forward.verified.profileSha256===policy.profileSha256,'ORIGINAL_PROFILE');
 const metadata=async(field:keyof ClosedAuthority['databaseTransport'])=>{const p=parent.databaseTransport[field];requireClosedTransportMetadataPermissions(field,p.path,await lstat(p.path));return pin(p);};
 const adminConfig=JSON.parse((await pin(parent.adminProfile,true)).toString()),t=parent.databaseTransport,receipt=JSON.parse((await metadata('proof')).toString()),ca=await metadata('ca'),baseline=JSON.parse((await metadata('baseline')).toString()),classification=JSON.parse((await metadata('classification')).toString());
 need(t.ca.sha256===receipt.tls.ca.sha256&&t.baseline.sha256===receipt.destination.restoredBaselineFile.sha256&&t.classification.sha256===receipt.origin.classificationFile.sha256,'ADMIN_TRANSPORT');
 registerLocalMainAdminTransport(receipt,t.proof,ca.toString(),adminConfig.adminUrl,baseline,classification);
 const pool=context?undefined:connect(validateAdminTarget(adminConfig),1),db=context?.db??await pool!.connect(),h=(s:string)=>Buffer.from(s,'hex');let sent=false;
 try{
  if(!context){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query("SET LOCAL statement_timeout='30000ms'");await db.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");}
  else need((await db.query("SELECT current_setting('transaction_isolation') IN('repeatable read','serializable') yes")).rows[0].yes,'BORROWED_SNAPSHOT');
  // The ordinary Envio consumer owns advisory key20261024 for its lifetime.
  // Admission/publication instead share this actual runtime-control row mutex.
  await acquireContinuousPublicationMutex(db);
  const identity=(await db.query('SELECT current_database() db,current_user role,(pg_control_system()).system_identifier::text system')).rows[0];
  need(identity.db==='zee_app_20261023'&&(identity.role==='zee_app_admin_20261023'||context&&identity.role==='zee_app_worker_20261023')&&identity.system==='7701863382450487342','DATABASE');
  const authorized=(await db.query('SELECT EXISTS(SELECT 1 FROM zee.testnet_closed_recovery_authorizations WHERE authorization_sha256=$1 AND policy_sha256=$2 AND worker_config_sha256=$3 AND execution_manifest_sha256=$4 AND execution_approval_sha256=$5 AND source_identity_digest=$6) yes',[h(a.parentClosedAuthority.sha256),h(parent.policy.sha256),h(parent.workerConfig.sha256),h(parent.executionManifest.sha256),h(parent.executionApproval.sha256),h(parent.sourceIdentityDigest)])).rows[0].yes;need(authorized,'PARENT_SQL_AUTHORITY');
  const s=(await db.query(`SELECT epoch::text,xmin::text,accepting_orders,dispatch_enabled,reconciliation_required,zee.testnet_policy_execution_epoch($1)::text effective,
   zee.testnet_continuous_demo_enabled($1) continuous,
   EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid=20261026 AND granted AND pid<>pg_backend_pid()) lease,
   (SELECT count(*)=2 FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds') fresh FROM zee.runtime_control WHERE singleton`,[h(parent.policy.sha256)])).rows[0];
  const current=s&&s.epoch===s.effective&&!s.reconciliation_required&&s.dispatch_enabled,paused=s&&BigInt(s.epoch)>BigInt(s.effective)&&!s.accepting_orders&&!s.dispatch_enabled&&s.reconciliation_required,warm=current&&!s.accepting_orders,isOpen=current&&s.accepting_orders;
  need(action==='inspect'||action.startsWith('closed-')?current||paused:current,'CURRENT_CONTROL');
  const pending=await resolveOriginalIntent(db,a.intentDirectory,modePin.sha256,!!a.previousContinuousMode);
  if(pending){if(!context)await db.query('ROLLBACK');return{status:'CONTINUOUS_DEMO_ORIGINAL_TRANSACTION_PENDING',pendingPublication:true,financialAction:false,onchainAction:false};}
  if(action!=='publish')need(s.continuous&&(await db.query(`SELECT authorization_sha256=$2 AND worker_config_sha256=$3 AND execution_manifest_sha256=$4 AND execution_approval_sha256=$5 AND capital_approval_sha256=$6 yes FROM ${a.previousContinuousMode?'zee.testnet_continuous_current_execution($1)':'zee.testnet_continuous_demo_authorizations'} ${a.previousContinuousMode?'':'WHERE policy_sha256=$1'}`,[h(parent.policy.sha256),h(modePin.sha256),h(a.successor.workerConfig.sha256),h(a.successor.executionManifest.sha256),h(a.successor.executionApproval.sha256),h(a.successor.capitalApproval.sha256)])).rows[0]?.yes,'ACTUAL_MODE_AUTHORITY');
  const runtime=forward.verified.runtime,keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
  const fullyClosed=(await db.query('SELECT zee.testnet_policy_closed_books() yes')).rows[0]?.yes===true;
  const background=!!a.previousContinuousMode&&!fullyClosed;
  need(!background||['inspect','reconcile','closed-inspect','closed-gate','closed-intake'].includes(action),'BACKGROUND_SOURCE_RECOVERY_BLOCKED');
  const closure=await verifyContinuousClosedBooks(db,keys,forward.verified.registry,parent.journalTrees,background);
  await pin(modePin,true);for(const p of a.codePins)await pin(p);
  let credited=0;
  if(action==='publish'){
   need(s.fresh,'SOURCE_STALE');await requireNoSourceRecoveryMarker();
   const physical=validateContinuousPhysicalProof(JSON.parse((await pin(a.capitalProof,true)).toString()),parent.policy.sha256,a.parentClosedAuthority.sha256);await pin(physical.nativeCapture,true);await pin(physical.baseCapture,true);
   const unreconciled=(await db.query("SELECT asset,COALESCE(sum(amount),0)::text amount FROM zee.ledger_entries WHERE bucket='operator:unreconciled' GROUP BY asset")).rows;
   const pendingAmount=(asset:string)=>BigInt(unreconciled.find(r=>r.asset===asset)?.amount??'0');
   need(pendingAmount('TAZ')>=0n&&pendingAmount('mockUSDC')>=0n&&BigInt(physical.nativeBalanceZatoshi)>=1200000n+pendingAmount('TAZ')&&BigInt(physical.baseAvailableAtomic)>=9900000n+pendingAmount('mockUSDC'),'PHYSICAL_UNRECONCILED_NOT_DOUBLE_ALLOCATED');
   need(Date.parse(a.publishBefore)>Date.now()&&Date.parse(a.publishBefore)<=Date.now()+300000,'FINITE_PUBLICATION');
   await db.query('SELECT zee.publish_testnet_continuous_demo($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[h(parent.policy.sha256),h(modePin.sha256),h(a.humanApprovalSha256),h(a.capitalProof.sha256),h(closure.digest),s.epoch,s.xmin,a.publishBefore,physical.baseGasWei,h(a.successor.workerConfig.sha256),h(a.successor.executionManifest.sha256),h(a.successor.executionApproval.sha256),h(a.successor.capitalApproval.sha256)]);
  }else if(action==='reconcile'&&!background){
   need(s.fresh,'SOURCE_STALE');await requireNoSourceRecoveryMarker();
   const candidates=(await db.query(`SELECT o.id FROM zee.orders o JOIN zee.testnet_policy_admissions a ON a.order_id=o.id WHERE o.state='SETTLED' AND a.policy_sha256 IN(SELECT zee.testnet_policy_lineage($1)) AND NOT EXISTS(SELECT 1 FROM zee.testnet_continuous_proceeds p WHERE p.order_id=o.id) ORDER BY o.id LIMIT 32`,[h(parent.policy.sha256)])).rows;
   for(const row of candidates)if((await db.query('SELECT zee.reconcile_testnet_continuous_proceeds($1,$2,$3,clock_timestamp()) yes',[h(parent.policy.sha256),row.id,h(closure.digest)])).rows[0].yes)credited++;
  }
  let changed=action==='publish'||action==='reconcile'&&credited>0;
  if(action.startsWith('closed-')){
   const closedAction=action.slice(7);
   if(['gate','resume','intake'].includes(closedAction)){need(s.fresh,'SOURCE_STALE');await requireNoSourceRecoveryMarker();}
   if(['gate','resume'].includes(closedAction)){
    need(!s.lease,'WORKER_LEASE');const unit=await promisify(execFile)('/bin/systemctl',['show','zeeswap-testnet-policy-worker.service','--property=ActiveState','--property=MainPID','--property=ControlPID'],{timeout:10000,maxBuffer:4096});
    const inactive=/ActiveState=(inactive|failed)(?:\n|$)/.test(unit.stdout),ownStart=closedAction==='gate'&&/ActiveState=activating(?:\n|$)/.test(unit.stdout)&&new RegExp('ControlPID='+process.pid+'(?:\n|$)').test(unit.stdout);
    need(/MainPID=0(?:\n|$)/.test(unit.stdout)&&(inactive||ownStart),'WORKER_PROCESS');
   }
   if(closedAction==='gate')need(warm||isOpen,'DISPATCH_NOT_READY');
   if(closedAction==='gate'&&a.previousContinuousMode)await checkDeliveredRestartCapital(worker,forward.verified,db);
   if(closedAction==='pause'&&!paused){await db.query('SELECT zee.pause_testnet_closed_execution($1,$2,$3)',[h(a.parentClosedAuthority.sha256),s.epoch,s.xmin]);changed=true;}
   if(closedAction==='resume'&&paused){await db.query('SELECT zee.resume_testnet_closed_execution($1,$2,$3,$4,$5,$6,$7,$8)',[h(a.parentClosedAuthority.sha256),s.epoch,s.xmin,h(closure.digest),h(parent.workerConfig.sha256),h(parent.executionManifest.sha256),h(parent.executionApproval.sha256),h(parent.sourceIdentityDigest)]);changed=true;}
   if(closedAction==='intake'&&warm){if(a.previousContinuousMode)await db.query('SELECT zee.enable_testnet_continuous_intake($1,$2,$3,$4)',[h(parent.policy.sha256),h(modePin.sha256),s.epoch,s.xmin]);else await db.query('SELECT zee.enable_testnet_closed_intake($1,$2,$3)',[h(a.parentClosedAuthority.sha256),s.epoch,s.xmin]);changed=true;}
  }
  const transactionId=(await db.query('SELECT pg_current_xact_id_if_assigned()::text xid')).rows[0].xid;
  let intentPath:string|undefined;
  if(!changed){if(!context)await db.query('ROLLBACK');}else{
   need(typeof a.intentDirectory==='string'&&a.intentDirectory.startsWith(ROOT+'/state/')&&resolve(a.intentDirectory)===a.intentDirectory,'INTENT_DIRECTORY');
   const st=await lstat(a.intentDirectory);need(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o777)===0o700&&await realpath(a.intentDirectory)===a.intentDirectory,'INTENT_DIRECTORY');
   intentPath=a.intentDirectory+'/'+(action==='publish'?'publication-':'')+randomUUID()+'-intent.private.json';
   const intent={version:1,action,transactionId,modeSha256:modePin.sha256,journalQualificationSha256:closure.digest,credited,effects:await originalEffects(db,transactionId)};
   await durablePrivateFile(intentPath,intent);
   await durablePrivateFile(a.intentDirectory+'/pending.private.json',{version:1,intentPath,intentSha256:sha(JSON.stringify(intent)),modeSha256:modePin.sha256});
   sent=true;await db.query('COMMIT');
   await durablePrivateFile(intentPath.replace('-intent.private.json','-completed.private.json'),{version:1,transactionId,modeSha256:modePin.sha256,status:'COMMITTED_EXACT'});
   await removePending(a.intentDirectory);
  }
  const closedStatuses:Record<string,string>={'closed-inspect':'CLOSED_SERVICE_QUALIFIED','closed-gate':'POLICY_CLOSED_IDLE_RESTART_ALLOWED','closed-pause':'CLOSED_SERVICE_PAUSED','closed-resume':'CLOSED_SERVICE_DISPATCH_PREPARED','closed-intake':'CLOSED_SERVICE_INTAKE_CHECKED'};
  return{status:closedStatuses[action]??(action==='inspect'?'CONTINUOUS_DEMO_QUALIFIED':action==='publish'?'CONTINUOUS_DEMO_PUBLISHED':'CONTINUOUS_PROCEEDS_RECONCILED'),backgroundFinalizing:background,fullyClosed,paused,warm,open:isOpen,pendingPublication:false,journalQualificationSha256:closure.digest,digest:closure.digest,orders:closure.orders,files:closure.files,sourceFresh:s.fresh,financialWorkerLease:s.lease,control:{epoch:s.epoch,xmin:s.xmin,accepting_orders:s.accepting_orders,dispatch_enabled:s.dispatch_enabled,reconciliation_required:s.reconciliation_required},continuousAuthorizationSha256:modePin.sha256,credited,transactionId,intentPath,financialAction:action==='publish'||action==='reconcile'&&!background,onchainAction:false};
 }catch(e){if(!context)await db.query('ROLLBACK').catch(()=>{});if(sent)throw Error('CONTINUOUS_DEMO_ORIGINAL_TRANSACTION_RECONCILIATION_REQUIRED');throw e;}finally{if(!context){db.release();await pool!.end();}}
}
export const continuousClosedServiceAction=(modePin:Pin,action:'inspect'|'gate'|'pause'|'resume'|'intake',execute=false)=>continuousDemoAction(modePin,('closed-'+action) as Action,execute);
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[path,sha256,action,...rest]=process.argv.slice(2);continuousDemoAction({path:path!,sha256:sha256!},action as any,rest.length===1&&rest[0]==='--execute').then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(JSON.stringify({status:'CONTINUOUS_DEMO_REFUSED',code:/^CONTINUOUS_[A-Z0-9_]+$/.test(e.message)?e.message:'CONTINUOUS_DEMO_PRIVATE_FAILURE',financialAction:false}));process.exitCode=1;});}
