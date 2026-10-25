import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,decodeHealth,ZeeApi} from '../src/api.ts';

const continuation=(forward:2|3=3)=>({inputAmountAtomic:'100000',maxAcceptedByDirection:{ZCASH_TO_BASE:forward,BASE_TO_ZCASH:1},newForwardCutoffBlocks:40,continuationSha256:'a'.repeat(64)});
const health=(quoteBounds?:unknown)=>({status:'ok',integrationOnly:false,...(quoteBounds===undefined?{}:{quoteBounds})});
test('health accepts the legacy bounded shape and connectivity without a policy',()=>{
 assert.deepEqual(decodeHealth(health()),health());
 const value=health({inputAmountAtomic:'100000',maxAcceptedPerDirection:1});assert.equal(decodeHealth(value).quoteBounds,value.quoteBounds);
});
test('both supported continuation limits retain directional policy data without claiming readiness',()=>{
 for(const forward of [2,3] as const){const value=health(continuation(forward)),raw=JSON.stringify(value);const got=decodeHealth(value);
  assert.equal(got.quoteBounds,value.quoteBounds);assert.equal(JSON.stringify(value),raw);assert.equal(Object.hasOwn(got,'ready'),false);
 }
});
test('health rejects mixed, extra, missing or wrongly typed bound fields',()=>{
 const invalid=[null,[],{},
  {...continuation(),maxAcceptedPerDirection:1},
  {...continuation(),extra:true},
  {...continuation(),inputAmountAtomic:'100001'},
  {...continuation(),newForwardCutoffBlocks:41},
  {...continuation(),newForwardCutoffBlocks:'40'},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:1,BASE_TO_ZCASH:1}},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:4,BASE_TO_ZCASH:1}},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:'3',BASE_TO_ZCASH:1}},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:3,BASE_TO_ZCASH:2}},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:3}},
  {...continuation(),maxAcceptedByDirection:{ZCASH_TO_BASE:3,BASE_TO_ZCASH:1,other:1}},
  {inputAmountAtomic:'100000',maxAcceptedPerDirection:2},
  {inputAmountAtomic:'100000',maxAcceptedPerDirection:'1'},
 ];
 for(const bounds of invalid)assert.throws(()=>decodeHealth(health(bounds)),e=>e instanceof ApiError&&e.code==='INVALID_RESPONSE');
 for(const key of Object.keys(continuation())){const bounds:Record<string,unknown>={...continuation()};delete bounds[key];assert.throws(()=>decodeHealth(health(bounds)));}
});
test('continuation authority hashes must be nonzero lowercase SHA256',()=>{
 for(const continuationSha256 of ['0'.repeat(64),'A'.repeat(64),'a'.repeat(63),'unknown',null,42])assert.throws(()=>decodeHealth(health({...continuation(),continuationSha256})));
});
test('unsupported health envelopes fail closed',()=>{
 for(const value of [null,[],{}, {...health(),status:'ready'}, {...health(),integrationOnly:'false'}, {...health(),ready:true}])assert.throws(()=>decodeHealth(value));
});
test('ZeeApi health decodes continuation through the real GET boundary and preserves AbortSignal',async()=>{
 const signal=new AbortController().signal;let calls=0;
 const api=new ZeeApi('http://127.0.0.1:3031',(async(url,init)=>{calls++;assert.equal(url,'http://127.0.0.1:3031/health');assert.equal(init?.method,'GET');assert.equal(init?.signal,signal);assert.equal(init?.body,undefined);return Response.json(health(continuation()));}) as typeof fetch);
 const value=await api.health(signal);assert.equal(calls,1);assert.deepEqual(value,health(continuation()));
});
