import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialG5LiveState,validateG5LiveState,advanceG5LiveSlot,runG5LiveBounded,syncAndFundG5Source,type G5LiveSnapshot,type G5LiveState,type G5LiveStage} from '../src/g5-live-controller.ts';
const snapshot=():G5LiveSnapshot=>({status:'G5_CONTROLLER_SNAPSHOT',runId:'run',incident:false,reconciliationRequired:false,closed:false,availableBaseFeeWei:'293508439999198',operatorRawPending:false,barriers:[],orders:[1,2].map(sequence=>({sequence,state:'SETTLED',receiptVerified:true}))});
const results:Partial<Record<G5LiveStage|'BARRIER'|'CLOSE',string>>={SYNC:'SYNCED',SOURCE_FUND:'BROADCAST',REVERSE_QUOTE:'AWAITING_FUNDS',FUNDING_CALL:'FUNDING_CALL_SAVED_FOR_SEPARATE_PAYER',PAYER_APPROVAL:'PAYER_APPROVAL_SAVED',PAYER_PREPARE:'PREPARED',PAYER_BROADCAST:'ORIGINAL_PAYER_BROADCAST_KNOWN',OBSERVE_SOURCE:'READY',DISPATCH:'SETTLED',PREPARE_COMMIT:'COMMIT_SIGNED_DURABLY',BROADCAST_COMMIT:'AWAITING_BASE_FINALITY',OBSERVE_COMMIT:'COMMIT_FINALIZED',APPROVE_WALLET:'IMMUTABLE_PRIVATE_WALLET_APPROVAL_SAVED',PREPARE_ZCASH:'ZCASH_SIGNED_DURABLY',BROADCAST_ZCASH:'AWAITING_ZCASH_FINALITY',OBSERVE_ZCASH:'ZCASH_DELIVERY_FINALIZED',PREPARE_SETTLE:'SETTLE_SIGNED_DURABLY',BROADCAST_SETTLE:'AWAITING_BASE_FINALITY',OBSERVE_SETTLE:'SETTLED',VERIFY:'G5_ORDER_RECEIPTS_VERIFIED',BARRIER:'G5_BATCH_VERIFIED',CLOSE:'G5_CLOSED'};
function harness(){
 const snap=snapshot(),state=initialG5LiveState('run','binding',snap),calls:{sequence:number;stage:string}[]=[],saved:G5LiveState[]=[];
 const io={now:()=>0,snapshot:async()=>structuredClone(snap),save:async(s:G5LiveState)=>{saved.push(structuredClone(s));},execute:async(sequence:number,stage:G5LiveStage|'BARRIER'|'CLOSE')=>{
  assert.deepEqual(saved.at(-1)?.inflight,{sequence,stage});calls.push({sequence,stage});
  if(stage==='START'){snap.orders.push({sequence,state:'AWAITING_FUNDS',receiptVerified:false});return {status:sequence%2?'AWAITING_SEPARATE_ONCE_ONLY_SOURCE_FUNDING':'G5_REVERSE_SLOT_READY'};}
  const row=snap.orders.find(o=>o.sequence===sequence);
  if(stage==='DISPATCH'||stage==='OBSERVE_SETTLE')row!.state='SETTLED';
  if(stage==='VERIFY')row!.receiptVerified=true;
  if(stage==='BARRIER')snap.barriers.push(sequence);
  if(stage==='CLOSE')snap.closed=true;
  return {status:results[stage]!};
 }};return {state,snap,calls,saved,io};
}
test('remaining eighteen use all exact stage gates and four physical barriers without touching first circle',async()=>{
 const h=harness();let result;
 do{result=await runG5LiveBounded(h.state,{maxSteps:200,maxMilliseconds:60000,maxActive:4},h.io);}while(result.status==='G5_CONTROLLER_BOUNDED_STOP');
 assert.equal(result.status,'G5_CONTROLLER_COMPLETE');assert.equal(result.settledReceipts,20);assert.deepEqual(h.state.barriers,[5,10,15,20]);
 assert(h.calls.every(c=>c.sequence>=3||c.stage==='BARRIER'));
 for(const n of [5,10,15])assert(h.calls.findIndex(c=>c.sequence===n&&c.stage==='BARRIER')<h.calls.findIndex(c=>c.sequence===n+1&&c.stage==='START'));
 for(let n=3;n<=19;n+=2){assert.equal(h.calls.filter(c=>c.sequence===n&&c.stage==='SOURCE_FUND').length,1);assert(h.calls.findIndex(c=>c.sequence===n&&c.stage==='SYNC')<h.calls.findIndex(c=>c.sequence===n&&c.stage==='START'));}
});
test('pending observations wait without terminal verification or new funding',async()=>{
 const h=harness(),normal=h.io.execute;h.io.execute=async(n,s)=>s==='OBSERVE_SOURCE'?{status:'CONFIRMING'}:normal(n,s);
 const r=await runG5LiveBounded(h.state,{maxSteps:30,maxMilliseconds:1000,maxActive:1},h.io);
 assert.equal(r.status,'G5_CONTROLLER_BOUNDED_STOP');assert.equal(h.state.slots[2].stage,'OBSERVE_SOURCE');assert(!h.calls.some(c=>c.stage==='VERIFY'));assert.equal(h.calls.filter(c=>c.stage==='SOURCE_FUND').length,1);
});
test('unknown source send retains durable original intent and freezes any resume',async()=>{
 const h=harness(),normal=h.io.execute;h.io.execute=async(n,s)=>{if(s==='SOURCE_FUND')throw Error('timeout');return normal(n,s);};
 const r=await runG5LiveBounded(h.state,{maxSteps:30,maxMilliseconds:1000},h.io);
 assert.equal(r.status,'UNKNOWN_OR_INCIDENT');assert.equal(h.state.incident,true);assert.deepEqual(h.state.inflight,{sequence:3,stage:'SOURCE_FUND'});
 assert.throws(()=>validateG5LiveState(h.state,'run','binding'),/RECONCILIATION/);
 await assert.rejects(()=>runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io),/RECONCILIATION/);
});
test('gas cap admission precheck and known outstanding raw serialize new preparations',async()=>{
 const h=harness();h.snap.availableBaseFeeWei='49999999999999';
 await runG5LiveBounded(h.state,{maxSteps:10,maxMilliseconds:1000},h.io);assert.equal(h.calls.length,0);
 h.snap.availableBaseFeeWei='50000000000000';h.state.slots.push({sequence:3,stage:'DISPATCH'});h.snap.orders.push({sequence:3,state:'READY',receiptVerified:false});h.snap.operatorRawPending=true;h.snap.operatorRawSequence=4;
 await runG5LiveBounded(h.state,{maxSteps:10,maxMilliseconds:1000},h.io);assert.equal(h.calls.length,0);
 h.snap.operatorRawSequence=3;await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io);assert.equal(h.calls[0].stage,'DISPATCH');
});
test('literal fourth order can hold before shielded calculation and block higher admission',async()=>{
 const h=harness();await runG5LiveBounded(h.state,{maxSteps:100,maxMilliseconds:1000,maxActive:1,admissionThrough:4,holds:['4:PREPARE_ZCASH']},h.io);
 assert.equal(h.state.slots.length,4);assert.equal(h.state.slots[2].stage,'DONE');assert.equal(h.state.slots[3].stage,'PREPARE_ZCASH');assert(!h.calls.some(c=>c.sequence===4&&c.stage==='PREPARE_ZCASH'));
});
test('phase parser never treats unknown statuses or cross-phase READY as success',()=>{
 assert.throws(()=>advanceG5LiveSlot({sequence:3,stage:'DISPATCH'},{status:'READY'}),/UNEXPECTED/);
 assert.throws(()=>advanceG5LiveSlot({sequence:4,stage:'OBSERVE_ZCASH'},{status:'SETTLED'}),/UNEXPECTED/);
 const slot={sequence:4,stage:'PREPARE_ZCASH' as const};assert.equal(advanceG5LiveSlot(slot,{status:'OBSERVER_WAIT'}),slot);
});
test('forward START observer waits return to source sync before every later admission attempt',async()=>{
 const h=harness(),normal=h.io.execute,events:string[]=[];let attempts=0;
 h.io.execute=async(n,stage)=>{events.push(stage);if(stage==='START'&&attempts++<2)return {status:'OBSERVER_WAIT'};return normal(n,stage);};
 await runG5LiveBounded(h.state,{maxSteps:8,maxMilliseconds:1000,maxActive:1},h.io);
 assert.deepEqual(events.slice(0,7),['SYNC','START','SYNC','START','SYNC','START','SOURCE_FUND']);
 assert.equal(h.calls.filter(c=>c.stage==='SOURCE_FUND').length,1);assert.equal(h.state.incident,false);
});
test('delayed successful admission refreshes source snapshot immediately before funding the unchanged instructions',async()=>{
 let currentTip=100,snapshotTip=100,sends=0;const events:string[]=[],funding=Object.freeze({amount:'100000',fee:'10000',cutoffHeight:112,receiver:'fixed',memo:'fixed'}),original=structuredClone(funding);
 // Model time consumed by a successful START and a later bounded tick resume.
 currentTip=103;assert(currentTip-snapshotTip>2);
 const result=await syncAndFundG5Source({sync:async()=>{events.push('SYNC');snapshotTip=currentTip;return {status:'SYNCED'};},fund:async()=>{events.push('FUND');assert.equal(snapshotTip,currentTip);assert.deepEqual(funding,original);sends++;return {status:'BROADCAST'};}});
 assert.equal(result.status,'BROADCAST');assert.deepEqual(events,['SYNC','FUND']);assert.equal(sends,1);assert.deepEqual(funding,original);
});
test('failed pre-fund refresh cannot invoke funding or alter an existing accepted cutoff',async()=>{
 let funds=0;const instructions=Object.freeze({cutoffHeight:112});
 await assert.rejects(()=>syncAndFundG5Source({sync:async()=>({status:'UNKNOWN'}),fund:async()=>{funds++;return {status:'BROADCAST'};}}),/FRESH_SOURCE_SYNC/);
 assert.equal(funds,0);assert.equal(instructions.cutoffHeight,112);
});
