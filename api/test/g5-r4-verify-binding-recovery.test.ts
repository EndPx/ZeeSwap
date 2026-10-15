import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {PrivateData} from '../src/private-data.ts';
import {depositIdentity,type DepositInput} from '../src/repository.ts';
import {g5Binding,G5_RETRY_TARGET,type G5State} from '../src/g5-run.ts';
import type {G5LiveState} from '../src/g5-live-controller.ts';
import {requireG5R4VerifyBindingRecovery,requireG5R4VerifyBindingCause,requireG5R4VerifyBindingSource,requireG5R4VerifyBindingBooks,requireG5R4VerifyBindingNonces,saveG5R4VerifyBindingMain,G5_R4_ORIGINAL_COMMIT_FEE} from '../src/g5-r4-verify-binding-recovery.ts';
test('cause guard binds the existing run path without inventing redundant runId or branchId fields',()=>{
 const cfg={sequence:2,runConfig:'/mnt/d/run.json'};requireG5R4VerifyBindingCause(cfg,'run','/mnt/d/run.json');requireG5R4VerifyBindingCause({...cfg,runId:'run'},'run','/mnt/d/run.json');
 for(const c of [{...cfg,branchId:'anything'},{...cfg,runId:'other'},{...cfg,sequence:4},{...cfg,runConfig:'/mnt/d/other.json'}])assert.throws(()=>requireG5R4VerifyBindingCause(c,'run','/mnt/d/run.json'));
});
test('read-only original fund binding checks exact event identity, encrypted source anchors and quote HMACs',()=>{
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),emitter='0x1111111111111111111111111111111111111111',blockHash='ab'.repeat(32),blockTime=new Date('2026-10-15T16:20:00Z'),input:DepositInput={network:'base-sepolia',txid:'962956490a2885d42bf14c1bc95d0d3a6d86ebe81f65c9e16e3b221bcef65a01',index:3,emitter,reference:'private-reference',receiver:'private-receiver',amount:'100000',height:48156445,blockHash,blockTime,shielded:false},identity=depositIdentity(input);
 const deposit={order_id:'r4',network:input.network,amount:input.amount,classification:'EXACT',confirmed_at:'time',shielded:false,block_height:'48156445',block_hash:blockHash,block_time:blockTime,identity_hash:keys.lookup('deposit',identity),private_payload:keys.seal(input,`deposit:${identity}:v1`),reference_hash:keys.lookup('reference',input.reference),receiver_hash:keys.lookup('receiver',input.receiver)},quote={id:'r4',private_payload:keys.seal({reference:input.reference,depositReceiver:input.receiver},'quote:r4:v1'),deposit_reference_hash:deposit.reference_hash,receiver_hash:deposit.receiver_hash},event={index:3,emitter,height:48156445,blockHash,blockTime};
 const check=(d=deposit,q=quote,e=event)=>requireG5R4VerifyBindingSource(keys,d,q,e);check();
 for(const e of [{...event,index:4},{...event,height:48156446},{...event,blockHash:'cd'.repeat(32)},{...event,emitter:'0x2222222222222222222222222222222222222222'}])assert.throws(()=>check(deposit,quote,e));
 for(const change of [{amount:'99999'},{block_height:'48156444'},{block_hash:'cd'.repeat(32)},{reference_hash:randomBytes(32)},{private_payload:keys.seal({...input,receiver:'other'},`deposit:${identity}:v1`)},{private_payload:keys.seal(input,'wrong-aad')}])assert.throws(()=>check({...deposit,...change}));
 assert.throws(()=>check(deposit,{...quote,receiver_hash:randomBytes(32)}));
});
import {validateG5SdkFaultAccounts,validateG5SdkFaultPhysical} from '../src/g5-sdk-fault.ts';
function incident(){const f=fixture();f.main.incident=true;f.controller.incident=false;delete f.controller.inflight;f.controller.slots[3].stage='OBSERVE_COMMIT';f.controller.lastOutcome={sequence:4,stage:'OBSERVE_COMMIT',status:'AWAITING_BASE_FINALITY'};
 const diagnostic={version:1,exceptionClass:'Error',observedAt:'2026-10-15T17:22:53.339Z',step:'verify',phase:'base-preflight',code:'G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED',frames:[{file:'g5-completed-base-descriptor.ts',line:13,column:29},{file:'g5-completed-base-descriptor.ts',line:63,column:9},{file:'g5-operator.ts',line:138,column:44},{file:'g5-operator.ts',line:443,column:4}]};return {...f,diagnostic};}
