import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {g5Binding,g5Capital,G5_RETRY_TARGET,type G5State} from '../src/g5-run.ts';
import type {G5LiveState} from '../src/g5-live-controller.ts';
import {requireG5R4FundingWaitRecovery,requireG5R4PrecommitStartupRecovery,requireG5R4FundingWaitNonces,requireG5R4HeldReadyBooks,requireG5R4FundingWaitLedger,g5R4OriginalOperatorRows} from '../src/g5-r4-funding-wait-recovery.ts';
import {validateG5SdkFaultAccounts,validateG5SdkFaultPhysical} from '../src/g5-sdk-fault.ts';
import {saveG5UnfundedR4QuoteLocal} from '../src/g5-r4-quote-recovery.ts';
function fixture(){
 const manifest={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',branchId:G5_RETRY_TARGET.branchId,batchSize:5,baseFeeBudget:'50000000000000',forward:{recipient:'fixture:base'},extraFeeWalletConfig:'fixture:fee',forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'fixture:'+i})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:i*2+2,configFile:'/mnt/d/reverse-'+i+'.json'}))};
 const main:G5State={version:1,runId:manifest.runId,binding:g5Binding(manifest),openingEventId:'opening',incident:false,policyInitialized:true,batchSize:5,barriers:[],orders:[1,2,3,4].map(n=>({sequence:n,direction:n%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner:'owner'+n,orderId:'order'+n,receiptVerified:n<4}))};
 const cfg={runId:manifest.runId,runConfig:'/mnt/d/run.json',manifestBinding:g5Binding(manifest)};
 const controller:G5LiveState={version:2,runId:main.runId,binding:createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),incident:true,inflight:{sequence:4,stage:'OBSERVE_SOURCE'},slots:[1,2,3,4].map(n=>({sequence:n,stage:n<4?'DONE':'OBSERVE_SOURCE'})),barriers:[],cursor:0,releasedHolds:[],closed:false};return {main,manifest,cfg,controller};
}
test('only literal fourth bound source-observation wait can resume; old missing outcome is not a generic clear',()=>{
 const f=fixture(),check=(m=f.main,c=f.controller)=>requireG5R4FundingWaitRecovery(m,f.manifest,c,f.cfg,'/mnt/d/run.json');check();check(f.main,{...f.controller,lastOutcome:{sequence:4,stage:'OBSERVE_SOURCE',status:'AWAITING_BASE_FINALITY'}});
 for(const c of [{...f.controller,inflight:{sequence:4,stage:'PAYER_BROADCAST' as const}},{...f.controller,lastOutcome:{sequence:4,stage:'OBSERVE_SOURCE',status:'UNKNOWN_STATUS'}},{...f.controller,lastOutcome:{sequence:4,stage:'OBSERVE_SOURCE',status:'READY'}},{...f.controller,transitionFailure:{code:'G5_LIVE_ACTION_OR_SAVE_FAILED' as const}},{...f.controller,slots:f.controller.slots.map((o,i)=>i===3?{...o,stage:'PREPARE_COMMIT' as const}:o)}])assert.throws(()=>check(f.main,c),/LITERAL_R4/);
 assert.throws(()=>check({...f.main,incident:true}),/LITERAL_R4/);assert.throws(()=>check({...f.main,orders:f.main.orders.map((o,i)=>i===3?{...o,orderId:undefined}:o)}),/LITERAL_R4/);
});
function books(){const ids=['order1','order2','order3','order4'];return {ids,b:{migrations:Array(14).fill({}),quotes:ids.map(id=>({id,input_amount:'100000',output_amount:'100000'})),orders:ids.map((id,i)=>({id,state:i===3?'READY':'SETTLED',primary_deposit:'dep'+i})),deposits:ids.map((order_id,i)=>({id:'dep'+i,order_id,amount:'100000',classification:'EXACT',confirmed_at:'time'})),obligations:ids.map((order_id,i)=>({order_id,deposit_id:'dep'+i,source_amount:'100000',state:i===3?'HELD':'DISCHARGED'})),operations:ids.map((order_id,i)=>({id:'op'+i,order_id,deposit_id:'dep'+i,kind:'PAYOUT',state:i===3?'PLANNED':'CONFIRMED',chain_authorization_verified:i<3})),jobs:ids.map((_,i)=>({id:'job'+i,operation_id:'op'+i,status:i===3?'QUEUED':'DONE',lease_owner:null,lease_until:null,fence:'0'})),reservations:ids.flatMap((order_id,i)=>[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']].map(([asset,purpose,amount])=>({order_id,asset,purpose,amount,released_at:i===3?null:'time'}))),forwards:Array(4).fill({confirmed:true}),commits:[{order_id:'order2',confirmed:true}],settles:[{order_id:'order2',confirmed:true}],shielded:[{order_id:'order2',confirmed:true}],refunds:[]}};}
test('exact fourth HELD/READY books exclude COMMIT, SDK delivery, active leases, changed sources or released reserves',()=>{
 const {b,ids}=books();requireG5R4HeldReadyBooks(b,ids);
 for(const changed of [{...b,commits:[...b.commits,{order_id:'order4',confirmed:false}]},{...b,shielded:[...b.shielded,{order_id:'order4',confirmed:false}]},{...b,operations:b.operations.map((o,i)=>i===3?{...o,chain_authorization_verified:true}:o)},{...b,jobs:b.jobs.map((j,i)=>i===3?{...j,status:'LEASED',lease_owner:'unexpected'}:j)},{...b,reservations:b.reservations.map((r,i)=>i===9?{...r,released_at:'time'}:r)},{...b,deposits:b.deposits.map((d,i)=>i===3?{...d,amount:'99999'}:d)}])assert.throws(()=>requireG5R4HeldReadyBooks(changed,ids));
 assert.throws(()=>requireG5R4HeldReadyBooks({...b,reservations:b.reservations.map((r,i)=>i===9?{...r,amount:'200000'}:r)},ids),/HELD_RESERVATIONS/);
});
test('funded-but-uncommitted physical model keeps escrow separate and charges no new operator execution or user gas to operator capital',()=>{
 const charged='11413220001117',accounts=[['mockUSDC','principal','800000','0'],['TAZ','principal','900000','100000'],['TAZ','fee','120000','10000'],['baseETH','fee','288586779998883','50000000000000']].map(([asset,purpose,balance,reserved])=>({asset,purpose,balance,reserved}));validateG5SdkFaultAccounts(accounts,charged);
 const opening={inventory:'10000000',operatorGas:'1000000000000000'},physical={inventory:'9900000',available:'9900000',tokenBalance:'10000000',escrowLiability:'100000',gas:'988586779998883'};validateG5SdkFaultPhysical(opening,charged,'0',physical);
 assert.throws(()=>validateG5SdkFaultPhysical(opening,charged,'0',{...physical,available:'10000000'}),/PHYSICAL_MISMATCH/);assert.throws(()=>validateG5SdkFaultPhysical(opening,charged,'0',{...physical,gas:String(BigInt(physical.gas)-4453900000248n)}),/PHYSICAL_MISMATCH/);
 requireG5R4FundingWaitNonces([11,11,8,8]);for(const n of [[11,12,8,8],[11,11,8,9],[12,12,8,8],[11,11,7,7]])assert.throws(()=>requireG5R4FundingWaitNonces(n),/NONCE_CHANGED/);
});
test('known-wait local reconciliation preserves every funded stage/outcome and main state without preparing COMMIT',async()=>{
 const f=fixture();f.controller.lastOutcome={sequence:4,stage:'OBSERVE_SOURCE',status:'AWAITING_BASE_FINALITY'};const main=structuredClone(f.main);let state=structuredClone(f.controller);
 await saveG5UnfundedR4QuoteLocal(f.controller,{save:async s=>{state=structuredClone(s);},read:async()=>state});assert.equal(state.incident,false);assert.equal(state.inflight,undefined);assert.equal(state.slots[3].stage,'OBSERVE_SOURCE');assert.deepEqual(state.lastOutcome,f.controller.lastOutcome);assert.deepEqual(f.main,main);assert.deepEqual(state.slots.slice(0,3),f.controller.slots.slice(0,3));
});
test('all six original journal paths have an explicit phase even when COMMIT/SETTLE table projections omit it',()=>{
 const rows=g5R4OriginalOperatorRows({forwards:[{order_id:'F1',phase:'RESERVE'},{order_id:'F1',phase:'PAY'},{order_id:'F3',phase:'RESERVE'},{order_id:'F3',phase:'PAY'}],commits:[{order_id:'R2'}],settles:[{order_id:'R2'}]});
 assert.deepEqual(rows.map(r=>r.order_id+'.'+r.phase+'.tx.json'),['F1.RESERVE.tx.json','F1.PAY.tx.json','F3.RESERVE.tx.json','F3.PAY.tx.json','R2.COMMIT.tx.json','R2.SETTLE.tx.json']);assert(rows.every(r=>!r.phase.includes('undefined')));
 assert.throws(()=>g5R4OriginalOperatorRows({forwards:[{},...rows.slice(1,4)],commits:[{}],settles:[{}]}),/SIX_PHASES/);
});
test('opening, event balance, original source proceeds and fourth held custody are independently validated with no R4 expense',()=>{
 const opening='opening',r4='order4',rows:any[]=g5Capital(G5_RETRY_TARGET.branchId).flatMap(([asset,purpose,amount])=>[{event_id:opening,asset,bucket:purpose+':available',amount},{event_id:opening,asset,bucket:purpose+':operator-capital',amount:'-'+amount}]);
 for(const [order_id,asset] of [['order1','TAZ'],['order2','mockUSDC'],['order3','TAZ']])rows.push({event_id:order_id,order_id,asset,bucket:'operator:unreconciled',amount:'100000'},{event_id:order_id,order_id,asset,bucket:'conversion:source',amount:'-100000'});
 rows.push({event_id:r4,order_id:r4,asset:'mockUSDC',bucket:'customer:held',amount:'100000'},{event_id:r4,order_id:r4,asset:'mockUSDC',bucket:'customer:liability',amount:'-100000'});requireG5R4FundingWaitLedger(rows,opening,r4);
 const moved=(asset:string,bucket:string,order_id?:string)=>[...rows,{event_id:'corruption',asset,bucket,amount:'-1',order_id},{event_id:'corruption',asset,bucket:'fixture:elsewhere',amount:'1',order_id}];
 assert.throws(()=>requireG5R4FundingWaitLedger(moved('TAZ','operator:unreconciled','order1'),opening,r4),/SOURCE_LEDGER/);assert.throws(()=>requireG5R4FundingWaitLedger(moved('mockUSDC','customer:held',r4),opening,r4),/SOURCE_LEDGER/);
 assert.throws(()=>requireG5R4FundingWaitLedger([...rows,{event_id:'bad',asset:'TAZ',bucket:'fee:spent',amount:'1',order_id:r4},{event_id:'bad',asset:'TAZ',bucket:'fixture:elsewhere',amount:'-1',order_id:r4}],opening,r4),/SOURCE_LEDGER/);
 assert.throws(()=>requireG5R4FundingWaitLedger([...rows,{event_id:'unbalanced',asset:'TAZ',bucket:'bad',amount:'1'}],opening,r4),/UNBALANCED/);
 assert.throws(()=>requireG5R4FundingWaitLedger(rows.map((r,i)=>i===0?{...r,amount:String(BigInt(r.amount)+1n)}:r),opening,r4),/OPENING_LEDGER/);
});
function startupFixture(){
 const f=fixture();f.controller.slots[3].stage='PREPARE_COMMIT';f.controller.inflight={sequence:4,stage:'PREPARE_COMMIT'};f.controller.lastOutcome={sequence:4,stage:'OBSERVE_SOURCE',status:'READY'};f.controller.transitionFailure={code:'G5_LIVE_ACTION_OR_SAVE_FAILED'};
 const packet={version:1,status:'G5_REVERSE_INITIALIZATION_FAILED',diagnostic:{observedAt:'2026-10-15T16:56:30.903Z',step:'prepare-commit',phase:'G5_REVERSE_INIT_SLOT',code:'ETIMEDOUT',exceptionClass:'Error',frames:[{file:'g5-context.ts',line:17,column:50},{file:'g5-slot.ts',line:17,column:100},{file:'g5-reverse-operator.ts',line:43,column:21},{file:'g5-reverse-operator.ts',line:33,column:19}]}};return {...f,packet};
}
test('pre-COMMIT alias accepts only the exact recorded initialization read timeout with original source READY acknowledgement',()=>{
 const f=startupFixture(),check=(c=f.controller,p=f.packet)=>requireG5R4PrecommitStartupRecovery(f.main,f.manifest,c,f.cfg,'/mnt/d/run.json',p);check();
 for(const p of [{...f.packet,diagnostic:{...f.packet.diagnostic,observedAt:'2026-10-15T16:56:31.000Z'}},{...f.packet,diagnostic:{...f.packet.diagnostic,code:'WALLET_UNAVAILABLE'}},{...f.packet,diagnostic:{...f.packet.diagnostic,phase:'G5_REVERSE_INIT_SIGNERS'}},{...f.packet,diagnostic:{...f.packet.diagnostic,frames:[]}}])assert.throws(()=>check(f.controller,p),/READ_TIMEOUT/);
 assert.throws(()=>check({...f.controller,slots:f.controller.slots.map((o,i)=>i===3?{...o,stage:'BROADCAST_COMMIT' as const}:o)}),/READ_TIMEOUT/);assert.throws(()=>check({...f.controller,lastOutcome:{sequence:4,stage:'OBSERVE_SOURCE',status:'AWAITING_BASE_FINALITY'}}),/READ_TIMEOUT/);
});
test('audited pre-COMMIT startup latch clear preserves PREPARE_COMMIT, READY outcome and original three DONE slots',async()=>{
 const f=startupFixture(),main=structuredClone(f.main);let controller=structuredClone(f.controller);
 await saveG5UnfundedR4QuoteLocal(f.controller,{save:async s=>{controller=structuredClone(s);},read:async()=>controller});assert.equal(controller.incident,false);assert.equal(controller.inflight,undefined);assert.equal(controller.slots[3].stage,'PREPARE_COMMIT');assert.equal(controller.lastOutcome?.status,'READY');assert.deepEqual(controller.slots.slice(0,3),f.controller.slots.slice(0,3));assert.deepEqual(f.main,main);assert.deepEqual(controller.barriers,[]);
});
