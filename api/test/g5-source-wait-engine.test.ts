import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceG5LiveSlot,initialG5LiveState,runG5LiveBounded,syncAndFundG5Source,type G5LiveSnapshot,type G5LiveState,type G5LiveStage} from '../src/g5-live-controller.ts';

const wait=()=>({version:1,status:'SOURCE_PREFUND_WAIT',command:'sync',sequence:3,phase:'NETWORK_TIP',code:'SOURCE_RPC_UNAVAILABLE',sdkCompleted:true,sdkActive:false,uncertain:false,proposalStarted:false,intentCreated:false,intentAbsent:true,resultAbsent:true,lockReleased:true});
const original=()=>Object.freeze({acceptedOrder:'synthetic-original',cutoffHeight:'108',principal:'100000',feeCap:'10000',receiverDigest:'synthetic-receiver'});
function harness(stage:G5LiveStage='SOURCE_FUND'){
 const snapshot:G5LiveSnapshot={status:'G5_CONTROLLER_SNAPSHOT',runId:'synthetic-run',incident:false,reconciliationRequired:false,closed:false,availableBaseFeeWei:'50000000000000',operatorRawPending:false,barriers:[],orders:[1,2].map(sequence=>({sequence,state:'SETTLED',receiptVerified:true}))};
 const state=initialG5LiveState(snapshot.runId,'synthetic-binding',snapshot);state.slots.push({sequence:3,stage});snapshot.orders.push({sequence:3,state:stage==='DISPATCH'?'READY':'AWAITING_FUNDS',receiptVerified:false});
 const saved:G5LiveState[]=[],calls:{sequence:number;stage:string}[]=[];
 const io={now:()=>0,snapshot:async()=>structuredClone(snapshot),save:async(value:G5LiveState)=>{saved.push(structuredClone(value));},execute:async(sequence:number,phase:G5LiveStage|'BARRIER'|'CLOSE')=>{calls.push({sequence,stage:phase});return {status:'UNEXPECTED_TEST_CALL'};}};
 return {state,snapshot,saved,calls,io};
}

test('completed sync WAIT skips fund and retains stage; next fresh sync funds the identical accepted original once',async()=>{
 const binding=original(),before=structuredClone(binding),slot={sequence:3,stage:'SOURCE_FUND' as const};let syncs=0,funds=0;const calls:string[]=[];
 const io={sync:async()=>{calls.push('sync');return ++syncs===1?wait():{status:'SYNCED'};},fund:async()=>{calls.push('fund');funds++;assert.deepEqual(binding,before);return {status:'BROADCAST'};}};
 const first=await syncAndFundG5Source(io,3);assert.equal(advanceG5LiveSlot(slot,first),slot);const syncSlot={sequence:3,stage:'SYNC' as const};assert.equal(advanceG5LiveSlot(syncSlot,first),syncSlot);assert.equal(funds,0);
 const second=await syncAndFundG5Source(io,3);assert.deepEqual(advanceG5LiveSlot(slot,second),{sequence:3,stage:'OBSERVE_SOURCE'});
 assert.equal(funds,1);assert.equal(syncs,2);assert.deepEqual(calls,['sync','sync','fund']);assert.deepEqual(binding,before);
});

test('bounded engine persists soft pre-fund WAIT without incident then resumes the same original funding action',async()=>{
 const h=harness(),binding=original(),before=structuredClone(binding),firstCircle=structuredClone(h.state.slots.slice(0,2));let syncs=0,funds=0;
 h.io.execute=async(sequence,stage)=>{h.calls.push({sequence,stage});assert.deepEqual(h.saved.at(-1)?.inflight,{sequence,stage});assert.equal(sequence,3);assert.equal(stage,'SOURCE_FUND');return syncAndFundG5Source({sync:async()=>++syncs===1?wait():{status:'SYNCED'},fund:async()=>{funds++;assert.deepEqual(binding,before);return {status:'BROADCAST'};}},sequence);};
 const first=await runG5LiveBounded(h.state,{maxSteps:5,maxMilliseconds:1000,maxActive:1},h.io);
 assert.equal(first.status,'G5_CONTROLLER_BOUNDED_STOP');assert.equal(first.steps,1);assert.equal(funds,0);assert.equal(h.state.incident,false);assert.equal(h.state.inflight,undefined);assert.equal(h.state.slots[2].stage,'SOURCE_FUND');
 assert.deepEqual(h.state.lastOutcome,{sequence:3,stage:'SOURCE_FUND',status:'SOURCE_PREFUND_WAIT'});assert.equal(h.saved.some(s=>s.inflight?.sequence===3&&s.inflight.stage==='SOURCE_FUND'),true);
 const second=await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000,maxActive:1},h.io);
 assert.equal(second.status,'G5_CONTROLLER_BOUNDED_STOP');assert.equal(funds,1);assert.equal(syncs,2);assert.equal(h.state.slots[2].stage,'OBSERVE_SOURCE');assert.deepEqual(h.calls,[{sequence:3,stage:'SOURCE_FUND'},{sequence:3,stage:'SOURCE_FUND'}]);assert.deepEqual(h.state.slots.slice(0,2),firstCircle);assert.deepEqual(binding,before);assert.equal(h.state.incident,false);
});

