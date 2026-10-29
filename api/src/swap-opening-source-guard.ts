/** Recheck only the already-qualified, paused opening. Full initial Source
 * export remains in the immutable collection; no timestamp/frontier is renewed. */
import {readJson,safeEndpoint} from './integrations/observation/chef.ts';
import {EVENT_FIRST_MAX_EXPORT_BLOCKS,validateEventFirstState,sampleCanonicalFinalityAtLeast,type EventFirstReader} from './integrations/observation/envio-event-first.ts';
import {stable,requireThat,type Policy} from './integrations/observation/types.ts';
import {requireConsumableOpeningSuffix} from './swap-first-service-opening.ts';
export async function verifyOpeningPublicationSourceGuard(o:{url:string;token:string;policy:Policy;generation:string;openingHeight:number;minimumFinalized:number;reader:EventFirstReader;signal:AbortSignal;request?:typeof fetch}){
 const response=await(o.request??fetch)(new URL('/zee-observation/event-first/status',safeEndpoint(o.url)),{headers:{authorization:'Bearer '+o.token},redirect:'error',signal:o.signal});requireThat(response.ok,'OPENING_SOURCE_STATUS_HTTP');const raw=await readJson(response,o.signal,8000000)as any;
 requireThat(raw?.protocol==='zee-envio-event-first-status-v1'&&raw.maxExportBlocks===EVENT_FIRST_MAX_EXPORT_BLOCKS,'OPENING_SOURCE_STATUS_PROTOCOL');const state=validateEventFirstState(raw.state,o.policy,o.generation),M=state.progress.height;
 requireConsumableOpeningSuffix(o.openingHeight,M,state.recoveryFloor,0);
 const sample=await sampleCanonicalFinalityAtLeast(o.reader,o.reader.sourceId,o.minimumFinalized,o.signal);requireThat(sample.head.height>=M&&sample.head.height-M<=40&&sample.finalized&&sample.finalized.height<=M,'OPENING_SOURCE_CURRENT_SAMPLE');
 const sdk=await o.reader.header(M,o.signal);requireThat(sdk.hash===state.checkpoint.hash,'OPENING_SOURCE_SDK_CANONICAL');
 requireThat(stable(await o.reader.header(sample.finalized.height,o.signal))===stable(sample.finalized),'OPENING_SOURCE_FINALITY_CANONICAL');
 for(let from=o.openingHeight;from<=M;from+=EVENT_FIRST_MAX_EXPORT_BLOCKS){const through=Math.min(M,from+EVENT_FIRST_MAX_EXPORT_BLOCKS-1),logs=await o.reader.logs(from,through,o.signal);requireThat(Array.isArray(logs)&&logs.length===0,'OPENING_SOURCE_NONEMPTY_QUIET_RANGE');}
 for(const h of[sdk,sample.head,sample.finalized])requireThat(stable(await o.reader.header(h.height,o.signal))===stable(h),'OPENING_SOURCE_END_REORG');o.signal.throwIfAborted();
 return{sdkCheckpoint:sdk,independentSample:sample,checkedAt:new Date().toISOString(),quietRange:{from:o.openingHeight,through:M,eventCount:0 as const},sourceProcessorObservedAt:state.processor.observedAt};
}
