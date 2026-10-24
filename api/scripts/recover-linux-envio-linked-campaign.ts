/** ROOT explicit linked catchup. No financial action, source reset or parent write. */
import {readFile,open,mkdir,rename,rmdir,lstat,realpath,unlink,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {loadLinuxEnvioProfile,readLinuxEnvioPin} from '../src/linux-envio-profile.ts';
import {loadPrefundingEpochAuthority} from '../src/prefunding-epoch.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {parseAbi} from 'viem';
import {canonicalRpc} from '../src/integrations/observation/canonical-rpc.ts';
import {readJson} from '../src/integrations/observation/chef.ts';
import {fetchSelectedEnvioRange} from '../src/integrations/observation/envio-selected-export.ts';
import {requiredEnvioAnchors} from '../src/integrations/observation/envio-required-anchors.ts';
import {envioRecoveryTransport,validateEnvioRecovery,nextEnvioRecoveryRange,appendEnvioRecovery,recheckEnvioRecovery,completeEnvioRecovery,type EnvioRecoveryJournal} from '../src/integrations/observation/envio-recovery.ts';
import {rawSha,LINKED_PARENT,validateLinkedApproval,validateCompletedParent,readCampaignSnapshot,campaignBaselineSql,beginLinkedCampaign,publishLinkedCampaign,classifyLinkedCommit,finishLinkedFileBoundary,type LinkedCampaignApproval,type LinkedCampaignIntent} from '../src/integrations/observation/envio-linked-campaign.ts';
import {requireThat,digest,stable} from '../src/integrations/observation/types.ts';
const need=(v:unknown,c:string)=>requireThat(v,'ENVIO_LINKED_'+c),root='/opt/zeeswap-testnet',state=root+'/state/envio',marker=state+'/recovery-in-progress';
const [step,approvalPath,approvalSha,limitArg]=process.argv.slice(2),limit=Number(limitArg);
need(process.platform==='linux'&&process.getuid?.()===0&&['recover','publish','reconcile'].includes(step??'')&&/^[a-f0-9]{64}$/.test(approvalSha??'')&&approvalPath?.startsWith(state+'/')&&!approvalPath.slice((state+'/').length).includes('/')&&(step==='recover'?process.argv.length===6&&Number.isInteger(limit)&&limit>=1&&limit<=20:process.argv.length===5),'ROOT_EXPLICIT_ARGUMENTS');
async function rootBytes(path:string,max=134217728){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&s.size<=max&&await realpath(path)===path,'ROOT_PRIVATE_FILE');return readFile(path);}
async function newFile(path:string,bytes:Buffer){const fd=await open(path,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}await syncDir(path.slice(0,path.lastIndexOf('/')));}
async function syncDir(path:string){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function exists(path:string){try{await lstat(path);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
async function atomic(path:string,bytes:Buffer,service=false,beforeRename?:()=>Promise<void>){const temp=path+'.'+randomUUID()+'.tmp',fd=await open(temp,'wx',0o600);try{await fd.writeFile(bytes);if(service)await fd.chown(986,978);await fd.sync();}finally{await fd.close();}if(beforeRename)await beforeRename();await rename(temp,path);await syncDir(path.slice(0,path.lastIndexOf('/')));}
const approvalBytes=await rootBytes(approvalPath!,262144);need(rawSha(approvalBytes)===approvalSha,'APPROVAL_RAW_SHA');const approval=JSON.parse(approvalBytes.toString()) as LinkedCampaignApproval;
const{profile:p,runtime,registry,source,token}=await loadLinuxEnvioProfile(root+'/secrets/linux-envio-profile.private.json');
const operator=JSON.parse((await readLinuxEnvioPin(p.operatorProfile)).toString()),opening=JSON.parse((await readLinuxEnvioPin(operator.immutable.openingProof)).toString());
const handoff=JSON.parse((await readLinuxEnvioPin(p.relocationProof)).toString());need(handoff.status==='PREFUNDING_RELOCATION_VERIFIED'&&handoff.profileSha256===p.operatorProfile.sha256,'R9_HANDOFF');
const authority=await loadPrefundingEpochAuthority({profileSha256:p.operatorProfile.sha256,handoffSha256:p.relocationProof.sha256,openingProofSha256:operator.immutable.openingProof.sha256,openingEventId:opening.eventId});need(authority,'EXPLICIT_V2_AUTHORITY');
const transport=envioRecoveryTransport(source.policy,process.env.ZEESWAP_RECOVERY_RPC_PACING),identity={profileSha256:p.operatorProfile.sha256,handoffSha256:p.relocationProof.sha256,generation:source.generation,policy:transport.policy};
validateLinkedApproval(approval,{profileSha256:p.operatorProfile.sha256,handoffSha256:p.relocationProof.sha256,openingProofSha256:operator.immutable.openingProof.sha256,openingEventId:opening.eventId},authority!,identity);
const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),context='envio-funding-hints:br-broad-pine-ao79wemx:zee_app_20261023:v1',openAdmission=(b:Buffer)=>keys.open(b,context);
const{policy:_,...canonicalTransport}=transport,canonical=canonicalRpc(canonicalTransport),base=new BaseContract(registry);
async function parent(){const bytes={coverage:await rootBytes(LINKED_PARENT+'/coverage.private.json'),intent:await rootBytes(LINKED_PARENT+'/publication-intent.private.json'),completed:await rootBytes(LINKED_PARENT+'/completed.private.json'),originalAdmission:await rootBytes(LINKED_PARENT+'/original-admission.bin')};return validateCompletedParent(bytes,approval.parent,openAdmission,authority!,identity);}
async function staticEvidence(){
 need(rawSha(await rootBytes(approvalPath!,262144))===approvalSha,'APPROVAL_FILE_CHANGED');
 validateLinkedApproval(approval,{profileSha256:p.operatorProfile.sha256,handoffSha256:p.relocationProof.sha256,openingProofSha256:operator.immutable.openingProof.sha256,openingEventId:opening.eventId},authority!,identity);
 const inactive=await rootBytes(approval.observerInactiveProof.path,262144),capital=await rootBytes(approval.capitalProof.path,262144);need(rawSha(inactive)===approval.observerInactiveProof.sha256&&rawSha(capital)===approval.capitalProof.sha256,'ISSUANCE_EVIDENCE_RAW_PIN');
 const stopped=JSON.parse(inactive.toString()),capture=JSON.parse(capital.toString());
 need(stopped.version===1&&stopped.status==='ROOT_NORMAL_ENVIO_OBSERVER_STOPPED'&&stopped.normalObserverStopped===true&&Date.parse(approval.verifiedAt)-Date.parse(stopped.verifiedAt)>=-5000&&Date.parse(approval.verifiedAt)-Date.parse(stopped.verifiedAt)<=60000,'OBSERVER_INACTIVE_ISSUANCE');
 need(capture.version===1&&capture.status==='ROOT_LINKED_ENVIO_CAPITAL_VERIFIED'&&capture.profileSha256===approval.profileSha256&&capture.epoch===approval.epoch&&capture.runtimeXmin===approval.runtimeXmin&&stable(capture.capital)===stable(approval.capital)&&capture.latestOperatorNonce===0&&capture.pendingOperatorNonce===0&&capture.financialWorkersStopped===true&&Date.parse(approval.verifiedAt)-Date.parse(capture.verifiedAt)>=-5000&&Date.parse(approval.verifiedAt)-Date.parse(capture.verifiedAt)<=60000,'PHYSICAL_CAPITAL_ISSUANCE');
 const entries=await readdir('/proc');need(entries.length<=10000,'PROCESS_CAPACITY');for(const pid of entries)if(/^[0-9]+$/.test(pid)){let cmd='';try{cmd=(await readFile('/proc/'+pid+'/cmdline','utf8')).replaceAll('\0',' ');}catch{continue;}need(!(/(?:observe-linux-envio|dispatch-linux-testnet|reverse-linux-testnet|refund-linux-testnet)\.ts/.test(cmd)),'APP_WRITER_RUNNING');}
}
async function baseCapital(){const heads=await base.heads(),address=registry.contracts.ZeeSwapSettlement.address,abi=parseAbi(['function inventory() view returns(uint256)','function availableInventory() view returns(uint256)','function reservedInventory() view returns(uint256)','function escrowLiability() view returns(uint256)']);
 const[latest,pending,gas,...values]=await Promise.all([base.client.getTransactionCount({address:registry.operator,blockTag:'latest'}),base.client.getTransactionCount({address:registry.operator,blockTag:'pending'}),base.client.getBalance({address:registry.operator,blockNumber:heads.finalized.number}),...(['inventory','availableInventory','reservedInventory','escrowLiability'] as const).map(functionName=>base.client.readContract({address,abi,functionName,blockNumber:heads.finalized.number}))]);need(latest===0&&pending===0&&gas.toString()===approval.capital.gasWei&&stable(values.map(String))===stable([approval.capital.inventory,approval.capital.available,approval.capital.reserved,approval.capital.liability]),'CURRENT_BASE_CAPITAL_OR_NONCE');}
const directory=state+'/catchup-'+approvalSha,journalPath=directory+'/coverage.private.json',intentPath=directory+'/publication-intent.private.json',markerBytes=Buffer.from('linked-catchup:'+approvalSha+'\n');
const pool=connect(runtime.workerUrl,2),lease=await pool.connect();let locked=false,fileLocked=false,lost=false;lease.on('error',()=>{lost=true;});
async function leaseGuard(){need(!lost,'LEASE_LOST');await lease.query('SELECT 1');need(!lost,'LEASE_LOST');}
async function guard(){await leaseGuard();await staticEvidence();await parent();const s=await readCampaignSnapshot(lease,authority!);await leaseGuard();return s;}
async function admission(){const s=await lstat(p.admissionPath);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===986&&s.gid===978&&(s.mode&0o777)===0o600&&await realpath(p.admissionPath)===p.admissionPath,'ACTIVE_ADMISSION_OWNER');return readFile(p.admissionPath);}
async function baseline(){const s=await guard();need(stable(s.checkpoint)===stable(approval.baseline)&&rawSha(await admission())===approval.activeAdmissionSha256,'BASELINE_INTERVENTION');return s;}
async function anchors(j:EnvioRecoveryJournal){const needed=await requiredEnvioAnchors(lease as unknown as pg.Pool,j.originalAdmission.hints),signal=AbortSignal.timeout(30000);for(let i=0;i<needed.length;i+=10){const page=needed.slice(i,i+10),actual=await canonical.headers!(page.map(a=>Number(a.height)),signal);need(actual.length===page.length&&actual.every((h,n)=>h.height===Number(page[n]!.height)&&(page[n]!.expected_hash===null||page[n]!.expected_hash===h.hash.slice(2))),'CURRENT_CANONICAL_ANCHOR');}}
async function finish(intent:LinkedCampaignIntent){
 await lease.query('BEGIN');try{await lease.query('SELECT zee.lock_observer_cycle()');
 const state=await guard(),status=(await lease.query('SELECT pg_xact_status($1::xid8) status',[intent.transactionId])).rows[0]?.status;need(classifyLinkedCommit(status,state,intent)==='COMMITTED_EXACT','COMMIT_NOT_CONFIRMED_NO_REPLAY');
 const candidate=Buffer.from(intent.candidateAdmissionBase64,'base64');let active:Buffer;need(rawSha(candidate)===intent.candidateAdmissionSha256,'CANDIDATE_RAW_CHANGED');
 const completed={version:1,status:'ENVIO_LINKED_CAMPAIGN_COMMITTED_EXACT',approvalSha256:approvalSha,parent:approval.parent,intentDigest:digest(intent),checkpoint:state.checkpoint,financialAction:false};
 await finishLinkedFileBoundary(status,state,intent,{
  leaseGuard,
  async readAdmission(){active=await admission();need([intent.originalAdmissionSha256,intent.candidateAdmissionSha256].includes(rawSha(active)),'ADMISSION_INTERVENTION');},
  async installAdmission(){if(rawSha(active)!==intent.candidateAdmissionSha256)await atomic(p.admissionPath,candidate,true,leaseGuard);need(rawSha(await admission())===intent.candidateAdmissionSha256,'ADMISSION_INSTALL_RESULT');},
  async writeCompletion(){if(await exists(directory+'/completed.private.json'))need(stable(JSON.parse((await rootBytes(directory+'/completed.private.json')).toString()))===stable(completed),'COMPLETION_INTERVENTION');else await newFile(directory+'/completed.private.json',Buffer.from(JSON.stringify(completed)+'\n'));need((await rootBytes(marker,4096)).equals(markerBytes),'MARKER_INTERVENTION');},
  async removeMarker(){await unlink(marker);await syncDir(stateRoot());},
 });
 await lease.query('COMMIT');
 }catch(e){await lease.query('ROLLBACK').catch(()=>{});throw e;}
}
function stateRoot(){return root+'/state/envio';}
try{
 locked=(await lease.query('SELECT pg_try_advisory_lock(84532,20261024) locked')).rows[0]?.locked===true;need(locked,'NORMAL_CONSUMER_OR_OTHER_RECOVERY_RUNNING');await staticEvidence();await parent();await readCampaignSnapshot(lease,authority!);
 if(!await exists(directory)){need(step==='recover','NEW_CAMPAIGN_RECOVER_ONLY');await mkdir(directory,{mode:0o700});await syncDir(state);}
 const ds=await lstat(directory);need(ds.isDirectory()&&!ds.isSymbolicLink()&&ds.uid===0&&(ds.mode&0o077)===0&&await realpath(directory)===directory,'CAMPAIGN_DIRECTORY');
 await mkdir(directory+'/writer.lock',{mode:0o700});fileLocked=true;
 need(!await exists(directory+'/completed.private.json')||await exists(marker),'ALREADY_COMPLETED_READ_RECEIPT_NO_REPLAY');
 if(await exists(marker))need((await rootBytes(marker,4096)).equals(markerBytes),'OTHER_RECOVERY_MARKER');else await newFile(marker,markerBytes);
 let j:EnvioRecoveryJournal;
 if(!await exists(journalPath)){
  need(step==='recover'&&!await exists(intentPath),'NEW_JOURNAL_RECOVER_ONLY');const s=await baseline(),bytes=await admission();
  const canonicalBaseline=await canonical.header(approval.baseline.height,AbortSignal.timeout(30000));need(canonicalBaseline.hash==='0x'+approval.baseline.hash&&stable(canonicalBaseline)===stable(approval.baselineCanonical),'CURRENT_BASELINE_CANONICAL');
  j=beginLinkedCampaign(approval,identity,bytes,openAdmission(bytes) as any,s);
  await newFile(directory+'/original-admission.bin',bytes);await newFile(directory+'/parent-link.private.json',Buffer.from(JSON.stringify({version:1,parentDirectory:LINKED_PARENT,parent:approval.parent,approvalSha256:approvalSha})+'\n'));await newFile(journalPath,Buffer.from(JSON.stringify(j)+'\n'));
 }else j=JSON.parse((await rootBytes(journalPath)).toString());
 validateEnvioRecovery(j,identity);need(j.originalAdmissionSha256===approval.activeAdmissionSha256&&rawSha(await rootBytes(directory+'/original-admission.bin'))===j.originalAdmissionSha256,'CAMPAIGN_ARCHIVE_INTERVENTION');
 const approvedSql=campaignBaselineSql(approval.baseline);need(stable(j.originalSql)===stable(approvedSql),'CAMPAIGN_ORIGINAL_SQL');
 need(stable(JSON.parse((await rootBytes(directory+'/parent-link.private.json')).toString()))===stable({version:1,parentDirectory:LINKED_PARENT,parent:approval.parent,approvalSha256:approvalSha}),'PARENT_LINK_INTERVENTION');
 await recheckEnvioRecovery(j,canonical);await anchors(j);
 if(await exists(intentPath)){
  need(step==='reconcile','PENDING_INTENT_RECONCILE_ONLY');const intent=JSON.parse((await rootBytes(intentPath)).toString()) as LinkedCampaignIntent;
  need(intent.version===1&&intent.purpose===approval.purpose&&intent.approvalSha256===approvalSha&&stable(intent.parent)===stable(approval.parent)&&intent.journalDigest===digest(j)&&intent.originalAdmissionSha256===j.originalAdmissionSha256&&stable(intent.before)===stable(approval.baseline)&&intent.control.epoch===approval.epoch&&intent.control.xmin===approval.runtimeXmin,'INTENT_BINDING');
  need(/^[1-9][0-9]*$/.test(intent.transactionId)&&intent.expectedXmin===(BigInt(intent.transactionId)%4294967296n).toString(),'INTENT_XID');
  const last=j.proofs.at(-1)!.selection,complete=completeEnvioRecovery(j,Math.max(Date.parse(last.range.readCompletedAt),Date.parse(last.verification.checkedAt))),candidate=Buffer.from(intent.candidateAdmissionBase64,'base64');
  need(rawSha(candidate)===intent.candidateAdmissionSha256&&stable(openAdmission(candidate))===stable(complete.admission)&&intent.after.height===complete.sql.height&&intent.after.hash===complete.sql.hash&&intent.after.finalizedHeight===complete.sql.finalizedHeight&&Date.parse(intent.after.finalizedTime)===Date.parse(complete.sql.finalizedTime)&&Date.parse(intent.after.observedAt)===Date.parse(complete.sql.observedAt)&&intent.after.xmin===intent.expectedXmin,'INTENT_COMPLETE_CANDIDATE');
  await baseCapital();await finish(intent);
 }else{
  need(step!=='reconcile','NO_DURABLE_INTENT');await baseline();
  if(step==='recover')for(let n=0;n<limit;n++){
   need(j.proofs.length<1024,'HISTORICAL_PROOF_LIMIT');await baseline();await baseCapital();
   const signal=AbortSignal.timeout(10000),response=await fetch(p.sourceUrl+'/zee-observation/status',{headers:{authorization:'Bearer '+token},redirect:'error',signal});need(response.ok,'WAIT_ENVIO_STATUS');const status=await readJson(response,signal) as any;
   need(status.protocol==='zee-envio-status-v1'&&status.checkpoint?.generation===source.generation&&status.checkpoint.complete===true,'SOURCE_STATUS');
   const range=nextEnvioRecoveryRange(j,status.checkpoint.through.height);if(j.proofs.at(-1)?.selection.range.through.height===status.checkpoint.through.height)break;
   const selection=await fetchSelectedEnvioRange(p.sourceUrl,token,range.from,'latest',transport.policy,canonical);await baseline();j=appendEnvioRecovery(j,selection);await atomic(journalPath,Buffer.from(JSON.stringify(j)+'\n'));
   console.log(JSON.stringify({status:'ENVIO_LINKED_PRIVATE_CHUNK',proofs:j.proofs.length,through:selection.range.through.height,sqlMutation:false,financialAction:false}));
  }else{
   await baseline();await baseCapital();await anchors(j);await recheckEnvioRecovery(j,canonical);const complete=completeEnvioRecovery(j),candidate=keys.seal(complete.admission,context);
   // Intent persistence is inside the publication transaction, before any INSERT/UPDATE.
   const intent=await publishLinkedCampaign(lease,guard,j,approvalSha!,approval,candidate,openAdmission,i=>newFile(intentPath,Buffer.from(JSON.stringify(i)+'\n')));
   await finish(intent);
  }
 }
 console.log(JSON.stringify({status:'ENVIO_LINKED_COMMAND_FINISHED',step,proofs:j.proofs.length,financialAction:false}));
}finally{if(fileLocked)await rmdir(directory+'/writer.lock');if(locked)await lease.query('SELECT pg_advisory_unlock(84532,20261024)').catch(()=>{});lease.release();await pool.end();}
