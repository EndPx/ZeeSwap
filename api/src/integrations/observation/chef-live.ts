import type pg from "pg";
import type { PrivateData } from "../../private-data.ts";
import { ingestSnapshot, observerCheckHeights,validateSnapshot,type Snapshot } from "../../observer.ts";
import { ChefAdapter, ChefCanonicalHeadChanged, SourceCheckpointMismatch, requireChefCanonicalHead, type ChefConfig } from "./chef.ts";
import { ChefWalletBridge } from "./chef-wallet-bridge.ts";
import { height, requireThat,parseHeader,stable,type ReplaceRange,type Header } from "./types.ts";

// Only the completed anchor-verification phase can issue this witness. A
// constructed error or a failed persisted-range read cannot manufacture it.
const siblingFrames=new WeakMap<ChefCanonicalHeadChanged,{error:string;anchors:Map<number,string>;parents:Header[]}>();
const siblingWaitProofs=new WeakMap<ChefCanonicalHeadChanged,{kind:'verified-unpublished-sibling-ancestry';headHeight:number;persistedTipHeight:number;unpublishedParentCount:number}>();
export function chefSiblingWaitProof(error:unknown){return error instanceof ChefCanonicalHeadChanged?siblingWaitProofs.get(error):undefined;}

/** Retained financial anchors are canonical header checks, never a claim that
 * the new Chef account scanned notes before its explicit birthday. */
export async function appendChefAnchorHeaders(snapshot:Snapshot,batch:ReplaceRange,checks:number[],canonical:ChefConfig["canonical"],signal:AbortSignal):Promise<Snapshot> {
 requireThat(checks.length<=502,"RECONCILIATION_WINDOW_LIMIT");
 requireThat(checks.every(check=>check<=snapshot.scannedHeight),"CHEF_RANGE_BEHIND_PERSISTED_ANCHOR");
 // The bridge has already validated the entire coherent range and every native
 // output. Publish only required anchors: each SQL header is checked while the
 // shared runtime row is locked, so publishing heartbeat history stalls Base.
 validateSnapshot(snapshot);
 const verified=new Map(snapshot.blocks.map(block=>[block.height,block]));
 const required=new Set([snapshot.scannedHeight,Math.max(0,snapshot.scannedHeight-9),...checks,
  ...snapshot.outputs.map(output=>output.height),...batch.observations.map(observation=>observation.block.height)]);
 requireThat(required.size<=1000,"CHEF_ANCHOR_CAPACITY_REACHED");
 const blocks=new Map<number,Snapshot["blocks"][number]>();
 for(const check of [...required].sort((a,b)=>a-b)) {
  const existing=verified.get(check);
  if(existing){blocks.set(check,existing);continue;}
  const header=parseHeader(await canonical.header(check,signal),"zcash-testnet");
  requireThat(header.height===check,"CANONICAL_ANCHOR_HEIGHT_MISMATCH");
  blocks.set(check,{height:header.height,hash:header.hash,time:header.time});
 }
 requireThat(blocks.size<=1000,"CHEF_ANCHOR_CAPACITY_REACHED");
 try{requireChefCanonicalHead(batch.coverage.sourceHead,await canonical.header(batch.coverage.sourceHead.height,signal),'anchor-recheck');}
 catch(error){
  if(error instanceof ChefCanonicalHeadChanged&&error.expected.height===error.actual.height&&error.expected.parentHash===error.actual.parentHash&&error.expected.time===error.actual.time&&error.expected.hash!==error.actual.hash){
   const parents:Header[]=[];
   // Read ONLY headers already verified in the initial independent dense range.
   // Never fetch a new parent or treat an unavailable prefix as verified.
   try{for(let h=error.expected.height-1;h>=0&&parents.length<6;h--){const origin=canonical.headerOrigin?.(h);if(origin?.kind!=='prefetch-cache'||origin.sampledHeadHeight!==error.expected.height||origin.fromHeight===undefined||origin.fromHeight>h||origin.throughHeight===undefined||origin.throughHeight<error.expected.height)break;parents.push(parseHeader(await canonical.header(h,signal),'zcash-testnet'));}}catch(failure){error.recheckFailure=failure;throw error;}
   siblingFrames.set(error,{error:stable([error.expected,error.actual]),anchors:new Map([...blocks].map(([h,b])=>[h,b.hash])),parents});
  }
  throw error;
 }
 return validateSnapshot({...snapshot,blocks:[...blocks.values()].sort((a,b)=>a.height-b.height)});
}

