import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {FAST_IDLE_TABLES,FAST_IDLE_ZERO_COUNTS,fastIdleTableDigestSql,validateFastIdleLaunchProof,requireFastIdleLaunchState,consumeFastIdleLaunch,type FastIdleLaunchProof,type FastIdleLaunchState} from '../src/fast-testnet-idle-launch.ts';
const now=Date.now(),hash='1'.repeat(64),expected={workerConfigSha256:hash,fastRootSha256:'2'.repeat(64),policySha256:'3'.repeat(64),activeEpoch:'240'};
function fixture(){const proof:FastIdleLaunchProof={version:1,purpose:'ROOT_BASE_L2_IDLE_LAUNCH',...expected,effectiveEpoch:expected.activeEpoch,controlXmin:'1234',approvedAt:new Date(now-1000).toISOString(),publishBefore:new Date(now+599000).toISOString(),originalWorkerPid:123,closedReceiptProof:{path:'/opt/zeeswap-testnet/state/service-policy/closed-receipts.private.json',sha256:'4'.repeat(64)},tableDigests:Object.fromEntries(FAST_IDLE_TABLES.map(t=>[t,{rows:1,sha256:'5'.repeat(64)}]))};const state:FastIdleLaunchState={control:{epoch:'240',xmin:'1234',accepting_orders:true,dispatch_enabled:true,reconciliation_required:false},tableDigests:structuredClone(proof.tableDigests),counts:Object.fromEntries(FAST_IDLE_ZERO_COUNTS.map(k=>[k,0])),originalWorkerAlive:false,financialProcessPids:[],checkedAt:new Date(now),sources:['zcash-testnet','base-sepolia'].map(network=>({network,scanned_height:'1000',finalized_height:'990',observed_at:new Date(now)}))};return {proof,state};}
test('one exact Root launch requires finite ten-minute authority, exact config/policy and explicit full table set',()=>{
 const {proof,state}=fixture();validateFastIdleLaunchProof(proof,expected,now);requireFastIdleLaunchState(proof,state);
 for(const patch of [{workerConfigSha256:'f'.repeat(64)},{fastRootSha256:'f'.repeat(64)},{policySha256:'f'.repeat(64)},{purpose:'ROOT_BYPASS'},{approvedAt:new Date(now+1).toISOString()},{publishBefore:new Date(now).toISOString()},{publishBefore:new Date(now+600001).toISOString()},{originalWorkerPid:0},{effectiveEpoch:'241'}])assert.throws(()=>validateFastIdleLaunchProof({...proof,...patch},expected,now),/FAST_IDLE_LAUNCH_/);
 const missing=structuredClone(proof);delete missing.tableDigests.base_inclusions;assert.throws(()=>validateFastIdleLaunchProof(missing,expected,now),/EXACT_TABLE_SET/);
 assert.throws(()=>fastIdleTableDigestSql('orders; DELETE FROM zee.orders'),/TABLE_NAME/);assert.match(fastIdleTableDigestSql('orders'),/jsonb_agg\(r ORDER BY r::text\)/);
});
test('tampered closed books, active finance, old process, stale source or changed control refuse',()=>{
 const {proof,state}=fixture();const book=structuredClone(state);book.tableDigests.orders!.sha256='f'.repeat(64);assert.throws(()=>requireFastIdleLaunchState(proof,book),/EXACT_CLOSED_BOOKS/);
 for(const counter of FAST_IDLE_ZERO_COUNTS){const active=structuredClone(state);active.counts[counter]=1;assert.throws(()=>requireFastIdleLaunchState(proof,active),/NO_UNRESOLVED_FINANCE/);}
 for(const patch of [{originalWorkerAlive:true},{financialProcessPids:[123]},{control:{...state.control,xmin:'1235'}},{control:{...state.control,reconciliation_required:true}},{sources:state.sources.map(s=>({...s,observed_at:new Date(now-61000)}))}])assert.throws(()=>requireFastIdleLaunchState(proof,{...state,...patch}),/FAST_IDLE_LAUNCH_/);
});
test('one-time consumption uses exclusive durable marker and refuses every replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'zee-fast-launch-')),path=join(directory,'consumed.private.json');try{
  await consumeFastIdleLaunch(path,hash,expected.workerConfigSha256);const value=JSON.parse(await readFile(path,'utf8'));assert.equal(value.proofSha256,hash);assert.equal(value.workerConfigSha256,expected.workerConfigSha256);
  await assert.rejects(consumeFastIdleLaunch(path,hash,expected.workerConfigSha256),{code:'EEXIST'});
 }finally{await rm(directory,{recursive:true,force:true});}
});


test('Root resume keeps raw admission epoch while authorizing only the exact effective control epoch',()=>{
 const {proof,state}=fixture(),resumed={...proof,effectiveEpoch:'242'};
 validateFastIdleLaunchProof(resumed,{...expected,effectiveEpoch:'242'},now);
 assert.throws(()=>requireFastIdleLaunchState(resumed,state),/EXACT_ACTIVE_IDLE_CONTROL/);
 requireFastIdleLaunchState(resumed,{...state,control:{...state.control,epoch:'242'}});
 assert.equal(resumed.activeEpoch,'240');
 assert.throws(()=>validateFastIdleLaunchProof({...resumed,effectiveEpoch:'243'},{...expected,effectiveEpoch:'242'},now),/CONTROL/);
});
