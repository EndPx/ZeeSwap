/** Root-reviewed zero-exposure collection/retirement. No signing or broadcast. */
import {parseArgs} from 'node:util';
import {open,lstat} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {connectBridgeDatabase} from '../src/bridge/database.ts';
import {PrivateData} from '../src/private-data.ts';
import {createPausedBridge,PinnedBridgeReadAdapter} from '../src/bridge/runtime.ts';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {pinnedFile} from '../src/bridge/adapters/profile.ts';
import {loadRootQualificationPermit} from '../src/bridge/operator-qualification.ts';
import {digest} from '../src/bridge/model.ts';
import {UnfundedNativeProbe,ZeroExposureVerifier,loadRootReplacementCertificate,UnfundedReplacementAuthority} from '../src/bridge/unfunded-retirement.ts';

async function main(){
 const {values:v}=parseArgs({options:{config:{type:'string'},'config-sha256':{type:'string'},permit:{type:'string'},'permit-sha256':{type:'string'},action:{type:'string'},'order-id':{type:'string'},output:{type:'string'},'certificate-draft-output':{type:'string'},certificate:{type:'string'},'certificate-sha256':{type:'string'}}});
 if(!v.config||!v['config-sha256']||!v.permit||!v['permit-sha256']||!['collect','retire','observe-late'].includes(v.action??'')||process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_UNFUNDED_ARGUMENTS');
 const config=JSON.parse((await pinnedFile({path:v.config,sha256:v['config-sha256']},true)).toString()),original=await loadRootQualificationPermit(v.permit,v['permit-sha256']);
 if(config.mode!=='BRIDGE_READ_PAUSED_API'||config.root!=='/opt/zeeswap-bridge-testnet'||config.serviceUid!==process.getuid()||!config.unfundedProbe||digest(config.unfundedProbe.readProfile)!==digest(config.native.profile))throw Error('BRIDGE_UNFUNDED_CONFIG_SCOPE');
 const pool=await connectBridgeDatabase(config.databaseUrl,config.databaseTransport);try{
  const keys=new PrivateData(Buffer.from(config.payloadKeyHex,'hex'),Buffer.from(config.lookupKeyHex,'hex')),native=await PinnedBridgeReadAdapter.create(config.native),base=new CanonicalBridgeBase(JSON.parse((await pinnedFile(config.baseProfile,true)).toString())),{store,runtime}=createPausedBridge(pool,keys,base,native),cast=JSON.parse((await pinnedFile(config.castProfile,true)).toString()),verifier=new ZeroExposureVerifier(runtime,new UnfundedNativeProbe(config.unfundedProbe),cast.journalRoot);
  if(v.action==='collect'){
   if(!v['order-id']||!v.output?.startsWith(config.root+'/operator/retirement/'))throw Error('BRIDGE_UNFUNDED_PROOF_OUTPUT');const before=await store.read(),proof=await verifier.collect(before,original,v['order-id']);if(digest(before)!==digest(await store.read()))throw Error('BRIDGE_UNFUNDED_BOOK_CHANGED_DURING_COLLECTION');
   const parent=await lstat(dirname(v.output));if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077)!==0||parent.uid!==process.getuid())throw Error('BRIDGE_UNFUNDED_PRIVATE_PROOF_DIRECTORY');const bytes=Buffer.from(JSON.stringify(proof)),f=await open(v.output,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}const proofPin={path:v.output,sha256:createHash('sha256').update(bytes).digest('hex')};let draftPin;
   if(v['certificate-draft-output']){const path=v['certificate-draft-output'];if(dirname(path)!==dirname(v.output))throw Error('BRIDGE_UNFUNDED_DRAFT_OUTPUT');const now=Date.now(),certificate={version:1,purpose:'ROOT_BRIDGE_ZERO_EXPOSURE_REPLACEMENT',certificateId:randomUUID(),createdAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+7200000,Date.parse(original.permit.expiresAt))).toISOString(),originalPermitId:original.permit.permitId,originalPermitSha256:original.sha256,originalOrderId:proof.originalOrder.id,originalOrderSha256:proof.originalOrderSha256,originalBookSha256:proof.originalBookSha256,closureProof:proofPin,readProfile:config.native.profile,probe:config.unfundedProbe,amountAtomic:'100000',maxFeeAtomic:'10000',maxReplacementAttempts:1,unusedFeeReleaseAtomic:'10000',physicalFeeAtomic:'30000'},data=Buffer.from(JSON.stringify(certificate)),file=await open(path,'wx',0o600);try{await file.writeFile(data);await file.sync();}finally{await file.close();}draftPin={path,sha256:createHash('sha256').update(data).digest('hex')};}
   const d=await open(dirname(v.output),'r');try{await d.sync();}finally{await d.close();}console.log(JSON.stringify({status:proof.status,proof:proofPin,certificateDraft:draftPin,rootApprovalInstalled:false,sourceWindowCanonicalHeight:proof.paired.zcash.height,sqlWrites:false}));return;
  }
  if(!v.certificate||!v['certificate-sha256'])throw Error('BRIDGE_ROOT_REPLACEMENT_CERTIFICATE_REQUIRED');const binding=await loadRootReplacementCertificate(v.certificate,v['certificate-sha256']),authority=await UnfundedReplacementAuthority.create(binding,original,verifier);
  console.log(JSON.stringify(v.action==='retire'?await authority.retire(store):await authority.observeLate(store)));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error&&/^BRIDGE_[A-Z_]+$/.test(e.message)?e.message:'BRIDGE_UNFUNDED_OPERATION_REFUSED');process.exitCode=1;});
