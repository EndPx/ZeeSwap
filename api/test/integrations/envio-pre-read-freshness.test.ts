import test from 'node:test';import assert from 'node:assert/strict';
import {closedV2Fixture} from './envio-event-first-closed-fixture.ts';
import {produceEventFirstExport,requireIndependentEventFirstSource,safeIndependentSourceDetails,type EventFirstReader,type EventFirstState,type OrdinaryPreReadSample} from '../../src/integrations/observation/envio-event-first.ts';
import {verifyEventFirstExportParallel} from '../../src/integrations/observation/envio-event-first-consumer-performance.ts';
async function fixture(){
 const x=await closedV2Fixture(),M=x.m.last.height+1000,start=Date.now()-14000,stamp=new Date(start).toISOString(),header=(h:number)=>({...x.header(h),time:new Date(start+(h-M-5)*200).toISOString()}),sourceId=x.reader.sourceId,independent='base-sepolia-official-independent-rpc';
 const state:EventFirstState={generation:x.a.identity.generation,projectionDigest:x.a.identity.policy.projectionDigest,registryDigest:x.a.identity.policy.registryDigest,revision:'1000',progress:{height:M,checkpointId:'1000'},checkpoint:{chainId:84532,id:'1000',height:M,hash:header(M).hash},processor:{height:M,observedAt:stamp},recoveryFloor:M-200};
 const source:EventFirstReader={...x.reader,header:async h=>header(h),headers:async hs=>hs.map(header),sample:async()=>({sourceId,head:header(M+5),finalized:header(M-10),checkedAt:stamp}),logs:async()=>[]};let ticks=0;
 const packet=await produceEventFirstExport({policy:x.a.identity.policy,generation:state.generation,from:M-63,through:M,reader:source,verificationSourceId:sourceId,snapshot:async()=>({state,events:[]}),fence:async()=>state,now:()=>++ticks===1?start:start+5000});
 const late={sourceId:independent,head:header(M+76),finalized:header(M-10),checkedAt:new Date().toISOString()};
 const reader:EventFirstReader={sourceId:independent,sourceProofSourceId:sourceId,headerBatchSize:10,sample:async()=>late,header:async h=>header(h),headers:async hs=>hs.map(header),logs:async()=>[]};
 const pre:OrdinaryPreReadSample={sample:{sourceId:independent,head:header(M+10),finalized:header(M-10),checkedAt:new Date(start-10).toISOString()},exportRequestedAt:stamp};return{...x,M,start,header,packet,late,reader,pre};
}
test('actual 14-second network advance checks start-time 40 without treating the later 76-block advance as stale Source',async()=>{
 const f=await fixture(),before=JSON.stringify(f.packet);assert.throws(()=>requireIndependentEventFirstSource(f.packet,f.late,f.reader),/EVENT_FIRST_INDEPENDENT_SOURCE/);
 assert.deepEqual(await verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:f.pre}),f.packet);assert.equal(JSON.stringify(f.packet),before);
});
test('genuinely stale at start above 40 refuses and diagnostics distinguish pre-read from later sample',async()=>{
 const f=await fixture();f.pre.sample.head=f.header(f.M+41);let error:unknown;
 try{await verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:f.pre});}catch(e){error=e;}
 const d=safeIndependentSourceDetails(error)!;assert.equal(d.checks.mLagWithin40,false);assert.equal(d.mLag,41);assert.equal(d.canonical.head,f.M+76);assert.equal(d.preRead!.head,f.M+41);assert.doesNotMatch(JSON.stringify(d),/authorization|token|recipient|observations/);
});
test('ordinary opt-in refuses missing, wrong-provider, late, uncoupled or renewed pre-fetch samples',async()=>{
 for(const kind of ['missing','provider','old','future','after-request','no-finality']){const f=await fixture();let pre:OrdinaryPreReadSample|undefined=f.pre;
  if(kind==='missing')pre=undefined;if(kind==='provider')f.pre.sample.sourceId='different';if(kind==='old')f.pre.sample.checkedAt=new Date(f.start-5001).toISOString();if(kind==='future'){f.pre.sample.checkedAt=new Date(f.start+5001).toISOString();f.pre.exportRequestedAt=f.pre.sample.checkedAt;}if(kind==='after-request')f.pre.sample.checkedAt=new Date(f.start+1).toISOString();if(kind==='no-finality')f.pre.sample.finalized=undefined;
  await assert.rejects(verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:pre}),/EVENT_FIRST_PRE_READ_SAMPLE/);
 }
});
test('later peer must still reach claimed head/M and retain original finality',async()=>{
 for(const kind of ['head','finality']){const f=await fixture();if(kind==='head')f.late.head=f.header(f.M+4);else f.late.finalized=f.header(f.M-11);
  await assert.rejects(verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:f.pre}),/EVENT_FIRST_INDEPENDENT_SOURCE/);
 }
});
test('full independent end fences still reject a changed source anchor after logs',async()=>{
 const f=await fixture();let end=false;f.reader.logs=async()=>{end=true;return[];};f.reader.headers=async hs=>hs.map(h=>({...f.header(h),...(end&&h===f.M?{hash:f.header(1).hash}:{})}));
 await assert.rejects(verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:f.pre}),/EVENT_FIRST_INDEPENDENT_END_REORG/);
});

test('later finality cannot regress below the own pre-read fact even when it still meets Source finality',async()=>{
 const f=await fixture();f.pre.sample.finalized=f.header(f.M-5);let samples=0;f.reader.sample=async()=>{samples++;return f.late;};
 await assert.rejects(verifyEventFirstExportParallel(f.packet,f.a.identity.policy,f.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:f.pre}),/EVENT_FIRST_INDEPENDENT_SOURCE/);assert.equal(samples,3);
 const g=await fixture();g.pre.sample.finalized=g.header(g.M-5);let rereads=0;g.reader.finalizedHeader=async()=>{rereads++;return g.header(g.M-5);};
 assert.deepEqual(await verifyEventFirstExportParallel(g.packet,g.a.identity.policy,g.reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:g.pre}),g.packet);assert.equal(rereads,1);
});
