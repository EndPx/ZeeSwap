import test from 'node:test';
import assert from 'node:assert/strict';
import {ChefCanonicalHeadChanged} from '../../src/integrations/observation/chef.ts';
import {ObservationError} from '../../src/integrations/observation/types.ts';
import {loadOriginalChefPersistedReader} from '../../src/chef-original-persisted-reader.ts';
import {chefHeadChangeCanWait,chefSourceRecheck,chefObserverExitStatus,type ChefPersistedState} from '../../src/integrations/observation/chef-live.ts';
const header=(height:number)=>({height,hash:'h'+height,parentHash:'h'+(height-1),time:'2026-10-30T00:00:00Z'});
const before:ChefPersistedState={control:{epoch:'238'},checkpoint:{scanned_height:'20',finalized_height:'11',tip_hash:'h20'},headers:[11,20].map(height=>({height:String(height),block_hash:'h'+height})),financial:{deposits:[],reverse_payouts:[],source_refunds:[]}};
const cursor={processedThrough:20,tipHash:'h20'};
const error=()=>new ChefCanonicalHeadChanged(header(30),{...header(30),time:'2026-10-30T00:00:01Z'},'traversal');
const canonical={sample:async()=>({sourceId:'fixture',checkedAt:new Date().toISOString(),head:header(30)}),header:async(h:number)=>header(h)};
const unready=async()=>{throw new ObservationError('WAIT_SOURCE_UNREADY');};

test('typed Source unready is deferred only after canonical prefix and unchanged world, without verified-wait diagnostic',async()=>{
 const calls:string[]=[];let diagnostics=0;
 const result=await chefHeadChangeCanWait(error(),false,before,cursor,{...canonical,header:async h=>{calls.push('header:'+h);return header(h);}},()=>chefSourceRecheck(async()=>{calls.push('state');return true;},async()=>{calls.push('source');return unready();},()=>true),AbortSignal.timeout(1000),'TRAVERSE',async()=>{diagnostics++;});
 assert.equal(result,'DEFERRED_SOURCE_UNREADY');assert.deepEqual(calls,['header:11','header:20','state','source']);assert.equal(diagnostics,0);
});
test('changed state prevents Source read; generic failures never become unready',async()=>{
 let reads=0;assert.equal(await chefSourceRecheck(async()=>false,async()=>{reads++;return unready();},()=>true),false);assert.equal(reads,0);
 for(const failure of [Error('WAIT_SOURCE_UNREADY'),new ObservationError('INVALID_PROJECT')])await assert.rejects(chefSourceRecheck(async()=>true,async()=>{throw failure;},()=>true),e=>e===failure);
});
test('persisted conflicts and publication retain original fatal classification and never ask Source',async()=>{
 let rereads=0;const unchanged=async()=>{rereads++;return'SOURCE_UNREADY' as const;};const original=error();
 assert.equal(await chefHeadChangeCanWait(original,false,before,cursor,{...canonical,header:async h=>({...header(h),hash:'fork'})},unchanged,AbortSignal.timeout(1000)),false);
 assert.equal(await chefHeadChangeCanWait(original,true,before,cursor,canonical,unchanged,AbortSignal.timeout(1000)),false);
 assert.equal(rereads,0);assert.equal(chefObserverExitStatus(original),78);
});
test('second Source reread can defer after first positive witness; subsequent ready cycle still needs all checks',async()=>{
 let reads=0,diagnostics=0;const recheck=()=>chefSourceRecheck(async()=>true,async()=>{if(++reads===2)return unready();return{generation:'same'};},s=>s.generation==='same');
 assert.equal(await chefHeadChangeCanWait(error(),false,before,cursor,canonical,recheck,AbortSignal.timeout(1000),'TRAVERSE',async()=>{diagnostics++;}),'DEFERRED_SOURCE_UNREADY');
 assert.equal(diagnostics,1);assert.equal(reads,2);
 assert.equal(await chefHeadChangeCanWait(error(),false,before,cursor,canonical,()=>chefSourceRecheck(async()=>true,async()=>({generation:'new'}),s=>s.generation==='same'),AbortSignal.timeout(1000)),false);
});

test('typed HTTP/unavailable/stale Source reads defer after unchanged state, while plain HTTP error does not',async()=>{
 for(const code of ['CHEF_HTTP_ERROR','WAIT_SOURCE_UNAVAILABLE','STALE_SOURCE'])assert.equal(await chefSourceRecheck(async()=>true,async()=>{throw new ObservationError(code);},()=>true),'SOURCE_UNREADY');
 await assert.rejects(chefSourceRecheck(async()=>true,async()=>{throw Error('CHEF_HTTP_ERROR');},()=>true),/CHEF_HTTP_ERROR/);
});
test('consumer transport selection cannot import an arbitrary module or rotate the original proof',async()=>{
 const keys=['ZEESWAP_CHEF_PERSISTED_READER_PROOF','ZEESWAP_CHEF_PERSISTED_READER_SHA256']as const,prior=keys.map(k=>process.env[k]),expected={profileSha256:'a'.repeat(64),headerScript:'/fixture/header.py',pythonPath:'/fixture/python',decoder:{path:'/fixture/decoder.json',sha256:'b'.repeat(64)}};
 try{for(const k of keys)delete process.env[k];assert.equal(await loadOriginalChefPersistedReader(expected),undefined);process.env[keys[0]]='/tmp/untrusted-reader.private.json';process.env[keys[1]]='0'.repeat(64);await assert.rejects(loadOriginalChefPersistedReader(expected),/ORIGINAL_PERSISTED_PROOF/);}finally{keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});}
});
