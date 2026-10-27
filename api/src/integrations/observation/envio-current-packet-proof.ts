/** Explicit current/future ticket pairing. No cache, Source mutation or persistence. */
import {consumerGroups,fetchRawEventFirstPacket} from './envio-event-first-consumer-performance.ts';
import {validateEventFirstExport,requireIndependentEventFirstSource,compareEventFirstLogs,type EventFirstVerifiedExport} from './envio-event-first.ts';
import type {ClosedV2RpcReader} from './envio-closed-v2-rpc.ts';
import {digest,fresh,stable,requireThat,type Header,type Policy} from './types.ts';
export type CurrentPacketTiming={dispatchClock:number;from:number;through:number;rawReadyMs:number;rangeReadyMs:number;consumeMs:number;sampleReadyMs:number;lateReadyMs:number;totalVerifyMs:number;currentAgeMs:number;bufferWaitMs:number};
export type CurrentPacketBundle={from:number;through:number;generation:string;policyDigest:string;sourceId:string;sourceSnapshotToken:string;dispatchClock:number;raw:EventFirstVerifiedExport;rangeHeaders:Header[];rawLogs:unknown[];rawReadyMs:number;rangeReadyMs:number};
const need=(v:unknown,c:string)=>requireThat(v,'ENVIO_CURRENT_PACKET_'+c);
export async function fetchCurrentPacketBundle(o:{url:string;token:string;from:number;through:number;policy:Policy;generation:string;reader:ClosedV2RpcReader;signal:AbortSignal;dispatchClock:number;request?:typeof fetch;onFailure?:(error:unknown)=>void}):Promise<CurrentPacketBundle>{
 need(o.reader.dispatchMode==='CURRENT_PACKET_V2'&&o.reader.headerBatchSize===10,'READER');need(Number.isFinite(o.dispatchClock)&&o.dispatchClock<=performance.now()&&performance.now()-o.dispatchClock<=30000&&o.through>=o.from&&o.through-o.from+1<=64,'DISPATCH_RANGE');o.signal.throwIfAborted();
 const stop=new AbortController(),signal=AbortSignal.any([o.signal,stop.signal]);let first:unknown,rawReadyMs=0,rangeReadyMs=0;
 const guarded=<T>(promise:Promise<T>)=>promise.catch(error=>{if(first===undefined){first=error;try{o.onFailure?.(error);}catch{}}stop.abort(error);throw error;});
 const groups:number[][]=[];for(let h=o.from;h<=o.through;h+=10)groups.push(Array.from({length:Math.min(10,o.through-h+1)},(_,i)=>h+i));const rangeHeaders:Header[]=new Array(o.through-o.from+1);
 const rawTask=guarded(fetchRawEventFirstPacket({...o,signal}).then(raw=>{rawReadyMs=performance.now()-o.dispatchClock;return raw;}));
 const rangeTask=guarded((async()=>{await consumerGroups(groups,(hs,s)=>guarded((async()=>{const rows=await o.reader.prefetchHeaders(hs,s);need(rows.length===hs.length,'HEADER_COUNT');for(let n=0;n<hs.length;n++){need(rows[n]!.height===hs[n],'HEADER_ORDER');rangeHeaders[hs[n]!-o.from]=rows[n]!;}})()),signal);return rangeHeaders;})());
 const logsTask=guarded(o.reader.prefetchLogs(o.from,o.through,signal));
 const rangeReady=guarded(Promise.all([rangeTask,logsTask]).then(result=>{rangeReadyMs=performance.now()-o.dispatchClock;return result;}));
 const results=await Promise.allSettled([rawTask,rangeReady,rangeTask,logsTask]);if(first!==undefined){stop.abort();throw first;}signal.throwIfAborted();
 const raw=(results[0] as PromiseFulfilledResult<EventFirstVerifiedExport>).value,[headers,logs]=(results[1] as PromiseFulfilledResult<[Header[],unknown[]]>).value;
 need(performance.now()-o.dispatchClock<=30000,'DEADLINE');stop.abort();return{from:o.from,through:o.through,generation:o.generation,policyDigest:digest(o.policy),sourceId:o.reader.sourceId,sourceSnapshotToken:raw.snapshotToken,dispatchClock:o.dispatchClock,raw,rangeHeaders:headers,rawLogs:logs,rawReadyMs,rangeReadyMs};
}
export async function verifyCurrentPacketBundle(b:CurrentPacketBundle,p:Policy,reader:ClosedV2RpcReader,signal:AbortSignal,onTiming?:(timing:CurrentPacketTiming)=>void){
 const consumeMs=performance.now()-b.dispatchClock;let sampleReadyMs=0,lateReadyMs=0;
 try{
  signal.throwIfAborted();need(reader.dispatchMode==='CURRENT_PACKET_V2'&&reader.sourceId===b.sourceId&&digest(p)===b.policyDigest&&b.raw.snapshotToken===b.sourceSnapshotToken&&b.raw.producer.generation===b.generation&&b.raw.range.fromHeight===b.from&&b.raw.range.through.height===b.through,'PAIRING');need(consumeMs>=0&&consumeMs<=30000,'DEADLINE');
  const v=validateEventFirstExport(b.raw,p,Date.now(),reader.sourceId),sample=await reader.sample(signal);sampleReadyMs=performance.now()-b.dispatchClock;fresh(sample.checkedAt,Date.now());requireIndependentEventFirstSource(v,sample,reader);
  const claimed=[v.producer.through,v.producer.sourceHead,v.verification.finalized],actual=await reader.headers!(claimed.map(h=>h.height),signal);requireThat(stable(actual)===stable(claimed),'EVENT_FIRST_INDEPENDENT_CLAIMED_HEAD_OR_FINALITY');
  requireThat(stable(b.rangeHeaders)===stable(v.range.headers),'EVENT_FIRST_INDEPENDENT_HEADERS');compareEventFirstLogs(b.rawLogs,v.range.observations,p,v.range.headers,b.from,b.through);
  const late=[v.producer.through,v.range.through,sample.head,sample.finalized!],end=await reader.headers!(late.map(h=>h.height),signal);requireThat(stable(end)===stable(late),'EVENT_FIRST_INDEPENDENT_END_REORG');
  signal.throwIfAborted();need(performance.now()-b.dispatchClock<=30000,'DEADLINE');const verified=validateEventFirstExport(v,p,Date.now(),reader.sourceId);lateReadyMs=performance.now()-b.dispatchClock;return verified;
 }finally{onTiming?.({dispatchClock:b.dispatchClock,from:b.from,through:b.through,rawReadyMs:b.rawReadyMs,rangeReadyMs:b.rangeReadyMs,consumeMs,sampleReadyMs,lateReadyMs,totalVerifyMs:performance.now()-b.dispatchClock-consumeMs,currentAgeMs:performance.now()-b.dispatchClock,bufferWaitMs:Math.max(0,consumeMs-Math.max(b.rawReadyMs,b.rangeReadyMs))});}
}
