import test from 'node:test';
import assert from 'node:assert/strict';
import {ObserverWaitError} from '../src/observer-frontiers.ts';
import {retryAuthenticatedBaseHeadRead} from '../src/base-observer-read-retry.ts';

const hash='ab'.repeat(32);
function snapshot(){const time=new Date().toISOString();return {schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,
 scannedHeight:1000,tipHash:hash,blocks:[{height:1000,hash,time},{height:991,hash,time}],outputs:[]};}
function lag(reason='HEAD_BEHIND',network='base-sepolia'){
 return new ObserverWaitError({event:'observer-frontier',source:'reverse-observer-refresh',status:'WAIT',network,reason,
  previous:{height:100,hash,finalizedHeight:90,observedAt:new Date().toISOString()},incoming:{height:99,hash,finalizedHeight:89,observedAt:new Date().toISOString()}});
}
test('two lagging authenticated Base reads then a fresh one publish once with the identical unchanged source observation',async()=>{
 const source=snapshot(),seen:unknown[]=[],captures:Date[]=[];let reads=0,writes=0,publishedTime:Date|undefined;
 const stored={height:100,finalized:90};
 const result=await retryAuthenticatedBaseHeadRead({
  read:async()=>{const observedAt=new Date(Date.now()+reads);captures.push(observedAt);reads++;return {heads:{height:reads===1?99:reads===2?100:101,finalized:reads===2?89:91},observedAt};},
  publish:async(read,captured)=>{seen.push(captured);assert.deepEqual(captured,source);assert.equal(Object.isFrozen(captured),true);
   if(read.heads.height<stored.height)throw lag('HEAD_BEHIND');if(read.heads.finalized<stored.finalized)throw lag('FINALITY_BEHIND');
   Object.assign(stored,read.heads);writes++;publishedTime=read.observedAt;return 'PUBLISHED';}
 },source);
 assert.equal(result,'PUBLISHED');assert.equal(reads,3);assert.equal(writes,1);
 assert.equal(seen.every(s=>s===seen[0]),true);assert.equal((seen[0] as any).observedAt,source.observedAt);assert.equal(publishedTime,captures[2]);
});
test('three lagging reads return the first original typed wait and never update readiness',async()=>{
 let reads=0,writes=0;const first=lag(),stored={height:100,observedAt:'original-readiness'},before=structuredClone(stored);
 await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>{reads++;return {heads:{height:99},observedAt:new Date()};},publish:async read=>{
  if(read.heads.height<stored.height)throw reads===1?first:lag('FINALITY_BEHIND');stored.height=read.heads.height;stored.observedAt=read.observedAt.toISOString();writes++;return 'PUBLISHED';}}),error=>error===first);
 assert.equal(reads,3);assert.equal(writes,0);assert.deepEqual(stored,before);
});
test('canonical conflict propagates after its first committed freeze and is never retried',async()=>{
 let reads=0,frozen=false;const conflict=new Error('OBSERVER_CANONICAL_CONFLICT');
 await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>({heads:++reads,observedAt:new Date()}),publish:async()=>{frozen=true;throw conflict;}}),error=>error===conflict);
 assert.equal(reads,1);assert.equal(frozen,true);
});
test('source lag, older Base observation, other network, malformed lookalikes and unknown errors immediately stop',async()=>{
 for(const error of [lag('HEAD_BEHIND','zcash-testnet'),lag('OLDER_OBSERVATION'),lag('SCANNER_FINALITY_PENDING'),
  new Error('BASE_RPC_UNAVAILABLE'),Object.assign(new Error('OBSERVER_WAIT'),{diagnostic:lag().diagnostic}),new ObserverWaitError({network:'base-sepolia',reason:'HEAD_BEHIND'})]){
  let reads=0;
  await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>({heads:++reads,observedAt:new Date()}),publish:async()=>{throw error;}},snapshot()),value=>value===error);
  assert.equal(reads,1);
 }
});
test('an already stale source capture prevents even the first Base read',async()=>{
 let reads=0;const source={...snapshot(),observedAt:new Date(Date.now()-61000).toISOString()};
 await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>({heads:++reads,observedAt:new Date()}),publish:async()=>true},source),/STALE_SNAPSHOT/);
 assert.equal(reads,0);
});
test('source capture expiring between attempts stops before another read and cannot have its timestamp renewed',async()=>{
 const now=Date.now,initial=now(),source=snapshot(),observedAt=source.observedAt;let reads=0;
 try{
  await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>({heads:++reads,observedAt:new Date(initial)}),publish:async()=>{Date.now=()=>initial+61001;throw lag();}},source),/STALE_SNAPSHOT/);
  assert.equal(reads,1);assert.equal(source.observedAt,observedAt);
 }finally{Date.now=now;}
});
test('source expiring during a Base read prevents publication even if that head would be usable',async()=>{
 const now=Date.now,initial=now();let reads=0,publishes=0;
 try{
  await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>{reads++;Date.now=()=>initial+61001;return {heads:101,observedAt:new Date(initial)};},publish:async()=>{publishes++;return true;}},snapshot()),/STALE_SNAPSHOT/);
  assert.equal(reads,1);assert.equal(publishes,0);
 }finally{Date.now=now;}
});
test('a later canonical or unknown failure after one eligible lag is propagated without a third read',async()=>{
 for(const error of [new Error('OBSERVER_CANONICAL_CONFLICT'),new Error('BASE_RPC_UNAVAILABLE'),lag('HEAD_BEHIND','zcash-testnet')]){
  let reads=0;
  await assert.rejects(()=>retryAuthenticatedBaseHeadRead({read:async()=>({heads:++reads,observedAt:new Date()}),publish:async()=>{if(reads===1)throw lag();throw error;}},snapshot()),value=>value===error);
  assert.equal(reads,2);
 }
});
