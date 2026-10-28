import test from 'node:test';import assert from 'node:assert/strict';
import {readReadyOpeningChefStatus} from '../src/swap-opening-readiness.ts';
const start=Date.parse('2026-10-29T00:00:00.000Z');
const status=(ready=true,generation='g')=>({project:'p',generation,revision:'1',checkpoint:{height:100,hash:'a'.repeat(64),anchorHash:null,status:ready?'ready':'reconciling',undoFloor:90},lastCommitAt:null,source:{status:'available',checkedAt:new Date(start).toISOString(),prepIndexedHeight:100,sourceObservedHeight:100,sourceObservedAt:start/1000}});
test('typed unready and HTTP503 retry share original deadline and preserve source clocks',async()=>{
 let now=start,requests=0;const waits:number[]=[],signal=AbortSignal.timeout(30000),responses=[Response.json(status(false)),new Response('',{status:503,headers:{'retry-after':'1'}}),Response.json(status())];
 const result=await readReadyOpeningChefStatus(async()=>{requests++;return responses.shift()!;},'p',signal,start+30000,()=>now,async(ms,s)=>{assert.equal(s,signal);waits.push(ms);now+=ms;});
 assert.equal(requests,3);assert.deepEqual(waits,[1000,1000]);assert.equal(result.source.sourceObservedAt,start/1000);assert.equal(Date.parse(result.source.checkedAt),start);
});
test('wrong generation, nontransient status and authentication errors never become ready',async()=>{
 let n=0;await assert.rejects(readReadyOpeningChefStatus(async()=>Response.json(status(n++>0,n===1?'g':'changed')),'p',AbortSignal.timeout(30000),start+30000,()=>start,async()=>{}),/GENERATION_CHANGED/);assert.equal(n,2);
 n=0;await assert.rejects(readReadyOpeningChefStatus(async()=>{n++;return new Response('',{status:401});},'p',AbortSignal.timeout(30000),start+30000,()=>start,async()=>{}),/SOURCE_HTTP/);assert.equal(n,1);
 await assert.rejects(readReadyOpeningChefStatus(async()=>Response.json({...status(),project:'wrong'}),'p',AbortSignal.timeout(30000),start+30000,()=>start,async()=>{}),/WRONG_PROJECT/);
});
test('retry-after bound, attempt cap, original deadline and cancellation all stop without readiness',async()=>{
 await assert.rejects(readReadyOpeningChefStatus(async()=>new Response('',{status:429,headers:{'retry-after':'6'}}),'p',AbortSignal.timeout(30000),start+30000,()=>start,async()=>{}),/RETRY_AFTER_BOUND/);
 let n=0;await assert.rejects(readReadyOpeningChefStatus(async()=>{n++;return Response.json(status(false));},'p',AbortSignal.timeout(30000),start+30000,()=>start,async()=>{}),/WAIT_SOURCE_UNREADY/);assert.equal(n,6);
 n=0;await assert.rejects(readReadyOpeningChefStatus(async()=>{n++;return Response.json(status(false));},'p',AbortSignal.timeout(30000),start+1000,()=>start,async()=>{}),/WAIT_SOURCE_UNREADY/);assert.equal(n,1);
 const c=new AbortController();await assert.rejects(readReadyOpeningChefStatus(async()=>Response.json(status(false)),'p',c.signal,start+30000,()=>start,async()=>{c.abort(Error('ORIGINAL_30S_SIGNAL'));}),/ORIGINAL_30S_SIGNAL/);
});