/** Include receipts that no longer appear in the incoming-note range. No
 * lifecycle/state filter may discard an already persisted financial anchor. */
export async function chefFinancialCheckHeights(pool:Pick<pg.Pool,'query'>):Promise<number[]> {
 const rows=(await pool.query(`SELECT anchor_height::text FROM (
  SELECT block_height AS anchor_height FROM zee.deposits WHERE network='zcash-testnet'
  UNION SELECT block_height FROM zee.reverse_payouts WHERE block_height IS NOT NULL
  UNION SELECT height FROM zee.source_refunds WHERE zcash_hash IS NOT NULL AND height IS NOT NULL
 ) anchors ORDER BY anchors.anchor_height LIMIT 501`)).rows;
 requireThat(rows.length<=500,"RECONCILIATION_WINDOW_LIMIT");
 const checks=await observerCheckHeights(pool,rows.map(row=>height(Number(row.anchor_height))));
 requireThat(checks.length<=502,"RECONCILIATION_WINDOW_LIMIT");
 return checks;
}

/** Explicit opt-in bridge for a fresh isolated testnet application. This has no
 * signer/dispatch imports; SQL still owns order matching, liability and finality. */
export async function observeChefOnce(pool: pg.Pool, keys: PrivateData, config: ChefConfig,
 bridge: ChefWalletBridge, fromHeight: number) {
 height(fromHeight);const started=Date.now();
 const checks=await chefFinancialCheckHeights(pool);
 const result = await new ChefAdapter({...config, classify: bridge.classify}).traverse(fromHeight);
 if (result.status !== "READY_SHADOW") return {status: result.status, retryAfterMs: result.retryAfterMs};
 const remaining=30_000-(Date.now()-started);requireThat(remaining>0,"READ_BUDGET");
 const snapshot = await appendChefAnchorHeaders(bridge.snapshot(result.batch, config.policy),result.batch,checks,config.canonical,AbortSignal.timeout(remaining));
 return {status: "CHEF_TESTNET_OBSERVED", ...await ingestSnapshot(pool, keys, snapshot),excludedOpeningCapital:bridge.excludedOpeningCapitalCount,
  verifiedRangeHeaders:result.batch.headers.length,publishedHeaders:snapshot.blocks.length};
}

export type ChefPersistedState={control:unknown;checkpoint:{scanned_height:string;finalized_height:string;tip_hash:string}|null;headers:{height:string;block_hash:string}[];financial:unknown};
/** One statement captures the exact native persisted prefix and financial rows.
 * No state/confirmation filter discards a retained financial anchor. */
export async function readChefPersistedState(db:Pick<pg.Pool,'query'>):Promise<ChefPersistedState>{
 const row=(await db.query(`SELECT jsonb_build_object(
 'control',(SELECT to_jsonb(c)||jsonb_build_object('xmin',xmin::text) FROM zee.runtime_control c WHERE singleton),
 'checkpoint',(SELECT to_jsonb(c) FROM zee.scanner_checkpoints c WHERE network='zcash-testnet'),
 'headers',(SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.height::bigint),'[]'::jsonb) FROM (SELECT height::text,block_hash FROM zee.chain_observations WHERE network='zcash-testnet' ORDER BY height LIMIT 10005) h),
 'financial',jsonb_build_object('deposits',(SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) FROM (SELECT * FROM zee.deposits WHERE network='zcash-testnet' ORDER BY id LIMIT 129) d),'reverse_payouts',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.order_id),'[]'::jsonb) FROM (SELECT * FROM zee.reverse_payouts ORDER BY order_id LIMIT 129) r),'source_refunds',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.order_id),'[]'::jsonb) FROM (SELECT * FROM zee.source_refunds ORDER BY order_id LIMIT 129) r))) AS state`)).rows[0]?.state;
 requireThat(row&&Array.isArray(row.headers)&&row.headers.length<=10004,'CHEF_PERSISTED_STATE_BOUND');requireThat(['deposits','reverse_payouts','source_refunds'].every(t=>Array.isArray(row.financial?.[t])&&row.financial[t].length<=128),'CHEF_PERSISTED_STATE_BOUND');return row;
}
/** A wait is permitted only after independently checking every persisted hash,
 * then rereading the exact captured state. Failure never becomes a wait. */
