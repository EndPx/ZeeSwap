/** Opt-in consumer only. Source producer/runtime and serial verifier are unchanged. */
import {readJson} from './chef.ts';
import {validateEventFirstExport,sampleIndependentEventFirstSource,compareEventFirstLogs,type EventFirstReader,type EventFirstVerifiedExport} from './envio-event-first.ts';
import {fresh,requireThat,stable,type Policy} from './types.ts';
/** At most two workers; first failure aborts and drains both before returning.
 * A rejected Promise.all alone would leave an RPC group running. */
export async function consumerGroups<T>(items:readonly T[],run:(item:T,signal:AbortSignal)=>Promise<void>,outer:AbortSignal){
 const stop=new AbortController(),signal=AbortSignal.any([outer,stop.signal]);let next=0,first:unknown;
 async function worker(){try{for(;;){signal.throwIfAborted();const index=next++;if(index>=items.length)return;await run(items[index]!,signal);}}catch(error){if(first===undefined)first=error;stop.abort();}}
 await Promise.allSettled([worker(),worker()]);if(first!==undefined)throw first;signal.throwIfAborted();
}
export async function verifyEventFirstExportParallel(value:unknown,p:Policy,reader:EventFirstReader,outer=AbortSignal.timeout(30000)){
 const started=performance.now(),signal=AbortSignal.any([outer,AbortSignal.timeout(30000)]),proofSourceId=reader.sourceProofSourceId??reader.sourceId,v=validateEventFirstExport(value,p,Date.now(),proofSourceId);signal.throwIfAborted();
 requireThat(reader.headerBatchSize===10&&reader.headers,'ENVIO_CONSUMER_PARALLEL_READER');const headers=reader.headers;
 const sample=await sampleIndependentEventFirstSource(v,reader,signal);
 const initial=[{header:v.producer.through,code:'EVENT_FIRST_INDEPENDENT_M'},{header:v.producer.sourceHead,code:'EVENT_FIRST_INDEPENDENT_CLAIMED_HEAD_OR_FINALITY'},{header:v.verification.finalized,code:'EVENT_FIRST_INDEPENDENT_CLAIMED_HEAD_OR_FINALITY'}];
 await consumerGroups(initial,async(item,s)=>{requireThat(stable(await reader.header(item.header.height,s))===stable(item.header),item.code);},signal);
 const groups=[];for(let n=0;n<v.range.headers.length;n+=10)groups.push(v.range.headers.slice(n,n+10));
 await consumerGroups(groups,async(expected,s)=>{requireThat(stable(await headers(expected.map(h=>h.height),s))===stable(expected),'EVENT_FIRST_INDEPENDENT_HEADERS');},signal);
 compareEventFirstLogs(await reader.logs(v.range.fromHeight,v.range.through.height,signal),v.range.observations,p,v.range.headers,v.range.fromHeight,v.range.through.height);
 const end=[{header:v.producer.through,code:'EVENT_FIRST_INDEPENDENT_END_REORG'},{header:v.range.through,code:'EVENT_FIRST_INDEPENDENT_END_REORG'},{header:sample.head,code:'EVENT_FIRST_INDEPENDENT_SAMPLE_REORG'},{header:sample.finalized!,code:'EVENT_FIRST_INDEPENDENT_SAMPLE_REORG'}];
 await consumerGroups(end,async(item,s)=>{requireThat(stable(await reader.header(item.header.height,s))===stable(item.header),item.code);},signal);
 signal.throwIfAborted();requireThat(performance.now()-started<=30000,'EVENT_FIRST_READ_BUDGET');return validateEventFirstExport(v,p,Date.now(),proofSourceId);
}
/** HTTP/structural stage only. Never marks an independent proof or writes files.
 * Original source clocks are left untouched and revalidated at verification time. */
