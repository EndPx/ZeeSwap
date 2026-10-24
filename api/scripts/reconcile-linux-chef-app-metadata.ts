/** Root-scoped operator tool: exact one-tip APP metadata repair, never financial activation. */
import {readFile,lstat,realpath,mkdir,rmdir,open,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import type pg from 'pg';
import {loadLinuxChefRuntime} from './recover-linux-chef.ts';
import {connect} from '../src/db.ts';
import {loadPrefundingEpochAuthority,decodePrefundingEpochAuthority,validateAuthorizedPrefundingSnapshot,type EpochAuthority} from '../src/prefunding-epoch.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {parseChefStatus,readJson,safeEndpoint} from '../src/integrations/observation/chef.ts';
import {digest,requireThat,stable,type Header} from '../src/integrations/observation/types.ts';
import {requireNoAppMetadataRepair,appMetadataCanonicalHeights,readAppMetadataRepairState,financialRepairDigest,otherCanonicalRowsDigest,validateAppMetadataApproval,validateAppMetadataBefore,expectedAppMetadataAfter,applyAppMetadataUpdates,classifyAppMetadataCommit,type AppMetadataRepairApproval,type RepairIntent,type RepairState} from '../src/app-chef-metadata-repair.ts';
const ROOT='/opt/zeeswap-testnet',BASE=ROOT+'/state/app-metadata-repair';
const need=(v:unknown,c:string)=>requireThat(v,'APP_METADATA_'+c),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function rootFile(path:string,max=8*1024*1024){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o027)===0&&await realpath(path)===path&&s.size<=max,'ROOT_FILE');return readFile(path);}
async function syncDir(path:string){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
async function exclusive(path:string,bytes:Buffer){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await syncDir(path.slice(0,path.lastIndexOf('/')));}
async function jsonExclusive(path:string,value:unknown){await exclusive(path,Buffer.from(JSON.stringify(value,null,2)+'\n'));}
async function exists(path:string){try{await lstat(path);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
async function main(){
 const [step,arg,approvalSha]=process.argv.slice(2);need(process.platform==='linux'&&process.getuid?.()===0&&process.env.HOME===ROOT+'/home'&&['inspect','apply','reconcile'].includes(step??'')&&arg&&(step==='apply'?process.argv.length===5&&/^[a-f0-9]{64}$/.test(approvalSha??''):process.argv.length===4),'ROOT_EXPLICIT_COMMAND');
 await mkdir(BASE,{recursive:true,mode:0o700});const bs=await lstat(BASE);need(bs.isDirectory()&&!bs.isSymbolicLink()&&bs.uid===0&&(bs.mode&0o077)===0&&await realpath(BASE)===BASE,'ROOT_DIRECTORY');
 const loaded=await loadLinuxChefRuntime(ROOT+'/secrets/chef-runtime.private.json'),{c,runtime,profile,profileSha256,env}=loaded;
 const handoffBytes=await rootFile(ROOT+'/secrets/relocation-applied-proof.private.json'),opening=JSON.parse(await readFile(profile.immutable.openingProof.path,'utf8'));
 const context={profileSha256,handoffSha256:sha(handoffBytes),openingProofSha256:profile.immutable.openingProof.sha256,openingEventId:opening.eventId};
 const cursorPath=c.recoveryDirectory+'/live-cursor.private.json',marker=c.recoveryDirectory+'/app-metadata-repair-in-progress',writer=c.recoveryDirectory+'/writer.lock';
 const pool=connect(runtime.workerUrl,2);let lease:pg.PoolClient|undefined,writerOwned=false,envioLocked=false;
 let directory='',approval:AppMetadataRepairApproval,authority:EpochAuthority|undefined,intent:RepairIntent&{newCursorBase64:string};
 async function cursor(){const s=await lstat(cursorPath);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===986&&s.gid===978&&(s.mode&0o077)===0&&await realpath(cursorPath)===cursorPath,'SERVICE_CURSOR_FILE');const bytes=await readFile(cursorPath);return{bytes,value:JSON.parse(bytes.toString()),sha256:sha(bytes)};}
 async function sourceAndCanonical(state:RepairState,approved?:AppMetadataRepairApproval){
  const signal=AbortSignal.timeout(180000),response=await fetch(new URL('/status',safeEndpoint(c.sourceUrl)),{headers:{authorization:'Bearer '+env.CHEF_API_TOKEN},signal,redirect:'error'});need(response.ok,'SOURCE_HTTP');const status=parseChefStatus(await readJson(response,signal),c.project,Date.now());
  need(status.checkpoint.height>=4536137&&(!approved||status.generation===approved.chefGeneration),'SOURCE_GENERATION_OR_HEIGHT');
  const heights=appMetadataCanonicalHeights(state.rows);
  const headers=new Map<number,Header>();
  for(let i=0;i<heights.length;){const from=heights[i]!,through=Math.min(heights.at(-1)!,from+999),reader=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,{fromHeight:from,throughHeight:through});await reader.sample(signal);while(i<heights.length&&heights[i]!<=through){const h=heights[i++]!;headers.set(h,await reader.header(h,signal));}}
  for(const row of state.rows)if(row.height!==4536137){const h=headers.get(row.height)!;need(h.hash===row.hash&&Date.parse(h.time)===Date.parse(row.time),'OTHER_STORED_CANONICAL_CONFLICT');}
  const common=headers.get(4536136)!,replacement=headers.get(4536137)!,oldFinalized=headers.get(4536128)!,targetFinalized=headers.get(4536127)!;need(replacement.parentHash===common.hash,'REPLACEMENT_PARENT');
  const plain=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId),sourceHeader=await plain.header(status.checkpoint.height,signal);need(sourceHeader.hash===status.checkpoint.hash,'SOURCE_CHECKPOINT_NONCANONICAL');
  for(const h of [common,replacement,oldFinalized,targetFinalized])need(stable(await plain.header(h.height,signal))===stable(h),'CANONICAL_CHANGED_DURING_READ');
  if(approved)for(const key of ['common','replacement','oldFinalized','targetFinalized'] as const)need(stable(({common,replacement,oldFinalized,targetFinalized})[key])===stable(approved[key]),'APPROVED_CANONICAL_HEADER_CHANGED');
  return{chefGeneration:status.generation,common,replacement,oldFinalized,targetFinalized};
 }
 async function finish(committed:RepairIntent&{newCursorBase64:string}){
  const current=await cursor(),bytes=Buffer.from(committed.newCursorBase64,'base64');need(sha(bytes)===committed.newCursorSha256&&stable(JSON.parse(bytes.toString()))===stable(committed.newCursor),'INTENDED_CURSOR_BYTES_CHANGED');
  need([committed.oldCursorSha256,committed.newCursorSha256].includes(current.sha256),'CURSOR_INTERVENTION');
  if(current.sha256!==committed.newCursorSha256){const temp=cursorPath+'.repair-'+randomUUID()+'.tmp',f=await open(temp,'wx',0o600);try{await f.writeFile(bytes);await f.chown(986,978);await f.sync();}finally{await f.close();}await rename(temp,cursorPath);await syncDir(c.recoveryDirectory);}
  const afterCursor=await cursor();need(afterCursor.sha256===committed.newCursorSha256,'CURSOR_RESULT');
  const receipt={version:1,status:'APP_CHEF_SINGLE_TIP_METADATA_RECONCILED',approvalSha256:committed.approvalSha256,transactionId:committed.transactionId,oldStateDigest:digest(committed.before),newStateDigest:digest(committed.after),financialDigest:financialRepairDigest(committed.after),control:committed.after.prefunding.control,oldCursorSha256:committed.oldCursorSha256,newCursorSha256:committed.newCursorSha256,sourceResolutionReceipt:approval.sourceResolutionReceipt,common:approval.common,replacement:approval.replacement,oldFinalized:approval.oldFinalized,targetFinalized:approval.targetFinalized,observedAtPreserved:true,financialTablesUnchanged:true,financialAction:false};
  const receiptPath=directory+'/completed.private.json';if(await exists(receiptPath))need(stable(JSON.parse((await rootFile(receiptPath)).toString()))===stable(receipt),'RECEIPT_INTERVENTION');else await jsonExclusive(receiptPath,receipt);
  if(await exists(marker)){const m=JSON.parse((await rootFile(marker)).toString());need(m.approvalSha256===committed.approvalSha256,'MARKER_INTERVENTION');await unlink(marker);await syncDir(c.recoveryDirectory);}
  console.log(JSON.stringify({status:receipt.status,receiptPath,receiptSha256:sha(await rootFile(receiptPath)),epoch:receipt.control.epoch,runtimeXmin:receipt.control.xmin,financialAction:false}));
 }
 try{
  await mkdir(writer,{mode:0o700});writerOwned=true;lease=await pool.connect();lease.on('error',()=>{});
  const db=(await lease.query('SELECT current_database() db,current_user role')).rows[0];need(db?.db==='zee_app_20261023'&&db.role==='zee_app_worker_20261023','CONNECTED_WORKER');
  if(step==='inspect'){
   need(arg.startsWith(BASE+'/')&&!arg.slice(BASE.length+1).includes('/')&&arg.endsWith('.private.json'),'INSPECTION_PATH');authority=await loadPrefundingEpochAuthority(context);need(authority,'EXPLICIT_EPOCH_AUTHORITY');
   await lease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=await readAppMetadataRepairState(lease);await lease.query('COMMIT');validateAuthorizedPrefundingSnapshot(state.prefunding,authority!);need(Object.values(state.children).every(v=>v==='0'),'INSPECTION_CUSTOMER_TABLES');const old=await cursor();
   const canonical=await sourceAndCanonical(state);const evidence={version:1,status:'APP_METADATA_REPAIR_INSPECTED',context,state,oldCursor:old.value,oldCursorSha256:old.sha256,financialDigest:financialRepairDigest(state),unchangedCanonicalRowsDigest:otherCanonicalRowsDigest(state,4536137),...canonical,epochAuthoritySha256:authority!.sha256,financialAction:false};await jsonExclusive(arg,evidence);console.log(JSON.stringify({status:evidence.status,output:arg,sqlMutation:false,financialAction:false}));return;
  }
  envioLocked=(await lease.query('SELECT pg_try_advisory_lock(84532,20261024) locked')).rows[0]?.locked===true;need(envioLocked,'ENVIO_APP_WRITER_RUNNING');
  if(step==='apply'){
   await requireNoAppMetadataRepair(marker);need(arg.startsWith(BASE+'/')&&!arg.slice(BASE.length+1).includes('/')&&arg.endsWith('.private.json'),'APPROVAL_PATH');const bytes=await rootFile(arg);need(sha(bytes)===approvalSha,'APPROVAL_RAW_HASH');approval=JSON.parse(bytes.toString());authority=await loadPrefundingEpochAuthority(context);need(authority,'EXPLICIT_EPOCH_AUTHORITY');validateAppMetadataApproval(approval,context,authority!);
   const resolution=await rootFile(approval.sourceResolutionReceipt.path);need(sha(resolution)===approval.sourceResolutionReceipt.sha256,'SOURCE_RECEIPT_HASH');
   directory=BASE+'/repair-'+approvalSha;await mkdir(directory,{mode:0o700});await syncDir(BASE);
   let commitSent=false;
   try{
    await lease.query('BEGIN');await lease.query('SELECT zee.lock_observer_cycle()');await lease.query("SELECT network FROM zee.scanner_checkpoints WHERE network='zcash-testnet' FOR UPDATE");await lease.query("SELECT height FROM zee.chain_observations WHERE network='zcash-testnet' AND height=4536137 FOR UPDATE");
    const before=await readAppMetadataRepairState(lease),old=await cursor();validateAppMetadataBefore(before,approval,authority!,old.value,old.sha256);await sourceAndCanonical(before,approval);validateAppMetadataApproval(approval,context,authority!);
    await exclusive(directory+'/approval.private.json',bytes);await jsonExclusive(directory+'/before-state.private.json',before);await exclusive(directory+'/old-cursor.private.bin',old.bytes);await exclusive(directory+'/source-resolution.private.bin',resolution);await exclusive(directory+'/epoch-authority.private.bin',await rootFile(process.env.ZEESWAP_PREFUNDING_EPOCH_PROOF!));
    const transactionId=String((await lease.query('SELECT pg_current_xact_id()::text id')).rows[0]?.id);need(/^[1-9][0-9]*$/.test(transactionId),'TRANSACTION_ID');const expectedXmin=(BigInt(transactionId)%4294967296n).toString(),after=expectedAppMetadataAfter(before,approval,expectedXmin),newCursor={...old.value,processedThrough:approval.common.height,tipHash:approval.common.hash},newCursorBytes=Buffer.from(JSON.stringify(newCursor)+'\n');
    intent={version:1,purpose:'APP_CHEF_SINGLE_TIP_METADATA_REPAIR',approvalSha256:approvalSha!,approvalDigest:digest(approval),transactionId,expectedXmin,before,after,oldCursorSha256:old.sha256,newCursor,newCursorSha256:sha(newCursorBytes),newCursorBase64:newCursorBytes.toString('base64')};await jsonExclusive(directory+'/intent.private.json',intent);await jsonExclusive(marker,{version:1,approvalSha256:approvalSha,directory});
    await applyAppMetadataUpdates(lease,approval);const actual=await readAppMetadataRepairState(lease);need(stable(actual)===stable(after)&&financialRepairDigest(actual)===financialRepairDigest(before),'POST_UPDATE_STATE_OR_TRIGGER_COUNT');await jsonExclusive(directory+'/commit-intent.private.json',{version:1,transactionId,actualControl:actual.prefunding.control,afterDigest:digest(actual)});commitSent=true;await lease.query('COMMIT');
   }catch(error){if(!commitSent)await lease.query('ROLLBACK').catch(()=>{});throw error;}finally{lease.release(commitSent?Error('REPAIR_READBACK_NEW_CONNECTION'):undefined);lease=undefined;}
  }else{
   need(/^[a-f0-9]{64}$/.test(arg),'RECONCILE_APPROVAL_HASH');directory=BASE+'/repair-'+arg;intent=JSON.parse((await rootFile(directory+'/intent.private.json')).toString());const approvalBytes=await rootFile(directory+'/approval.private.json');need(sha(approvalBytes)===arg&&intent.approvalSha256===arg,'ARCHIVED_APPROVAL_HASH');approval=JSON.parse(approvalBytes.toString());authority=decodePrefundingEpochAuthority(await rootFile(directory+'/epoch-authority.private.bin'),approval.epochAuthoritySha256,context,Date.parse(approval.verifiedAt));validateAppMetadataApproval(approval,context,authority,Date.now(),true);need(intent.approvalDigest===digest(approval)&&stable(intent.before)===stable(JSON.parse((await rootFile(directory+'/before-state.private.json')).toString()))&&sha(await rootFile(directory+'/old-cursor.private.bin'))===intent.oldCursorSha256,'ARCHIVE_CHANGED');
  }
  const readback=await pool.connect();let readbackEnvioLock=false;try{if(step==='apply'){readbackEnvioLock=(await readback.query('SELECT pg_try_advisory_lock(84532,20261024) locked')).rows[0]?.locked===true;need(readbackEnvioLock,'ENVIO_APP_WRITER_RUNNING');}const state=await readAppMetadataRepairState(readback),status=(await readback.query('SELECT pg_xact_status($1::xid8) status',[intent!.transactionId])).rows[0]?.status;need(classifyAppMetadataCommit(status,state,intent!)==='COMMITTED_EXACT','COMMIT_NOT_EXACT_NO_REPLAY');await sourceAndCanonical(state,approval!);await finish(intent!);}finally{if(readbackEnvioLock)await readback.query('SELECT pg_advisory_unlock(84532,20261024)').catch(()=>{});readback.release();}
 }finally{if(lease){if(envioLocked)await lease.query('SELECT pg_advisory_unlock(84532,20261024)').catch(()=>{});lease.release();}if(writerOwned)await rmdir(writer);await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main().catch(error=>{console.error(JSON.stringify({status:'APP_METADATA_REPAIR_STOPPED_ROOT_REVIEW',code:/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:'APP_METADATA_REPAIR_FAILED',automaticRetry:false,financialAction:false}));process.exitCode=1;});
