import test from 'node:test';
import assert from 'node:assert/strict';
import {g5Binding,G5_RETRY_TARGET} from '../src/g5-run.ts';
import {prepareSourceAdmission,sourceAdmissionDecision,admitAndFundSource,runSourcePreparation,sourceAdmissionWait} from '../src/g5-source-admission.ts';
import {advanceG5LiveSlot,initialG5LiveState,runG5LiveBounded,type G5LiveSnapshot} from '../src/g5-live-controller.ts';
const hash='ab'.repeat(32);
function fixture(){
 const config={version:1,runId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',branchId:G5_RETRY_TARGET.branchId,batchSize:5,extraFeeWalletConfig:'/synthetic/fee.json',baseFeeBudget:'50000000000000',forward:{recipient:'0x1111111111111111111111111111111111111111'},forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'utest1source'+(i*2+1)})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:(i+1)*2,configFile:'/synthetic/reverse-'+i+'.json'}))};
 const slot={sequence:13,direction:'ZCASH_TO_BASE' as const,owner:'synthetic-owner',receiver:'utest1deposit13'},state={version:1 as const,runId:config.runId,binding:g5Binding(config),openingEventId:'synthetic-opening',orders:[slot],batchSize:5 as const};
 const actor={sequence:13,branchId:config.branchId,runId:config.runId,runConfig:'/synthetic/run.json',walletPath:'/home/albary/zeeswap-g5-retry/source-13/user-wallet',preQuoteSyncFile:'/home/albary/zeeswap-g5-retry/source-13/source-prequote-sync.private.json',refundRecipient:'utest1source13',ufvkSha256:'a'.repeat(64),approvedNote:{pool:'ironwood',txid:'b'.repeat(64),index:0,value:'110000'}};
 const now=Date.now(),prepared=prepareSourceAdmission(config,state,slot,actor,'/synthetic/run.json','0x2222222222222222222222222222222222222222','9',new Date(now).toISOString()),sync={state:'SYNCED',binding:actor,tip:1002,scannedHeight:1001,observedAt:new Date(now).toISOString()};
 const source={network:'zcash-testnet',scanned_height:'1000',tip_hash:hash,canonical_hash:hash,observed_at:new Date(now)},base={network:'base-sepolia',observed_at:new Date(now)};return {config,state,slot,actor,prepared,sync,source,base,now};
}
test('real deposit scan plus12 permits ten remaining and refuses nine before quote creation',()=>{
 const f=fixture();assert.deepEqual(sourceAdmissionDecision(f.prepared,f.actor,f.sync,f.source,f.base,f.now),{status:'SOURCE_ADMISSION_READY',cutoffHeight:'1012'});
 assert.equal(sourceAdmissionDecision(f.prepared,f.actor,{...f.sync,tip:1003,scannedHeight:1003},f.source,f.base,f.now).status,'SOURCE_ADMISSION_WAIT');
 assert.throws(()=>sourceAdmissionDecision(f.prepared,f.actor,f.sync,{...f.source,canonical_hash:'cd'.repeat(32)},f.base,f.now),/CANONICAL_CHECKPOINT/);
 assert.throws(()=>sourceAdmissionDecision(f.prepared,f.actor,{...f.sync,binding:{...f.actor,refundRecipient:'other'}},f.source,f.base,f.now),/SYNC_BINDING/);
});
test('Source13 observed63.5s preparation and53s sync refuses margin7 before any quote or funding effect',async()=>{
 const f=fixture(),events:string[]=[];let now=f.now,quoteWrites=0,funds=0;
 const prep=await runSourcePreparation({validateRefund:async()=>{events.push('refund');now+=5000;},allocateReceiver:async()=>{events.push('allocate');now+=40000;return f.slot.receiver;},basePreflight:async()=>{events.push('base-preflight');return new Date(now).toISOString();},refresh:async()=>{events.push('actual-view-refresh');now+=18500;}});
 f.prepared.basePreflightObservedAt=prep.basePreflightObservedAt;f.source.scanned_height='4507005';f.source.observed_at=new Date(now);f.base.observed_at=new Date(now);
 const r=await admitAndFundSource(13,{sync:async()=>{events.push('source-sync');now+=53000;f.sync.tip=4507010;f.sync.scannedHeight=4507010;f.sync.observedAt=new Date(now).toISOString();return {status:'SYNCED'};},admit:async()=>{events.push('guard-before-quote');const d=sourceAdmissionDecision(f.prepared,f.actor,f.sync,f.source,f.base,now);if(d.status!=='SOURCE_ADMISSION_WAIT')quoteWrites++;return d;},recordAdmitted:async()=>{throw Error('no intent');},authorize:async()=>{throw Error('no authority');},fund:async()=>{funds++;return {status:'BROADCAST'};}});
 assert.deepEqual(events,['refund','allocate','base-preflight','actual-view-refresh','source-sync','guard-before-quote']);assert.equal(r.status,'SOURCE_ADMISSION_WAIT');assert.equal(r.reason,'INSUFFICIENT_WINDOW');assert.equal(quoteWrites,0);assert.equal(funds,0);
});
test('single production action persists admission then checks epoch authority and funds without additional wrapper snapshot or resync',async()=>{
 const events:string[]=[];const r=await admitAndFundSource(13,{sync:async()=>{events.push('sync');return {status:'SYNCED'};},admit:async()=>{events.push('atomic-admit');return {status:'SOURCE_ADMITTED',sequence:13,epoch:'9',fundingSha256:hash};},recordAdmitted:async()=>{events.push('durable-admitted');},authorize:async()=>{events.push('epoch-authority');return {status:'SOURCE_FUNDING_AUTHORIZED',sequence:13,epoch:'9'};},fund:async()=>{events.push('fund-once');return {status:'BROADCAST'};}});
 assert.equal(r.status,'BROADCAST');assert.deepEqual(events,['sync','atomic-admit','durable-admitted','epoch-authority','fund-once']);
});
test('post-admit uncertainty or original reexport stays hard and cannot authorize an automatic funding retry',async()=>{
 for(const failure of ['record','authority','fund','reexport']){let funds=0;await assert.rejects(()=>admitAndFundSource(13,{sync:async()=>({status:'SYNCED'}),admit:async()=>({status:failure==='reexport'?'SOURCE_ORIGINAL_ADMISSION_REEXPORTED':'SOURCE_ADMITTED',sequence:13,epoch:'9',fundingSha256:hash}),recordAdmitted:async()=>{if(failure==='record')throw Error('uncertain write');},authorize:async()=>({status:'SOURCE_FUNDING_AUTHORIZED',sequence:13,epoch:failure==='authority'?'10':'9'}),fund:async()=>{funds++;throw Error('unknown after proposal');}}));assert.equal(funds,failure==='fund'?1:0);}
});
test('repeated pre-admission waits yield to funded11and12 despite capacity for14, preserving ten completed receipts',async()=>{
 const completed=Array.from({length:10},(_,i)=>({sequence:i+1,state:'SETTLED',receiptVerified:true}));
 const snap:G5LiveSnapshot={status:'G5_CONTROLLER_SNAPSHOT',runId:'synthetic',incident:false,reconciliationRequired:false,closed:false,availableBaseFeeWei:'50000000000000',operatorRawPending:false,barriers:[5,10],orders:[...completed,{sequence:11,state:'READY',receiptVerified:false},{sequence:12,state:'CONFIRMING',receiptVerified:false},{sequence:13,state:'UNACCEPTED',receiptVerified:false}]};
 const state=initialG5LiveState('synthetic','binding',{...snap,barriers:[],orders:completed.slice(0,2)});
 state.slots=completed.map(o=>({sequence:o.sequence,stage:'DONE'}));state.barriers=[5,10];state.slots.push({sequence:11,stage:'DISPATCH'},{sequence:12,stage:'OBSERVE_SOURCE'},{sequence:13,stage:'SOURCE_FUND'});
 const originalCompleted=structuredClone(state.slots.slice(0,10)),calls:number[]=[];
 const io={now:()=>0,snapshot:async()=>structuredClone(snap),save:async()=>{},execute:async(sequence:number,stage:string)=>{calls.push(sequence);if(sequence!==13)return {status:sequence===11?'AWAITING_BASE_FINALITY':'CONFIRMING'};if(stage==='START')return {status:'SOURCE_PREPARED_FOR_ADMISSION'};return admitAndFundSource(13,{sync:async()=>({version:1,status:'SOURCE_PREFUND_WAIT',command:'sync',sequence:13,phase:'SCAN_FRESHNESS',code:'G5_SOURCE_SCAN_STALE',scannedHeight:100,tipHeight:102,sdkCompleted:true,sdkActive:false,uncertain:false,proposalStarted:false,intentCreated:false,intentAbsent:true,resultAbsent:true,lockReleased:true}),admit:async()=>{throw Error('must not admit');},recordAdmitted:async()=>{throw Error('must not record');},authorize:async()=>{throw Error('must not authorize');},fund:async()=>{throw Error('must not fund');}});}};
 assert.equal(advanceG5LiveSlot({sequence:13,stage:'SOURCE_FUND'},sourceAdmissionWait(13,'INSUFFICIENT_WINDOW')).stage,'START');
 for(let i=0;i<6;i++)await runG5LiveBounded(state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},io);
 assert.equal(calls[0],13);assert.notEqual(calls[1],13);assert(calls.includes(11));assert(calls.includes(12));assert(!calls.includes(14));assert.equal(state.slots.length,13);assert.equal(state.incident,false);
 assert.deepEqual(state.slots.slice(0,10),originalCompleted);assert.deepEqual(state.barriers,[5,10]);
});

