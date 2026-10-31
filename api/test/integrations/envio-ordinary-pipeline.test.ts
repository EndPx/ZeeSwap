import test from 'node:test';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';
import {produceEventFirstExport,verifyEventFirstExport,verifyEventFirstExportWithSample,sampleCanonicalFinalityAtLeast,type EventFirstReader,type EventFirstState} from '../../src/integrations/observation/envio-event-first.ts';
import {verifyEventFirstExportParallel} from '../../src/integrations/observation/envio-event-first-consumer-performance.ts';
import {fetchEventFirstReplacement} from '../../src/integrations/observation/envio-event-first-consumer.ts';import type {Header,Policy} from '../../src/integrations/observation/types.ts';
function fixture(){const time=new Date().toISOString(),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),header=(height:number):Header=>({height,hash:hash(height),parentHash:hash(height-1),time}),p:Policy={adapter:'envio-hyperindex',network:'eip155:84532',birthday:100,registryDigest:'a'.repeat(64),projectionDigest:'b'.repeat(64),abiDigest:'c'.repeat(64),canonicalSourceId:'original',contract:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),contractVersion:'v1',maxBlocks:1000},state=(height:number):EventFirstState=>({generation:'g',projectionDigest:p.projectionDigest,registryDigest:p.registryDigest,revision:'501',progress:{height,checkpointId:'50'},checkpoint:{chainId:84532,id:'50',height,hash:hash(height)},processor:{height,observedAt:time},recoveryFloor:100}),reader:EventFirstReader={sourceId:'independent',headerBatchSize:10,sample:async()=>({sourceId:'independent',checkedAt:new Date().toISOString(),head:header(400),finalized:header(200)}),header:async h=>header(h),headers:async hs=>hs.map(header),logs:async()=>[]};return{p,header,state,reader,packet:(from:number,through:number,M=400)=>produceEventFirstExport({policy:p,generation:'g',verificationSourceId:reader.sourceId,from,through,reader:{...reader,sample:async()=>({sourceId:'independent',checkedAt:new Date().toISOString(),head:header(M),finalized:header(200)})},snapshot:async()=>({state:state(M),events:[]}),fence:async()=>state(M)})};}
test('serial and parallel retry only a regressed finalized view and fence the actual chosen hash',async()=>{
 for(const parallel of[false,true]){const f=fixture(),packet=await f.packet(300,300);let samples=0,retries=0;const r={...f.reader,sample:async()=>{samples++;return{sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(199)};},finalizedHeader:async()=>{retries++;return f.header(retries===1?199:200);}};
  assert.deepEqual(await(parallel?verifyEventFirstExportParallel(packet,f.p,r):verifyEventFirstExport(packet,f.p,r)),packet);assert.equal(samples,1);assert.equal(retries,2);
  const bad={...r,finalizedHeader:async()=>({...f.header(200),hash:f.header(777).hash})};await assert.rejects(parallel?verifyEventFirstExportParallel(packet,f.p,bad):verifyEventFirstExport(packet,f.p,bad),/SAMPLE_REORG/);
  let extra=0;const wrong={...r,sample:async()=>({sourceId:'wrong',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(199)}),finalizedHeader:async()=>{extra++;return f.header(200);}};await assert.rejects(parallel?verifyEventFirstExportParallel(packet,f.p,wrong):verifyEventFirstExport(packet,f.p,wrong),/INDEPENDENT_SOURCE/);assert.equal(extra,0);
 }
});
test('ordinary pipeline verifies contiguous adaptive suffix with one Source request and two RPC groups in flight',async()=>{
 const f=fixture(),raws=[await f.packet(219,282),await f.packet(283,346,425),await f.packet(347,400,450),await f.packet(401,450,450)];let sourceActive=0,peakSource=0,rpcActive=0,peakRpc=0,overlap=false,call=0;const r={...f.reader,sample:async()=>({sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(call>=3?450:call===2?425:400),finalized:f.header(200)}),headers:async(hs:readonly number[],s:AbortSignal)=>{rpcActive++;peakRpc=Math.max(peakRpc,rpcActive);try{await delay(10,undefined,{signal:s});return hs.map(f.header);}finally{rpcActive--;}}};
 const request:typeof fetch=async(input,init)=>{sourceActive++;peakSource=Math.max(peakSource,sourceActive);if(rpcActive)overlap=true;try{await delay(2,undefined,{signal:init?.signal!});if(rpcActive)overlap=true;const u=new URL(String(input)),from=Number(u.searchParams.get('from')),through=Number(u.searchParams.get('through')),packet=raws[call++]!;assert.equal(packet.range.fromHeight,from);assert.equal(packet.range.through.height,through);return Response.json(packet);}finally{sourceActive--;}};
 const batch=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',219,400,f.p,'g',r,AbortSignal.timeout(30000),request);assert.equal(batch.coverage.through.height,450);assert.equal(batch.headers.length,232);assert.equal(peakSource,1);assert.equal(peakRpc,2);assert.equal(overlap,true);assert.equal(call,4);for(let n=0;n<batch.headers.length;n++)assert.equal(batch.headers[n]!.height,219+n);
});
test('post-proof sample retains actual admitted SQL finality and preserves original head clock',async()=>{
 const f=fixture(),checkedAt=new Date().toISOString();let n=0;const reader={...f.reader,sample:async()=>({sourceId:'independent',checkedAt,head:f.header(400),finalized:f.header(199)}),finalizedHeader:async()=>{n++;return f.header(200);}};
 const sample=await sampleCanonicalFinalityAtLeast(reader,'independent',200,AbortSignal.timeout(30000));assert.equal(n,1);assert.equal(sample.checkedAt,checkedAt);assert.equal(sample.finalized!.height,200);
 await assert.rejects(sampleCanonicalFinalityAtLeast({...reader,finalizedHeader:async()=>f.header(199)},'independent',200,AbortSignal.timeout(30000)),/WAIT_ENVIO_FINALITY/);
});
test('source proof provider and actual independent provider stay distinct; WithSample retains actual finality without another sample',async()=>{
 const f=fixture(),packet=await f.packet(300,300),sourceProofSourceId='base-sepolia-publicnode-normal-rpc',sourceId='base-sepolia-official-independent-rpc';packet.verification.canonicalSourceId=sourceProofSourceId;let samples=0;
 const r={...f.reader,sourceId,sourceProofSourceId,sample:async()=>{samples++;return{sourceId,checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(210)};}};
 const verified=await verifyEventFirstExportWithSample(packet,f.p,r);assert.equal(samples,1);assert.equal(verified.packet.verification.canonicalSourceId,sourceProofSourceId);assert.equal(verified.independentSample.sourceId,sourceId);assert.equal(verified.independentSample.finalized!.height,210);assert.equal(verified.packet.verification.finalized.height,200);
 await verifyEventFirstExportParallel(packet,f.p,r);await assert.rejects(verifyEventFirstExport(packet,f.p,{...r,sourceProofSourceId:sourceId}),/VERIFICATION/);
});


