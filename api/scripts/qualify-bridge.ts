/** Root-permitted local qualification only. All instructions/capabilities remain
 * in a dedicated private artifact; no HTTP writer or implicit financial send. */
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {lstat,open,readFile,realpath,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {connectBridgeDatabase} from '../src/bridge/database.ts';
import {PrivateData,newAccessToken} from '../src/private-data.ts';
import {applyEvent} from '../src/bridge/model.ts';
import {BridgeService} from '../src/bridge/service.ts';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {CastBridgeBaseSigner,type SignedBridgeBase} from '../src/bridge/adapters/cast.ts';
import {pinnedFile} from '../src/bridge/adapters/profile.ts';
import {PinnedBridgeReadAdapter,createPausedBridge,BridgeMintCoordinator} from '../src/bridge/runtime.ts';
import {loadRootQualificationPermit,OperatorQualificationRuntime} from '../src/bridge/operator-qualification.ts';
import {BridgeReverseCoordinator} from '../src/bridge/reverse.ts';
import {approveNativeProfile} from '../src/bridge/native-profile.ts';
import {BridgeWorker} from '../src/bridge/worker.ts';
import {BridgeJournal} from '../src/bridge/journal.ts';
import {loadRootReplacementCertificate,UnfundedNativeProbe,ZeroExposureVerifier,UnfundedReplacementAuthority,RetirementAwareNativeRead,OperatorReplacementRuntime,ReplacementMintCoordinator} from '../src/bridge/unfunded-retirement.ts';

async function main(){
 const {values:v}=parseArgs({options:{config:{type:'string'},'config-sha256':{type:'string'},permit:{type:'string'},'permit-sha256':{type:'string'},action:{type:'string'},direction:{type:'string'},'replacement-certificate':{type:'string'},'replacement-sha256':{type:'string'}}});
 if(!!v['replacement-certificate']!==!!v['replacement-sha256'])throw Error('BRIDGE_REPLACEMENT_PIN_PAIR_REQUIRED');
 if(!v.config||!v['config-sha256']||!v.permit||!v['permit-sha256']||!['init-capability','open','quote','accept','close','refresh','payer-source-guard','mint-prepare','mint-broadcast','mint-observe','burn-prepare','burn-broadcast','burn-observe','native-approve','native-prepare','native-recover','native-broadcast','native-observe','ack-prepare','ack-broadcast','ack-observe'].includes(v.action??'')||process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_OPERATOR_ARGUMENTS');
 const binding=await loadRootQualificationPermit(v.permit,v['permit-sha256']),config=JSON.parse((await pinnedFile({path:v.config,sha256:v['config-sha256']},true)).toString());
 if(config.version!==1||config.mode!=='BRIDGE_READ_PAUSED_API'||config.root!=='/opt/zeeswap-bridge-testnet'||config.serviceUid!==process.getuid()||!v.config.startsWith(config.root+'/'))throw Error('BRIDGE_OPERATOR_CONFIG');
 const base=new CanonicalBridgeBase(JSON.parse((await pinnedFile(config.baseProfile,true)).toString())),underlying=await PinnedBridgeReadAdapter.create(config.native),pool=await connectBridgeDatabase(config.databaseUrl,config.databaseTransport);
 try{
  const identity=(await pool.query('SELECT current_database() AS database, current_user AS role')).rows[0];
  const context={databaseName:identity.database,databaseRole:identity.role,nativeReadProfileSha256:config.native.profile.sha256};
  const keys=new PrivateData(Buffer.from(config.payloadKeyHex,'hex'),Buffer.from(config.lookupKeyHex,'hex')),cast=config.castProfile?JSON.parse((await pinnedFile(config.castProfile,true)).toString()):undefined,plain=createPausedBridge(pool,keys,base,underlying);
  let authority:UnfundedReplacementAuthority|undefined;if(v['replacement-certificate']){if(!config.unfundedProbe||!cast)throw Error('BRIDGE_REPLACEMENT_PROBE_REQUIRED');const rb=await loadRootReplacementCertificate(v['replacement-certificate'],v['replacement-sha256']!);authority=await UnfundedReplacementAuthority.create(rb,binding,new ZeroExposureVerifier(plain.runtime,new UnfundedNativeProbe(config.unfundedProbe),cast.journalRoot));authority.assertBound(await plain.store.read());}
  const native=authority?new RetirementAwareNativeRead(underlying,authority):underlying,{store,runtime}=authority?createPausedBridge(pool,keys,base,native):plain,reverse=new BridgeReverseCoordinator(runtime,binding),operator=authority?new OperatorReplacementRuntime(base,native,binding,context,authority,reverse):new OperatorQualificationRuntime(base,native,binding,context,reverse),service=new BridgeService(store,operator);
  const mint=authority?new ReplacementMintCoordinator(runtime,authority):new BridgeMintCoordinator(runtime,{permitId:binding.permit.permitId,permitSha256:binding.sha256,forwardRecipient:binding.permit.forward.recipient,forwardRefundRecipient:binding.permit.forward.refundRecipient});
  const signer=cast?new CastBridgeBaseSigner(base,cast,keys,mint,reverse):undefined;if(signer)reverse.bindSigner(signer);
  const root=join(config.root,'operator'),dir=await lstat(root);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||dir.uid!==process.getuid()||await realpath(root)!==root)throw Error('BRIDGE_OPERATOR_PRIVATE_DIRECTORY');
  const path=join(root,binding.permit.permitId+(authority?'.replacement.'+authority.binding.certificate.certificateId:'')+'.private.json');
  const save=async(value:unknown,exclusive=false)=>{const tmp=exclusive?path:join(root,randomUUID()+'.tmp.private.json'),file=await open(tmp,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}try{if(!exclusive)await rename(tmp,path);const d=await open(root,'r');try{await d.sync();}finally{await d.close();}}catch(e){if(!exclusive)await unlink(tmp).catch(()=>{});throw e;}};
  if(v.action==='init-capability'){
   operator.assertAdmission();await save({version:1,permitId:binding.permit.permitId,permitSha256:binding.sha256,...(authority?{replacementCertificateSha256:authority.binding.sha256}:{}),directions:{TAZ_TO_ZEETAZ:{capability:newAccessToken(),idempotencyKey:randomUUID()},ZEETAZ_TO_TAZ:{capability:newAccessToken(),idempotencyKey:randomUUID()}}},true);
   console.log(JSON.stringify({status:'BRIDGE_OPERATOR_PRIVATE_CAPABILITY_CREATED'}));return;
  }
  const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>2*1024*1024||await realpath(path)!==path)throw Error('BRIDGE_OPERATOR_PRIVATE_ARTIFACT');
  const artifact=JSON.parse(await readFile(path,'utf8'));if(artifact.version!==1||artifact.permitId!==binding.permit.permitId||artifact.permitSha256!==binding.sha256||(authority&&artifact.replacementCertificateSha256!==authority.binding.sha256))throw Error('BRIDGE_OPERATOR_ARTIFACT_BINDING');
  if(v.action==='open'){await runtime.refreshPaused(store);await operator.openQualification(store);}
  else if(v.action==='close')await operator.closeQualification(store);
  else if(v.action==='refresh')await runtime.refreshPaused(store);
  else if(v.action==='payer-source-guard'){
   await runtime.refreshPaused(store);const b=await store.read();operator.assertOriginalBinding(b);const o=b.orders[artifact.directions.TAZ_TO_ZEETAZ.order?.id],f=o?.funding;
   if(!b.paused||b.incident||!o?.accepted||o.direction!=='TAZ_TO_ZEETAZ'||o.status!=='AWAITING_DEPOSIT'||o.amountAtomic!=='100000'||f?.kind!=='shielded-deposit'||Date.now()>=Date.parse(f.cutoffTime)||b.pair!.zcash.height>=f.cutoffHeight||!o.feeReservation||o.feeReservation.maximum!=='10000')throw Error('BRIDGE_PAYER_SOURCE_NOT_AUTHORIZED');
   console.log(JSON.stringify({status:'BRIDGE_PAYER_SOURCE_GUARD_VERIFIED',orderId:o.id,recipient:f.address,amountZatoshi:o.amountAtomic,memoSha256:createHash('sha256').update(f.memo).digest('hex'),cutoffHeight:f.cutoffHeight,cutoffTime:f.cutoffTime,...(authority?{replacementCertificateSha256:authority.binding.sha256}:{})}));return;
  }
  else if(v.action==='quote'||v.action==='accept'){
   if(!['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'].includes(v.direction??''))throw Error('BRIDGE_OPERATOR_DIRECTION');const direction=v.direction as 'TAZ_TO_ZEETAZ'|'ZEETAZ_TO_TAZ',entry=artifact.directions[direction];
   await operator.refreshOpen(store);
   if(v.action==='quote'){entry.quote=await service.quote(operator.input(direction),entry.capability,entry.idempotencyKey);await save(artifact);}
   else {try{if(!entry.quote?.id)throw Error('BRIDGE_OPERATOR_QUOTE_REQUIRED');entry.order=await service.accept(entry.quote.id,entry.capability,entry.idempotencyKey);await save(artifact);}finally{await operator.closeQualification(store);}}
  }else if(v.action!.startsWith('burn-')||v.action!.startsWith('native-')||v.action!.startsWith('ack-')){
   const id=artifact.directions.ZEETAZ_TO_TAZ.order?.id;if(!id||!signer)throw Error('BRIDGE_OPERATOR_ACCEPTED_REVERSE_REQUIRED');operator.assertOriginalBinding(await store.read());
   if(artifact.nativeProfile){const p=JSON.parse((await pinnedFile(artifact.nativeProfile.profile,true)).toString());reverse.bindNative(artifact.nativeProfile,p);}
   if(v.action==='native-approve'){if(!config.nativeSpend)throw Error('BRIDGE_NATIVE_TEMPLATE_REQUIRED');artifact.nativeProfile=await approveNativeProfile(store,runtime,binding,config.nativeSpend,id);await save(artifact);}
   else if(v.action==='burn-observe'){if(!artifact.burnPrepared)throw Error('BRIDGE_OPERATOR_ORIGINAL_BURN_REQUIRED');await reverse.observeBurn(store,id,artifact.burnPrepared.hash);await signer.reconcile(artifact.burnPrepared,(await store.read()).pair);}
   else if(v.action==='native-observe')await reverse.reconcileNative(store,id);
   else if(v.action==='native-prepare'||v.action==='native-recover'||v.action==='native-broadcast'){
    if(!artifact.nativeProfile)throw Error('BRIDGE_REVERSE_NATIVE_PROFILE_REQUIRED');await reverse.refreshPayout(store,id);
    const adapter=reverse.signerAdapter(new BridgeJournal(join(root,'native-journal'),keys),v.action==='native-recover'?'recover':'prepare'),worker=new BridgeWorker(store,runtime,adapter);
    if(v.action==='native-broadcast')await worker.broadcast(id);else await worker.prepare(id,'10000');
   }else if(v.action==='ack-observe'){if(!artifact.ackPrepared)throw Error('BRIDGE_OPERATOR_ORIGINAL_ACK_REQUIRED');await reverse.observeAck(store,id,artifact.ackPrepared.hash);await signer.reconcile(artifact.ackPrepared,(await store.read()).pair);}
   else {
    const burn=v.action!.startsWith('burn-'),phase=burn?'BURN':'ACK',key=burn?'burnPrepared':'ackPrepared';
    if(burn)await runtime.refreshPaused(store);else await reverse.reconcileNative(store,id);
    if(v.action!.endsWith('-prepare')){artifact[key]=await store.update(b=>signer.prepare(phase,b.orders[id],b));await save(artifact);}
    else {if(!artifact[key]||artifact[key].orderId!==id)throw Error('BRIDGE_OPERATOR_ORIGINAL_TRANSACTION_REQUIRED');artifact[burn?'burnSubmittedHash':'ackSubmittedHash']=await store.update(b=>signer.broadcast(artifact[key],b));await save(artifact);}
   }
  }else{
   const id=artifact.directions.TAZ_TO_ZEETAZ.order?.id;if(!id)throw Error('BRIDGE_OPERATOR_ACCEPTED_FORWARD_REQUIRED');
   if(!signer)throw Error('BRIDGE_OPERATOR_CAST_PROFILE_REQUIRED');
   if(v.action==='mint-observe'){
    const prepared=artifact.mintPrepared as SignedBridgeBase;if(!prepared||prepared.orderId!==id)throw Error('BRIDGE_OPERATOR_ORIGINAL_MINT_REQUIRED');
    await store.update(async b=>{operator.assertOriginalBinding(b);if(!b.paused)throw Error('BRIDGE_OPERATOR_PAUSED_MINT_REQUIRED');const {s,c}=await runtime.observe(b);b.pair={zcash:s.zcash,base:c.anchor};const event=await base.verify({kind:'MINT',transactionHash:prepared.hash},b.orders[id],b);applyEvent(b,event,Date.now());await runtime.recheck(b);await signer.reconcile(prepared,b.pair);});
   }else{
    await runtime.refreshPaused(store);
    if(v.action==='mint-prepare'){artifact.mintPrepared=await store.update(b=>signer.prepare('MINT',b.orders[id],b));await save(artifact);}
    else {const prepared=artifact.mintPrepared as SignedBridgeBase;if(!prepared||prepared.orderId!==id)throw Error('BRIDGE_OPERATOR_ORIGINAL_MINT_REQUIRED');artifact.mintSubmittedHash=await store.update(b=>signer.broadcast(prepared,b));await save(artifact);}
   }
  }
  console.log(JSON.stringify({status:'BRIDGE_OPERATOR_ACTION_RECORDED',action:v.action,admissionPublic:false}));
 }finally{await pool.end();}
}
main().catch(e=>{const code=e instanceof Error&&/^BRIDGE_[A-Z_]+$/.test(e.message)?e.message:'BRIDGE_OPERATOR_ACTION_REFUSED_RECONCILE';console.error(code);process.exitCode=1;});
