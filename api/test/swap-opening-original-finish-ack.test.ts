import {test} from 'node:test';import assert from 'node:assert/strict';
import {continuationDigest as digest} from '../src/native-circle-continuation.ts';
import {finishOperatorOpeningUnderObserverLock,validateOriginalOpeningFinishAcknowledgement,validateOperatorOpeningReceipt,validatePriorOperatorOpening,type OperatorOpeningIntent,type OriginalOpeningFinishAckEvidence,type OperatorOpeningApproval} from '../src/swap-operator-opening-publication.ts';
import {requireOpeningFinishAckArchives} from '../scripts/swap-operator-opening.ts';
import {validateServiceMetadataReceipt} from '../src/testnet-service-source-compat.ts';
const h='a'.repeat(64),b='b'.repeat(64);
function fixture(){
 const now=Date.now(),at=new Date(now).toISOString(),from={epoch:'234',xmin:'27890',accepting_orders:false as const,dispatch_enabled:false as const,reconciliation_required:true as const},to={...from,epoch:'235',xmin:'43503'};
 const checkpoint={height:100,hash:h,finalizedHeight:90,finalizedTime:at,observedAt:at,xmin:'39333'},books={orders:Array.from({length:70},(_,id)=>({id}))},rows=Array.from({length:269},(_,height)=>({height,blockHash:h})),before={database:'zee_app_20261023',role:'zee_app_worker_20261023',control:from,checkpoint,books,rows,authorizationRows:0};
 const a:OperatorOpeningApproval={version:1,status:'ROOT_BASE_OPERATOR_SCOPE_OPENING_APPROVED',metadataOnly:true,financialAction:false,explicitHistoricalCoverageAmendment:true,profileSha256:'76711023c2313cf7e1e30382ea1591f5ff7721b56f68b3094ad7dd0f92ff8251',registrySha256:'56072db2d7b7f40b183257d07ac5384179dcff357c50610ce79feeebd13a3e69',handoffSha256:'394b2f41bafe98a7e165a8e33ce94232ad8726e160852deaf4e1e877b4d13b57',openingProofSha256:'9e2141e85105d881c82710a7f859545b6d8702666086bddeb247e71f887ab3c3',publicCommit:'6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc',collectorPublicCommit:'c'.repeat(40),operator:'0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087',evidenceSha256:b,archiveManifestSha256:h,retainedRowsSha256:digest(rows),financialDigest:digest(books),control:from,before:checkpoint,after:{height:300,hash:b,finalizedHeight:280,finalizedTime:at,observedAt:at},originalAdmissionSha256:h,generation:'synthetic',projectionDigest:h,unverifiedHistoricalInterval:{from:101,through:299},verifiedAt:at,expiresAt:new Date(now+120000).toISOString()};
 const i:OperatorOpeningIntent={version:1,purpose:'BASE_OPERATOR_SCOPE_OPENING_METADATA',databaseSystemIdentifier:'7701863382450487342',approvalSha256:h,approval:a,transactionId:'43498',expectedXmin:'43498',before,after:{...a.after,xmin:'43498'},afterRows:rows,candidateAdmissionSha256:b,candidateAdmissionBase64:''};
 const pin=(name:string,sha256=h)=>({path:'/opt/zeeswap-testnet/state/'+name+'.private.json',sha256});
 const ack:OriginalOpeningFinishAckEvidence={certificate:{version:1,purpose:'ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_CONTROL_ACK',status:'ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_APPROVED',databaseSystemIdentifier:i.databaseSystemIdentifier!,originalTransactionId:'43498',originalIntent:pin('intent'),originalApproval:pin('approval'),originalEvidence:pin('evidence',b),originalConfig:pin('config'),fromControl:from,toControl:to,controlTransactionId:'43503',financialDigest:a.financialDigest,retainedRowsSha256:a.retainedRowsSha256,originalAdmissionSha256:h,candidateAdmissionSha256:b,nativeBoundary:pin('boundary'),fatalDiagnostic:pin('fatal'),reconciliationOutcome:'ACKNOWLEDGED',financialAction:false,admissionEnabled:false,nativeReadinessClaimed:false,verifiedAt:at,expiresAt:new Date(now+120000).toISOString()},certificatePin:pin('ack'),nativeBoundary:{version:1,status:'ROOT_NATIVE_FS_BOUNDARY_READ_ONLY_VERIFIED',control:to,cursor:{processedThrough:4553427,tipHash:h},cursorSha256:h,nativeSql:{height:4553427,hash:h,finalizedHeight:4553418,finalizedHash:b},canonicalTip:{height:4553427,hash:h},canonicalFinalized:{height:4553418,hash:b},sqlMutation:false,cursorMutation:false,nativeReadinessClaimed:false},fatalDiagnostic:{code:'CANONICAL_HEAD_CHANGED',phase:'VERIFY_ANCHORS',publicationAttempted:false,headChange:{expected:{height:4553429},actual:{height:4553429},phase:'anchor-recheck',recheckFailure:{message:'CHEF_CANONICAL_HEADER_FAILED'}}}};
 return {a,i,ack,current:{...before,checkpoint:i.after,control:to}};
}
test('original43498 FS finish permits only the explicit235 acknowledgement; strict path still refuses',async()=>{
 const x=fixture(),queries:string[]=[];let writes=0,fs='original';
 const c={async query(sql:string,args?:unknown[]){queries.push(sql);return{rows:sql.includes('pg_try_advisory')?[{ok:true}]:sql.includes('pg_xact_status')?[{status:'committed'}]:[]};}};
 await assert.rejects(finishOperatorOpeningUnderObserverLock(c as any,async()=>x.current,x.i,async()=>{writes++;}),/ORIGINAL_XID_FINISH/);assert.equal(writes,0);
 const finish=async()=>{if(fs==='original'){fs='candidate';writes++;}};
 await finishOperatorOpeningUnderObserverLock(c as any,async()=>x.current,x.i,finish,x.ack);
 await finishOperatorOpeningUnderObserverLock(c as any,async()=>x.current,x.i,finish,x.ack);
 assert.equal(writes,1);assert.equal(fs,'candidate');assert.equal(x.i.before.control.epoch,'234');assert.equal(x.current.control.epoch,'235');
 assert.ok(!queries.some(q=>/\b(UPDATE|INSERT|DELETE)\b/.test(q)));assert.equal(queries.at(-1),'COMMIT');
});
test('acknowledgement refuses changed original data, transaction status, authorization and possible Native publication',()=>{
 const changes:Array<(x:ReturnType<typeof fixture>)=>void>=[
  x=>{x.i.transactionId='39333';},x=>{x.i.databaseSystemIdentifier='other';},
  x=>{x.current.checkpoint={...x.current.checkpoint,xmin:'43499'};},
  x=>{x.current.rows=structuredClone(x.current.rows);x.current.rows[0]!.blockHash=b;},
  x=>{x.current.books=structuredClone(x.current.books);x.current.books.orders[0]!.id=999;},
  x=>{x.current.authorizationRows=1;},x=>{x.current.control={...x.current.control,xmin:'43504'};},
  x=>{x.ack.certificate.candidateAdmissionSha256=h;},x=>{x.ack.certificate.admissionEnabled=true as any;},
  x=>{x.ack.nativeBoundary.cursor.tipHash=b;},x=>{x.ack.nativeBoundary.canonicalFinalized.hash=h;},
  x=>{x.ack.fatalDiagnostic.publicationAttempted=true;},x=>{x.ack.certificate.expiresAt=new Date(Date.now()-1000).toISOString();},
 ];
 for(const change of changes){const x=fixture();change(x);assert.throws(()=>validateOriginalOpeningFinishAcknowledgement(x.ack,x.i,x.current,'committed','committed'));}
 for(const original of ['aborted','in progress','unknown']){const x=fixture();assert.throws(()=>validateOriginalOpeningFinishAcknowledgement(x.ack,x.i,x.current,original,'committed'));}
 for(const control of ['aborted','in progress','unknown']){const x=fixture();assert.throws(()=>validateOriginalOpeningFinishAcknowledgement(x.ack,x.i,x.current,'committed',control));}
});
test('post-filesystem intervention refuses completion and does not replay SQL publication',async()=>{
 const x=fixture(),queries:string[]=[];let reads=0;
 const c={async query(sql:string){queries.push(sql);return{rows:sql.includes('pg_try_advisory')?[{ok:true}]:sql.includes('pg_xact_status')?[{status:'committed'}]:[]};}};
 await assert.rejects(finishOperatorOpeningUnderObserverLock(c as any,async()=>{reads++;return reads===1?x.current:{...x.current,authorizationRows:1};},x.i,async()=>{},x.ack),/FINISH_ACK_ORIGINAL_DATA/);
 assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.some(q=>/\b(UPDATE|INSERT|DELETE)\b/.test(q)));
});
test('receipt retains the legacy service metadata shape and explicitly records current235 acknowledgement',()=>{
 const {a,i,ack}=fixture(),r={version:1,status:'BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT',financialAction:false,completeContractHistory:false,approvalSha256:h,intentDigest:digest(i),transactionId:i.transactionId,checkpoint:i.after,retainedRowsSha256:a.retainedRowsSha256,evidenceSha256:a.evidenceSha256,archiveManifestSha256:a.archiveManifestSha256,unverifiedHistoricalInterval:a.unverifiedHistoricalInterval,controlAcknowledgement:{certificate:ack.certificatePin,control:ack.certificate.toControl,nativeReadinessClaimed:false,admissionEnabled:false}};
 validateOperatorOpeningReceipt(r,i,a,h);validateServiceMetadataReceipt('baseMetadata',r,i,a,h);assert.equal(r.controlAcknowledgement.control.epoch,'235');assert.equal(i.before.control.epoch,'234');
});
test('collector continuation binds the archived receipt acknowledgement and refuses a missing or substituted archive',()=>{
 const {a,i,ack,current}=fixture(),r={version:1,status:'BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT',financialAction:false,completeContractHistory:false,approvalSha256:h,intentDigest:digest(i),transactionId:i.transactionId,checkpoint:i.after,retainedRowsSha256:a.retainedRowsSha256,evidenceSha256:a.evidenceSha256,archiveManifestSha256:a.archiveManifestSha256,unverifiedHistoricalInterval:a.unverifiedHistoricalInterval,controlAcknowledgement:{certificate:ack.certificatePin,control:ack.certificate.toControl}};
 const archives=[ack.certificatePin,ack.certificate.nativeBoundary,ack.certificate.fatalDiagnostic];requireOpeningFinishAckArchives(r,ack.certificatePin,ack.certificate,archives);
 assert.throws(()=>requireOpeningFinishAckArchives(r,ack.certificatePin,ack.certificate,archives.slice(1)),/PRIOR_FINISH_ACK_ARCHIVED/);
 assert.throws(()=>requireOpeningFinishAckArchives(r,{...ack.certificatePin,sha256:b},ack.certificate,archives),/PRIOR_FINISH_ACK_RECEIPT_PIN/);
 const finalized={height:i.after.finalizedHeight,hash:'0x'+h,parentHash:'0x'+b,time:i.after.finalizedTime},e={version:1,status:'ROOT_BASE_OPERATOR_SCOPE_OPENING_COLLECTED',profileSha256:a.profileSha256,registrySha256:a.registrySha256,operator:a.operator,financialDigest:a.financialDigest,retainedRowsSha256:a.retainedRowsSha256,archiveManifestSha256:a.archiveManifestSha256,before:i.before,after:a.after,selection:{selection:{verification:{finalized},range:{through:{height:i.after.height,hash:'0x'+i.after.hash}}}}};
 assert.throws(()=>validatePriorOperatorOpening(r,i,a,h,e,'committed',current),/PRIOR_EXACT_COMMITTED/);
 assert.deepEqual(validatePriorOperatorOpening(r,i,a,h,e,'committed',current,undefined,undefined,undefined,undefined,{...ack,controlTransactionStatus:'committed'}),finalized);
});
