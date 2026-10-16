import {isObserverWait,ObserverWaitError} from './observer-frontiers.ts';
import {validateSnapshot,type Snapshot} from './observer.ts';

export interface CapturedBaseHeadRead<T> {heads:T;observedAt:Date}
export function isRetryableBaseHeadLag(error:unknown):error is ObserverWaitError{
 if(!isObserverWait(error))return false;
 const d=error.diagnostic;
 return d.event==='observer-frontier'&&d.status==='WAIT'&&d.network==='base-sepolia'
  &&(d.reason==='HEAD_BEHIND'||d.reason==='FINALITY_BEHIND');
}
function captureSource(value:unknown):Readonly<Snapshot>{
 const source=validateSnapshot(structuredClone(value));
 if(typeof source.observedAt!=='string')throw Error('INVALID_SNAPSHOT');
 source.blocks.forEach(Object.freeze);source.outputs.forEach(Object.freeze);
 Object.freeze(source.blocks);Object.freeze(source.outputs);return Object.freeze(source);
}

/** Only a previously validated, privately cloned and frozen capture can expire
 * into WAIT. Initial stale/invalid captures and future/nonfinite clocks are hard. */
function revalidateCapturedSource(source:Readonly<Snapshot>){
 const age=Date.now()-Date.parse(source.observedAt);
 if(Number.isFinite(age)&&age>60000)throw new ObserverWaitError({event:'observer-frontier',source:'base-head-read-retry',
  status:'WAIT',network:'zcash-testnet',reason:'SOURCE_CAPTURE_EXPIRED',previous:null,
  incoming:{height:source.scannedHeight,hash:source.tipHash,finalizedHeight:Math.max(0,source.scannedHeight-9),observedAt:source.observedAt}});
 validateSnapshot(source);
}

/** The fixed internal reader must authenticate the Base network,
 * freshness and canonical headers before returning its actual capture time.
 * Only that Base read/publication is retried. No source-wallet capability,
 * signer, transaction callback, timestamp replacement or background retry exists.
 */
export async function retryAuthenticatedBaseHeadRead<T,R>(io:{
 read():Promise<CapturedBaseHeadRead<T>>;
 publish(read:CapturedBaseHeadRead<T>,source:Readonly<Snapshot>|undefined):Promise<R>;
},sourceSnapshot?:unknown):Promise<R>{
 const source=sourceSnapshot===undefined?undefined:captureSource(sourceSnapshot);
 let firstLag:ObserverWaitError|undefined;
 for(let attempt=0;attempt<3;attempt++){
  // The same immutable capture is checked on every attempt, including after
  // slow RPC work. An old source proof can never be renewed by a Base retry.
  if(source)revalidateCapturedSource(source);
  try{
   const read=await io.read();
   if(!(read.observedAt instanceof Date)||!Number.isFinite(read.observedAt.getTime()))throw Error('INVALID_BASE_OBSERVATION_TIME');
   if(source)revalidateCapturedSource(source);
   return await io.publish(read,source);
  }catch(error){
   if(!isRetryableBaseHeadLag(error))throw error;
   firstLag??=error;
   if(attempt===2)throw firstLag;
  }
 }
 throw Error('BASE_HEAD_RETRY_UNREACHABLE');
}
