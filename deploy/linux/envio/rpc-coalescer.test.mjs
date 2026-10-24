import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {dirname} from 'node:path';
import {createServer} from 'node:http';
import {HeaderRpcTransport,RollingMethodBudget,stockHeaderRequest,overrideHeaderEffect,readBoundedRpcText,RPC_BODY_BYTE_LIMIT} from './rpc-coalescer.mjs';
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
class Clock{
 constructor(){this.t=0;this.id=0;this.timers=new Map();}
 now=()=>this.t;
 setTimeout=(fn,ms)=>{const id=++this.id;this.timers.set(id,{at:this.t+ms,fn});return id;};
 clearTimeout=id=>this.timers.delete(id);
 async tick(ms){const target=this.t+ms;await flush();for(let steps=0;steps<10000;steps++){
  const next=[...this.timers].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
  if(!next){this.t=target;await flush();return;}this.t=next[1].at;this.timers.delete(next[0]);next[1].fn();await flush();
 }throw Error('CLOCK_LOOP');}
}
const url='https://rpc.fixture',hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const block=n=>({number:'0x'+n.toString(16),hash:hash(n),parentHash:hash(n-1),timestamp:'0x65'});
function request(height,signal=new AbortController().signal){return{method:'POST',headers:{'content-type':'application/json'},redirect:'error',signal,body:JSON.stringify([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:['0x'+height.toString(16),false]},{jsonrpc:'2.0',id:3,method:'eth_getBlockByNumber',params:['latest',false]}])};}
function provider(clock,mutate){const calls=[];let active=0,maxActive=0;
 const fetch=async(input,init)=>{const rows=JSON.parse(init.body);active++;maxActive=Math.max(maxActive,active);calls.push({at:clock.now(),rows});
  try{let response=rows.map(r=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?'0x14a34':block(r.params[0]==='latest'?1000:Number(BigInt(r.params[0])))})).reverse();
   const custom=await mutate?.({input,init,rows,response,calls});return custom??new Response(JSON.stringify(response),{status:200});
  }finally{active--;}
 };return{fetch,calls,get maxActive(){return maxActive;}};
}
function bounded(records){for(const p of records){const sum=records.filter(x=>x.at>=p.at-1000&&x.at<=p.at).reduce((s,x)=>s+x.count,0);assert.ok(sum<=18,`rolling capacity ${sum} at ${p.at}`);}}
test('exact stock trio recognition; unrelated fetch passes through untouched',async()=>{
 assert.equal(stockHeaderRequest(url,request(100),url).height,100);
 assert.equal(stockHeaderRequest(url,{...request(100),body:'[]'},url),null);
 assert.equal(stockHeaderRequest(url,request(100),'https://other.fixture'),null);
 let inputSeen,initSeen;const transport=new HeaderRpcTransport({url,fetch:async(input,init)=>{inputSeen=input;initSeen=init;return new Response('passthrough');}}),init={method:'GET'};
 assert.equal(await(await transport.fetch('https://other.fixture',init)).text(),'passthrough');assert.equal(inputSeen,'https://other.fixture');assert.equal(initSeen,init);await transport.close();
});
test('twelve callers share fresh metadata after exact headers; real values survive out-of-order IDs',async()=>{
 const clock=new Clock(),p=provider(clock),dispatches=[],summaries=[],transport=new HeaderRpcTransport({url,fetch:p.fetch,clock,onDispatch:x=>dispatches.push(x),onCohort:x=>summaries.push(x)});
 try{
  const pending=Array.from({length:12},(_,i)=>transport.fetch(url,request(100+i)));await clock.tick(0);
  const rows=await Promise.all(pending.map(async r=>(await r).json()));
  for(let i=0;i<rows.length;i++){assert.deepEqual(rows[i].map(x=>x.id),[1,2,3]);assert.equal(rows[i][0].result,'0x14a34');assert.deepEqual(rows[i][1].result,block(100+i));assert.deepEqual(rows[i][2].result,block(1000));}
  assert.equal(p.calls.reduce((n,c)=>n+c.rows.length,0),15);assert.ok(p.calls.every(c=>c.rows.length<=10));assert.ok(p.maxActive<=2);
  const chainIndex=p.calls.findIndex(c=>c.rows.some(r=>r.method==='eth_chainId'));assert.equal(chainIndex,2);
  assert.ok(p.calls.slice(0,chainIndex).every(c=>c.rows.every(r=>r.params[0]!=='latest')));
  assert.equal(p.calls.filter(c=>c.rows.some(r=>r.params[0]==='latest')).length,1);assert.equal(summaries[0].status,'HEADER_COHORT_VERIFIED');bounded(dispatches);
 }finally{await transport.close();}
});
test('second cohort waits for rolling capacity and preserves max two HTTP requests',async()=>{
 const clock=new Clock(),p=provider(clock),records=[],transport=new HeaderRpcTransport({url,fetch:p.fetch,clock,onDispatch:x=>records.push(x)});
 try{
  const jobs=Array.from({length:24},(_,i)=>transport.fetch(url,request(100+i)).then(r=>r.json()));await clock.tick(2100);
  const values=await Promise.all(jobs);assert.equal(values.length,24);
  assert.equal(records.reduce((s,x)=>s+x.count,0),30);bounded(records);assert.ok(p.maxActive<=2);assert.ok(records.some(x=>x.at>=1001));
 }finally{await transport.close();}
});
test('metadata waits for all exact header pages; later same-height request is never cached',async()=>{
 const clock=new Clock();let head=1000;
 const p=provider(clock,({rows,response})=>{
  if(rows.every(r=>r.method==='eth_getBlockByNumber'&&r.params[0]!=='latest')&&rows.length===10)return new Promise(resolve=>clock.setTimeout(()=>resolve(new Response(JSON.stringify(response))),10));
  if(rows.some(r=>r.params[0]==='latest'))response.find(r=>typeof r.result==='object').result=block(head++);
 }),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
 try{
  const batch=Array.from({length:12},(_,i)=>transport.fetch(url,request(100+i)).then(r=>r.json()));await clock.tick(9);assert.equal(p.calls.some(c=>c.rows.some(r=>r.params[0]==='latest')),false);await clock.tick(1);await Promise.all(batch);
  const again=transport.fetch(url,request(100)).then(r=>r.json());await clock.tick(1021);const result=await again;assert.equal(result[2].result.number,block(1001).number);
  assert.equal(p.calls.flatMap(c=>c.rows).filter(r=>r.method==='eth_getBlockByNumber'&&r.params[0]==='0x64').length,2);
  assert.ok(p.calls.slice(0,2).flatMap(c=>c.rows).every(r=>Number(BigInt(r.params[0]))>=100&&Number(BigInt(r.params[0]))<=111));
 }finally{await transport.close();}
});
test('an undispatched reservation cannot expire into a rolling-window burst',async()=>{
 const clock=new Clock(),records=[],b=new RollingMethodBudget({clock,onDispatch:x=>records.push(x)}),held=await b.reserve(3),first=await b.reserve(15);
 first.dispatch(15);first.release();await clock.tick(1001);
 let granted=false;const waiting=b.reserve(18).then(ticket=>{granted=true;ticket.dispatch(18);ticket.release();});await flush();assert.equal(granted,false);
 held.dispatch(3);held.release();await clock.tick(1000);assert.equal(granted,false);await clock.tick(1);await waiting;bounded(records);assert.equal(records.at(-1).at,2002);
});
test('random weighted dispatch/reservation/cancellation sequences obey every rolling boundary',async()=>{
 const clock=new Clock(),records=[],budget=new RollingMethodBudget({clock,onDispatch:x=>records.push(x)}),pending=[];let seed=19;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<80;i++){
  const count=1+next()%10,controller=new AbortController(),hold=next()%1500;
  const promise=budget.reserve(count,controller.signal).then(ticket=>new Promise(resolve=>clock.setTimeout(()=>{if(!controller.signal.aborted)ticket.dispatch(count);ticket.release();resolve();},hold))).catch(()=>{});pending.push(promise);
  if(next()%5===0)clock.setTimeout(()=>controller.abort(),next()%300);await clock.tick(next()%120);
 }
 await clock.tick(120000);await Promise.all(pending);bounded(records);assert.equal(budget.reserved,0);assert.equal(budget.queue.length,0);
});
test('invalid or partial RPC replies reject every caller in the cohort',async()=>{
 const cases=[
  ({rows,response})=>{if(rows.every(r=>r.method==='eth_getBlockByNumber'&&r.params[0]!=='latest'))response[0].id=response.at(-1).id;},
  ({rows,response})=>{if(rows.some(r=>r.method==='eth_chainId'))response.find(r=>r.result==='0x14a34').result='0x1';},
  ({rows,response})=>{if(rows.some(r=>r.params[0]==='latest'))response.find(r=>typeof r.result==='object').result=block(50);},
  ({rows,response})=>{if(rows.every(r=>r.method==='eth_getBlockByNumber'&&r.params[0]!=='latest'))response[0].result.number='0x1';},
  ({rows,response})=>{if(rows.every(r=>r.method==='eth_getBlockByNumber'&&r.params[0]!=='latest'))response[0].result.parentHash=hash(8);},
  ({rows,response})=>{if(rows.length===1&&rows[0].params[0]==='0x3e8')response[0].result.hash=hash(9999);},
  ()=>new Response('limited',{status:429}),
  ({response})=>{response[0]={jsonrpc:'2.0',id:response[0].id,error:{code:-32005,message:'bounded fixture'}};},
 ];
 for(const mutate of cases){const clock=new Clock(),p=provider(clock,mutate),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
  try{const jobs=Array.from({length:12},(_,i)=>transport.fetch(url,request(100+i)));const settled=Promise.allSettled(jobs);await clock.tick(50);const results=await settled;assert.ok(results.every(r=>r.status==='rejected'));}finally{await transport.close();}
 }
});
test('oversized ASCII and multibyte streams cancel early without complete allocation or successful fanout',async()=>{
 for(const unit of ['x','€']){
  const clock=new Clock(),chunk=new TextEncoder().encode(unit.repeat(4096)),declared=RPC_BODY_BYTE_LIMIT*16;let produced=0,cancels=0;
  const body=new ReadableStream({pull(controller){if(produced>=declared){controller.close();return;}produced+=chunk.byteLength;controller.enqueue(chunk);},cancel(){cancels++;}});
  const p=provider(clock,()=>new Response(body)),summaries=[],transport=new HeaderRpcTransport({url,fetch:p.fetch,clock,onCohort:x=>summaries.push(x)});
  try{const settled=Promise.allSettled([transport.fetch(url,request(100)),transport.fetch(url,request(101))]);await clock.tick(20);const results=await settled;
   assert.ok(results.every(r=>r.status==='rejected'));assert.equal(cancels,1);assert.ok(produced>RPC_BODY_BYTE_LIMIT);assert.ok(produced<=RPC_BODY_BYTE_LIMIT+2*chunk.byteLength);assert.ok(produced<declared);
   assert.equal(summaries.length,1);assert.equal(summaries[0].kind,'BODY_BYTE_LIMIT');assert.equal(summaries[0].headerMethodsTotal,2);assert.equal(p.calls.length,1);
  }finally{await transport.close();}
 }
});
test('exact byte limit accepts valid UTF-8 split inside multibyte code points',async()=>{
 const encoder=new TextEncoder(),prefix='{"tag":"€😀","pad":"',suffix='"}',padding=RPC_BODY_BYTE_LIMIT-encoder.encode(prefix+suffix).byteLength;
 const bytes=encoder.encode(prefix+'x'.repeat(padding)+suffix),euro=bytes.indexOf(0xe2),cuts=[euro+1,euro+2,euro+4,euro+6];let offset=0,cancelled=false;
 const body=new ReadableStream({pull(controller){if(offset===bytes.byteLength){controller.close();return;}const end=cuts.find(n=>n>offset)??Math.min(bytes.byteLength,offset+65536);controller.enqueue(bytes.subarray(offset,end));offset=end;},cancel(){cancelled=true;}});
 const text=await readBoundedRpcText(new Response(body),new AbortController().signal),parsed=JSON.parse(text);
 assert.equal(bytes.byteLength,RPC_BODY_BYTE_LIMIT);assert.equal(Buffer.byteLength(text,'utf8'),RPC_BODY_BYTE_LIMIT);assert.equal(parsed.tag,'€😀');assert.equal(parsed.pad.length,padding);assert.equal(cancelled,false);
});
test('non-2xx and caller abort explicitly cancel an unread or pending response stream',async()=>{
 let cancelled=0,produced=0;const clock=new Clock(),body=new ReadableStream({pull(c){produced++;c.enqueue(new Uint8Array(4096));},cancel(){cancelled++;}}),p=provider(clock,()=>new Response(body,{status:429})),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
 try{const settled=Promise.allSettled([transport.fetch(url,request(100))]);await clock.tick(20);assert.equal((await settled)[0].status,'rejected');assert.equal(cancelled,1);assert.ok(produced<=1);assert.equal(transport.stats.headerMethods,1);}finally{await transport.close();}
 const controller=new AbortController(),reason=new Error('BODY_STREAM_CALLER_ABORT');let abortedCancel=0;
 const pendingBody=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){abortedCancel++;}}),reading=readBoundedRpcText(new Response(pendingBody),controller.signal),rejects=assert.rejects(reading,e=>e===reason);
 await flush();controller.abort(reason);await rejects;assert.equal(abortedCancel,1);
});
test('same-height same-hash headers with different normalized parent or timestamp refuse whole cohort',async()=>{
 for(const field of ['parentHash','timestamp']){
  const clock=new Clock(),p=provider(clock,({response})=>{if(response.length===2&&response.every(x=>typeof x.result==='object'))response[0].result[field]=field==='parentHash'?hash(9999):'0x66';}),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
  try{const settled=Promise.allSettled([transport.fetch(url,request(100)),transport.fetch(url,request(100))]);await clock.tick(20);assert.ok((await settled).every(x=>x.status==='rejected'));assert.equal(p.calls.length,1);}finally{await transport.close();}
 }
});
test('caller abort before admission, while queued and during HTTP retains its reason',async()=>{
 for(const phase of ['before','queue','http']){
  const clock=new Clock(),controller=new AbortController(),reason=new Error('CALLER_ABORT'),p=provider(clock,phase==='http'?({init})=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})):undefined),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
  try{if(phase==='queue'){const ticket=await transport.budget.reserve(18);ticket.dispatch(18);ticket.release();}if(phase==='before')controller.abort(reason);
   const job=transport.fetch(url,request(100,controller.signal));const result=assert.rejects(job,e=>e===reason);
   if(phase!=='before'){await clock.tick(20);controller.abort(reason);}await result;await clock.tick(0);assert.equal(p.calls.length,phase==='http'?1:0);
  }finally{await transport.close();}
 }
});
test('reserved final checks incur no quota wait after latest; stale result cannot be relabeled at json consumption',async()=>{
 const clock=new Clock(),p=provider(clock),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
 try{const pending=transport.fetch(url,request(100));await clock.tick(20);const response=await pending;await clock.tick(1001);await assert.rejects(response.json(),/BASE_HEADER_RPC_ERROR/);
 }finally{await transport.close();}
 const clock2=new Clock(),controller=new AbortController(),p2=provider(clock2),t2=new HeaderRpcTransport({url,fetch:p2.fetch,clock:clock2});
 try{const pending=t2.fetch(url,request(100,controller.signal));await clock2.tick(20);const response=await pending,reason=new Error('AFTER_RESPONSE_ABORT');controller.abort(reason);await assert.rejects(response.json(),e=>e===reason);}finally{await t2.close();}
});
test('sample/recheck latency over one second rejects whole cohort before successful fanout',async()=>{
 const clock=new Clock(),p=provider(clock,({rows})=>{if(rows.length===1&&rows[0].params[0]==='0x3e8')return new Promise(resolve=>clock.setTimeout(()=>resolve(new Response(JSON.stringify([{jsonrpc:'2.0',id:rows[0].id,result:block(1000)}]))),1001));}),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
 try{const job=transport.fetch(url,request(100)),settled=Promise.allSettled([job]);await clock.tick(1100);assert.equal((await settled)[0].status,'rejected');}finally{await transport.close();}
});
test('reserved recheck dispatches immediately despite competing method usage',async()=>{
 const clock=new Clock(),records=[],p=provider(clock,({rows,response})=>{if(rows.some(r=>r.params[0]==='latest'))return new Promise(resolve=>clock.setTimeout(()=>resolve(new Response(JSON.stringify(response))),500));}),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock,onDispatch:x=>records.push(x)});
 try{
  const job=transport.fetch(url,request(100)).then(r=>r.json());await clock.tick(20);assert.ok(p.calls.some(c=>c.rows.some(r=>r.params[0]==='latest')));
  const competing=await transport.budget.reserve(14);competing.dispatch(14);competing.release();await clock.tick(500);const result=await job;assert.deepEqual(result[2].result,block(1000));
  const recheck=p.calls.find(c=>c.rows.length===1&&c.rows[0].params[0]==='0x3e8');assert.equal(recheck.at,520);assert.equal(records.reduce((n,x)=>n+x.count,0),18);bounded(records);
 }finally{await transport.close();}
});
test('native fetch cancellation closes the owned loopback HTTP request',async()=>{
 let requestSeen,requestClosed;const seen=new Promise(r=>requestSeen=r),closed=new Promise(r=>requestClosed=r);
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>requestSeen());res.on('close',()=>requestClosed());});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const endpoint='http://127.0.0.1:'+server.address().port,transport=new HeaderRpcTransport({url:endpoint,fetch:globalThis.fetch.bind(globalThis)}),controller=new AbortController(),reason=new Error('REAL_FETCH_ABORT');
 try{const job=transport.fetch(endpoint,request(100,controller.signal)),rejected=assert.rejects(job,e=>e===reason);await seen;controller.abort(reason);await rejected;await transport.close();await closed;assert.equal(transport.slots.active,0);}
 finally{await transport.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('queue is bounded and a five-second caller deadline fails without dispatching delayed work',async()=>{
 const clock=new Clock(),p=provider(clock),transport=new HeaderRpcTransport({url,fetch:p.fetch,clock});
 try{const reservation=await transport.budget.reserve(18),jobs=Array.from({length:100},(_,i)=>transport.fetch(url,request(100+i))),all=Promise.allSettled(jobs);
  await assert.rejects(transport.fetch(url,request(500)),/BASE_HEADER_RPC_ERROR/);await clock.tick(5000);assert.ok((await all).every(r=>r.status==='rejected'));assert.equal(p.calls.length,0);reservation.release();await clock.tick(0);
 }finally{await transport.close();}
});
const sdkRoot=process.env.ENVIO_SDK_ROOT;
test('actual SDK same descriptor takes limit12 before first effect table; stock readHeaders retry stays real',{skip:!sdkRoot?'Requires installed stock Envio SDK fixture':false},async()=>{
 const loader=await import(pathToFileURL(sdkRoot+'/src/HandlerLoader.res.mjs').href),effects=await import(pathToFileURL(sdkRoot+'/src/EffectState.res.mjs').href),oldCwd=process.cwd(),oldFetch=globalThis.fetch,oldUrl=process.env.ZEESWAP_BASE_RPC_URL;
 process.chdir(dirname(dirname(sdkRoot)));loader.registerTsHooks();const a=await loader.importHandler('src/headers.ts'),b=await loader.importHandler('src/headers.js'),effect=a.canonicalHeaders,oldRate=effect.rateLimit,refs={handler:effect.handler,input:effect.input,output:effect.output,storageMeta:effect.storageMeta};
 let attempts=0;const records=[],p=provider({now:()=>performance.now()},()=>{if(attempts++===0)return new Response('fixture429',{status:429});}),transport=new HeaderRpcTransport({url,fetch:p.fetch,onDispatch:x=>records.push(x)});
 try{assert.equal(a,b);assert.equal(effect,b.canonicalHeaders);overrideHeaderEffect(effect);
  const table=effects.getTable(effects.make(),effect,{TAG:'Chain',_0:84532});assert.equal(table.rateLimitState.callsPerDuration,12);assert.equal(effect.defaultShouldCache,false);assert.equal(effect.crossChain,false);for(const [k,v]of Object.entries(refs))assert.equal(effect[k],v);
  globalThis.fetch=transport.fetch.bind(transport);process.env.ZEESWAP_BASE_RPC_URL=url;const before=Date.now(),result=await a.readHeaders(100);assert.equal(result.header.height,100);assert.equal(result.sourceHead.height,1000);assert.ok(Date.parse(result.sampledAt)>=before);assert.ok(attempts>=4);assert.equal(records.reduce((n,x)=>n+x.count,0),5);bounded(records);
 }finally{effect.rateLimit=oldRate;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.ZEESWAP_BASE_RPC_URL;else process.env.ZEESWAP_BASE_RPC_URL=oldUrl;process.chdir(oldCwd);await transport.close();}
});
