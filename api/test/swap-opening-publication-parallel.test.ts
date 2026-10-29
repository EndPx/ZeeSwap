import test from 'node:test';import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {runOpeningPublicationReadGuards,openingPublicationRpcFetch,requireOpeningPublicationFreshness} from '../scripts/swap-operator-opening.ts';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};};
test('all independent first-phase guards overlap, all finish before the two RPC groups, approval is checked last',async()=>{
 const stop=deferred(),started:string[]=[],completed:string[]=[];let rpcActive=0,peak=0,final=0;
 const read=(name:string)=>async()=>{started.push(name);await stop.promise;completed.push(name);};
 const rpc=async()=>{assert.equal(completed.length,4);rpcActive++;peak=Math.max(peak,rpcActive);await delay(5);rpcActive--;};
 const result=runOpeningPublicationReadGuards({files:read('files'),native:read('native'),quiescence:read('quiescence'),source:read('source'),duplex:[rpc,rpc],finalApproval:()=>{assert.equal(rpcActive,0);final++;}});
 await delay(1);assert.deepEqual(started,['files','native','quiescence','source']);assert.equal(completed.length,0);stop.resolve();await result;assert.equal(peak,2);assert.equal(final,1);
});
test('each failed first-phase guard drains all other started checks and starts neither RPC nor final approval',async()=>{
 for(const failed of ['files','native','quiescence','source']){const stop=deferred(),error=Error(failed),started:string[]=[],ended:string[]=[];let settled=false,rpc=0,final=0;
  const read=(name:string)=>async()=>{started.push(name);if(name===failed)throw error;await stop.promise;ended.push(name);};
  const result=runOpeningPublicationReadGuards({files:read('files'),native:read('native'),quiescence:read('quiescence'),source:read('source'),duplex:[async()=>{rpc++;},async()=>{rpc++;}],finalApproval:()=>{final++;}});result.then(()=>{settled=true;},()=>{settled=true;});
  await delay(1);assert.equal(started.length,4);assert.equal(settled,false);stop.resolve();await assert.rejects(result,e=>e===error);assert.equal(ended.length,3);assert.equal(rpc,0);assert.equal(final,0);
 }
});
test('one direct RPC failure drains the other and never invokes the final approval check',async()=>{
 const stop=deferred(),error=Error('ANCHOR_OR_NONCE_CHANGED');let other=false,final=0,settled=false;
 const ok=async()=>{};const result=runOpeningPublicationReadGuards({files:ok,native:ok,quiescence:ok,source:ok,duplex:[async()=>{throw error;},async()=>{await stop.promise;other=true;}],finalApproval:()=>{final++;}});result.catch(()=>{settled=true;});await delay(1);assert.equal(settled,false);stop.resolve();await assert.rejects(result,e=>e===error);assert.equal(other,true);assert.equal(final,0);
});
test('approval expiry or lost connection at the final fence is fatal after every read has drained',async()=>{
 const error=Error('APPROVAL_EXPIRED'),finished:string[]=[];const read=(name:string)=>async()=>{finished.push(name);};
 await assert.rejects(runOpeningPublicationReadGuards({files:read('files'),native:read('native'),quiescence:read('quiescence'),source:read('source'),duplex:[read('primary'),read('independent')],finalApproval:()=>{assert.equal(finished.length,6);throw error;}}),e=>e===error);
});
test('parallel clients retain one shared75ms method dispatcher without changing read-only method scope',async()=>{
 const starts:number[]=[],paced=openingPublicationRpcFetch(async(_input,init)=>{assert.equal(init?.redirect,'error');starts.push(Date.now());return Response.json({result:'fixture'});});
 const request=(method:string,signal?:AbortSignal)=>paced('https://fixture.invalid/',{method:'POST',body:JSON.stringify({method}),signal});
 await Promise.all([request('eth_getBlockByNumber'),request('eth_getTransactionCount'),request('eth_getBlockByNumber'),request('eth_getTransactionCount')]);assert.equal(starts.length,4);for(let n=1;n<starts.length;n++)assert.ok(starts[n]!-starts[n-1]!>=74);
 await assert.rejects(request('eth_sendRawTransaction'),/READ_RPC_BUDGET/);await assert.rejects(paced('https://fixture.invalid/',{body:JSON.stringify([{method:'eth_getBlockByNumber'}])}),/READ_RPC_BUDGET/);assert.equal(starts.length,4);
 const stop=new AbortController();stop.abort(Error('REQUEST_STOP'));await assert.rejects(request('eth_getBlockByNumber',stop.signal),/REQUEST_STOP/);assert.equal(starts.length,4);
});

test('final freshness reuses unchanged original Native/Source/quiescence clocks and refuses each aged proof',()=>{
 const now=Date.now(),stamp=new Date(now).toISOString(),old=new Date(now-61000).toISOString();
 const make=()=>({native:{observedAt:stamp,sourceClocks:{checkedAt:stamp,observedAt:Math.floor(now/1000)}},source:{sourceProcessorObservedAt:stamp,independentSample:{checkedAt:stamp}},journalFiles:[],quiescence:[{pin:{path:'/fixture',sha256:'b'.repeat(64)},proof:{version:1,status:'G5_SIGNER_QUIESCENT_READ_ONLY',observedAt:stamp,configSha256:'b'.repeat(64),journalDigest:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',fileCount:0,scopeSha256:'a'.repeat(64),scopedProcessesAbsent:true,flockAcquired:true,lockReleased:true,readOnly:true,walletAddressMatches:true}}]});
 const clean=make(),original=JSON.stringify(clean);requireOpeningPublicationFreshness(clean);assert.equal(JSON.stringify(clean),original);
 for(const field of ['native-sql','native-checked','native-observed','source-processor','source-independent','quiescence']){
  const value=make();if(field==='native-sql')value.native.observedAt=old;if(field==='native-checked')value.native.sourceClocks.checkedAt=old;if(field==='native-observed')value.native.sourceClocks.observedAt=Math.floor(now/1000)-61;
  if(field==='source-processor')value.source.sourceProcessorObservedAt=old;if(field==='source-independent')value.source.independentSample.checkedAt=old;if(field==='quiescence')value.quiescence[0]!.proof.observedAt=new Date(now-31000).toISOString();
  assert.throws(()=>requireOpeningPublicationFreshness(value));
 }
});