test('source wallet final actual scan must be within one of final tip before SQL admission',()=>{
 const f=fixture();assert.equal(sourceAdmissionDecision(f.prepared,f.actor,f.sync,f.source,f.base,f.now).status,'SOURCE_ADMISSION_READY');
 const lag={...f.sync,scannedHeight:1000};const decision=sourceAdmissionDecision(f.prepared,f.actor,lag,f.source,f.base,f.now);assert.equal(decision.status,'SOURCE_ADMISSION_WAIT');assert.equal('reason' in decision?decision.reason:undefined,'SOURCE_WALLET_SCAN_BEHIND');
 for(const changed of [{...f.sync,scannedHeight:undefined},{...f.sync,scannedHeight:1003},{...f.sync,scannedHeight:'1001'},{...f.sync,scannedHeight:-1}])assert.throws(()=>sourceAdmissionDecision(f.prepared,f.actor,changed,f.source,f.base,f.now),/SYNC_SCAN_REQUIRED/);
});


test('authenticated preaccept scan WAIT yields START and funded work without admission or ADMITTED replay',async()=>{
 const scan={version:1,status:'SOURCE_PREFUND_WAIT',command:'sync',sequence:13,phase:'SCAN_FRESHNESS',code:'G5_SOURCE_SCAN_STALE',scannedHeight:100,tipHeight:102,sdkCompleted:true,sdkActive:false,uncertain:false,proposalStarted:false,intentCreated:false,intentAbsent:true,resultAbsent:true,lockReleased:true};
 let admitted=0,recorded=0,funded=0;
 const result=await admitAndFundSource(13,{sync:async()=>scan,admit:async()=>{admitted++;throw Error('no quote');},recordAdmitted:async()=>{recorded++;},authorize:async()=>{throw Error('no authority');},fund:async()=>{funded++;return {status:'BROADCAST'};}});
 assert.deepEqual(result,sourceAdmissionWait(13,'SOURCE_WALLET_SCAN_BEHIND'));assert.equal(admitted,0);assert.equal(recorded,0);assert.equal(funded,0);assert.equal(advanceG5LiveSlot({sequence:13,stage:'SOURCE_FUND'},result).stage,'START');
 for(const changed of [{...scan,command:'fund'},{...scan,tipHeight:99},{...scan,proposalStarted:true}])await assert.rejects(()=>admitAndFundSource(13,{sync:async()=>changed,admit:async()=>{throw Error('no quote');},recordAdmitted:async()=>{},authorize:async()=>{},fund:async()=>{throw Error('no fund');}}));
});
