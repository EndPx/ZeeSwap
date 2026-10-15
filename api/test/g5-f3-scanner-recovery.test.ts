import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {g5Binding,G5_RETRY_TARGET,type G5State} from '../src/g5-run.ts';
import type {G5LiveState} from '../src/g5-live-controller.ts';
import {requireG5F3ScannerRecovery,requireG5F3RecoveryBooks,requireG5F3Nonces,requireG5F3Migrations,requireG5F3CanonicalGlobalRaw,saveG5F3RecoveryLocals} from '../src/g5-f3-scanner-recovery.ts';
function fixture(){
 const config={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',branchId:G5_RETRY_TARGET.branchId,batchSize:5,baseFeeBudget:'50000000000000',forward:{recipient:'fixture:base'},extraFeeWalletConfig:'fixture:fee',stateFile:'/mnt/d/zee/state.json',forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'fixture:'+i})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:i*2+2,configFile:'/mnt/d/zee/reverse-'+i+'.json'}))};
 const state:G5State={version:1,runId:config.runId,binding:g5Binding(config),openingEventId:'opening',incident:true,policyInitialized:true,batchSize:5,barriers:[],orders:[1,2,3].map((n)=>({sequence:n,direction:n%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner:'user'+n,orderId:'order'+n,receiptVerified:n<3}))};
 const cfg={runId:config.runId,runConfig:'/mnt/d/zee/run.json',stateFile:'/mnt/d/zee/controller.json',manifestBinding:g5Binding(config)};
 const controller:G5LiveState={version:2,runId:config.runId,binding:createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),incident:true,inflight:{sequence:3,stage:'DISPATCH'},slots:[{sequence:1,stage:'DONE'},{sequence:2,stage:'DONE'},{sequence:3,stage:'DISPATCH'}],barriers:[],cursor:0,releasedHolds:[],closed:false};
 const diagnostic={observedAt:'2026-10-15T15:29:53.608Z',phase:'base-preflight',step:'dispatch',code:'WALLET_UNAVAILABLE',frames:[{file:'wallet-adapter.ts',line:14,column:53},{file:'wallet-adapter.ts',line:18,column:81}]};return {config,state,cfg,controller,diagnostic};
}
test('literal scanner failure guard rejects another run, failure, controller phase or expanded admission',()=>{
 const f=fixture();const check=(s=f.state,c=f.config,ctl=f.controller,d=f.diagnostic,cfg=f.cfg)=>requireG5F3ScannerRecovery(s,c,ctl,cfg,d,'/mnt/d/zee/run.json');check();
 for(const s of [{...f.state,incident:false},{...f.state,closed:true},{...f.state,orders:f.state.orders.slice(0,2)},{...f.state,barriers:[5]},{...f.state,orders:f.state.orders.map((o,i)=>i===2?{...o,receiptVerified:true}:o)}])assert.throws(()=>check(s),/LITERAL_F3/);
 assert.throws(()=>check(f.state,{...f.config,runId:'another-run'}),/LITERAL_F3/);
 assert.throws(()=>check(f.state,f.config,{...f.controller,inflight:{sequence:3,stage:'SOURCE_FUND'}}),/LITERAL_F3/);
 for(const d of [{...f.diagnostic,code:'BASE_BROADCAST_UNCERTAIN'},{...f.diagnostic,observedAt:'2026-10-15T15:30:00.000Z'},{...f.diagnostic,phase:'broadcast'},{...f.diagnostic,frames:[]}])assert.throws(()=>check(f.state,f.config,f.controller,d),/LITERAL_F3/);
 assert.throws(()=>check(f.state,f.config,f.controller,f.diagnostic,{...f.cfg,runConfig:'/mnt/d/other/run.json'}),/LITERAL_F3/);
});
test('migration bytes and final global nonces refuse added migrations, changed hashes and pending nonce gaps',()=>{
 const rows=Array.from({length:14},(_,i)=>({name:String(i+1).padStart(4,'0')+'_fixture.sql',sha256:'ab'.repeat(32)}));requireG5F3Migrations(rows,structuredClone(rows));requireG5F3Nonces([11,11,7,7]);
 assert.throws(()=>requireG5F3Migrations([...rows,{name:'0015_future.sql',sha256:'ab'.repeat(32)}],rows),/MIGRATION_BYTES/);
 assert.throws(()=>requireG5F3Migrations(rows,rows.map((r,i)=>i===13?{...r,sha256:'cd'.repeat(32)}:r)),/MIGRATION_BYTES/);
 for(const nonces of [[11,12,7,7],[12,12,7,7],[11,11,7,8],[11,11,8,8]])assert.throws(()=>requireG5F3Nonces(nonces),/NONCES_CHANGED/);
});
test('all retained raw journals require exact canonical finalized chain identity, not only inclusion',()=>{
 const v={original:{hash:'hash',nonce:10},parsed:{chainId:84532,nonce:10,data:'0x1234',to:'0xabc',value:0n},chain:{hash:'hash',nonce:10,input:'0x1234',from:'0xdef',to:'0xabc',value:0n,blockNumber:100n,blockHash:'block'},receipt:{transactionHash:'hash',status:'success',blockNumber:100n,blockHash:'block'},canonical:{hash:'block'},finalized:{number:100n},signer:'0xdef'};
 requireG5F3CanonicalGlobalRaw(v);
 for(const changed of [{...v,finalized:{number:99n}},{...v,canonical:{hash:'changed'}},{...v,chain:{...v.chain,input:'0xother'}},{...v,chain:{...v.chain,blockNumber:null}},{...v,parsed:{...v.parsed,chainId:1}},{...v,receipt:{...v.receipt,transactionHash:'other'}}])assert.throws(()=>requireG5F3CanonicalGlobalRaw(changed),/CANONICAL_FINALITY/);
});
test('local recovery success leaves F3 unverified at VERIFY and cannot advance a barrier',async()=>{
 const f=fixture();let main=structuredClone(f.state),controller=structuredClone(f.controller),freeze=0;
 await saveG5F3RecoveryLocals(f.state,f.controller,{saveMain:async s=>{main=structuredClone(s);},saveController:async s=>{controller=structuredClone(s);},readMain:async()=>main,readController:async()=>controller,refreeze:async()=>{freeze++;}});
 assert.equal(main.incident,false);assert.equal(main.orders[2].receiptVerified,false);assert.equal(controller.incident,false);assert.equal(controller.inflight,undefined);assert.equal(controller.slots[2].stage,'VERIFY');assert.deepEqual(controller.barriers,[]);assert.equal(freeze,0);
});
test('partial/uncertain local write re-freezes first and restores only recovery-owned files with original inflight',async()=>{
 const f=fixture();let main=structuredClone(f.state),controller=structuredClone(f.controller),writes=0;const events:string[]=[];
 await assert.rejects(()=>saveG5F3RecoveryLocals(f.state,f.controller,{saveMain:async s=>{events.push('main');main=structuredClone(s);},saveController:async s=>{events.push('controller');controller=structuredClone(s);if(writes++===0)throw Error('uncertain local rename');},readMain:async()=>{events.push('read-main');return main;},readController:async()=>controller,refreeze:async()=>{events.push('refreeze');}}),/uncertain/);
 assert(events.indexOf('refreeze')<events.indexOf('read-main'));assert.deepEqual(main,f.state);assert.deepEqual(controller,f.controller);assert.deepEqual(controller.inflight,{sequence:3,stage:'DISPATCH'});
});
test('failed local recovery never overwrites unrelated controller contents',async()=>{
 const f=fixture();let main=structuredClone(f.state),controller=structuredClone(f.controller);const foreign={...structuredClone(f.controller),cursor:999};let controllerWrites=0;
 await assert.rejects(()=>saveG5F3RecoveryLocals(f.state,f.controller,{saveMain:async s=>{main=structuredClone(s);},saveController:async()=>{controllerWrites++;controller=foreign;throw Error('foreign write');},readMain:async()=>main,readController:async()=>controller,refreeze:async()=>{}}),/foreign/);
 assert.equal(controllerWrites,1);assert.deepEqual(controller,foreign);assert.deepEqual(main,f.state);
});
test('settled-book guard excludes pending payout, open liability, released gate mismatch and new migration',()=>{
 const b={migrations:Array(14).fill({}),quotes:Array(3).fill({}),orders:[1,2,3].map(id=>({id,state:'SETTLED'})),deposits:[1,2,3].map(order_id=>({order_id,amount:'100000',classification:'EXACT',confirmed_at:'time'})),obligations:Array(3).fill({state:'DISCHARGED',source_amount:'100000'}),operations:Array(3).fill({kind:'PAYOUT',state:'CONFIRMED'}),jobs:Array(3).fill({status:'DONE'}),reservations:Array(9).fill({released_at:'time'}),forwards:Array(4).fill({confirmed:true}),commits:[{confirmed:true}],settles:[{confirmed:true}],shielded:[{confirmed:true}],refunds:[]};requireG5F3RecoveryBooks(b);
 for(const changed of [{...b,forwards:[...b.forwards.slice(0,3),{confirmed:false}]},{...b,obligations:[...b.obligations.slice(0,2),{state:'HELD',source_amount:'100000'}]},{...b,migrations:Array(15).fill({})},{...b,refunds:[{}]}])assert.throws(()=>requireG5F3RecoveryBooks(changed),/SETTLED_BOOKS/);
});
