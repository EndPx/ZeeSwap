import test from 'node:test';import assert from 'node:assert/strict';
import {closedV2Fixture} from './envio-event-first-closed-fixture.ts';
import {produceEventFirstExport,type EventFirstState,type EventFirstReader} from '../../src/integrations/observation/envio-event-first.ts';
import {fetchEventFirstReplacement,eventFirstTailFailureMetadata} from '../../src/integrations/observation/envio-event-first-consumer.ts';
import {observeEnvioOnce} from '../../src/integrations/observation/envio-live.ts';
import {PrivateData} from '../../src/private-data.ts';
async function fixture(growth=49,maxBlocks=1000,lateProducerAdvance=0,initialBlocks=263,initialSourceAhead=0){
 const x=await closedV2Fixture(),from=x.m.last.height+1,initial=from+initialBlocks-1,policy={...x.a.identity.policy,maxBlocks},generation=x.a.identity.generation;
 let M=initial+initialSourceAhead,statusCalls=0,consumerSamples=0;const ranges:{from:number;through:number}[]=[],source={...x.reader,sample:async(_signal?:AbortSignal)=>({sourceId:x.reader.sourceId,head:x.header(M+2),finalized:x.header(M-10),checkedAt:new Date().toISOString()})};
 const state=(h:number):EventFirstState=>({generation,projectionDigest:policy.projectionDigest,registryDigest:policy.registryDigest,revision:'1000',progress:{height:h,checkpointId:'1000'},checkpoint:{chainId:84532,id:'1000',height:h,hash:x.header(h).hash},processor:{height:h,observedAt:new Date().toISOString()},recoveryFloor:from-1});
 const reader:EventFirstReader={...source,headerBatchSize:10,headers:async hs=>hs.map(x.header),sample:async signal=>{consumerSamples++;return source.sample(signal);},logs:async()=>[]};
 const request:typeof fetch=async(input,_init)=>{const u=new URL(String(input));if(u.pathname.endsWith('/status')){statusCalls++;const observed=initial+growth;if(growth>=0&&growth<100)M=observed;return Response.json({protocol:'zee-envio-event-first-status-v1',state:state(observed)});}
  const start=Number(u.searchParams.get('from')),end=Number(u.searchParams.get('through'));ranges.push({from:start,through:end});if(start<=initial)M=Math.max(M,initial+Math.min(32,ranges.length*8));
  if(end===initial+growth)M+=lateProducerAdvance;const captured=state(M),packet=await produceEventFirstExport({policy,generation,from:start,through:end,reader:source,verificationSourceId:source.sourceId,snapshot:async()=>({state:captured,events:[]}),fence:async()=>captured});return Response.json(packet);
 };
 return{...x,from,initial,policy,generation,reader,request,ranges,state,get statusCalls(){return statusCalls;},get consumerSamples(){return consumerSamples;}};
}
test('actual R6 four64 + short7 + fresh49 becomes exactly four64 + one56, with no sixth dispatch',async()=>{
 const f=await fixture(),result=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true});
 assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,64,64,56]);assert.equal(f.statusCalls,1);assert.equal(result.headers.length,312);assert.equal(result.coverage.fromHeight,f.from);assert.equal(result.coverage.through.height,f.initial+49);
 assert.deepEqual(result.headers.map(h=>h.height),Array.from({length:312},(_,i)=>f.from+i));
});
test('tail over128 or complete-range bound refuses instead of dropping or chasing the remainder',async()=>{
 for(const [growth,max]of [[122,1000],[49,270]]){const f=await fixture(growth,max);await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true}),growth===122?/FINAL_TAIL_TOO_LARGE/:/ENVIO_ADMISSION_GAP/);assert.equal(f.ranges.length,4);assert.equal(f.statusCalls,1);}
});
test('less than10 seconds remaining refuses before tail status or export; original30second budget is retained',async()=>{
 const f=await fixture(),original=Date.now,start=original();let offset=0;
 try{Date.now=()=>start+offset;const request:typeof fetch=async(input,init)=>{const result=await f.request(input,init);if(f.ranges.length===4)offset=20001;return result;};await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),request,{boundedFinalTail:true}),/FINAL_TAIL_BUDGET/);assert.equal(f.statusCalls,0);assert.equal(f.ranges.length,4);}finally{Date.now=original;}
});
test('abort drains the sole prefetched tail status without starting its export',async()=>{
 const f=await fixture(),stop=new AbortController();let active=0;
 const request:typeof fetch=async(input,init)=>{if(!new URL(String(input)).pathname.endsWith('/status'))return f.request(input,init);active++;try{await new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});stop.abort(Error('TAIL_STATUS_STOP'));});throw Error('unreachable');}finally{active--;}};
 await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,stop.signal,request,{boundedFinalTail:true}),/TAIL_STATUS_STOP/);assert.equal(active,0);assert.equal(f.ranges.length,4);
});
test('original finality flow does not add a separate end-peer lag acceptance rule',async()=>{
 const f=await fixture(),original=globalThis.fetch;let initialStatus=true,saves=0,queries=0;
 globalThis.fetch=async(input,init)=>{if(initialStatus&&new URL(String(input)).pathname.endsWith('/status')){initialStatus=false;return Response.json({protocol:'zee-envio-event-first-status-v1',state:f.state(f.initial)});}return f.request(input,init);};
 const reader={...f.reader,sample:async(signal:AbortSignal)=>f.consumerSamples>=5?{sourceId:f.reader.sourceId,head:f.header(f.initial+49+41),finalized:f.header(f.initial-10),checkedAt:new Date().toISOString()}:f.reader.sample(signal)};
 const pool={async query(sql:string){queries++;if(sql.startsWith('SELECT scanned_height'))return{rows:[{scanned_height:String(f.from+31),finalized_height:'0'}]};if(sql.includes('count(*)'))return{rows:[{count:'0'}]};if(sql.includes('WITH required')||sql.includes('JOIN zee.escrow_bindings'))return{rows:[]};throw Error('UNEXPECTED_PUBLICATION');}};
 const base={registry:{chainId:84532,contracts:{ZeeSwapSettlement:{address:f.policy.contract},MockUSDC:{address:f.policy.token}}}};
 try{await assert.rejects(observeEnvioOnce(pool as any,new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2)),base as any,{url:'http://127.0.0.1:8099',token:'fixture',policy:f.policy,canonical:reader,eventFirst:{generation:f.generation,reader},verificationSourceId:reader.sourceId,hints:{async load(){return{version:2,hints:[],checkpoint:{height:f.from+31,hash:f.header(f.from+31).hash,generation:f.generation,projectionDigest:f.policy.projectionDigest}};},async save(){saves++;throw Error('STOP_BEFORE_HINT_OR_SQL_WRITE');}}}),/STOP_BEFORE_HINT_OR_SQL_WRITE/);assert.equal(saves,1);assert.equal(queries,4);assert.equal(f.ranges.length,5);}finally{globalThis.fetch=original;}
});

