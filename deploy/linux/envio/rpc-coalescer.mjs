/** Read-only header transport. Successful stock responses retain real RPC data. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const nativeClock={now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
const error=()=>new Error('BASE_HEADER_RPC_ERROR');
const abortReason=s=>s.reason??new DOMException('The operation was aborted.','AbortError');
const sha=b=>createHash('sha256').update(b).digest('hex');
export const HEADER_SHA256='b3180028a7c4cedd2616fdc0845aec746e3ae322e169b6a691f85f5aff2a2a42';
export const SDK_PINS={
 'Envio.res.mjs':'a60e9c769281f6ad793bbc3ca8b76a5f98c695261b46fd33859e9ae7140cfeaa',
 'EffectState.res.mjs':'adb3b7553094d81fe33c6ebfb56302463912b826522f556cf7546d0a0174af05',
 'HandlerLoader.res.mjs':'007f2e8f91e599eeb89ed031a5a0d56c680fc93f1a11b3d350daa54df57eabf1',
 'TsModuleHooks.mjs':'ed19133b40b366af897e85c04234cf56450c00eeb1b8a51c51122ff365f00d18',
 'LoadManager.res.mjs':'412f348efee1b8f7102887d72444b60f313cf17bbf325b5febf74e4fcc44b2ba',
};
export const PRODUCTION_MODULE='/opt/zeeswap-testnet/current/app/deploy/linux/envio/rpc-coalescer.mjs';
export const PRODUCTION_MAIN='/opt/zeeswap-testnet/state/envio-engine/project/node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs';
export const MODIFIED_MAIN_SHA256='f86148bd6e8cbe777b5021f2e7f58ed6b717af4182c0e00f032036e93e8ae82f';
export const RPC_BODY_BYTE_LIMIT=4_000_000;
/** Count network bytes before UTF-8 decoding. Cancel at the first over-limit
 * chunk; never materialize the complete untrusted response before checking. */
export async function readBoundedRpcText(response,signal){
 if(!response.body)throw error();const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let bytes=0,cancellation;
 const cancel=reason=>cancellation??=(async()=>{try{await reader.cancel(reason);}catch{}})();
 const onAbort=()=>{void cancel(abortReason(signal));};signal?.addEventListener('abort',onAbort,{once:true});
 const limitError=()=>Object.assign(error(),{transportFailureKind:'BODY_BYTE_LIMIT'});
 try{
  if(signal?.aborted)throw abortReason(signal);
  const advertised=response.headers.get('content-length');if(advertised&&/^\d+$/.test(advertised)&&Number(advertised)>RPC_BODY_BYTE_LIMIT)throw limitError();
  while(true){const chunk=await reader.read();if(signal?.aborted)throw abortReason(signal);if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array))throw error();if(chunk.value.byteLength>RPC_BODY_BYTE_LIMIT-bytes)throw limitError();bytes+=chunk.value.byteLength;parts.push(decoder.decode(chunk.value,{stream:true}));
  }
  parts.push(decoder.decode());if(signal?.aborted)throw abortReason(signal);return parts.join('');
 }catch(e){await cancel(e);throw e;}finally{signal?.removeEventListener('abort',onAbort);reader.releaseLock();}
}

/** Reservations never age out. They move to timestamped usage only at actual
 * HTTP dispatch, or are released unused. Every closed rolling second is bounded. */