test('forged wrong-sequence fund-phase SDK-timeout and post-proposal waits freeze engine before any fund call',async()=>{
 for(const delta of [{sequence:4},{sequence:5},{command:'fund'},{phase:'PROPOSE'},{phase:'SEND'},{code:'SOURCE_SDK_TIMEOUT'},{sdkCompleted:false},{sdkActive:true},{uncertain:true},{proposalStarted:true},{intentCreated:true},{intentAbsent:false},{resultAbsent:false},{lockReleased:false},{providerMessage:'private-test-value'}]){
  const h=harness(),firstCircle=structuredClone(h.state.slots.slice(0,2));let funds=0;
  h.io.execute=async(sequence,stage)=>{h.calls.push({sequence,stage});return syncAndFundG5Source({sync:async()=>({...wait(),...delta}),fund:async()=>{funds++;return {status:'BROADCAST'};}},sequence);};
  const result=await runG5LiveBounded(h.state,{maxSteps:3,maxMilliseconds:1000,maxActive:1},h.io);
  assert.equal(result.status,'UNKNOWN_OR_INCIDENT',JSON.stringify(delta));assert.equal(funds,0);assert.equal(h.state.incident,true);assert.deepEqual(h.state.inflight,{sequence:3,stage:'SOURCE_FUND'});assert.equal(h.state.slots[2].stage,'SOURCE_FUND');assert.deepEqual(h.state.slots.slice(0,2),firstCircle);
  await assert.rejects(()=>runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io),/ORIGINAL_EFFECT_RECONCILIATION_REQUIRED/);
 }
});

test('unknown sync exceptions and cross-phase typed waits remain hard without funding',async()=>{
 for(const error of [Error('G5_SOURCE_WALLET_COMMAND_FAILED'),Error('UNKNOWN_SOURCE_READ_OUTCOME')]){
  const h=harness();let funds=0;h.io.execute=async sequence=>syncAndFundG5Source({sync:async()=>{throw error;},fund:async()=>{funds++;return {status:'BROADCAST'};}},sequence);
  assert.equal((await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io)).status,'UNKNOWN_OR_INCIDENT');assert.equal(funds,0);assert.equal(h.state.incident,true);
 }
 const h=harness('DISPATCH');h.io.execute=async()=>wait();assert.equal((await runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io)).status,'UNKNOWN_OR_INCIDENT');assert.equal(h.state.incident,true);assert.deepEqual(h.state.inflight,{sequence:3,stage:'DISPATCH'});
 assert.throws(()=>advanceG5LiveSlot({sequence:4,stage:'SOURCE_FUND'},wait()),/UNEXPECTED_STAGE_STATUS/);assert.throws(()=>advanceG5LiveSlot({sequence:3,stage:'START'},wait()),/UNEXPECTED_STAGE_STATUS/);
});

test('a result originating from fund cannot disguise an unknown effect as a pre-fund sync WAIT',async()=>{
 const h=harness(),firstCircle=structuredClone(h.state.slots.slice(0,2));let syncs=0,funds=0;
 h.io.execute=async sequence=>syncAndFundG5Source({sync:async()=>{syncs++;return {status:'SYNCED'};},fund:async()=>{funds++;return wait();}},sequence);
 const result=await runG5LiveBounded(h.state,{maxSteps:2,maxMilliseconds:1000},h.io);
 assert.equal(result.status,'UNKNOWN_OR_INCIDENT');assert.equal(syncs,1);assert.equal(funds,1);
 assert.equal(h.state.incident,true);assert.deepEqual(h.state.inflight,{sequence:3,stage:'SOURCE_FUND'});
 assert.equal(h.state.slots[2].stage,'SOURCE_FUND');assert.deepEqual(h.state.slots.slice(0,2),firstCircle);
 await assert.rejects(()=>runG5LiveBounded(h.state,{maxSteps:1,maxMilliseconds:1000},h.io),/ORIGINAL_EFFECT_RECONCILIATION_REQUIRED/);
 assert.equal(funds,1);
});