test('abort during the selected tail export drains it and never dispatches another packet',async()=>{
 const f=await fixture(),stop=new AbortController();let active=0,tailStarts=0;
 const request:typeof fetch=async(input,init)=>{const u=new URL(String(input));if(u.pathname.endsWith('/status')||Number(u.searchParams.get('from'))<=f.initial-7)return f.request(input,init);
  tailStarts++;active++;try{await new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});stop.abort(Error('TAIL_EXPORT_STOP'));});throw Error('unreachable');}finally{active--;}};
 await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,stop.signal,request,{boundedFinalTail:true}),/TAIL_EXPORT_STOP/);assert.equal(active,0);assert.equal(tailStarts,1);assert.equal(f.ranges.length,4);assert.equal(f.statusCalls,1);
});
test('without ordinary opt-in the existing adaptive caller still dispatches its old short7 then49',async()=>{
 const f=await fixture();let grown=false;
 const request:typeof fetch=async(input,init)=>{const u=new URL(String(input));if(!grown&&Number(u.searchParams.get('from'))===f.initial-6){grown=true;await f.request('http://127.0.0.1:8099/zee-observation/event-first/status',init);}return f.request(input,init);};
 const result=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),request);
 assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,64,64,7,49]);assert.equal(result.headers.length,312);
});