test('only the literal completed-descriptor verification failure with healthy original controller is recoverable',()=>{
 const f=incident(),check=(m=f.main,c=f.controller,d=f.diagnostic)=>requireG5R4VerifyBindingRecovery(m,f.manifest,c,f.cfg,'/mnt/d/run.json',d);check();
 for(const d of [{...f.diagnostic,step:'dispatch'},{...f.diagnostic,code:'WALLET_UNAVAILABLE'},{...f.diagnostic,observedAt:'2026-10-15T17:22:54.339Z'},{...f.diagnostic,frames:[]}])assert.throws(()=>check(f.main,f.controller,d),/LITERAL_R4_VERIFY_BINDING/);
 for(const c of [{...f.controller,incident:true},{...f.controller,inflight:{sequence:4,stage:'OBSERVE_COMMIT' as const}},{...f.controller,slots:f.controller.slots.map((s,i)=>i===3?{...s,stage:'PREPARE_COMMIT' as const}:s)},{...f.controller,lastOutcome:{sequence:4,stage:'OBSERVE_COMMIT',status:'UNKNOWN_STATUS'}}])assert.throws(()=>check(f.main,c),/LITERAL_R4_VERIFY_BINDING/);
 assert.throws(()=>check({...f.main,incident:false}),/LITERAL_R4_VERIFY_BINDING/);assert.throws(()=>check({...f.main,orders:f.main.orders.map((o,i)=>i===2?{...o,receiptVerified:false}:o)}));
});
function committed(){const f=books(),lease={jobId:'job3',owner:'old-owner',fence:'1'};f.b.jobs[3].fence='2';f.b.commits.push({order_id:'order4',confirmed:false,actual_fee:null,receipt_payload:null,block_height:null,block_hash:null} as any);return {...f,lease};}
test('unconfirmed original COMMIT preserves held books and accepts exactly the reconciliation-retired lease',()=>{
 const f=committed(),check=(b:any=f.b,lease:any=f.lease)=>requireG5R4VerifyBindingBooks(b,f.ids,lease);check();
 for(const delta of [{confirmed:true},{actual_fee:'749720000158'},{receipt_payload:Buffer.from('unexpected')},{block_height:'48158125'},{block_hash:'ab'.repeat(32)}])assert.throws(()=>check({...f.b,commits:f.b.commits.map((c:any)=>c.order_id==='order4'?{...c,...delta}:c)}),/UNCHARGED/);
 for(const delta of [{fence:'1'},{fence:'3'},{status:'LEASED',lease_owner:'new-owner'},{lease_until:'now'}])assert.throws(()=>check({...f.b,jobs:f.b.jobs.map((j,i)=>i===3?{...j,...delta}:j)}),/RETIRED_LEASE/);
 assert.throws(()=>check({...f.b,shielded:[...f.b.shielded,{order_id:'order4',confirmed:false}]}));assert.throws(()=>check(f.b,null));
});
test('SQL accounts retain original charged fees while physical gas includes finalized but uncharged COMMIT exactly once',()=>{
 const charged='11413220001117',accounts=[['mockUSDC','principal','800000','0'],['TAZ','principal','900000','100000'],['TAZ','fee','120000','10000'],['baseETH','fee','288586779998883','50000000000000']].map(([asset,purpose,balance,reserved])=>({asset,purpose,balance,reserved}));validateG5SdkFaultAccounts(accounts,charged);
 const opening={inventory:'10000000',operatorGas:'1000000000000000'},physical={inventory:'9900000',available:'9900000',tokenBalance:'10000000',escrowLiability:'100000',gas:'987837059998725'};validateG5SdkFaultPhysical(opening,charged,G5_R4_ORIGINAL_COMMIT_FEE,physical);
 assert.throws(()=>validateG5SdkFaultPhysical(opening,charged,'0',physical));assert.throws(()=>validateG5SdkFaultAccounts(accounts,String(BigInt(charged)+BigInt(G5_R4_ORIGINAL_COMMIT_FEE))));
 requireG5R4VerifyBindingNonces([12,12,8,8]);for(const n of [[11,11,8,8],[12,13,8,8],[12,12,8,9]])assert.throws(()=>requireG5R4VerifyBindingNonces(n));
});
test('successful local main clear preserves all receipt flags and controller while uncertain save refreezes first',async()=>{
 const f=incident(),original=structuredClone(f.main),controller=structuredClone(f.controller);let saved=f.main;const events:string[]=[];
 const next=await saveG5R4VerifyBindingMain(f.main,{save:async s=>{saved=s;},read:async()=>saved,refreeze:async()=>{throw Error('unexpected');}});assert.equal(next.incident,false);assert.deepEqual({...next,incident:true},original);assert.deepEqual(f.controller,controller);
 let writes=0;await assert.rejects(saveG5R4VerifyBindingMain(original,{save:async s=>{events.push('save');saved=s;if(++writes===1)throw Error('uncertain');},read:async()=>{events.push('read');return saved;},refreeze:async()=>{events.push('refreeze');}}),/uncertain/);assert.deepEqual(events,['save','refreeze','read','save']);assert.deepEqual(saved,original);
});
test('local failure never restores over an unrelated main file',async()=>{
 const f=incident(),foreign={...f.main,runId:'foreign-run'};let writes=0,refrozen=false;await assert.rejects(saveG5R4VerifyBindingMain(f.main,{save:async()=>{writes++;throw Error('uncertain');},read:async()=>foreign,refreeze:async()=>{refrozen=true;}}));assert.equal(refrozen,true);assert.equal(writes,1);
});
function fixture(){
 const manifest={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',branchId:G5_RETRY_TARGET.branchId,batchSize:5,baseFeeBudget:'50000000000000',forward:{recipient:'fixture:base'},extraFeeWalletConfig:'fixture:fee',forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'fixture:'+i})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:i*2+2,configFile:'/mnt/d/reverse-'+i+'.json'}))};
 const main:G5State={version:1,runId:manifest.runId,binding:g5Binding(manifest),openingEventId:'opening',incident:false,policyInitialized:true,batchSize:5,barriers:[],orders:[1,2,3,4].map(n=>({sequence:n,direction:n%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner:'owner'+n,orderId:'order'+n,receiptVerified:n<4}))};
 const cfg={runId:manifest.runId,runConfig:'/mnt/d/run.json',manifestBinding:g5Binding(manifest)};
 const controller:G5LiveState={version:2,runId:main.runId,binding:createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),incident:true,inflight:{sequence:4,stage:'OBSERVE_SOURCE'},slots:[1,2,3,4].map(n=>({sequence:n,stage:n<4?'DONE':'OBSERVE_SOURCE'})),barriers:[],cursor:0,releasedHolds:[],closed:false};return {main,manifest,cfg,controller};
}
function books(){const ids=['order1','order2','order3','order4'];return {ids,b:{migrations:Array(14).fill({}),quotes:ids.map(id=>({id,input_amount:'100000',output_amount:'100000'})),orders:ids.map((id,i)=>({id,state:i===3?'READY':'SETTLED',primary_deposit:'dep'+i})),deposits:ids.map((order_id,i)=>({id:'dep'+i,order_id,amount:'100000',classification:'EXACT',confirmed_at:'time'})),obligations:ids.map((order_id,i)=>({order_id,deposit_id:'dep'+i,source_amount:'100000',state:i===3?'HELD':'DISCHARGED'})),operations:ids.map((order_id,i)=>({id:'op'+i,order_id,deposit_id:'dep'+i,kind:'PAYOUT',state:i===3?'PLANNED':'CONFIRMED',chain_authorization_verified:i<3})),jobs:ids.map((_,i)=>({id:'job'+i,operation_id:'op'+i,status:i===3?'QUEUED':'DONE',lease_owner:null,lease_until:null,fence:'0'})),reservations:ids.flatMap((order_id,i)=>[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']].map(([asset,purpose,amount])=>({order_id,asset,purpose,amount,released_at:i===3?null:'time'}))),forwards:Array(4).fill({confirmed:true}),commits:[{order_id:'order2',confirmed:true}],settles:[{order_id:'order2',confirmed:true}],shielded:[{order_id:'order2',confirmed:true}],refunds:[]}};}
