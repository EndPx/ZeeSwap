/** Root-only completion of one original committed metadata transaction. No
 * checkpoint/control DML, service start, signing, or fresh admission authority. */
import {readFile,lstat,realpath,open,mkdir,rmdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';import {dirname,resolve} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import {loadLinuxChefRuntime} from './recover-linux-chef.ts';import {loadLinuxEnvioObservationProfile} from '../src/linux-envio-event-first-profile.ts';
import {connect} from '../src/db.ts';import {PrivateData} from '../src/private-data.ts';
import {closedSnapshotSql,type ClosedSnapshot} from '../src/integrations/observation/envio-closed-recovery.ts';
import {continuationDigest} from '../src/native-circle-continuation.ts';import {stable} from '../src/integrations/observation/types.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {operatorOpeningAdmission,validateOperatorOpeningApproval,finishOperatorOpeningUnderObserverLock,type OriginalOpeningFinishAckEvidence,type OperatorOpeningIntent} from '../src/swap-operator-opening-publication.ts';
type Pin={path:string;sha256:string};const root='/opt/zeeswap-testnet',sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,code:string):asserts v{if(!v)throw Error('ORIGINAL_OPENING_FINISH_'+code);}
async function pin(p:Pin,code=false){need(p&&p.path.startsWith(root+'/')&&!p.path.includes('..')&&/^[a-f0-9]{64}$/.test(p.sha256),'PIN');const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&await realpath(p.path)===p.path&&(s.mode&(code?0o022:0o077))===0&&s.size<=16000000,'ROOT_FILE');const raw=await readFile(p.path);need(sha(raw)===p.sha256,'RAW_CHANGED');return raw;}
async function save(p:string,value:unknown){const f=await open(p,'wx',0o600);try{await f.writeFile(JSON.stringify(value)+'\n');await f.sync();}finally{await f.close();}const d=await open(dirname(p),'r');try{await d.sync();}finally{await d.close();}}
export async function finishOriginalOpening(configPath:string,configSha256:string){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.execPath==='/usr/bin/node','ROOT_ONLY');
 const cfg=JSON.parse((await pin({path:configPath,sha256:configSha256})).toString());need(cfg.version===1&&cfg.status==='ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_CONFIG'&&/^[a-f0-9]{40}$/.test(cfg.finishCollectorPublicCommit)&&Array.isArray(cfg.codePins)&&cfg.codePins.length>0&&cfg.codePins.length<=300,'CONFIG');
 for(const url of[import.meta.url,new URL('../src/swap-operator-opening-publication.ts',import.meta.url).href])need(cfg.codePins.some((p:Pin)=>p.path===fileURLToPath(url)),'FINISH_CODE_PIN');
 const repin=async()=>{await pin({path:configPath,sha256:configSha256});for(const p of cfg.codePins)await pin(p,true);};await repin();
 const certificate=JSON.parse((await pin(cfg.certificate)).toString()),i=JSON.parse((await pin(certificate.originalIntent)).toString())as OperatorOpeningIntent;
 const a=JSON.parse((await pin(certificate.originalApproval)).toString()),e=JSON.parse((await pin(certificate.originalEvidence)).toString()),original=JSON.parse((await pin(certificate.originalConfig)).toString());
 need(stable(i.approval)===stable(a)&&i.approvalSha256===certificate.originalApproval.sha256&&a.evidenceSha256===certificate.originalEvidence.sha256&&e.configSha256===certificate.originalConfig.sha256&&a.publicCommit===original.publicCommit&&a.publicCommit==='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc','ORIGINAL_DOCUMENTS');validateOperatorOpeningApproval(a,Date.parse(a.verifiedAt));
 const directory=original.directory;need(directory===root+'/state/service-policy/opening-primary-20261029-r8'&&certificate.originalIntent.path===directory+'/publication-intent.private.json','ORIGINAL_DIRECTORY');
 const ack:OriginalOpeningFinishAckEvidence={certificate,certificatePin:cfg.certificate,nativeBoundary:JSON.parse((await pin(certificate.nativeBoundary)).toString()),fatalDiagnostic:JSON.parse((await pin(certificate.fatalDiagnostic)).toString())};
 const chef=await loadLinuxChefRuntime(root+'/secrets/chef-runtime.private.json'),envio=await loadLinuxEnvioObservationProfile(root+'/secrets/linux-envio-profile.private.json'),pool=connect(chef.runtime.workerUrl,1),c=await pool.connect();
 const keys=new PrivateData(Buffer.from(chef.runtime.payloadKeyHex,'hex'),Buffer.from(chef.runtime.lookupKeyHex,'hex')),context='envio-funding-hints:br-broad-pine-ao79wemx:zee_app_20261023:v1';
 need(chef.profileSha256===a.profileSha256&&chef.profile.immutable.registry.sha256===a.registrySha256&&envio.profile.relocationProof.sha256===a.handoffSha256,'ORIGINAL_PROFILE');
 await mkdir(directory+'/writer.lock',{mode:0o700});
 try{
  await finishOperatorOpeningUnderObserverLock(c,async()=>(await c.query(closedSnapshotSql)).rows[0]as ClosedSnapshot,i,async()=>{
   await repin();await pin(cfg.certificate);await pin(certificate.nativeBoundary);await pin(certificate.fatalDiagnostic);
   const native=(await c.query("SELECT scanned_height::integer height,tip_hash hash,finalized_height::integer finalized FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0],cursorPath=chef.c.recoveryDirectory+'/live-cursor.private.json',cursorStat=await lstat(cursorPath);need(cursorStat.isFile()&&!cursorStat.isSymbolicLink()&&(cursorStat.mode&0o077)===0&&await realpath(cursorPath)===cursorPath,'NATIVE_CURSOR_FILE');const cursorRaw=await readFile(cursorPath);
   need(native?.height===ack.nativeBoundary.nativeSql.height&&native.hash===ack.nativeBoundary.nativeSql.hash&&native.finalized===ack.nativeBoundary.nativeSql.finalizedHeight&&sha(cursorRaw)===ack.nativeBoundary.cursorSha256,'NATIVE_BOUNDARY_CHANGED');
   const reader=localChefCanonical(chef.c.pythonPath,[chef.c.headerScript,'--config',chef.c.decoderConfigPath],chef.c.canonicalSourceId);
   need((await reader.header(native.height,AbortSignal.timeout(15000))).hash===native.hash&&(await reader.header(native.finalized,AbortSignal.timeout(15000))).hash===ack.nativeBoundary.nativeSql.finalizedHash,'NATIVE_BOUNDARY_CANONICAL');
   const admissionStat=await lstat(envio.profile.admissionPath);need(admissionStat.isFile()&&!admissionStat.isSymbolicLink()&&(admissionStat.mode&0o077)===0&&await realpath(envio.profile.admissionPath)===envio.profile.admissionPath,'ADMISSION_FILE');const current=await readFile(envio.profile.admissionPath),candidate=Buffer.from(i.candidateAdmissionBase64,'base64');need(sha(candidate)===i.candidateAdmissionSha256&&stable(keys.open(candidate,context))===stable(operatorOpeningAdmission(a,i.approvalSha256)),'ORIGINAL_CANDIDATE');
   need(sha(current)===a.originalAdmissionSha256||sha(current)===i.candidateAdmissionSha256,'ADMISSION_INTERVENED');
   if(sha(current)!==i.candidateAdmissionSha256){const s=await lstat(envio.profile.admissionPath),tmp=envio.profile.admissionPath+'.'+randomUUID()+'.tmp',f=await open(tmp,'wx',s.mode&0o777);try{await f.chown(s.uid,s.gid);await f.writeFile(candidate);await f.sync();}finally{await f.close();}await rename(tmp,envio.profile.admissionPath);const d=await open(dirname(envio.profile.admissionPath),'r');try{await d.sync();}finally{await d.close();}}
  },ack);
  const receipt={version:1,status:'BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT',financialAction:false,completeContractHistory:false,approvalSha256:i.approvalSha256,intentDigest:continuationDigest(i),transactionId:i.transactionId,checkpoint:i.after,retainedRowsSha256:a.retainedRowsSha256,evidenceSha256:a.evidenceSha256,archiveManifestSha256:a.archiveManifestSha256,unverifiedHistoricalInterval:a.unverifiedHistoricalInterval,
   controlAcknowledgement:{certificate:cfg.certificate,control:certificate.toControl,controlTransactionId:certificate.controlTransactionId,finishCollectorPublicCommit:cfg.finishCollectorPublicCommit,nativeReadinessClaimed:false,admissionEnabled:false}};
  await save(directory+'/completed.private.json',receipt);return {status:receipt.status,transactionId:i.transactionId,controlAcknowledgement:receipt.controlAcknowledgement,sqlMutation:false};
 }finally{c.release();await pool.end();await rmdir(directory+'/writer.lock');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[path,rawSha]=process.argv.slice(2);finishOriginalOpening(path!,rawSha!).then(v=>console.log(JSON.stringify(v))).catch(()=>{console.error('ORIGINAL_OPENING_FINISH_REFUSED_NO_REPLAY');process.exitCode=1;});}