export class RollingMethodBudget{
 constructor({limit=18,clock=nativeClock,onDispatch=()=>{}}={}){this.limit=limit;this.clock=clock;this.onDispatch=onDispatch;this.used=[];this.reserved=0;this.queue=[];this.timer=undefined;}
 reserve(count,signal){
  if(!Number.isInteger(count)||count<1||count>this.limit)return Promise.reject(error());
  if(signal?.aborted)return Promise.reject(abortReason(signal));
  return new Promise((resolve,reject)=>{const item={count,signal,resolve,reject};item.abort=()=>{const i=this.queue.indexOf(item);if(i>=0){this.queue.splice(i,1);reject(abortReason(signal));this.pump();}};signal?.addEventListener('abort',item.abort,{once:true});this.queue.push(item);this.pump();});
 }
 pump(){
  if(this.timer!==undefined){this.clock.clearTimeout(this.timer);this.timer=undefined;}
  const now=this.clock.now();this.used=this.used.filter(x=>x.at+1000>=now);
  while(this.queue.length){const item=this.queue[0],total=this.used.reduce((s,x)=>s+x.count,0)+this.reserved;
   if(total+item.count>this.limit)break;
   this.queue.shift();item.signal?.removeEventListener('abort',item.abort);this.reserved+=item.count;let remaining=item.count;
   item.resolve({dispatch:count=>{if(!Number.isInteger(count)||count<1||count>remaining)throw error();remaining-=count;this.reserved-=count;const at=this.clock.now();this.used.push({at,count});this.onDispatch({at,count});this.pump();},release:()=>{this.reserved-=remaining;remaining=0;this.pump();}});
  }
  if(this.queue.length&&this.used.length){const wait=Math.max(1,this.used[0].at+1001-this.clock.now());this.timer=this.clock.setTimeout(()=>{this.timer=undefined;this.pump();},wait);}
 }
}
class Slots{
 constructor(limit=2){this.limit=limit;this.active=0;this.queue=[];}
 acquire(signal){if(signal?.aborted)return Promise.reject(abortReason(signal));return new Promise((resolve,reject)=>{
  const item={signal,resolve,reject};item.abort=()=>{const i=this.queue.indexOf(item);if(i>=0){this.queue.splice(i,1);reject(abortReason(signal));}};signal?.addEventListener('abort',item.abort,{once:true});this.queue.push(item);this.pump();});}
 pump(){while(this.active<this.limit&&this.queue.length){const item=this.queue.shift();item.signal?.removeEventListener('abort',item.abort);if(item.signal?.aborted){item.reject(abortReason(item.signal));continue;}this.active++;let released=false;item.resolve(()=>{if(!released){released=true;this.active--;this.pump();}});}}
}
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
export function stockHeaderRequest(input,init,url){
 if(String(input)!==url||init?.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||init.body.length>1024||!init.signal)return null;
 try{const headers=new Headers(init.headers);if(headers.get('content-type')!=='application/json')return null;
  const b=JSON.parse(init.body);if(!Array.isArray(b)||b.length!==3)return null;
  for(let i=0;i<3;i++)if(!keys(b[i],['jsonrpc','id','method','params'])||b[i].jsonrpc!=='2.0'||b[i].id!==i+1)return null;
  if(b[0].method!=='eth_chainId'||JSON.stringify(b[0].params)!=='[]'||b[1].method!=='eth_getBlockByNumber'||!Array.isArray(b[1].params)||b[1].params.length!==2||b[1].params[1]!==false||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(b[1].params[0])||b[2].method!=='eth_getBlockByNumber'||JSON.stringify(b[2].params)!=='["latest",false]')return null;
  const height=Number(BigInt(b[1].params[0]));return Number.isSafeInteger(height)&&height>=0?{height,hex:b[1].params[0]}:null;
 }catch{return null;}
}
function header(value){
 try{if(!value||typeof value!=='object'||typeof value.number!=='string'||typeof value.timestamp!=='string'||!/^0x[0-9a-f]{64}$/.test(value.hash)||!/^0x[0-9a-f]{64}$/.test(value.parentHash))throw error();
  const height=Number(BigInt(value.number)),stamp=Number(BigInt(value.timestamp));if(!Number.isSafeInteger(height)||height<0||!Number.isSafeInteger(stamp)||stamp<0||!Number.isFinite(new Date(stamp*1000).getTime()))throw error();return{height,hash:value.hash,parentHash:value.parentHash,stamp};
 }catch{throw error();}
}
export class HeaderRpcTransport{
 constructor({url,fetch:upstream,clock=nativeClock,onDispatch=()=>{},onCohort=()=>{}}){
  this.url=url;this.upstream=upstream;this.clock=clock;this.onCohort=onCohort;this.stats={headerMethods:0,httpRequests:0};this.budget=new RollingMethodBudget({clock,onDispatch:event=>{this.stats.headerMethods+=event.count;this.stats.httpRequests++;onDispatch(event);}});this.slots=new Slots(2);this.current=[];this.timer=undefined;this.pending=0;this.cohorts=new Set();this.closed=false;this.nextId=1;
 }
 fetch(input,init){
  const request=stockHeaderRequest(input,init,this.url);if(!request)return this.upstream(input,init);
  if(init.signal.aborted)return Promise.reject(abortReason(init.signal));
  if(this.closed||this.pending>=100)return Promise.reject(error());
  return new Promise((resolve,reject)=>{
   const job={...request,signal:init.signal,resolve,reject,done:false,admittedAt:this.clock.now()};this.pending++;
   job.finish=(failure,response)=>{if(job.done)return;job.done=true;this.pending--;job.signal.removeEventListener('abort',job.abort);this.clock.clearTimeout(job.timer);failure?reject(failure):resolve(response);if(job.cohort&&job.cohort.jobs.every(j=>j.done))job.cohort.controller.abort();};
   job.abort=()=>job.finish(abortReason(job.signal));job.signal.addEventListener('abort',job.abort,{once:true});
   job.timer=this.clock.setTimeout(()=>job.finish(new DOMException('The operation was aborted due to timeout','TimeoutError')),5000);
   this.current.push(job);if(this.current.length===12)this.seal();else if(this.timer===undefined)this.timer=this.clock.setTimeout(()=>this.seal(),20);
  });
 }
 seal(){
  if(this.timer!==undefined){this.clock.clearTimeout(this.timer);this.timer=undefined;}
  const jobs=this.current;this.current=[];const active=jobs.filter(j=>!j.done);if(!active.length)return;
  const cohort={jobs:active,controller:new AbortController(),sealedAt:this.clock.now()};for(const job of active)job.cohort=cohort;
  this.cohorts.add(cohort);cohort.promise=this.run(cohort).catch(()=>{}).finally(()=>this.cohorts.delete(cohort));
 }
 async rpc(rows,reservation,cohort){
  if(rows.length<1||rows.length>10||cohort.controller.signal.aborted)throw error();
  const init={method:'POST',headers:{'content-type':'application/json'},redirect:'error',signal:cohort.controller.signal,body:JSON.stringify(rows)};
  reservation.dispatch(rows.length);
  const response=await this.upstream(this.url,init);
  if(!response.ok){cohort.failure={kind:'HTTP_ERROR',httpStatus:response.status};await response.body?.cancel().catch(()=>{});throw error();}
  let text;try{text=await readBoundedRpcText(response,cohort.controller.signal);}catch(e){if(e.transportFailureKind==='BODY_BYTE_LIMIT')cohort.failure={kind:'BODY_BYTE_LIMIT'};throw e;}
  let result;try{result=JSON.parse(text);}catch{throw error();}
  if(!Array.isArray(result)||result.length!==rows.length||new Set(result.map(x=>x.id)).size!==rows.length)throw error();
  const map=new Map(result.map(x=>[x.id,x]));
  for(const row of rows){const got=map.get(row.id);if(!got||got.jsonrpc!=='2.0'||got.error!==undefined||got.result==null){if(typeof got?.error?.code==='number')cohort.failure={kind:'RPC_ERROR',rpcCode:got.error.code};throw error();}}return map;
 }
 async page(rows,cohort){const release=await this.slots.acquire(cohort.controller.signal);let reservation;try{reservation=await this.budget.reserve(rows.length,cohort.controller.signal);return await this.rpc(rows,reservation,cohort);}finally{reservation?.release();release();}}
 async run(cohort){
  let latestStartedAt;try{
   const requested=cohort.jobs.map(job=>({job,id:this.nextId++})),pages=[];
   for(let i=0;i<requested.length;i+=10){const part=requested.slice(i,i+10);pages.push(this.page(part.map(x=>({jsonrpc:'2.0',id:x.id,method:'eth_getBlockByNumber',params:[x.job.hex,false]})),cohort));}
   const completed=await Promise.allSettled(pages.map(p=>p.catch(e=>{cohort.controller.abort();throw e;})));
   if(completed.some(p=>p.status==='rejected'))throw error();const maps=completed.map(p=>p.value),byHeight=new Map();
   for(const x of requested){const raw=maps.find(m=>m.has(x.id))?.get(x.id)?.result,h=header(raw);if(h.height!==x.job.height)throw error();const old=byHeight.get(h.height);if(old&&JSON.stringify(old)!==JSON.stringify(h))throw error();byHeight.set(h.height,h);x.raw=raw;}
   for(const h of byHeight.values()){const parent=byHeight.get(h.height-1);if(parent&&parent.hash!==h.parentHash)throw error();}
   // Hold one HTTP slot and reserve ALL remaining methods BEFORE sampling.
   // Neither the latest read nor its fixed-height recheck waits for quota later.
   const release=await this.slots.acquire(cohort.controller.signal);let reservation,chain,latest;
   try{
    reservation=await this.budget.reserve(3,cohort.controller.signal);const chainId=this.nextId++,latestId=this.nextId++;
    latestStartedAt=this.clock.now();const meta=await this.rpc([{jsonrpc:'2.0',id:chainId,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:latestId,method:'eth_getBlockByNumber',params:['latest',false]}],reservation,cohort);
    chain=meta.get(chainId).result;latest=meta.get(latestId).result;const head=header(latest);
    if(chain!=='0x14a34'||head.height<Math.max(...requested.map(x=>x.job.height)))throw error();
    const anchorId=this.nextId++,anchor=(await this.rpc([{jsonrpc:'2.0',id:anchorId,method:'eth_getBlockByNumber',params:[latest.number,false]}],reservation,cohort)).get(anchorId).result;
    if(JSON.stringify(header(anchor))!==JSON.stringify(head)||this.clock.now()-latestStartedAt>1000)throw error();
   }finally{reservation?.release();release();}
   // No post-sampling queue/cache. Each stock caller parses real values and
   // assigns its normal completion timestamp immediately after this fanout.
   const ready=[];
   for(const x of requested){if(x.job.done)continue;
    const response=new Response(JSON.stringify([{jsonrpc:'2.0',id:1,result:chain},{jsonrpc:'2.0',id:2,result:x.raw},{jsonrpc:'2.0',id:3,result:latest}]),{status:200,headers:{'content-type':'application/json'}});
    const json=response.json.bind(response),fresh=()=>{if(x.job.signal.aborted)throw abortReason(x.job.signal);if(this.clock.now()-latestStartedAt>1000||this.clock.now()-x.job.admittedAt>=5000)throw error();};
    response.json=async()=>{fresh();const result=await json();fresh();return result;};ready.push({job:x.job,response});
   }
   if(this.clock.now()-latestStartedAt>1000||ready.some(x=>this.clock.now()-x.job.admittedAt>=5000))throw error();
   for(const {job,response} of ready)job.finish(job.signal.aborted?abortReason(job.signal):undefined,response);
   try{this.onCohort({status:'HEADER_COHORT_VERIFIED',jobs:requested.length,methods:requested.length+3,headerMethodsTotal:this.stats.headerMethods,headerRequestsTotal:this.stats.httpRequests,durationMs:Math.round(this.clock.now()-cohort.sealedAt),sampleAgeMs:Math.round(this.clock.now()-latestStartedAt)});}catch{}
  }catch{
   for(const job of cohort.jobs)if(!job.done)job.finish(job.signal.aborted?abortReason(job.signal):error());
   try{this.onCohort({status:'HEADER_COHORT_REFUSED',jobs:cohort.jobs.length,headerMethodsTotal:this.stats.headerMethods,headerRequestsTotal:this.stats.httpRequests,...(cohort.failure??{kind:'INVALID_OR_ABORTED_COHORT'})});}catch{}
  }
 }
 async close(){this.closed=true;if(this.timer!==undefined){this.clock.clearTimeout(this.timer);this.timer=undefined;}for(const job of this.current)job.finish(error());this.current=[];for(const c of this.cohorts){for(const job of c.jobs)job.finish(error());c.controller.abort();}await Promise.allSettled([...this.cohorts].map(c=>c.promise));}
}
export function overrideHeaderEffect(effect){
 if(!effect||effect.name!=='ZeeSwapCanonicalHeadersV1'||effect.defaultShouldCache!==false||effect.crossChain!==false||typeof effect.handler!=='function'||effect.rateLimit?.callsPerDuration!==6||effect.rateLimit.durationMs!==1000||!Object.getOwnPropertyDescriptor(effect,'rateLimit')?.writable)throw Error('EXACT_STOCK_HEADER_EFFECT_REQUIRED');
 const preserved={handler:effect.handler,input:effect.input,output:effect.output,storageMeta:effect.storageMeta};effect.rateLimit={callsPerDuration:12,durationMs:1000};
 for(const [key,value] of Object.entries(preserved))if(effect[key]!==value)throw Error('HEADER_EFFECT_CHANGED');return effect;
}
export async function installEnvioRpcTransport({sdkMainUrl,importHandler,config}){
 if(process.platform!=='linux'||process.cwd()!=='/opt/zeeswap-testnet/state/envio-engine/project'||fileURLToPath(sdkMainUrl)!==PRODUCTION_MAIN||process.env.ZEESWAP_COHERENT_HEADERS!=='true'||process.env.ZEESWAP_BASE_RPC_URL!=='https://sepolia.base.org'||!Number.isInteger(config.batchSize)||config.batchSize<1||config.batchSize>100)throw Error('EXACT_ENVIO_TRANSPORT_SCOPE_REQUIRED');
 const identity=JSON.stringify(config.envioInfo),sdk=dirname(PRODUCTION_MAIN),self=await realpath(fileURLToPath(import.meta.url));
 if(sha(await readFile(PRODUCTION_MAIN))!==MODIFIED_MAIN_SHA256)throw Error('EXACT_MODIFIED_MAIN_REQUIRED');
 for(const [name,hash] of Object.entries(SDK_PINS))if(sha(await readFile(sdk+'/'+name))!==hash)throw Error('ENVIO_SDK_PIN_CHANGED');
 if(sha(await readFile(process.cwd()+'/src/headers.ts'))!==HEADER_SHA256)throw Error('ENVIO_HEADER_SOURCE_CHANGED');
 const manifestPath='/opt/zeeswap-testnet/secrets/envio-sdk-runtime.sha256',stat=await lstat(manifestPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o027)!==0||await realpath(manifestPath)!==manifestPath)throw Error('ROOT_RUNTIME_HASH_MANIFEST_REQUIRED');
 const lines=(await readFile(manifestPath,'utf8')).trim().split('\n');if(lines.length!==2)throw Error('EXACT_TWO_RUNTIME_PINS_REQUIRED');const seen=new Set();
 for(const line of lines){const m=/^([0-9a-f]{64})  (\/opt\/zeeswap-testnet\/[^\r\n]+)$/.exec(line);if(!m)throw Error('RUNTIME_PIN_FORMAT');const path=await realpath(m[2]);if(![self,PRODUCTION_MAIN].includes(path)||seen.has(path)||sha(await readFile(path))!==m[1])throw Error('RUNTIME_PIN_CHANGED');seen.add(path);}
 const globalState=await import(sdk+'/EnvioGlobal.res.mjs');if(globalState.value.indexerState!==undefined||globalThis[Symbol.for('zeeswap.envio.headerTransport')])throw Error('TRANSPORT_MUST_PRECEDE_FIRST_EFFECT');
 const a=await importHandler('src/headers.ts'),b=await importHandler('src/headers.js');if(a!==b||a.canonicalHeaders!==b.canonicalHeaders)throw Error('EXACT_HEADER_MODULE_IDENTITY_REQUIRED');
 overrideHeaderEffect(a.canonicalHeaders);
 const transport=new HeaderRpcTransport({url:process.env.ZEESWAP_BASE_RPC_URL,fetch:globalThis.fetch.bind(globalThis),onCohort:summary=>console.log(JSON.stringify({event:'envio-header-transport',...summary}))});
 globalThis[Symbol.for('zeeswap.envio.headerTransport')]=transport;globalThis.fetch=transport.fetch.bind(transport);
 if(JSON.stringify(config.envioInfo)!==identity)throw Error('ENVIO_STORED_IDENTITY_CHANGED');
 console.log(JSON.stringify({status:'MODIFIED_ENVIO_CAP100_HEADER_TRANSPORT',effectJobsPerSecond:12,headerMethodsPerRollingSecond:18,totalProviderQuotaClaim:false}));
}
