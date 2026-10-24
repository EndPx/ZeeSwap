import test from 'node:test';import assert from 'node:assert/strict';
import {observerCadenceDelay} from '../src/observer-cadence.ts';
import {canonicalRpc,canonicalRetryAfterMs,type CanonicalRpcDiagnostic} from '../src/integrations/observation/canonical-rpc.ts';
const hash='0x'+'a'.repeat(64),rpcHeader={jsonrpc:'2.0',id:1,result:{number:'0x64',timestamp:'0x1',hash,parentHash:'0x'+'b'.repeat(64)}};
test('cadence removes idle after slow cycles and retains the minimum start interval',()=>{
 assert.equal(observerCadenceDelay(100,20100),0);assert.equal(observerCadenceDelay(100,1100),4000);assert.equal(observerCadenceDelay(100,100),5000);
 for(const [start,end] of [[NaN,100],[100,99],[0,Infinity]])assert.throws(()=>observerCadenceDelay(start!,end!),/INVALID_OBSERVER_CADENCE/);
});
test('Retry-After diagnostics are numeric, bounded and cannot disclose header text',()=>{
 assert.equal(canonicalRetryAfterMs('2'),2000);assert.equal(canonicalRetryAfterMs('9999999999'),300000);
 assert.equal(canonicalRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT',Date.parse('2026-10-21T07:27:59Z')),1000);
 assert.equal(canonicalRetryAfterMs('sensitive-header-text'),null);assert.equal(canonicalRetryAfterMs(null),null);
});
test('terminal HTTP error preserves its code with safe metadata and no extra retry',async()=>{
 const diagnostics:CanonicalRpcDiagnostic[]=[];let calls=0;
 const c=canonicalRpc({url:'https://rpc.invalid',network:'eip155:84532',sourceId:'fixture',fetch:async()=>{calls++;return new Response('sensitive-response-body',{status:403,headers:{'retry-after':'sensitive-header'}});},diagnostic:d=>diagnostics.push(d)});
 await assert.rejects(c.header(100,AbortSignal.timeout(3000)),(e:any)=>e.code==='CANONICAL_RPC_HTTP_ERROR');assert.equal(calls,1);
 assert.deepEqual(diagnostics,[{event:'canonical-rpc-failure',attempt:1,methodCount:1,httpStatus:403,retryAfterMs:null,willRetry:false}]);assert.doesNotMatch(JSON.stringify(diagnostics),/sensitive|rpc.invalid|hidden-path/);
});
test('existing 429 retry count stays unchanged even if the diagnostic callback fails',async()=>{
 let calls=0;const seen:CanonicalRpcDiagnostic[]=[];
 const c=canonicalRpc({url:'https://rpc.invalid',network:'eip155:84532',sourceId:'fixture',fetch:async()=>{calls++;return calls===1?new Response('not-logged',{status:429,headers:{'retry-after':'3'}}):new Response(JSON.stringify(rpcHeader));},diagnostic:d=>{seen.push(d);throw Error('diagnostic-only');}});
 assert.equal((await c.header(100,AbortSignal.timeout(3000))).height,100);assert.equal(calls,2);assert.equal(seen[0]!.httpStatus,429);assert.equal(seen[0]!.retryAfterMs,3000);assert.equal(seen[0]!.willRetry,true);
});
test('the reused reader retains its twelve-method pacer across zero-delay cycles',async()=>{
 const starts:number[]=[];const c=canonicalRpc({url:'https://rpc.invalid',network:'eip155:84532',sourceId:'fixture',maxMethodsPerSecond:12,headerBatchSize:10,fetch:async()=>{starts.push(performance.now());return new Response(JSON.stringify(rpcHeader));}});
 await c.header(100,AbortSignal.timeout(3000));assert.equal(observerCadenceDelay(0,20000),0);await c.header(100,AbortSignal.timeout(3000));assert.ok(starts[1]!-starts[0]!>=75,'permit persists across the cycle boundary');
});