export async function chefHeadChangeCanWait(error:unknown,publicationAttempted:boolean,before:ChefPersistedState,cursor:{processedThrough:number;tipHash:string},canonical:ChefConfig['canonical']&{prefetchPersisted?:(heights:number[],signal:AbortSignal)=>Promise<void>},unchanged:()=>Promise<boolean>,signal:AbortSignal,cyclePhase?:string,verifiedDiagnostic?:()=>Promise<void>){
 const headChange=error instanceof ChefCanonicalHeadChanged,checkpointChange=error instanceof SourceCheckpointMismatch;
 if(publicationAttempted||!headChange&&!checkpointChange||!before.checkpoint)return false;
 const expectedHeight=headChange?error.expected.height:error.expectedCore.height,actualHeight=headChange?error.actual.height:error.actualHeader.height;
 if(actualHeight!==expectedHeight||checkpointChange&&(cyclePhase!=='TRAVERSE'||!error.freshCanonicalHeader||error.freshCanonicalHeader.height!==expectedHeight||error.freshCanonicalFailure!==undefined))return false;
 requireThat(before.headers.length<=10004,'CHEF_PERSISTED_STATE_BOUND');
 const headers=new Map(before.headers.map(x=>[Number(x.height),x.block_hash]));
 if(headers.has(cursor.processedThrough)&&headers.get(cursor.processedThrough)!==cursor.tipHash)return false;
 headers.set(cursor.processedThrough,cursor.tipHash);
 const cp=before.checkpoint,scanned=Number(cp.scanned_height),finalized=Number(cp.finalized_height);
 if(headers.get(scanned)!==cp.tip_hash||!headers.has(finalized))return false;
 const financial=before.financial as Record<string,any[]>;
 for(const [table,key]of [['deposits','block_height'],['reverse_payouts','block_height'],['source_refunds','height']] as const)for(const row of financial[table]??[]){if(row[key]==null&&row.block_hash==null)continue;const h=Number(row[key]);if(!Number.isSafeInteger(h)||headers.get(h)!==row.block_hash)return false;}
 if(![...headers.keys(),scanned,finalized].every(h=>Number.isSafeInteger(h)&&h>=0&&h<expectedHeight))return false;
 try{
 const frame=headChange?siblingFrames.get(error):undefined;
 let sibling=false;
 if(headChange&&frame&&cyclePhase==='VERIFY_ANCHORS'&&error.phase==='anchor-recheck'&&frame.error===stable([error.expected,error.actual])&&scanned===cursor.processedThrough&&scanned<expectedHeight&&expectedHeight-scanned<=6&&[...headers.keys()].every(h=>h<=scanned)){
  const required=new Set([scanned,finalized,cursor.processedThrough]);
  for(const [table,key]of [['deposits','block_height'],['reverse_payouts','block_height'],['source_refunds','height']] as const)for(const row of financial[table]??[])if(row[key]!=null)required.add(Number(row[key]));
  // Required persisted/financial anchors were independently verified BEFORE the
  // sibling was observed. Its unchanged parent chain commits to the same tip.
  if([...required].every(h=>frame.anchors.get(h)===headers.get(h))){
   let parentHash=error.actual.parentHash;
   for(let h=expectedHeight-1;h>=scanned;h--){signal.throwIfAborted();const parent=frame.parents[expectedHeight-1-h];if(!parent||parent.height!==h||parent.hash!==parentHash)break;if(h===scanned){sibling=parent.hash===cp.tip_hash;break;}parentHash=parent.parentHash;}
  }
 }
 if(sibling&&headChange){siblingWaitProofs.set(error,{kind:'verified-unpublished-sibling-ancestry',headHeight:expectedHeight,persistedTipHeight:scanned,unpublishedParentCount:expectedHeight-scanned-1});}
 else {
 await canonical.prefetchPersisted?.([...headers.keys()],signal);
 for(const [h,hash]of headers){signal.throwIfAborted();const current=await canonical.header(h,signal);if(current.height!==h||current.hash!==hash)return false;}
 }
 signal.throwIfAborted();let onAbort:()=>void=()=>{};const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(signal.reason);signal.addEventListener('abort',onAbort,{once:true});});try{const result=await Promise.race([unchanged(),aborted]);signal.throwIfAborted();if(result&&(verifiedDiagnostic||sibling)){await verifiedDiagnostic?.();signal.throwIfAborted();const final=await Promise.race([unchanged(),aborted]);signal.throwIfAborted();return final;}return result;}finally{signal.removeEventListener('abort',onAbort);}
 }catch(recheckFailure){error.recheckFailure=recheckFailure;throw error;}
}
export const chefDiagnosticCodes=['CANONICAL_HEAD_CHANGED','OBSERVER_EPOCH_CHANGED','CHEF_LIVE_CURSOR_REORG','CHEF_LIVE_GENERATION_CHANGED','CHEF_RECOVERY_TARGET_REORG','CHEF_RECOVERY_OVERLAP_REORG','CHEF_LIVE_CURSOR_IDENTITY','CHEF_LIVE_SOURCE_REGRESSION','CHEF_RECOVERY_IDENTITY_CHANGED','CANONICAL_CHECKPOINT_MISMATCH','HEADER_GAP_OR_FORK','CANONICAL_NOTE_MISMATCH','CHEF_HTTP_ERROR','CHEF_CANONICAL_HEADER_FAILED','CANONICAL_RPC_HTTP_ERROR','CHEF_PERSISTED_STATE_BOUND'] as const;
export function chefDiagnosticCode(error:unknown){const e=error as {code?:unknown;message?:unknown};const code=typeof e?.code==='string'?e.code:e?.message;return chefDiagnosticCodes.includes(code as typeof chefDiagnosticCodes[number])?String(code):'UNCLASSIFIED_PRIVATE_ERROR';}
/** Exactly the existing persisted/source conflict set that requires reconciliation. */
export const chefFatalReconciliationCodes=['CHEF_LIVE_CURSOR_REORG','CHEF_LIVE_GENERATION_CHANGED','CHEF_RECOVERY_TARGET_REORG','CHEF_RECOVERY_OVERLAP_REORG','CHEF_LIVE_CURSOR_IDENTITY','CHEF_LIVE_SOURCE_REGRESSION','CHEF_RECOVERY_IDENTITY_CHANGED','CANONICAL_CHECKPOINT_MISMATCH','HEADER_GAP_OR_FORK','CANONICAL_NOTE_MISMATCH','CANONICAL_HEAD_CHANGED'] as const;
export function chefObserverExitStatus(error:unknown):1|78{return chefFatalReconciliationCodes.includes(chefDiagnosticCode(error) as typeof chefFatalReconciliationCodes[number])?78:1;}
/** One invocation attempts the existing SQL function once. Unknown acknowledgement stays fatal. */
export async function reconcileChefObserverFailure(error:unknown,connectedScope:boolean,reconcile:()=>Promise<unknown>):Promise<'NOT_REQUESTED'|'ACKNOWLEDGED'|'UNKNOWN'>{
 if(!connectedScope||chefObserverExitStatus(error)!==78)return'NOT_REQUESTED';
 try{await reconcile();return'ACKNOWLEDGED';}catch{return'UNKNOWN';}
}

