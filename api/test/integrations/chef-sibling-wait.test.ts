import test from 'node:test';
import assert from 'node:assert/strict';
import {appendChefAnchorHeaders,chefHeadChangeCanWait,chefSiblingWaitProof,type ChefPersistedState} from '../../src/integrations/observation/chef-live.ts';
import {ChefCanonicalHeadChanged,type CanonicalReader} from '../../src/integrations/observation/chef.ts';
import type {Snapshot} from '../../src/observer.ts';
import type {ReplaceRange} from '../../src/integrations/observation/types.ts';
const time='2026-10-29T13:52:40.000Z',hash=(h:number)=>h.toString(16).padStart(64,'0');
const header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
const before=():ChefPersistedState=>({control:{epoch:'237',reconciliation_required:true},checkpoint:{scanned_height:'110',finalized_height:'101',tip_hash:hash(110)},headers:[89,101,110].map(h=>({height:String(h),block_hash:hash(h)})),financial:{deposits:[{block_height:89,block_hash:hash(89)}],reverse_payouts:[],source_refunds:[]}});
const cursor={processedThrough:110,tipHash:hash(110)},signal=()=>AbortSignal.timeout(5000);
async function sibling(options:{head?:number;cached?:boolean;parentFork?:boolean;anchorFork?:boolean;differentTime?:boolean;differentParent?:boolean}={}){
 const head=options.head??112,reads:number[]=[];
 const initial:CanonicalReader={sample:async()=>({sourceId:'native',head:header(head),checkedAt:time}),headerOrigin:()=>({kind:options.cached===false?'fresh':'prefetch-cache',fromHeight:100,throughHeight:head,sampledHeadHeight:head}),header:async h=>{reads.push(h);return h===head?{...header(h),hash:hash(999),...(options.differentTime?{time:'2026-10-29T13:52:41.000Z'}:{}),...(options.differentParent?{parentHash:hash(998)}:{})}:h===111&&options.parentFork?{...header(h),parentHash:hash(998)}:h===89&&options.anchorFork?{...header(h),hash:hash(998)}:header(h);}};
 const snapshot:Snapshot={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date().toISOString(),scannedHeight:110,tipHash:hash(110),blocks:[101,110].map(h=>({height:h,hash:hash(h),time})),outputs:[]};
 const batch={coverage:{sourceHead:header(head)},observations:[]} as unknown as ReplaceRange;
 let error:unknown;try{await appendChefAnchorHeaders(snapshot,batch,[89,101,110],initial,signal());}catch(e){error=e;}
 assert.ok(error instanceof ChefCanonicalHeadChanged);return{error,reads};
}
const unavailable:CanonicalReader={sample:async()=>{throw Error('NO_NEW_SOURCE_SAMPLE');},header:async()=>{throw Error('PERSISTED_AUDIT_UNAVAILABLE');}};
test('verified unpublished sibling commits through the same persisted tip and all money/finality anchors, with two unchanged-world reads',async()=>{
 const f=await sibling(),state=before(),bytes=JSON.stringify(state);let rereads=0,diagnostics=0;
 assert.equal(await chefHeadChangeCanWait(f.error,false,state,cursor,unavailable,async()=>{rereads++;return true;},signal(),'VERIFY_ANCHORS',async()=>{diagnostics++;}),true);
 assert.equal(rereads,2);assert.equal(diagnostics,1);assert.equal(JSON.stringify(state),bytes);
 assert.deepEqual(chefSiblingWaitProof(f.error),{kind:'verified-unpublished-sibling-ancestry',headHeight:112,persistedTipHeight:110,unpublishedParentCount:1});
 assert.equal(f.reads.filter(h=>h===112).length,1);
});
test('missing verified cache, changed parent/time, disconnected ancestry, financial conflict and depth above six never waive failed audit',async()=>{
 for(const options of [{cached:false},{differentTime:true},{differentParent:true},{parentFork:true},{anchorFork:true},{head:117}]){const f=await sibling(options);await assert.rejects(chefHeadChangeCanWait(f.error,false,before(),cursor,unavailable,async()=>true,signal(),'VERIFY_ANCHORS'),e=>e===f.error);assert.equal(chefSiblingWaitProof(f.error),undefined);}
});
test('constructed sibling and wrong phase cannot manufacture an initial verified frame',async()=>{
 const f=await sibling(),forged=new ChefCanonicalHeadChanged(f.error.expected,f.error.actual,'anchor-recheck');
 for(const [error,phase]of [[forged,'VERIFY_ANCHORS'],[f.error,'TRAVERSE']] as const)await assert.rejects(chefHeadChangeCanWait(error,false,before(),cursor,unavailable,async()=>true,signal(),phase),e=>e===error);
});
test('publication, persisted conflict, first/second changed world, diagnostic failure and abort never become a safe wait',async()=>{
 const f=await sibling();assert.equal(await chefHeadChangeCanWait(f.error,true,before(),cursor,unavailable,async()=>true,signal(),'VERIFY_ANCHORS'),false);
 const conflict=before();conflict.headers[2]!.block_hash=hash(998);assert.equal(await chefHeadChangeCanWait(f.error,false,conflict,cursor,unavailable,async()=>true,signal(),'VERIFY_ANCHORS'),false);
 for(const changedRead of [1,2]){let n=0;assert.equal(await chefHeadChangeCanWait((await sibling()).error,false,before(),cursor,unavailable,async()=>++n!==changedRead,signal(),'VERIFY_ANCHORS'),false);assert.equal(n,changedRead);}
 const d=await sibling();await assert.rejects(chefHeadChangeCanWait(d.error,false,before(),cursor,unavailable,async()=>true,signal(),'VERIFY_ANCHORS',async()=>{throw Error('FSYNC_FAILED');}),e=>e===d.error);
 const stop=new AbortController();stop.abort();const a=await sibling();await assert.rejects(chefHeadChangeCanWait(a.error,false,before(),cursor,unavailable,async()=>true,stop.signal,'VERIFY_ANCHORS'),e=>e===a.error);
});
