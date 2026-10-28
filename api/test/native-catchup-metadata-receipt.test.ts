import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateServiceMetadataReceipt} from '../src/testnet-service-source-compat.ts';
import {continuationDigest} from '../src/native-circle-continuation.ts';
import {digest} from '../src/integrations/observation/types.ts';

function fixture(){
 const hash=(n:number)=>n.toString(16).padStart(64,'0'),time='2026-10-27T00:00:00.000Z',later='2026-10-27T00:01:00.000Z',ref={path:'/opt/zeeswap-testnet/state/fixture.private.json',sha256:hash(7)};
 const identity={project:'fixture',generation:'generation',policy:{adapter:'zeer-chef',network:'zcash-testnet',birthday:100,registryDigest:hash(1),projectionDigest:hash(2),canonicalSourceId:'native',accountFingerprint:'fixture',maxBlocks:1000,maxObservations:1000}},control={epoch:'230',xmin:'1234',accepting_orders:false,dispatch_enabled:false,reconciliation_required:true};
 const checkpoint={scanned_height:'200',finalized_height:'191',tip_hash:hash(200),finalized_time:time,observed_at:time,xmin:'1235'},books={orders:[{state:'SETTLED'}]};
 const approval:any={version:2,status:'ROOT_CHEF_LINKED_SUFFIX_METADATA_RECOVERY_APPROVED',purpose:'ROOT_CURRENT_CLOSED_NATIVE_CATCHUP',metadataOnly:true,noFinance:true,appObserverStopped:true,financialWorkersStopped:true,verifiedAt:time,expiresAt:'2026-10-27T01:00:00.000Z',publicCommit:'a'.repeat(40),profileSha256:hash(3),handoffSha256:hash(4),openingProofSha256:hash(5),financialDigest:continuationDigest(books),control,baseline:{cursor:{...ref,value:{version:1,identityDigest:digest(identity),processedThrough:200,tipHash:hash(200),snapshotDigest:hash(8)}},checkpoint},identity,legacyJournal:ref,continuationAuthority:ref,capitalProof:ref,observerInactiveProof:ref,freshCanonicalAudit:ref,before:{database:'zee_app_20261023',role:'zee_app_worker_20261023',authorizationRows:'0',checkpointXmin:'1235',persisted:{control,checkpoint},books}};
 const snapshot={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:later,scannedHeight:220,tipHash:hash(220),blocks:[{height:211,hash:hash(211),time:later},{height:220,hash:hash(220),time:later}],outputs:[]};
 const cursor={version:1,identityDigest:digest(identity),processedThrough:220,tipHash:hash(220),snapshotDigest:digest(snapshot)},cursorSha256=createHash('sha256').update(JSON.stringify(cursor)+'\n').digest('hex'),permitSha256=hash(50);
 const intent:any={version:1,permitSha256,journalDigest:hash(60),transactionId:'4294968196',expectedXmin:'900',before:structuredClone({control,checkpoint}),after:{control,checkpoint:{scanned_height:'220',finalized_height:'211',tip_hash:hash(220),finalized_time:later,observed_at:later,xmin:'900'}},snapshot,cursor,cursorSha256};
 const receipt:any={version:1,status:'ROOT_CURRENT_NATIVE_CATCHUP_COMMITTED_EXACT',permitSha256,intentDigest:digest(intent),transactionId:intent.transactionId,checkpoint:intent.after.checkpoint,cursorSha256,financialAction:false};
 return{approval,intent,receipt,permitSha256};
}
function validate(f:ReturnType<typeof fixture>){validateServiceMetadataReceipt('nativeMetadata',f.receipt,f.intent,f.approval,f.permitSha256);}
test('current catchup exact generated receipt remains archival after expiry and advances checkpoint clocks without preservation claims',()=>{const f=fixture();validate(f);assert.equal(f.receipt.approvalSha256,undefined);assert.equal(f.receipt.observedAtPreserved,undefined);assert.notEqual(f.intent.before.checkpoint.finalized_time,f.intent.after.checkpoint.finalized_time);});
test('current receipt rejects wrong kind, legacy alias replay and receipt tampering',()=>{
 for(const patch of [{status:'CLOSED_HISTORY_CHEF_SINGLE_TIP_COMMITTED_EXACT'},{status:'CLOSED_EMPTY_NATIVE_TAIL_COMMITTED_EXACT'},{permitSha256:'f'.repeat(64)},{transactionId:'900'},{cursorSha256:'f'.repeat(64)},{financialAction:true},{intentDigest:'f'.repeat(64)},{observedAtPreserved:true},{approvalSha256:'f'.repeat(64)},{checkpoint:{scanned_height:'221'}}]){const f=fixture();Object.assign(f.receipt,patch);assert.throws(()=>validate(f));}
 const f=fixture();assert.throws(()=>validateServiceMetadataReceipt('baseMetadata',f.receipt,f.intent,f.approval,f.permitSha256));
});
test('rebound intent hashes cannot conceal XID, cursor bytes, snapshot, control, before-state or financial changes',()=>{
 const mutations=[(f:any)=>f.intent.expectedXmin='901',(f:any)=>f.intent.before.checkpoint.xmin='999',(f:any)=>f.intent.after.control={...f.intent.after.control,epoch:'231'},(f:any)=>f.intent.cursor.snapshotDigest='f'.repeat(64),(f:any)=>f.intent.cursorSha256=createHash('sha256').update(JSON.stringify(f.intent.cursor)).digest('hex'),(f:any)=>f.intent.snapshot.tipHash='f'.repeat(64),(f:any)=>f.intent.snapshot.outputs=[{}],(f:any)=>f.intent.snapshot.observedAt='invalid',(f:any)=>f.approval.before.books.orders[0].state='NEW',(f:any)=>f.approval.noFinance=false,(f:any)=>f.approval.purpose='OTHER',(f:any)=>f.approval.version=3,(f:any)=>f.approval.expiresAt=f.approval.verifiedAt,(f:any)=>f.approval.baseline.cursor.value.tipHash='f'.repeat(64)];
 for(const mutate of mutations){const f=fixture();mutate(f);f.receipt.intentDigest=digest(f.intent);f.receipt.transactionId=f.intent.transactionId;f.receipt.cursorSha256=f.intent.cursorSha256;f.receipt.checkpoint=f.intent.after.checkpoint;assert.throws(()=>validate(f));}
});