export async function fetchRawEventFirstPacket(o:{url:string;token:string;from:number;through:number;policy:Policy;generation:string;signal:AbortSignal;request?:typeof fetch}){
 requireThat(o.url==='http://127.0.0.1:8099'&&o.through>=o.from&&o.through-o.from+1<=64,'ENVIO_CONSUMER_RAW_RANGE');const signal=AbortSignal.any([o.signal,AbortSignal.timeout(30000)]),u=new URL('/zee-observation/event-first/export',o.url);u.searchParams.set('from',String(o.from));u.searchParams.set('through',String(o.through));
 const response=await(o.request??fetch)(u,{headers:{authorization:'Bearer '+o.token},redirect:'error',signal});requireThat(response.ok,'ENVIO_CONSUMER_SOURCE_HTTP');const value=validateEventFirstExport(await readJson(response,signal,8000000),o.policy,Date.now(),'base-sepolia-publicnode-normal-rpc');
 requireThat(value.producer.generation===o.generation&&value.range.fromHeight===o.from&&value.range.through.height===o.through,'ENVIO_CONSUMER_RAW_IDENTITY');return value;
}
type Outcome<T>={ok:true;value:T|null}|{ok:false;error:unknown};
/** One current + one future raw packet. No two Source exports overlap: the next
 * dispatch occurs only after current raw HTTP completed. Every future is drained,
 * including pilot cap, successful tail, expiry and external cancellation. */
export async function collectEventFirstLookahead<T=EventFirstVerifiedExport>(o:{from:number;limit:number;signal:AbortSignal;before(from:number):Promise<void>;fetch(from:number,signal:AbortSignal,fail:(error:unknown)=>void):Promise<T|null>;packet?(value:T):EventFirstVerifiedExport;verify(raw:T,signal:AbortSignal):Promise<EventFirstVerifiedExport>;accept(packet:EventFirstVerifiedExport,signal:AbortSignal):Promise<void>;prefetchAfter?(raw:T):boolean;afterAccept?():Promise<void>}){
 requireThat(Number.isSafeInteger(o.limit)&&o.limit>=1&&o.limit<=16384,'ENVIO_CONSUMER_PACKET_LIMIT');const stop=new AbortController(),signal=AbortSignal.any([o.signal,stop.signal]);let pending:{promise:Promise<Outcome<T>>;signal:AbortSignal}|undefined,failure:unknown,accepted=0,from=o.from;
 const dispatch=(height:number)=>{const packetSignal=AbortSignal.any([signal,AbortSignal.timeout(30000)]);const fail=(error:unknown)=>{if(failure===undefined)failure=error;stop.abort(error);};const promise=o.fetch(height,packetSignal,fail).then(value=>({ok:true as const,value}),error=>{if(failure===undefined)failure=error;stop.abort();return{ok:false as const,error};});pending={promise,signal:packetSignal};return pending;};
 try{
  for(let n=0;n<o.limit;n++){
   signal.throwIfAborted();await o.before(from);signal.throwIfAborted();const current=pending??dispatch(from);const result=await current.promise;pending=undefined;if(!result.ok)throw result.error;current.signal.throwIfAborted();if(result.value===null)break;
   const value=result.value,raw=o.packet?o.packet(value):value as EventFirstVerifiedExport;requireThat(raw.range.fromHeight===from,'ENVIO_CONSUMER_PREFETCH_ORDER');const next=raw.range.through.height+1;if(n+1<o.limit&&(o.prefetchAfter?.(value)??true))dispatch(next);
   const packet=await o.verify(value,current.signal);current.signal.throwIfAborted();signal.throwIfAborted();if(failure!==undefined)throw failure;requireThat(packet.range.fromHeight===from&&packet.range.through.height===raw.range.through.height&&stable(packet)===stable(raw),'ENVIO_CONSUMER_VERIFIED_PACKET_CHANGED');
   current.signal.throwIfAborted();await o.accept(packet,current.signal);accepted++;from=next;current.signal.throwIfAborted();signal.throwIfAborted();await o.afterAccept?.();signal.throwIfAborted();
  }
  signal.throwIfAborted();return{accepted,nextFrom:from};
 }catch(error){if(failure===undefined)failure=error;throw failure;}
 finally{stop.abort();if(pending)await pending.promise;}
}
