import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {g5Binding,G5_RETRY_TARGET,type G5State} from '../src/g5-run.ts';
import type {G5LiveState} from '../src/g5-live-controller.ts';
import {requireG5UnfundedR4QuoteRecovery,requireG5UnfundedR4NoEffects,saveG5UnfundedR4QuoteLocal} from '../src/g5-r4-quote-recovery.ts';
function fixture(){
 const manifest={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',branchId:G5_RETRY_TARGET.branchId,batchSize:5,baseFeeBudget:'50000000000000',forward:{recipient:'fixture:base'},extraFeeWalletConfig:'fixture:fee',forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'fixture:'+i})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:i*2+2,configFile:'/mnt/d/reverse-'+i+'.json'}))};
 const main:G5State={version:1,runId:manifest.runId,binding:g5Binding(manifest),openingEventId:'opening',incident:false,policyInitialized:true,batchSize:5,barriers:[],orders:[1,2,3,4].map(n=>({sequence:n,direction:n%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner:'owner'+n,...(n<4?{orderId:'order'+n,receiptVerified:true}:{})}))};
 const cfg={runId:manifest.runId,runConfig:'/mnt/d/run.json',manifestBinding:g5Binding(manifest)};
 const controller:G5LiveState={version:2,runId:main.runId,binding:createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),incident:true,inflight:{sequence:4,stage:'REVERSE_QUOTE'},slots:[1,2,3,4].map(n=>({sequence:n,stage:n<4?'DONE':'REVERSE_QUOTE'})),barriers:[],cursor:0,releasedHolds:[],closed:false};return {main,manifest,cfg,controller};
}
test('only literal empty fourth quote unknown with three receipt-verified completed orders can reconcile',()=>{
 const f=fixture(),check=(m=f.main,c=f.controller)=>requireG5UnfundedR4QuoteRecovery(m,f.manifest,c,f.cfg,'/mnt/d/run.json');check();
 for(const changed of [{...f.main,incident:true},{...f.main,closed:true},{...f.main,barriers:[5]},{...f.main,orders:f.main.orders.map((o,i)=>i===3?{...o,orderId:'accepted-r4'}:o)},{...f.main,orders:f.main.orders.map((o,i)=>i===2?{...o,receiptVerified:false}:o)}])assert.throws(()=>check(changed),/EMPTY_R4/);
 for(const changed of [{...f.controller,incident:false},{...f.controller,inflight:{sequence:4,stage:'PAYER_BROADCAST' as const}},{...f.controller,slots:f.controller.slots.map((o,i)=>i===3?{...o,stage:'FUNDING_CALL' as const}:o)}])assert.throws(()=>check(f.main,changed),/EMPTY_R4/);
});
test('a quote business row refuses recovery even when no private reverse state artifact exists',()=>{
 const zero={ownerQuotes:0,quotes:3,orders:3,digests:['0'.repeat(64)]};requireG5UnfundedR4NoEffects(zero);
 for(const changed of [{...zero,ownerQuotes:1},{...zero,quotes:4},{...zero,orders:4},{...zero,digests:['ab'.repeat(32)]},{...zero,fundingHash:'original-payer-hash'}])assert.throws(()=>requireG5UnfundedR4NoEffects(changed),/EFFECT_EXISTS/);
});
test('local no-effect reconciliation changes only controller latch and preserves stage, first three DONE and main state',async()=>{
 const f=fixture(),originalMain=structuredClone(f.main);let current=structuredClone(f.controller);
 await saveG5UnfundedR4QuoteLocal(f.controller,{save:async s=>{current=structuredClone(s);},read:async()=>current});
 assert.equal(current.incident,false);assert.equal(current.inflight,undefined);assert.equal(current.slots[3].stage,'REVERSE_QUOTE');assert.deepEqual(current.slots.slice(0,3),f.controller.slots.slice(0,3));assert.deepEqual(f.main,originalMain);assert.deepEqual(current.barriers,[]);
});
test('uncertain local save restores original frozen controller only when its contents remain recovery-owned',async()=>{
 const f=fixture();let current=structuredClone(f.controller),writes=0;
 await assert.rejects(()=>saveG5UnfundedR4QuoteLocal(f.controller,{save:async s=>{current=structuredClone(s);if(writes++===0)throw Error('uncertain rename');},read:async()=>current}),/uncertain/);assert.deepEqual(current,f.controller);
 const foreign={...structuredClone(f.controller),cursor:999};writes=0;
 await assert.rejects(()=>saveG5UnfundedR4QuoteLocal(f.controller,{save:async()=>{writes++;current=foreign;throw Error('foreign state');},read:async()=>current}),/foreign/);assert.equal(writes,1);assert.deepEqual(current,foreign);
});
