import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import test from 'node:test';import assert from 'node:assert/strict';
import {ordinaryChefCanonicalRecheck} from '../../scripts/observe-linux-chef.ts';
import {ChefCanonicalHeadChanged} from '../../src/integrations/observation/chef.ts';
import {chefHeadChangeCanWait,chefObserverExitStatus,type ChefPersistedState} from '../../src/integrations/observation/chef-live.ts';
import {verifyChefPersistedRanges,localChefPersistedRange,type ChefPersistedRangeReader} from '../../src/chef-persisted-range-reader.ts';
const min=4531977,tip=4553427,final=4553418,money=4540000,hash=(h:number)=>h.toString(16).padStart(64,'0'),stamp=new Date().toISOString(),header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time:stamp});
const state=():ChefPersistedState=>({control:{epoch:'234'},checkpoint:{scanned_height:String(tip),finalized_height:String(final),tip_hash:hash(tip)},headers:[min,money,...Array.from({length:4552},(_,i)=>tip-4551+i)].map(h=>({height:String(h),block_hash:hash(h)})),financial:{deposits:[{block_height:String(money),block_hash:hash(money)}],reverse_payouts:[],source_refunds:[]}});
const failure=()=>new ChefCanonicalHeadChanged({...header(tip+2),hash:'000002091b6f2da093e754c289937e207796def25a163622ff64ae67961b5574'},{...header(tip+2),hash:'000020386c5391a1d57e61ad36218c504c3eaefa611da6ca68db7579a93808f6'},'anchor-recheck');
function reader(change?:(p:Awaited<ReturnType<ChefPersistedRangeReader>>)=>void){const calls:{from:number;through:number}[]=[],dense=new Set<number>();const read:ChefPersistedRangeReader=async(from,through,signal)=>{signal.throwIfAborted();assert.ok(from>=min&&through<=tip&&through-from<1000);calls.push({from,through});const proof={kind:'independent-persisted-range-v1' as const,sourceId:'native',latestHeight:tip+2,fromHeight:from,throughHeight:through,headers:Array.from({length:through-from+1},(_,i)=>{dense.add(from+i);return header(from+i);})};change?.(proof);return proof;};return{calls,dense,read};}
const unavailableFuture=()=>({sample:async()=>{throw Error('VOLATILE_LATEST_GETBLOCK_UNAVAILABLE');},header:async()=>{throw Error('NO_LEGACY_HEADER_IO_ALLOWED');}});
test('actual above-persisted VERIFY_ANCHORS conflict audits all4554 stored anchors/dense parents with no future block fetch',async()=>{
 const f=reader(),before=state(),bytes=JSON.stringify(before),error=failure();let rereads=0,witness=0;
 const canonical=ordinaryChefCanonicalRecheck(unavailableFuture,'native',f.read);
 assert.equal(await chefHeadChangeCanWait(error,false,before,{processedThrough:tip,tipHash:hash(tip)},canonical,async()=>{rereads++;return true;},AbortSignal.timeout(180000),'VERIFY_ANCHORS',async()=>{witness++;}),true);
 assert.equal(before.headers.length,4554);assert.equal(rereads,2);assert.equal(witness,1);assert.equal(JSON.stringify(before),bytes);for(let h=min;h<=tip;h++)assert.ok(f.dense.has(h));
 const chunks=f.calls.filter(c=>c.from!==c.through);for(const chunk of chunks)assert.equal(f.calls.filter(c=>c.from===chunk.through&&c.through===chunk.through).length,2);
});
test('persisted financial/tip fork, wrong identity, incomplete range, bad height and unavailable IO remain fatal',async()=>{
 for(const mode of ['financial','tip','identity','partial','height','unavailable']){
  const f=reader(p=>{if(mode==='identity')p.sourceId='other';if(mode==='partial')p.headers.pop();if(mode==='height')p.headers[0]!.height++;if(mode==='financial'||mode==='tip'){const h=mode==='financial'?money:tip;const v=p.headers.find(v=>v.height===h);if(v)v.hash=hash(42);}}),error=failure(),canonical=ordinaryChefCanonicalRecheck(unavailableFuture,'native',mode==='unavailable'?async()=>{throw Error('TRANSPORT_FAILURE');}:f.read);let rereads=0;
  const check=chefHeadChangeCanWait(error,false,state(),{processedThrough:tip,tipHash:hash(tip)},canonical,async()=>{rereads++;return true;},AbortSignal.timeout(180000),'VERIFY_ANCHORS');
  if(mode==='tip')assert.equal(await check,false);else await assert.rejects(check,e=>e===error);assert.equal(chefObserverExitStatus(error),78);assert.equal(rereads,0);
  if(mode!=='tip')await assert.rejects(canonical.header(min,AbortSignal.timeout(1000)),/CACHE_REQUIRED/);
 }
});
test('fresh persisted endpoints and final seam rereads refuse a changed full header',async()=>{
 for(const at of [1,2]){const counts=new Map<number,number>(),f=reader(p=>{if(p.fromHeight===p.throughHeight){const n=(counts.get(p.fromHeight)??0)+1;counts.set(p.fromHeight,n);if(n===at)p.headers[0]!.time=new Date(0).toISOString();}});
  await assert.rejects(verifyChefPersistedRanges([min,money,final,tip],f.read,'native',AbortSignal.timeout(180000)),/RANGE_CHANGED/);
 }
});
test('post-publication, at-persisted mismatch, changed SQL/cursor world and deadline never produce safe wait',async()=>{
 const f=reader(),before=state(),cursor={processedThrough:tip,tipHash:hash(tip)},canonical=ordinaryChefCanonicalRecheck(unavailableFuture,'native',f.read);
 assert.equal(await chefHeadChangeCanWait(failure(),true,before,cursor,canonical,async()=>true,AbortSignal.timeout(1000),'VERIFY_ANCHORS'),false);assert.equal(f.calls.length,0);
 assert.equal(await chefHeadChangeCanWait(new ChefCanonicalHeadChanged(header(tip),{...header(tip),hash:hash(42)},'anchor-recheck'),false,before,cursor,canonical,async()=>true,AbortSignal.timeout(1000),'VERIFY_ANCHORS'),false);
 let rereads=0;assert.equal(await chefHeadChangeCanWait(failure(),false,before,cursor,canonical,async()=>++rereads===1,AbortSignal.timeout(180000),'VERIFY_ANCHORS',async()=>{}),false);assert.equal(rereads,2);
 const stop=new AbortController(),error=failure();stop.abort(Error('ORIGINAL_DEADLINE'));await assert.rejects(chefHeadChangeCanWait(error,false,before,cursor,canonical,async()=>true,stop.signal,'VERIFY_ANCHORS'),e=>e===error);
});