/** Existing dense canonical reader verifies every intervening parent once;
 * retained SQL rows then share that bounded cache rather than spawn per row.
 * persisted-range is ONLY the prepublication safe-wait audit: its fresh endpoint
 * fences every dense parent while permitting a volatile unpersisted tip to move. */
export function chefPersistedCanonical(factory:(range:{fromHeight:number;throughHeight:number})=>ChefConfig['canonical'],fence:'sampled-head'|'persisted-range'='sampled-head'):ChefConfig['canonical']&{prefetchPersisted:(heights:number[],signal:AbortSignal)=>Promise<void>}{
 const cache=new Map<number,Awaited<ReturnType<ChefConfig['canonical']['header']>>>();
 return {sample:signal=>factory({fromHeight:0,throughHeight:0}).sample(signal),async header(h){const found=cache.get(h);requireThat(found,'CHEF_PERSISTED_CANONICAL_CACHE_REQUIRED');return found;},async prefetchPersisted(heights,signal){
 requireThat(heights.length>0&&heights.length<=10004,'CHEF_PERSISTED_STATE_BOUND');requireThat(heights.every(h=>Number.isSafeInteger(h)&&h>=0),'INVALID_HEIGHT');const wanted=new Set(heights),min=Math.min(...heights),max=Math.max(...heights);requireThat(max-min<10000,'CHEF_PERSISTED_DENSE_RANGE_BOUND');let previous:Awaited<ReturnType<ChefConfig['canonical']['header']>>|undefined;
 for(let fromHeight=min;fromHeight<=max;fromHeight+=1000){signal.throwIfAborted();const throughHeight=Math.min(max,fromHeight+999),reader=factory({fromHeight,throughHeight}),sample=await reader.sample(signal);for(let h=fromHeight;h<=throughHeight;h++){const header=await reader.header(h,signal);requireThat(!previous||header.parentHash===previous.hash,'HEADER_GAP_OR_FORK');previous=header;if(wanted.has(h))cache.set(h,header);}if(fence==='persisted-range'){requireThat(sample.head.height>=throughHeight,'CHEF_PERSISTED_SOURCE_BEHIND');const endpoint=await factory({fromHeight:throughHeight,throughHeight}).header(throughHeight,signal);requireThat(stable(endpoint)===stable(previous),'CANONICAL_PERSISTED_RANGE_CHANGED');}else requireThat(stable(await reader.header(sample.head.height,signal))===stable(sample.head),'CANONICAL_HEAD_CHANGED');}
 }};
}

