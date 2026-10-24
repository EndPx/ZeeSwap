import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendChefAnchorHeaders,chefFinancialCheckHeights} from '../../src/integrations/observation/chef-live.ts';
import type pg from 'pg';
import type {CanonicalReader} from '../../src/integrations/observation/chef.ts';
import type {ReplaceRange} from '../../src/integrations/observation/types.ts';
import type {Snapshot} from '../../src/observer.ts';
const time=new Date().toISOString(),hash=(n:number)=>n.toString(16).padStart(64,'0');
const header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
const snapshot:Snapshot={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,scannedHeight:110,tipHash:hash(110),
 blocks:Array.from({length:11},(_,i)=>({height:100+i,hash:hash(100+i),time})),outputs:[]};
const batch={coverage:{sourceHead:header(111)},observations:[]} as unknown as ReplaceRange;
const canonical:CanonicalReader={sample:async()=>({head:header(111),checkedAt:time,sourceId:'fixture'}),header:async h=>header(h)};
test('old persisted anchors are independently checked without extending note coverage or deleting history',async()=>{
 const reads:number[]=[];
 const result=await appendChefAnchorHeaders(snapshot,batch,[89,95,101],{...canonical,header:async h=>{reads.push(h);return header(h);}},AbortSignal.timeout(1000));
 assert.deepEqual(reads,[89,95,111]);assert.deepEqual(result.blocks.map(b=>b.height),[89,95,101,110]);assert.equal(result.outputs.length,0);assert.equal(result.scannedHeight,110);
 assert.equal(snapshot.blocks.length,11);
});

test('300 fully verified headers compact to exact current, output and persisted money anchors',async()=>{
 const full:Snapshot={...snapshot,scannedHeight:399,tipHash:hash(399),
  blocks:Array.from({length:300},(_,i)=>({height:100+i,hash:hash(100+i),time})),
  outputs:[{txid:hash(999),index:0,pool:'ironwood',amount:'100000',receiver:'fixture',memo:null,
   height:180,blockHash:hash(180),blockTime:time,shieldedSource:true}]};
 // 160 represents a native-proven opening-capital/change output omitted from
 // customer ingestion. Its block is still checked, along with all money kinds.
 const range={coverage:{sourceHead:header(400)},observations:[{block:header(160)}]} as unknown as ReplaceRange;
 const reads:number[]=[];
 const result=await appendChefAnchorHeaders(full,range,[89,140,240,300,350],
  {...canonical,header:async h=>{reads.push(h);return header(h);}},AbortSignal.timeout(1000));
 assert.deepEqual(result.blocks.map(b=>b.height),[89,140,160,180,240,300,350,390,399]);
 assert.deepEqual(result.outputs,full.outputs);assert.equal(result.observedAt,full.observedAt);
 assert.equal(result.tipHash,full.tipHash);assert.equal(full.blocks.length,300);
 assert.deepEqual(reads,[89,400]);
});

test('full snapshot is validated before compaction can discard a malformed unused header',async()=>{
 const malformed={...snapshot,blocks:snapshot.blocks.map(b=>b.height===105?{...b,hash:'invalid'}:b)};
 await assert.rejects(appendChefAnchorHeaders(malformed,batch,[],canonical,AbortSignal.timeout(1000)),/INVALID_BLOCK/);
});

test('persisted anchor selection includes native deposits, payouts, refunds and both old checkpoints',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);return {rows:queries.length===1?
  [{anchor_height:'80'},{anchor_height:'90'},{anchor_height:'100'}]:[{scanned_height:'110',finalized_height:'101'}]};}} as unknown as pg.Pool;
 assert.deepEqual(await chefFinancialCheckHeights(pool),[80,90,100,110,101]);
 assert.match(queries[0]!,/zee\.deposits WHERE network='zcash-testnet'/);
 assert.match(queries[0]!,/UNION SELECT block_height FROM zee\.reverse_payouts WHERE block_height IS NOT NULL/);
 assert.match(queries[0]!,/UNION SELECT height FROM zee\.source_refunds WHERE zcash_hash IS NOT NULL AND height IS NOT NULL/);
 assert.doesNotMatch(queries[0]!,/confirmed|status|state/);
 assert.equal(queries.length,2);
});

test('anchor capacity overflow refuses rather than silently dropping old money anchors',async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;return {rows:Array.from({length:501},(_,i)=>({anchor_height:String(i)}))};}} as unknown as pg.Pool;
 await assert.rejects(chefFinancialCheckHeights(pool),/RECONCILIATION_WINDOW_LIMIT/);
 assert.equal(calls,1);
});
test('failed or wrong-height anchor read and changed sampled head refuse before SQL publication',async()=>{
 await assert.rejects(appendChefAnchorHeaders(snapshot,batch,[89],{...canonical,header:async()=>{throw Error('unavailable');}},AbortSignal.timeout(1000)));
 await assert.rejects(appendChefAnchorHeaders(snapshot,batch,[89],{...canonical,header:async h=>header(h+1)},AbortSignal.timeout(1000)),/CANONICAL_ANCHOR_HEIGHT_MISMATCH/);
 await assert.rejects(appendChefAnchorHeaders(snapshot,batch,[89],{...canonical,header:async h=>({...header(h),hash:hash(999)})},AbortSignal.timeout(1000)),/CANONICAL_HEAD_CHANGED/);
 await assert.rejects(appendChefAnchorHeaders(snapshot,batch,[112],canonical,AbortSignal.timeout(1000)),/CHEF_RANGE_BEHIND_PERSISTED_ANCHOR/);
});
test('changed old canonical anchor is retained for existing SQL conflict detection, never masked by stale stored hash',async()=>{
 const result=await appendChefAnchorHeaders(snapshot,batch,[89],{...canonical,header:async h=>h===89?{...header(h),hash:hash(999)}:header(h)},AbortSignal.timeout(1000));
 assert.equal(result.blocks.find(b=>b.height===89)!.hash,hash(999));
});
