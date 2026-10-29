import test from 'node:test';import assert from 'node:assert/strict';
import {closedV2Fixture} from './envio-event-first-closed-fixture.ts';
import {fetchEventFirstReplacement} from '../../src/integrations/observation/envio-event-first-consumer.ts';
import {produceEventFirstExport,type EventFirstState,type EventFirstReader} from '../../src/integrations/observation/envio-event-first.ts';
async function fixture(width=150,firstLag=2,sourceLag=5){
 const x=await closedV2Fixture(),Original=Date,start=Date.now(),H=x.m.last.height+1000,from=H-width+1;let clock=start;
 class ClockDate extends Original{constructor(value?:string|number){super(value===undefined?clock:value);}static now(){return clock;}}
 globalThis.Date=ClockDate as DateConstructor;
 const header=(h:number)=>({...x.header(h),time:new Date(start+(h-H-2)*200).toISOString()}),ranges:{from:number;through:number}[]=[],rawPackets:any[]=[],samples:any[]=[];
 const sourceId=x.reader.sourceId,peerId='base-sepolia-official-independent-rpc',F=H-100;
 const peer:EventFirstReader={sourceId:peerId,sourceProofSourceId:sourceId,headerBatchSize:10,sample:async()=>{const sample={sourceId:peerId,head:header(H+Math.floor((clock-start)/200)+(samples.length===0?firstLag:2)),finalized:header(F),checkedAt:new Date().toISOString()};samples.push(structuredClone(sample));return sample;},header:async h=>header(h),headers:async hs=>hs.map(header),logs:async()=>[]};
 const request:typeof fetch=async(input,init)=>{const u=new URL(String(input));assert.ok(u.pathname.endsWith('/export'),'fixed mode must not issue tail status');init?.signal?.throwIfAborted();const a=Number(u.searchParams.get('from')),b=Number(u.searchParams.get('through')),M=H+Math.floor((clock-start)/200);ranges.push({from:a,through:b});
  const stamp=new Date().toISOString(),state:EventFirstState={generation:x.a.identity.generation,projectionDigest:x.a.identity.policy.projectionDigest,registryDigest:x.a.identity.policy.registryDigest,revision:'1000',progress:{height:M,checkpointId:'1000'},checkpoint:{chainId:84532,id:'1000',height:M,hash:header(M).hash},processor:{height:M,observedAt:stamp},recoveryFloor:from-1};
  const reader:EventFirstReader={...x.reader,header:async h=>header(h),headers:async hs=>hs.map(header),sample:async()=>({sourceId,head:header(M+sourceLag),finalized:header(F),checkedAt:stamp}),logs:async()=>{clock+=5000;return[];}};
  const packet=await produceEventFirstExport({policy:x.a.identity.policy,generation:state.generation,from:a,through:b,reader,verificationSourceId:sourceId,snapshot:async()=>({state,events:[]}),fence:async()=>state,signal:init!.signal!,now:()=>clock});rawPackets.push(structuredClone(packet));return Response.json(packet);
 };
 const run=(signal=AbortSignal.timeout(30000),get=request)=>fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',from,H,x.a.identity.policy,x.a.identity.generation,peer,signal,get,{boundedFinalTail:true,preReadFreshness:true,fixedReadStartTarget:true});
 return{...x,H,from,header,ranges,rawPackets,samples,peer,request,run,restore(){globalThis.Date=Original;}};
}
test('fixed start target covers every planned header once without status or chasing a head that advances 75 blocks',async()=>{
 const f=await fixture();try{const result=await f.run();assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,22]);assert.equal(result.coverage.through.height,f.H);assert.deepEqual(result.headers.map(h=>h.height),Array.from({length:150},(_,i)=>f.from+i));assert.deepEqual(result.coverage.sourceHead,f.samples[0].head);assert.equal(result.coverage.sourceHead.height,f.H+2);assert.ok(f.rawPackets.at(-1).producer.sourceHead.height>f.H+40);assert.equal(result.coverage.sourceSampledAt,f.rawPackets[0].producer.sourceSampledAt);assert.ok(result.coverage.sourceHead.height!==result.coverage.through.height);assert.ok(f.rawPackets.every(p=>p.producer.sourceHead.height-p.producer.through.height===5));}finally{f.restore();}
});
test('target must be independently current at start: behind or more than 40 ahead refuses before any SDK export',async()=>{
 for(const lag of [-1,41]){const f=await fixture(150,lag);try{await assert.rejects(f.run(),/EVENT_FIRST_READ_START_TARGET/);assert.equal(f.ranges.length,0);}finally{f.restore();}}
});
test('fixed mode still refuses incomplete/oversized ranges and stale claimed Source freshness',async()=>{
 const a=await fixture(1001);try{await assert.rejects(a.run(),/ENVIO_ADMISSION_GAP/);assert.equal(a.ranges.length,0);}finally{a.restore();}
 const b=await fixture(32,2,41);try{await assert.rejects(b.run(),/EVENT_FIRST_CANONICAL_SOURCE/);}finally{b.restore();}
});
test('fixed target preserves independent full-header, log and end-reorg refusals',async()=>{
 for(const mode of ['header','logs','end']){const f=await fixture(32);let afterLogs=false;try{f.peer.headers=async hs=>hs.map(h=>({...f.header(h),...(mode==='header'&&hs.length===10||mode==='end'&&afterLogs&&h===f.H?{hash:f.header(1).hash}:{})}));f.peer.logs=async()=>{afterLogs=true;return mode==='logs'?[{}]:[];};await assert.rejects(f.run());}finally{f.restore();}}
});
test('cancellation drains a fixed future packet and cannot return a partial replacement',async()=>{
 const f=await fixture(),stop=new AbortController();let active=0,blocked=0;
 const request:typeof fetch=async(input,init)=>{if(Number(new URL(String(input)).searchParams.get('from'))!==f.from+64)return f.request(input,init);active++;blocked++;try{await new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});stop.abort(Error('FIXED_FUTURE_STOP'));});throw Error('unreachable');}finally{active--;}};
 try{await assert.rejects(f.run(stop.signal,request),/FIXED_FUTURE_STOP/);assert.equal(active,0);assert.equal(blocked,1);assert.equal(f.ranges.length,1);}finally{f.restore();}
});

test('fixed target does not renew the original 30-second complete-read budget',async()=>{
 const f=await fixture(500);try{await assert.rejects(f.run(),/EVENT_FIRST_CONSUMER_BUDGET/);assert.equal(f.ranges.at(-1)!.through,f.H);assert.ok(f.ranges.every(r=>r.through<=f.H));}finally{f.restore();}
});
