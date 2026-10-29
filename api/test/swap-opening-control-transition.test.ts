import {test} from 'node:test';import assert from 'node:assert/strict';
import {continuationDigest as digest} from '../src/native-circle-continuation.ts';
import {validatePriorOperatorOpening,validatePriorControlTransition,type OperatorOpeningIntent,type OperatorOpeningApproval,type PriorControlTransitionEvidence} from '../src/swap-operator-opening-publication.ts';
import {validateServiceMetadataReceipt} from '../src/testnet-service-source-compat.ts';
import type {ClosedSnapshot} from '../src/integrations/observation/envio-closed-recovery.ts';
const h='a'.repeat(64),b='b'.repeat(64),at=()=>new Date().toISOString();
function fixture(){
 const from={epoch:'233',xmin:'1327',accepting_orders:false as const,dispatch_enabled:false as const,reconciliation_required:true as const},to={...from,epoch:'234',xmin:'27890'};
 const checkpoint={height:100,hash:h,finalizedHeight:90,finalizedTime:at(),observedAt:at(),xmin:'1328'};
 const books={orders:Array.from({length:70},(_,id)=>({id}))},rows=Array.from({length:269},(_,height)=>({height,blockHash:h}));
 const before:ClosedSnapshot={database:'zee_app_20261023',role:'zee_app_worker_20261023',control:from,checkpoint,books,rows,authorizationRows:0};
 const a:OperatorOpeningApproval={version:1,status:'ROOT_BASE_OPERATOR_SCOPE_OPENING_APPROVED',metadataOnly:true,financialAction:false,explicitHistoricalCoverageAmendment:true,
  profileSha256:'76711023c2313cf7e1e30382ea1591f5ff7721b56f68b3094ad7dd0f92ff8251',registrySha256:'56072db2d7b7f40b183257d07ac5384179dcff357c50610ce79feeebd13a3e69',handoffSha256:'394b2f41bafe98a7e165a8e33ce94232ad8726e160852deaf4e1e877b4d13b57',openingProofSha256:'9e2141e85105d881c82710a7f859545b6d8702666086bddeb247e71f887ab3c3',
  publicCommit:'6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc',collectorPublicCommit:'c'.repeat(40),operator:'0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087',
  evidenceSha256:b,archiveManifestSha256:h,retainedRowsSha256:digest(rows),financialDigest:digest(books),control:from,before:checkpoint,
  after:{height:300,hash:b,finalizedHeight:280,finalizedTime:at(),observedAt:at()},originalAdmissionSha256:h,generation:'synthetic-source',projectionDigest:h,
  unverifiedHistoricalInterval:{from:101,through:299},verifiedAt:at(),expiresAt:new Date(Date.now()+120000).toISOString()};
 const i:OperatorOpeningIntent={version:1,purpose:'BASE_OPERATOR_SCOPE_OPENING_METADATA',databaseSystemIdentifier:'7701863382450487342',approvalSha256:h,approval:a,
  transactionId:'25793',expectedXmin:'25793',before,after:{...a.after,xmin:'25793'},afterRows:rows,candidateAdmissionSha256:b,candidateAdmissionBase64:''};
 const current:ClosedSnapshot={...before,control:to,checkpoint:i.after};
 const pin=(name:string,sha256=h)=>({path:'/opt/zeeswap-testnet/state/service-policy/opening-primary-20261029-r3/'+name+'.private.json',sha256});
 const prior={approval:pin('approval'),intent:pin('publication-intent'),completed:pin('completed'),evidence:pin('evidence',b)};
 const canonical={height:4553220,hash:b,parentHash:h,time:at()};
 const t:PriorControlTransitionEvidence={certificate:{version:1,purpose:'ROOT_PRIOR_OPERATOR_OPENING_PAUSED_CONTROL_TRANSITION',status:'ROOT_PAUSED_CONTROL_TRANSITION_APPROVED',
  databaseSystemIdentifier:i.databaseSystemIdentifier!,priorTransactionId:'25793',priorOpening:prior,fromControl:from,toControl:to,controlTransactionId:'27890',
  financialDigest:a.financialDigest,financialRows:70,retainedRowsSha256:digest(rows),noRepair:pin('no-repair'),fatalDiagnostic:pin('diagnostic'),reconciliationOutcome:'ACKNOWLEDGED',
  verifiedAt:at(),expiresAt:new Date(Date.now()+120000).toISOString()},priorOpening:prior,controlTransactionStatus:'committed',
  noRepair:{version:1,status:'ROOT_NATIVE_NO_REPAIR_RESTART_VERIFIED',control:{epoch:'234',xmin:'27890'},financialDigest:a.financialDigest,allPersistedCanonical:true,
   verifiedPersistedHeaders:271,cursorSha256:h,persistedStateDigest:b,cursor:{processedThrough:4553218,tipHash:h},sqlMutation:false,cursorMutation:false,restartPerformed:false,
   currentSource:{generation:'13d3e6eb-ecfe-4159-8cde-b5d9ed00151e',checkpoint:{height:4553253,hash:h}},independentCore:{height:4553253,hash:h},displacedCandidateCanonical:canonical},
  fatalDiagnostic:{code:'CANONICAL_CHECKPOINT_MISMATCH',phase:'TRAVERSE',publicationAttempted:false,checkpointMismatch:{expectedCore:{height:4553220},actualHeader:canonical,
   freshCanonicalHeader:canonical,freshCanonicalFailure:null,recheckFailure:{message:'CHEF_CANONICAL_HEADER_FAILED'}}}};
 const r={version:1,status:'BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT',financialAction:false,completeContractHistory:false,approvalSha256:h,intentDigest:digest(i),transactionId:i.transactionId,
  checkpoint:i.after,retainedRowsSha256:a.retainedRowsSha256,evidenceSha256:a.evidenceSha256,archiveManifestSha256:a.archiveManifestSha256,unverifiedHistoricalInterval:a.unverifiedHistoricalInterval};
 const finalized={height:280,hash:'0x'+h,parentHash:'0x'+b,time:i.after.finalizedTime};
 const e={version:1,status:'ROOT_BASE_OPERATOR_SCOPE_OPENING_COLLECTED',profileSha256:a.profileSha256,registrySha256:a.registrySha256,operator:a.operator,
  financialDigest:a.financialDigest,retainedRowsSha256:a.retainedRowsSha256,archiveManifestSha256:a.archiveManifestSha256,before,after:a.after,
  selection:{selection:{verification:{finalized},range:{through:{height:300,hash:'0x'+b}}}}};
 return {a,i,r,e,current,t,finalized};
}
test('explicit Root transition accepts only the current-cluster paused control change; old strict path still refuses',()=>{
 const x=fixture();validatePriorControlTransition(x.t,x.i,x.a,x.current);
 assert.throws(()=>validatePriorOperatorOpening(x.r,x.i,x.a,h,x.e,'committed',x.current),/PRIOR_EXACT_COMMITTED/);
 assert.deepEqual(validatePriorOperatorOpening(x.r,x.i,x.a,h,x.e,'committed',x.current,undefined,undefined,undefined,x.t),x.finalized);
 validateServiceMetadataReceipt('baseMetadata',x.r,x.i,x.a,h);
});
test('transition refuses terminal-status uncertainty, origin identity, missing canonical proof and any publish/cursor movement',()=>{
 const changes:Array<(x:ReturnType<typeof fixture>)=>void>=[
  x=>{x.t.controlTransactionStatus='in progress';},x=>{x.t.controlTransactionStatus='aborted';},
  x=>{x.i.databaseSystemIdentifier='different';},x=>{x.i.transactionId='1337189';},
  x=>{x.t.certificate.priorOpening.evidence.sha256=h;},x=>{x.t.certificate.reconciliationOutcome='UNKNOWN' as any;},
  x=>{x.t.noRepair.allPersistedCanonical=false;},x=>{x.t.noRepair.sqlMutation=true;},x=>{x.t.noRepair.cursorMutation=true;},
  x=>{x.t.noRepair.cursor.processedThrough++;},x=>{x.t.fatalDiagnostic.publicationAttempted=true;},
  x=>{x.t.noRepair.independentCore.hash=b;},x=>{x.t.noRepair.currentSource.generation='other';},
  x=>{x.t.fatalDiagnostic.phase='AFTER_PUBLICATION';},x=>{x.t.fatalDiagnostic.checkpointMismatch.freshCanonicalFailure={};},
  x=>{x.t.fatalDiagnostic.checkpointMismatch.freshCanonicalHeader={height:4553220,hash:h};},
  x=>{x.t.certificate.expiresAt=new Date(Date.now()-1000).toISOString();},
 ];
 for(const change of changes){const x=fixture();change(x);assert.throws(()=>validatePriorControlTransition(x.t,x.i,x.a,x.current));}
});
test('transition cannot account for changes to checkpoint, retained rows, books, authorizations or control flags',()=>{
 for(const change of [
  (x:ReturnType<typeof fixture>)=>{x.current.checkpoint={...x.current.checkpoint,xmin:'27891'};},
  (x:ReturnType<typeof fixture>)=>{x.current.rows=structuredClone(x.current.rows);x.current.rows[0]!.blockHash=b;},
  (x:ReturnType<typeof fixture>)=>{x.current.books=structuredClone(x.current.books);x.current.books.orders[0]!.id=999;},
  (x:ReturnType<typeof fixture>)=>{x.current.authorizationRows=1;},
  (x:ReturnType<typeof fixture>)=>{x.current.control={...x.current.control,accepting_orders:true as any};},
  (x:ReturnType<typeof fixture>)=>{x.current.control={...x.current.control,xmin:'27891'};},
 ]){const x=fixture();change(x);assert.throws(()=>validatePriorControlTransition(x.t,x.i,x.a,x.current));}
 const x=fixture();assert.throws(()=>validatePriorOperatorOpening(x.r,x.i,x.a,h,x.e,'aborted',x.current,undefined,undefined,undefined,x.t),/PRIOR_EXACT_COMMITTED/);
});