test('conservative ordinary finality ingests a complete current range with producer ahead and preserves raw proof',async()=>{
 const f=fixture(),packet=await f.packet(369,400),raw=JSON.stringify(packet);let selected:Header|undefined;
 const reader={...f.reader,sample:async()=>({sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(190)})};
 const options={batchFences:true as const,conservativeFinality:{minimum:180,accept:(h:Header)=>{selected=h;}}};
 assert.deepEqual(await verifyEventFirstExportParallel(packet,f.p,reader,AbortSignal.timeout(30000),options),packet);assert.equal(selected!.height,190);assert.equal(JSON.stringify(packet),raw);assert.equal(packet.verification.finalized.height,200);
 const pre={sample:{sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(185)},exportRequestedAt:new Date().toISOString()};
 await verifyEventFirstExportParallel(packet,f.p,reader,AbortSignal.timeout(30000),{...options,ordinaryPreReadFreshness:true,preReadSample:pre});assert.equal(selected!.height,185);
 const conflictingPre={...pre,sample:{...pre.sample,finalized:{...f.header(200),hash:f.header(999).hash}}};await assert.rejects(verifyEventFirstExportParallel(packet,f.p,reader,AbortSignal.timeout(30000),{...options,ordinaryPreReadFreshness:true,preReadSample:conflictingPre}),/CONSERVATIVE_FINALITY_CONFLICT/);
 const batch=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',369,400,f.p,'g',reader,AbortSignal.timeout(30000),async()=>Response.json(packet),{boundedFinalTail:true,preReadFreshness:true,fixedReadStartTarget:true,conservativeFinalityMinimum:180});assert.equal(batch.coverage.through.height,400);assert.equal(batch.consumerFinalized!.height,190);assert.equal(batch.headers.length,32);
});
test('conservative finality retains stored floor, full canonical fences, wrong-source refusal and zero partial witnesses',async()=>{
 for(const fault of ['stored-floor','producer-hash','selected-hash','headers','logs','source']){
  const f=fixture(),packet=await f.packet(369,400);let selected=0;
  const r={...f.reader,sample:async()=>({sourceId:fault==='source'?'wrong':'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(190)})};
  if(fault==='producer-hash')packet.verification.finalized.hash=f.header(999).hash;
  if(fault==='selected-hash')r.header=async h=>({...f.header(h),hash:f.header(999).hash});
  if(fault==='headers')r.headers=async hs=>hs.map(h=>({...f.header(h),hash:f.header(999).hash}));
  if(fault==='logs')r.logs=async()=>[{}];
  await assert.rejects(verifyEventFirstExportParallel(packet,f.p,r,AbortSignal.timeout(30000),{batchFences:true,conservativeFinality:{minimum:fault==='stored-floor'?191:180,accept:()=>{selected++;}}}));assert.equal(selected,0);
 }
});


test('lagging producer finality remains raw informational evidence while actual independent floor admits complete current head',async()=>{
 const f=fixture(),packet=await f.packet(369,400),raw=JSON.stringify(packet),floor=205;let selected:Header|undefined;
 const reader={...f.reader,sample:async()=>({sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(210)})};
 const pre={sample:{sourceId:'independent',checkedAt:new Date().toISOString(),head:f.header(400),finalized:f.header(208)},exportRequestedAt:new Date().toISOString()};
 assert.equal(packet.verification.finalized.height,200);assert.ok(packet.verification.finalized.height<floor);
 assert.deepEqual(await verifyEventFirstExportParallel(packet,f.p,reader,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:pre,conservativeFinality:{minimum:floor,accept:(h:Header)=>{selected=h;}}}),packet);
 assert.equal(selected!.height,208);assert.equal(JSON.stringify(packet),raw);
 const batch=await fetchEventFirstReplacement('http://127.0.0.1:8099','fixture',369,400,f.p,'g',reader,AbortSignal.timeout(30000),async()=>Response.json(packet),{boundedFinalTail:true,preReadFreshness:true,fixedReadStartTarget:true,conservativeFinalityMinimum:floor});assert.equal(batch.coverage.through.height,400);assert.equal(batch.headers.length,32);assert.equal(batch.consumerFinalized!.height,210);
 for(const bad of ['producer-header','pre-read-floor','current-floor']){let accepted=0;const p=structuredClone(packet),r={...reader},before=structuredClone(pre);if(bad==='producer-header')p.verification.finalized.hash=f.header(999).hash;if(bad==='pre-read-floor')before.sample.finalized=f.header(204);if(bad==='current-floor')r.sample=async()=>({...await reader.sample(),finalized:f.header(204)});await assert.rejects(verifyEventFirstExportParallel(p,f.p,r,AbortSignal.timeout(30000),{batchFences:true,ordinaryPreReadFreshness:true,preReadSample:before,conservativeFinality:{minimum:floor,accept:()=>{accepted++;}}}));assert.equal(accepted,0);}
});
