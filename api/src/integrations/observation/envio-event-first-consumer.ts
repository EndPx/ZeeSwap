import {readJson,safeEndpoint} from './chef.ts';import {EVENT_FIRST_MAX_EXPORT_BLOCKS,validateEventFirstExport,validateEventFirstState,verifyEventFirstExport,type EventFirstReader,type EventFirstVerifiedExport} from './envio-event-first.ts';
import {collectEventFirstLookahead,verifyEventFirstExportParallel} from './envio-event-first-consumer-performance.ts';
import {contentDigest,fresh,requireThat,ObservationError,type Policy,type ReplaceRange} from './types.ts';
/** Numeric-only diagnostics for the two locally classified tail failures. */
export function eventFirstTailFailureMetadata(error:unknown){
 const e=error as {code?:unknown;details?:Record<string,unknown>};if(!['EVENT_FIRST_FINAL_TAIL_REGRESSION','EVENT_FIRST_FINAL_TAIL_TOO_LARGE'].includes(String(e?.code)))return undefined;
 const d=e.details;if(!d||Object.keys(d).sort().join(',')!=='initialTarget,selectedTarget,tailBlocks,tailFrom'||!Object.values(d).every(Number.isSafeInteger))return undefined;
 return{initialTarget:d.initialTarget as number,selectedTarget:d.selectedTarget as number,tailFrom:d.tailFrom as number,tailBlocks:d.tailBlocks as number};
}
/** Converts verified v2 evidence into the internal publisher DTO; never emits a v1 source envelope. */
export async function fetchEventFirstReplacement(url:string,token:string,from:number,through:number,policy:Policy,generation:string,reader:EventFirstReader,signal:AbortSignal,request:typeof fetch=fetch,options?:{boundedFinalTail:true}):Promise<ReplaceRange>{
 const base=safeEndpoint(url),started=new Date().toISOString(),maxBlocks=Math.min(policy.maxBlocks??1000,1000);requireThat(Number.isSafeInteger(from)&&Number.isSafeInteger(through)&&through>=from&&through-from+1<=maxBlocks,'ENVIO_ADMISSION_GAP');const packets:EventFirstVerifiedExport[]=[];let target=through,tailSelected=false;
 await collectEventFirstLookahead({from,limit:Math.ceil(maxBlocks/EVENT_FIRST_MAX_EXPORT_BLOCKS),signal,before:async()=>signal.throwIfAborted(),prefetchAfter:v=>v.range.through.height<target,
  fetch:async(h,s)=>{
   if(h>target)return null;
   // Select once before the final partial HTTP request, including a prefetched
   // one. The fixed selection may span two64-header pages, never another chase.
   if(options?.boundedFinalTail&&!tailSelected&&target-h+1<EVENT_FIRST_MAX_EXPORT_BLOCKS){
    tailSelected=true;requireThat(Date.now()-Date.parse(started)<=20000,'EVENT_FIRST_FINAL_TAIL_BUDGET');
    const response=await request(new URL('/zee-observation/event-first/status',base),{headers:{authorization:'Bearer '+token},signal:s,redirect:'error'});requireThat(response.ok,'WAIT_EVENT_FIRST_EXPORT');
    const status=await readJson(response,s,8_000_000) as {protocol?:unknown;state?:unknown};requireThat(status.protocol==='zee-envio-event-first-status-v1','EVENT_FIRST_STATUS_PROTOCOL');
    const observed=validateEventFirstState(status.state,policy,generation).progress.height;
    const details={initialTarget:through,selectedTarget:observed,tailFrom:h,tailBlocks:observed-h+1};
    if(observed<target)throw Object.assign(new ObservationError('EVENT_FIRST_FINAL_TAIL_REGRESSION'),{details});
    if(observed-h+1>2*EVENT_FIRST_MAX_EXPORT_BLOCKS)throw Object.assign(new ObservationError('EVENT_FIRST_FINAL_TAIL_TOO_LARGE'),{details});
    requireThat(observed-from+1<=maxBlocks,'ENVIO_ADMISSION_GAP');
    requireThat(Date.now()-Date.parse(started)<=20000,'EVENT_FIRST_FINAL_TAIL_BUDGET');s.throwIfAborted();target=observed;
   }
   const end=Math.min(target,h+EVENT_FIRST_MAX_EXPORT_BLOCKS-1),u=new URL('/zee-observation/event-first/export',base);u.searchParams.set('from',String(h));u.searchParams.set('through',String(end));
   const response=await request(u,{headers:{authorization:'Bearer '+token},signal:s,redirect:'error'});requireThat(response.ok,'WAIT_EVENT_FIRST_EXPORT');
   const v=validateEventFirstExport(await readJson(response,s,8_000_000),policy,Date.now(),reader.sourceProofSourceId??reader.sourceId);requireThat(v.producer.generation===generation&&v.range.fromHeight===h&&v.range.through.height===end,'EVENT_FIRST_CONSUMER_RANGE');
   if(!options?.boundedFinalTail&&v.producer.sourceHead.height-target>40){const observed=v.producer.through.height;requireThat(observed>target&&observed-from+1<=maxBlocks,'ENVIO_ADMISSION_GAP');target=observed;}return v;
  },
  verify:(v,s)=>reader.headerBatchSize===10&&reader.headers?verifyEventFirstExportParallel(v,policy,reader,s,{batchFences:true}):verifyEventFirstExport(v,policy,reader,s),
  accept:async v=>{if(packets.length)requireThat(v.range.headers[0]!.parentHash===packets.at(-1)!.range.through.hash,'EVENT_FIRST_CONSUMER_SEAM');packets.push(v);}});
 const headers=packets.flatMap(p=>p.range.headers),observations=packets.flatMap(p=>p.range.observations),last=packets.at(-1)!,sampledAt=new Date(Math.min(...packets.map(p=>Date.parse(p.producer.sourceSampledAt)))).toISOString();fresh(sampledAt,Date.now());requireThat(last.range.through.height===target&&headers.length<=maxBlocks&&last.producer.sourceHead.height-last.range.through.height<=40&&Date.now()-Date.parse(started)<=30000&&observations.length<=(policy.maxObservations??1000),'EVENT_FIRST_CONSUMER_BUDGET');
 return{headers,observations,coverage:{protocol:'zee-observation-v1',adapter:'envio-hyperindex',network:policy.network,registryDigest:policy.registryDigest,projectionDigest:policy.projectionDigest,generation,revision:last.producer.revision,fromHeight:from,through:last.range.through,complete:true,readStartedAt:started,readCompletedAt:new Date().toISOString(),sourceSampledAt:sampledAt,sourceHead:last.producer.sourceHead,recoveryFloor:Math.max(...packets.map(p=>p.producer.recoveryFloor)),canonicalCheckAt:new Date().toISOString(),canonicalSourceId:reader.sourceId,contentDigest:contentDigest({headers,observations})}};
}