export function chefFailureMetadata(error:unknown,publicationAttempted:boolean,phase:string){
 const code=chefDiagnosticCode(error),allowed=['INITIALIZE','READ_PERSISTED','READ_SOURCE','TRAVERSE','VERIFY_ANCHORS','AFTER_PUBLICATION'];
 return {caller:'chef',source:code==='OBSERVER_EPOCH_CHANGED'?'shared-runtime-control':'chef',code,phase:publicationAttempted?'AFTER_PUBLICATION':allowed.includes(phase)?phase:'INITIALIZE'};
}

/** Fresh uncached evidence is diagnostic only: it never repairs a batch header. */
export async function diagnoseSourceCheckpointMismatch(error:SourceCheckpointMismatch,read:(height:number,signal:AbortSignal)=>Promise<Awaited<ReturnType<ChefConfig['canonical']['header']>>>,signal:AbortSignal){
 try{const header=await read(error.expectedCore.height,signal);requireThat(header.height===error.expectedCore.height,'CANONICAL_CHECKPOINT_MISMATCH');error.freshCanonicalHeader=header;return header;}catch(failure){error.freshCanonicalFailure=failure;throw error;}
}

export function chefCheckpointSourceUnchanged(error:SourceCheckpointMismatch,expected:{project:string;generation:string;configIdentity:string},current:{project:string;generation:string;configIdentity:string}){
 return error.expectedCore.project===expected.project&&error.expectedCore.generation===expected.generation&&current.project===expected.project&&current.generation===expected.generation&&current.configIdentity===expected.configIdentity;
}
