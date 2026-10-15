import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialG5LiveState,validateG5LiveState,advanceG5LiveSlot,runG5LiveBounded,syncAndFundG5Source,g5LiveOutcome,type G5LiveSnapshot,type G5LiveState,type G5LiveStage} from '../src/g5-live-controller.ts';
import {PrivateData} from '../src/private-data.ts';
import {randomBytes,randomUUID} from 'node:crypto';
import {observeEscrowFunding,escrowTerms} from '../src/base-escrow.ts';
import {publicSettlementId,type BaseContract} from '../src/base-contract.ts';
import {TransactionReceiptNotFoundError,type Hex} from 'viem';
import type pg from 'pg';
const snapshot=():G5LiveSnapshot=>({status:'G5_CONTROLLER_SNAPSHOT',runId:'run',incident:false,reconciliationRequired:false,closed:false,availableBaseFeeWei:'293508439999198',operatorRawPending:false,barriers:[],orders:[1,2].map(sequence=>({sequence,state:'SETTLED',receiptVerified:true}))});
const results:Partial<Record<G5LiveStage|'BARRIER'|'CLOSE',string>>={SYNC:'SYNCED',SOURCE_FUND:'BROADCAST',REVERSE_QUOTE:'AWAITING_FUNDS',FUNDING_CALL:'FUNDING_CALL_SAVED_FOR_SEPARATE_PAYER',PAYER_APPROVAL:'PAYER_APPROVAL_SAVED',PAYER_PREPARE:'PREPARED',PAYER_BROADCAST:'ORIGINAL_PAYER_BROADCAST_KNOWN',OBSERVE_SOURCE:'READY',DISPATCH:'SETTLED',PREPARE_COMMIT:'COMMIT_SIGNED_DURABLY',BROADCAST_COMMIT:'AWAITING_BASE_FINALITY',OBSERVE_COMMIT:'COMMIT_FINALIZED',APPROVE_WALLET:'IMMUTABLE_PRIVATE_WALLET_APPROVAL_SAVED',PREPARE_ZCASH:'ZCASH_SIGNED_DURABLY',BROADCAST_ZCASH:'AWAITING_ZCASH_FINALITY',OBSERVE_ZCASH:'ZCASH_DELIVERY_FINALIZED',PREPARE_SETTLE:'SETTLE_SIGNED_DURABLY',BROADCAST_SETTLE:'AWAITING_BASE_FINALITY',OBSERVE_SETTLE:'SETTLED',VERIFY:'G5_ORDER_RECEIPTS_VERIFIED',BARRIER:'G5_BATCH_VERIFIED',CLOSE:'G5_CLOSED'};
test('durable preparation WAIT pin precedes admission and survives original prepare through broadcast',async()=>{
 const h=harness();h.state.slots.push({sequence:3,stage:'DONE'},{sequence:4,stage:'PREPARE_COMMIT'});h.snap.orders.push({sequence:3,state:'SETTLED',receiptVerified:true},{sequence:4,state:'READY',receiptVerified:false});
 const responses=['OBSERVER_WAIT','COMMIT_SIGNED_DURABLY','OBSERVER_WAIT','AWAITING_BASE_FINALITY'];const calls:string[]=[];
 h.io.execute=async(sequence,stage)=>{calls.push(`${sequence}:${stage}`);return {status:responses.shift()!};};
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);
 assert.deepEqual(h.saved.at(-1)?.preparePriority,{sequence:4,stage:'PREPARE_COMMIT'});
 for(let i=0;i<3;i++)await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},h.io);
 assert.deepEqual(calls,['4:PREPARE_COMMIT','4:PREPARE_COMMIT','4:BROADCAST_COMMIT','4:BROADCAST_COMMIT']);assert.equal(h.state.slots.length,4);assert.equal(h.state.slots[3].stage,'OBSERVE_COMMIT');assert.equal(h.state.preparePriority,undefined);
});
test('fresh terminal proof retires original prepare pin through VERIFY while local DONE alone cannot',async()=>{
 for(const stage of ['DISPATCH','VERIFY','DONE'] as const){const h=harness();h.state.slots.push({sequence:3,stage});h.state.preparePriority={sequence:3,stage:'DISPATCH'};h.snap.orders.push({sequence:3,state:'SETTLED',receiptVerified:stage==='DONE'});
  await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);assert.equal(h.state.preparePriority,undefined);assert.equal(h.state.incident,false);
  if(stage!=='DONE')assert.deepEqual(h.calls,[{sequence:3,stage:'VERIFY'}]);
 }
 const h=harness();h.state.slots.push({sequence:3,stage:'DONE'});h.state.preparePriority={sequence:3,stage:'DISPATCH'};h.snap.orders.push({sequence:3,state:'SETTLED',receiptVerified:false});
 await assert.rejects(runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io),/COMPLETED_RECEIPT_CONTRADICTION/);assert(h.state.preparePriority);assert.equal(h.calls.length,0);
});
test('priority cannot bypass an unknown effect or incompatible original raw guard',async()=>{
 const h=harness();h.state.slots.push({sequence:3,stage:'DISPATCH'});h.snap.orders.push({sequence:3,state:'READY',receiptVerified:false});h.state.preparePriority={sequence:3,stage:'DISPATCH'};h.snap.operatorRawPending=true;h.snap.operatorRawSequence=4;
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},h.io);assert.equal(h.calls.length,0);assert(h.state.preparePriority);
 h.state.incident=true;await assert.rejects(runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io),/ORIGINAL_EFFECT_RECONCILIATION_REQUIRED/);assert(h.state.preparePriority);
});
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
test('PAY reconciliation returning NO_ELIGIBLE_JOB advances only through a fresh SETTLED snapshot and actual receipt verification',async()=>{
 const h=harness();h.state.slots.push({sequence:3,stage:'DISPATCH'});h.snap.orders.push({sequence:3,state:'READY',receiptVerified:false});const events:string[]=[];
 h.io.execute=async(n,stage)=>{
  events.push(stage);const row=h.snap.orders.find(o=>o.sequence===n)!;
  if(stage==='DISPATCH'){
   // Production dispatch reconciles before claiming: original PAY finalizes,
   // its job is DONE, and the subsequent claim has no eligible job.
   row.state='SETTLED';return {status:'NO_ELIGIBLE_JOB'};
  }
  assert.equal(stage,'VERIFY');assert.equal(row.state,'SETTLED');assert.equal(h.state.slots[2].stage,'VERIFY');assert.equal(row.receiptVerified,false);
  row.receiptVerified=true;return {status:'G5_ORDER_RECEIPTS_VERIFIED'};
 };
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);
 assert.equal(h.state.slots[2].stage,'DISPATCH');assert.equal(h.snap.orders[2].receiptVerified,false);
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);
 assert.deepEqual(events,['DISPATCH','VERIFY']);assert.equal(h.state.slots[2].stage,'DONE');assert.equal(h.snap.orders[2].receiptVerified,true);
});
test('terminal snapshot promotion cannot complete an order when independent receipt verification fails',async()=>{
 const h=harness();h.state.slots.push({sequence:3,stage:'DISPATCH'});h.snap.orders.push({sequence:3,state:'SETTLED',receiptVerified:false});h.snap.operatorRawPending=true;h.snap.operatorRawSequence=4;
 let verifications=0;h.io.execute=async(_n,stage)=>{assert.equal(stage,'VERIFY');verifications++;throw Error('fresh original receipt contradiction');};
 const r=await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);
 assert.equal(r.status,'UNKNOWN_OR_INCIDENT');assert.equal(h.state.slots[2].stage,'VERIFY');assert.equal(h.state.incident,true);assert.equal(h.snap.orders[2].receiptVerified,false);assert.equal(verifications,1);assert.equal(r.settledReceipts,2);
});
test('reverse source funding finality waits remain observable until READY, then only prepare the original COMMIT',async()=>{
 const h=harness();h.state.slots.push({sequence:3,stage:'DONE'},{sequence:4,stage:'OBSERVE_SOURCE'});h.snap.orders.push({sequence:3,state:'SETTLED',receiptVerified:true},{sequence:4,state:'AWAITING_FUNDS',receiptVerified:false});let observations=0;const stages:string[]=[];
 h.io.execute=async(n,stage)=>{assert.equal(n,4);stages.push(stage);if(stage==='OBSERVE_SOURCE')return {status:observations++<2?'AWAITING_BASE_FINALITY':'READY'};assert.equal(stage,'PREPARE_COMMIT');return {status:'COMMIT_SIGNED_DURABLY'};};
 for(let i=0;i<2;i++){const r=await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);assert.equal(r.status,'G5_CONTROLLER_BOUNDED_STOP');assert.equal(h.state.slots[3].stage,'OBSERVE_SOURCE');assert.equal(h.state.incident,false);assert.equal(h.saved.at(-1)?.lastOutcome?.status,'AWAITING_BASE_FINALITY');}
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);assert.equal(h.state.slots[3].stage,'PREPARE_COMMIT');
 await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);assert.equal(h.state.slots[3].stage,'BROADCAST_COMMIT');assert.deepEqual(stages,['OBSERVE_SOURCE','OBSERVE_SOURCE','OBSERVE_SOURCE','PREPARE_COMMIT']);
 assert.throws(()=>advanceG5LiveSlot({sequence:3,stage:'OBSERVE_SOURCE'},{status:'AWAITING_BASE_FINALITY'}),/UNEXPECTED_STAGE_STATUS/);
});
test('unexpected engine status persists a bounded last outcome before transition failure without retaining provider text',async()=>{
 const h=harness(),secret='PROVIDER_PRIVATE_PASSWORD_'+ 'AB'.repeat(32);h.state.slots.push({sequence:3,stage:'OBSERVE_SOURCE'});h.snap.orders.push({sequence:3,state:'AWAITING_FUNDS',receiptVerified:false});h.io.execute=async()=>({status:secret});
 const r=await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);assert.equal(r.status,'UNKNOWN_OR_INCIDENT');assert.equal(h.state.transitionFailure?.code,'G5_LIVE_UNEXPECTED_STAGE_STATUS');assert.equal(h.state.lastOutcome?.status,'UNKNOWN_STATUS');assert.match(h.state.lastOutcome?.unknownStatusHash??'',/^[0-9a-f]{64}$/);assert(h.saved.some(s=>s.lastOutcome?.status==='UNKNOWN_STATUS'&&!s.incident));assert.equal(JSON.stringify(h.saved).includes(secret),false);
 assert.equal(g5LiveOutcome(4,'OBSERVE_SOURCE','AWAITING_BASE_FINALITY').status,'AWAITING_BASE_FINALITY');
});
test('actual source funding observer pending-receipt outcome is a reverse source wait with no writes',async()=>{
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),id=randomUUID(),settlementId=randomUUID(),address='0x1111111111111111111111111111111111111111';let auth:any,writes=0;
 const q={id,settlement_id:settlementId,direction:'BASE_TO_ZCASH',execution_mode:'base-escrow-v1',base_contract:address,input_amount:'100000',output_amount:'100000',funding_cutoff_time:new Date('2026-10-15T18:00:00Z'),cancellation_available_at:new Date('2026-10-15T20:00:00Z'),private_payload:keys.seal({direction:'BASE_TO_ZCASH',executionMode:'base-escrow-v1',baseContract:address,inputAmount:'100000',outputAmount:'100000',payer:address,refundRecipient:address,depositReceiver:'escrow:'+publicSettlementId(settlementId)},`quote:${id}:v1`)};
 const pool={query:async(sql:string)=>{if(!sql.startsWith('SELECT'))writes++;return {rows:sql.includes('zee.escrow_bindings')?[{terms_payload:keys.seal(auth,`escrow-terms:${id}:v1`)}]:[q]};}} as unknown as pg.Pool;
 const hash=('0x'+'ab'.repeat(32)) as Hex,base={registry:{contracts:{MockUSDC:{address},ZeeSwapSettlement:{address}}},client:{getTransactionReceipt:async()=>{throw new TransactionReceiptNotFoundError({hash});}}} as unknown as BaseContract;
 auth={terms:await escrowTerms(pool,keys,base,id),signature:('0x'+'ab'.repeat(65))};const actual=await observeEscrowFunding(pool,keys,base,id,hash);
 const slot={sequence:4,stage:'OBSERVE_SOURCE' as const};assert.equal(advanceG5LiveSlot(slot,actual),slot);assert.equal(writes,0);
});
test('already-finalized reverse broadcast still enters its fresh observation gate and cannot authorize later phases',()=>{
 assert.equal(advanceG5LiveSlot({sequence:4,stage:'BROADCAST_COMMIT'},{status:'ALREADY_FINALIZED'}).stage,'OBSERVE_COMMIT');
 assert.equal(advanceG5LiveSlot({sequence:4,stage:'BROADCAST_SETTLE'},{status:'ALREADY_FINALIZED'}).stage,'OBSERVE_SETTLE');
 for(const stage of ['OBSERVE_COMMIT','APPROVE_WALLET','OBSERVE_SETTLE','VERIFY'] as const)assert.throws(()=>advanceG5LiveSlot({sequence:4,stage},{status:'ALREADY_FINALIZED'}),/UNEXPECTED_STAGE_STATUS/);
});
test('checkpoint observer wait preserves barrier/closed state and only a later successful proof advances it',async()=>{
 for(const close of [false,true]){
  const h=harness(),count=close?20:5;h.state.slots=Array.from({length:count},(_,i)=>({sequence:i+1,stage:'DONE'}));h.snap.orders=Array.from({length:count},(_,i)=>({sequence:i+1,state:'SETTLED',receiptVerified:true}));h.state.barriers=close?[5,10,15,20]:[];h.snap.barriers=[...h.state.barriers];let proofs=0;
  h.io.execute=async(_n,stage)=>{assert.equal(stage,close?'CLOSE':'BARRIER');if(proofs++===0)return {status:'OBSERVER_WAIT'};if(close)h.snap.closed=true;else h.snap.barriers.push(5);return {status:close?'G5_CLOSED':'G5_BATCH_VERIFIED'};};
  const before=[...h.state.barriers];await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io);assert.deepEqual(h.state.barriers,before);assert.equal(h.state.closed,false);assert.equal(h.state.incident,false);assert.equal(h.state.inflight,undefined);assert.equal(h.state.lastOutcome?.status,'OBSERVER_WAIT');
  await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io);assert.equal(proofs,2);if(close)assert.equal(h.state.closed,true);else assert.deepEqual(h.state.barriers,[5]);
 }
});