test('R9 two64 prefix can select one fixed71-header tail and consume exactly64 plus7 without another selection',async()=>{
 const f=await fixture(40,1000,0,159),result=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true});
 assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,64,7]);assert.equal(f.statusCalls,1);assert.equal(result.headers.length,199);assert.equal(result.coverage.through.height,f.initial+40);
});
test('a regressed committed Source target has a distinct code and only numeric range diagnostics',async()=>{
 const f=await fixture(-1);let error:any;try{await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true});}catch(e){error=e;}
 assert.equal(error.code,'EVENT_FIRST_FINAL_TAIL_REGRESSION');assert.deepEqual(Object.keys(error.details).sort(),['initialTarget','selectedTarget','tailBlocks','tailFrom']);assert.ok(Object.values(error.details).every(Number.isSafeInteger));assert.deepEqual(eventFirstTailFailureMetadata(error),error.details);assert.equal(f.ranges.length,4);
});
test('original Source-claimed head lag40 still refuses after the fixed tail, without recursive catch-up',async()=>{
 const f=await fixture(49,1000,41);await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true}),/EVENT_FIRST_CONSUMER_BUDGET/);assert.equal(f.ranges.length,5);assert.equal(f.statusCalls,1);
});

test('public tail failure diagnostics never expose payloads or accept extra/non-numeric fields',()=>{
 assert.equal(eventFirstTailFailureMetadata({code:'OTHER',details:{secret:'hidden'}}),undefined);
 assert.equal(eventFirstTailFailureMetadata({code:'EVENT_FIRST_FINAL_TAIL_TOO_LARGE',details:{initialTarget:1,selectedTarget:2,tailFrom:1,tailBlocks:2,token:'hidden'}}),undefined);
 assert.equal(eventFirstTailFailureMetadata({code:'EVENT_FIRST_FINAL_TAIL_REGRESSION',details:{initialTarget:1,selectedTarget:'hidden',tailFrom:1,tailBlocks:2}}),undefined);
 assert.deepEqual(eventFirstTailFailureMetadata({code:'EVENT_FIRST_FINAL_TAIL_TOO_LARGE',details:{initialTarget:100,selectedTarget:300,tailFrom:100,tailBlocks:201}}),{initialTarget:100,selectedTarget:300,tailFrom:100,tailBlocks:201});
});

test('cancellation drains the second fixed tail page without a third tail or partial result',async()=>{
 const f=await fixture(40,1000,0,159),stop=new AbortController();let active=0,second=0;
 const request:typeof fetch=async(input,init)=>{const u=new URL(String(input));if(u.pathname.endsWith('/status')||Number(u.searchParams.get('from'))!==f.from+192)return f.request(input,init);
  second++;active++;try{await new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});stop.abort(Error('SECOND_FIXED_TAIL_STOP'));});throw Error('unreachable');}finally{active--;}};
 await assert.rejects(fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,stop.signal,request,{boundedFinalTail:true}),/SECOND_FIXED_TAIL_STOP/);assert.equal(second,1);assert.equal(active,0);assert.equal(f.statusCalls,1);assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,64]);
});

test('the fixed tail accepts the exact128 boundary as two64 pages with one status selection',async()=>{
 const f=await fixture(121,1000,0,263,121),result=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',f.from,f.initial,f.policy,f.generation,f.reader,AbortSignal.timeout(30000),f.request,{boundedFinalTail:true});
 assert.deepEqual(f.ranges.map(r=>r.through-r.from+1),[64,64,64,64,64,64]);assert.equal(f.statusCalls,1);assert.equal(result.headers.length,384);
});