test('actual child transport uses persisted-range only and aborts without accepting partial output',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'persisted-transport-')),path=join(directory,'reader.mjs');
 try{await writeFile(path,`let text='';for await(const chunk of process.stdin)text+=chunk;const q=JSON.parse(text);if(q.command!=='persisted-range'||Object.keys(q).sort().join(',')!=='command,fromHeight,throughHeight')process.exit(2);const hash=n=>n.toString(16).padStart(64,'0');process.stdout.write(JSON.stringify({kind:'independent-persisted-range-v1',sourceId:'fixture',latestHeight:999,fromHeight:q.fromHeight,throughHeight:q.throughHeight,headers:Array.from({length:q.throughHeight-q.fromHeight+1},(_,i)=>({height:q.fromHeight+i,hash:hash(q.fromHeight+i),parentHash:hash(q.fromHeight+i-1),time:'2026-10-29T00:00:00Z'}))}));`);
  const read=localChefPersistedRange(process.execPath,[path]),result=await verifyChefPersistedRanges([100,101,102],read,'fixture',AbortSignal.timeout(5000));assert.equal(result.size,3);assert.equal(result.get(102)!.height,102);
  await writeFile(path,`for await(const chunk of process.stdin){};process.stdout.write('{');await new Promise(done=>setTimeout(done,10000));`);const stop=new AbortController();const pending=read(100,102,stop.signal);setTimeout(()=>stop.abort(),10);await assert.rejects(pending,/CHEF_PERSISTED_RANGE_FAILED/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('failed child exposes only requested numeric range, exit and allowlisted reason/status, never raw stderr',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'persisted-diagnostic-')),path=join(directory,'reader.mjs');
 try{for(const stderr of [JSON.stringify({event:'CHEF_PERSISTED_RANGE_FAILED',reason:'PERSISTED_RANGE_INCOMPLETE',grpcStatus:4,secret:'PRIVATE_TOKEN'}),'PRIVATE_TOKEN and raw provider payload']){
  await writeFile(path,`for await(const chunk of process.stdin){};process.stderr.write(${JSON.stringify(stderr)});process.exitCode=1;`);
  await assert.rejects(localChefPersistedRange(process.execPath,[path])(110,119,AbortSignal.timeout(5000)),error=>{const e=error as Error&{persistedRange:unknown};assert.equal(e.message,'CHEF_PERSISTED_RANGE_FAILED');assert.deepEqual(e.persistedRange,{fromHeight:110,throughHeight:119,exitCode:1,aborted:false,reason:stderr.startsWith('{')?'PERSISTED_RANGE_INCOMPLETE':null,grpcStatus:stderr.startsWith('{')?4:null});assert.equal(JSON.stringify(e).includes('PRIVATE_TOKEN'),false);return true;});
 }}finally{await rm(directory,{recursive:true,force:true});}
});
