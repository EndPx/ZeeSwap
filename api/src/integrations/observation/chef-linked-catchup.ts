/** Invocation-local verification scheduling only. No SQL, signing, or financial ingestion. */
import type {CanonicalReader} from './chef.ts';
import {parseHeader,stable,height,requireThat,type Header,type ChefHistoricalWitness,type ReplaceRange} from './types.ts';
import type {Snapshot} from '../../observer.ts';
import {appendChefLinkedRecoveryProof,chefLinkedRecoveryHeaders,chefLinkedRecoverySnapshot,extendChefLinkedRecoveryTarget,nextChefLinkedRecoveryRange,validateChefLinkedRecovery,type ChefLinkedApproval,type ChefLinkedJournal} from './chef-linked-recovery.ts';
const need=(value:unknown,code:string)=>requireThat(value,'CHEF_LINKED_'+code);
export type LinkedCanonical=CanonicalReader&{prefetchPersisted(heights:number[],signal:AbortSignal):Promise<void>;freshHeader(height:number,signal:AbortSignal):Promise<Header>};

/** Retain verified dense history only within this invocation; extensions cannot overwrite a fork. */
export function chefLinkedInvocationCanonical(factory:(range?:{fromHeight:number;throughHeight:number})=>CanonicalReader):LinkedCanonical{
 const cache=new Map<number,Header>();let sampledHead:number|undefined;
 const freshHeader=async(h:number,signal:AbortSignal)=>{height(h);return parseHeader(await factory().header(h,signal),'zcash-testnet');};
 return{freshHeader,async sample(signal){const value=await factory().sample(signal);sampledHead=value.head.height;return value;},
  async header(h,signal){height(h);signal.throwIfAborted();return h!==sampledHead&&cache.has(h)?cache.get(h)!:freshHeader(h,signal);},
  headerOrigin(h){return{kind:cache.has(h)&&h!==sampledHead?'prefetch-cache':'fresh'};},
  async prefetchPersisted(heights,signal){
   need(heights.length>0&&heights.length<=10004,'CANONICAL_DENSE_BOUND');for(const h of heights)height(h);
   const all=[...cache.keys(),...heights],min=Math.min(...all),max=Math.max(...all);need(max-min<10000,'CANONICAL_DENSE_BOUND');
   for(let from=min;from<=max;){signal.throwIfAborted();if(cache.has(from)){from++;continue;}
    let end=from;while(end<max&&!cache.has(end+1)&&end-from<998)end++;
    const start=cache.has(from-1)?from-1:from,through=Math.min(end,start+999),reader=factory({fromHeight:start,throughHeight:through}),sample=await reader.sample(signal);
    let previous=cache.get(start-1);
    for(let h=start;h<=through;h++){signal.throwIfAborted();const current=parseHeader(await reader.header(h,signal),'zcash-testnet'),old=cache.get(h),next=cache.get(h+1);
     need(current.height===h&&(!previous||current.parentHash===previous.hash),'HEADER_GAP_OR_FORK');need(!old||stable(old)===stable(current),'HISTORICAL_CANONICAL_REORG');need(!next||next.parentHash===current.hash,'HEADER_GAP_OR_FORK');
     cache.set(h,Object.freeze({...current}));previous=current;
    }
    need(stable(parseHeader(await reader.header(sample.head.height,signal),'zcash-testnet'))===stable(parseHeader(sample.head,'zcash-testnet')),'CANONICAL_HEAD_CHANGED');from=through+1;
   }
  },
 };
}

type Current={generation:string;checkpoint:{height:number;hash:string}};
/** A durable intent may remain after an expired fsync; never return to the SQL publisher then. */
export async function chefLinkedPublicationFence(signal:AbortSignal|undefined,writeIntent:()=>Promise<void>,leaseFence:()=>Promise<void>){signal?.throwIfAborted();await writeIntent();await leaseFence();signal?.throwIfAborted();}
export async function prepareChefLinkedCatchupPublish(options:{journal:ChefLinkedJournal;approval:ChefLinkedApproval;sha:string;canonical:LinkedCanonical;checks:number[];
 finalSignal?:AbortSignal;guard():Promise<void>;readCurrent(signal?:AbortSignal):Promise<Current>;traverse(range:{fromHeight:number;throughHeight:number},canonical:LinkedCanonical,signal:AbortSignal):Promise<{batch:ReplaceRange;snapshot:Snapshot;historicalWitness?:ChefHistoricalWitness}>;save(journal:ChefLinkedJournal):Promise<void>}){
 const{approval:p,sha,canonical,checks}=options;let j=options.journal;
 validateChefLinkedRecovery(j,p,sha,j.target);need(nextChefLinkedRecoveryRange(j)===null,'COMPLETE_PREFIX_REQUIRED');need(checks.length<=502,'ANCHOR_LIMIT');
 const history=chefLinkedRecoveryHeaders(j),bulkSignal=AbortSignal.timeout(90000);
 await canonical.prefetchPersisted([...new Set([...history.map(h=>h.height),...checks,j.target.height-9])],bulkSignal);
 for(const old of history){bulkSignal.throwIfAborted();need(stable(await canonical.header(old.height,bulkSignal))===stable(old),'HISTORICAL_CANONICAL_REORG');}
 await options.guard();
 // The expensive old-history verification precedes the one final target selection.
 const deadline=AbortSignal.timeout(30000),signal=options.finalSignal?AbortSignal.any([deadline,options.finalSignal]):deadline,selected=await options.readCurrent(signal);signal.throwIfAborted();need(selected.generation===p.identity.generation,'GENERATION_CHANGED');
 const combine=(inner:AbortSignal)=>AbortSignal.any([signal,inner]),bound:LinkedCanonical={...canonical,sample:inner=>canonical.sample(combine(inner)),header:(h,inner)=>canonical.header(h,combine(inner)),freshHeader:(h,inner)=>canonical.freshHeader(h,combine(inner)),prefetchPersisted:(heights,inner)=>canonical.prefetchPersisted(heights,combine(inner))};
 const target=await canonical.freshHeader(selected.checkpoint.height,signal);need(target.height===selected.checkpoint.height&&target.hash===selected.checkpoint.hash,'CANONICAL_CHECKPOINT_MISMATCH');
 if(target.height>j.target.height){j=extendChefLinkedRecoveryTarget(j,p,sha,j.target,target);const range=nextChefLinkedRecoveryRange(j);need(range&&range.throughHeight===target.height&&range.throughHeight-range.fromHeight+1<=1000,'FINAL_SUFFIX_TOO_LARGE');
  await canonical.prefetchPersisted(Array.from({length:range!.throughHeight-range!.fromHeight+1},(_,i)=>range!.fromHeight+i),signal);
  const result=await options.traverse(range!,bound,signal);signal.throwIfAborted();await options.guard();signal.throwIfAborted();
  const checked=await canonical.freshHeader(target.height,signal);j=appendChefLinkedRecoveryProof(j,p,sha,checked,result.batch,result.snapshot,Date.now(),result.historicalWitness);await options.save(j);signal.throwIfAborted();
 }else need(target.height===j.target.height&&target.hash===j.target.hash,'TARGET_REGRESSION');
 const snapshot=await chefLinkedRecoverySnapshot(j,p,sha,canonical,checks,()=>options.readCurrent(signal),signal);signal.throwIfAborted();await options.guard();signal.throwIfAborted();
 return{journal:j,snapshot,signal};
}
