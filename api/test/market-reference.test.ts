import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Standalone Node ESM boundary intentionally has no TS/DB runtime dependency.
// @ts-expect-error Plain .mjs modules are verified by runtime tests below.
import {positiveDecimal,assembleReference,validateProviderHeaders,testOnly as providerTest} from '../src/market-reference/provider.mjs';
// @ts-expect-error Plain .mjs modules are verified by runtime tests below.
import {testOnly as cacheTest,unavailableReference} from '../src/market-reference/cache.mjs';
// @ts-expect-error Plain .mjs modules are verified by runtime tests below.
import {createMarketReferenceServer} from '../src/market-reference/server.mjs';

const now=Date.now();
function fixture(time=now){
 const wrap=(result:unknown)=>({value:{error:[],result},receivedAt:time,expiresAt:time+30000});
 return {status:wrap({status:'online',timestamp:new Date(time).toISOString()}),pairs:wrap({XZECZUSD:{base:'XZEC',quote:'ZUSD',altname:'ZECUSD',wsname:'ZEC/USD',status:'online'},USDCUSD:{base:'USDC',quote:'ZUSD',altname:'USDCUSD',wsname:'USDC/USD',status:'online'}}),ticker:wrap({XZECZUSD:{b:['100.00000000','1','1'],a:['102.00000000','1','1']},USDCUSD:{b:['0.99000000','1','1'],a:['1.01000000','1','1']}})};
}
const headers=(time=now)=>({'content-type':'application/json; charset=utf-8',date:new Date(time).toUTCString(),'cache-control':'public, max-age=2'});
async function upstream(t:any,handler:(req:any,res:any)=>void){
 const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});return `http://127.0.0.1:${(server.address() as any).port}`;
}
function writeFixture(req:any,res:any,data=fixture(Date.now())){
 res.setHeader('Content-Type','application/json');const key=req.url.startsWith('/0/public/SystemStatus')?'status':req.url.startsWith('/0/public/AssetPairs')?'pairs':'ticker';res.end(JSON.stringify(data[key].value));
}
test('decimal parsing is exact and rejects numbers, exponents, signs and unbounded precision',()=>{
 for(const bad of [1,1.5,-1,NaN,Infinity,'0','0.0','-1','+1','01','1e3','NaN','Infinity','.1','1.','1.0000000000000000001','1000000000000000000'])assert.throws(()=>positiveDecimal(bad));
 assert.equal(positiveDecimal('0.000000000000000001'),1n);assert.equal(positiveDecimal('123.456789012345678901'),123456789012345678901n);
});
test('two actual USD legs determine conservative bid/ask and rational midpoint without a peg assumption',()=>{
 const value=assembleReference(fixture(),now);assert.deepEqual(value.rate,{mid:'101.000000000000',bid:'99.009900990099',ask:'103.030303030304',decimals:12});assert.equal(value.exchangeUpdatedAt,null);assert.equal(value.priceMode,'reference-only');
 const data=fixture();(data.ticker.value.result as any).USDCUSD={a:['2.0000'],b:['2.0000']};assert.equal(assembleReference(data,now).rate.mid,'50.500000000000');assert.equal(assembleReference(data,now).sourcePairs[1].pair,'USDC/USD');
});
test('invalid USD leg, inverted spread, wrong market identity, provider errors and offline state fail closed',()=>{
 const mutations=[(f:any)=>f.ticker.value.result.USDCUSD.b=['0'],(f:any)=>f.ticker.value.result.XZECZUSD.b=['103'],(f:any)=>f.pairs.value.result.USDCUSD.quote='USDT',(f:any)=>f.pairs.value.result.XZECZUSD.status='cancel_only',(f:any)=>f.status.value.result.status='maintenance',(f:any)=>f.ticker.value.error=['EGeneral:failure'],(f:any)=>delete f.ticker.value.result.USDCUSD,(f:any)=>f.pairs.value.result.XZECZUSD.wsname='TAZ/USD'];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>assembleReference(f,now),/MARKET_REFERENCE_UNAVAILABLE/);}
});
test('tiny positive source prices that would display as zero do not publish a misleading zero reference',()=>{
 const f=fixture();(f.ticker.value.result as any).XZECZUSD={a:['0.000000000000000001'],b:['0.000000000000000001']};assert.throws(()=>assembleReference(f,now));
});
test('provider health timestamp and actual HTTP retrieval TTL cannot be replaced by processing time',()=>{
 for(const stamp of ['not-a-date',new Date(now-31000).toISOString(),new Date(now+6000).toISOString(),'2026-02-31T00:00:00Z']){const f=fixture();(f.status.value.result as any).timestamp=stamp;assert.throws(()=>assembleReference(f,now));}
 const f=fixture(now-30000);assert.throws(()=>assembleReference(f,now));
 const mixed=fixture();mixed.pairs.receivedAt=now-10000;mixed.pairs.expiresAt=now+20000;const value=assembleReference(mixed,now);assert.equal(value.retrievedAt,new Date(now-10000).toISOString());assert.equal(value.expiresAt,new Date(now+20000).toISOString());
});
test('HTTP Date/Age/cache freshness rejects stale responses while fresh EXPIRED revalidation is accepted',()=>{
 const good=headers();assert.ok(validateProviderHeaders({...good,'cf-cache-status':'EXPIRED'},now)>now);
 const invalid=[{...good,date:new Date(now-31000).toUTCString()},{...good,date:new Date(now+7000).toUTCString()},{...good,date:'Invalid Date'},{...good,age:'31'},{...good,age:'-1'},{...good,age:'1.5'},{...good,warning:'110 cache "Response is stale"'},{...good,'cf-cache-status':'STALE'},{...good,'cache-control':'public, stale-if-error=60'},{...good,'cache-control':'stale-while-revalidate=5'},{...good,'cache-control':'max-age=-1'},{...good,'content-type':'text/html'},{...good,'content-encoding':'gzip'},{...good,'content-length':'65537'}];
 for(const value of invalid)assert.throws(()=>validateProviderHeaders(value,now));
 assert.ok(validateProviderHeaders({...good,age:'29'},now)<=now+1000);
});
test('real local HTTP upstream uses exactly three fixed GET paths and validates the completed sample',async t=>{
 const requests:string[]=[];const origin=await upstream(t,(req,res)=>{requests.push(req.url);assert.equal(req.method,'GET');assert.equal(req.headers.authorization,undefined);writeFixture(req,res);});
 const sample=providerTest.sampler({origin,testOnly:true});const value=await sample();assert.equal(value.status,'available');assert.equal(requests.length,3);assert.deepEqual(requests.sort(),['/0/public/AssetPairs?pair=ZECUSD,USDCUSD','/0/public/SystemStatus','/0/public/Ticker?pair=ZECUSD,USDCUSD'].sort());assert.equal(value.rate.mid,'101.000000000000');
});
test('test transport cannot become an arbitrary provider URL or implicit production fallback',()=>{
 for(const input of [{origin:'https://example.com',testOnly:true},{origin:'http://example.com',testOnly:true},{origin:'http://127.0.0.1:1'},{origin:'http://user:pass@127.0.0.1:1',testOnly:true},{origin:'http://127.0.0.1:1/path',testOnly:true}])assert.throws(()=>providerTest.sampler(input));
 assert.throws(()=>cacheTest.cache({sample:()=>Promise.resolve({})}));
});
test('redirects and provider HTTP failures are not retried or followed',async t=>{
 const originalPaths=['/0/public/AssetPairs?pair=ZECUSD,USDCUSD','/0/public/SystemStatus','/0/public/Ticker?pair=ZECUSD,USDCUSD'].sort();
 for(const status of [302,429,500]){
  const requests:string[]=[];let originalArrivals!:()=>void;
  const allOriginalRequests=new Promise<void>(resolve=>{originalArrivals=resolve;});
  const origin=await upstream(t,(req,res)=>{
   requests.push(req.url);if(originalPaths.every(path=>requests.includes(path)))originalArrivals();
   res.statusCode=req.url==='/unexpected-redirect'?200:status;res.setHeader('Location','/unexpected-redirect');res.end();
  });
  await assert.rejects(()=>providerTest.sampler({origin,testOnly:true})());
  // Promise.all rejects on the first failed response, before the two other
  // original HTTP requests necessarily reach the server. Observe their actual
  // arrivals before asserting counts or allowing test cleanup to close sockets.
  let deadline:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([allOriginalRequests,new Promise<void>((_resolve,reject)=>{deadline=setTimeout(()=>reject(Error('THREE_ORIGINAL_REQUESTS_NOT_OBSERVED')),1000);})]);}finally{clearTimeout(deadline);}
  // Keep the real redirect endpoint observable for a bounded interval after all
  // originals arrived; a retry or followed Location adds an unexpected request.
  await new Promise<void>(resolve=>setTimeout(resolve,100));
  assert.deepEqual([...requests].sort(),originalPaths);
 }
});
test('provider body size, malformed JSON and stalled body are bounded',async t=>{
 const huge=await upstream(t,(_req,res)=>{res.setHeader('Content-Type','application/json');res.end('x'.repeat(65537));});await assert.rejects(()=>providerTest.sampler({origin:huge,testOnly:true})());
 const malformed=await upstream(t,(_req,res)=>{res.setHeader('Content-Type','application/json');res.end('{');});await assert.rejects(()=>providerTest.sampler({origin:malformed,testOnly:true})());
 const stalled=await upstream(t,(_req,res)=>{res.setHeader('Content-Type','application/json');res.write('{');});const start=Date.now();await assert.rejects(()=>providerTest.sampler({origin:stalled,testOnly:true,timeoutMs:40})());assert.ok(Date.now()-start<1000);
});
test('cache sampling is singleflight, bounded to 15 seconds and independent of browser reads',async()=>{
 let wall=now,mono=0,calls=0,release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});const cache=cacheTest.cache({testOnly:true,clock:()=>wall,monotonic:()=>mono,sample:async()=>{calls++;await barrier;return assembleReference(fixture(wall),wall);}});
 const work=Array.from({length:40},()=>cache.refresh());await Promise.resolve();assert.equal(calls,1);release();await Promise.all(work);for(let i=0;i<100;i++)assert.equal(cache.view().status,'available');await cache.refresh();assert.equal(calls,1);
 const original=cache.view();wall+=14999;mono+=14999;await cache.refresh();assert.equal(calls,1);assert.equal(cache.view().retrievedAt,original.retrievedAt);wall++;mono++;await cache.refresh();assert.equal(calls,2);
});
test('stale values disappear completely and failure never falls back to a previous numeric snapshot',async()=>{
 let wall=now,mono=0,fail=false;const cache=cacheTest.cache({testOnly:true,clock:()=>wall,monotonic:()=>mono,sample:()=>{if(fail)throw Error('upstream private detail');return assembleReference(fixture(wall),wall);}});
 await cache.refresh();wall+=15000;mono+=15000;fail=true;await cache.refresh();assert.deepEqual(cache.view(),unavailableReference());assert.equal(JSON.stringify(cache.view()).includes('101.'),false);
 wall+=15000;mono+=15000;fail=false;await cache.refresh();assert.equal(cache.view().status,'available');wall+=30000;mono+=30000;assert.equal(cache.view().status,'unavailable');assert.equal('rate'in cache.view(),false);
});
test('monotonic expiry prevents wall-clock rollback from extending a sampled reference',async()=>{
 let wall=now,mono=0;const cache=cacheTest.cache({testOnly:true,clock:()=>wall,monotonic:()=>mono,sample:async()=>assembleReference(fixture(wall),wall)});await cache.refresh();mono=30000;assert.equal(cache.view().status,'unavailable');wall=now-6000;mono=1;assert.equal(cache.view().status,'unavailable');
});
test('local endpoint serves strict available/HEAD/OPTIONS and rejects writes, paths, queries and bodies',async t=>{
 const data=assembleReference(fixture(Date.now()),Date.now());let views=0;const service=createMarketReferenceServer({view:()=>{views++;return data;},start(){},stop(){}});await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));t.after(()=>{service.server.closeAllConnections();service.server.close();});const origin=`http://127.0.0.1:${service.server.address().port}`;
 const response=await fetch(origin+'/market-reference');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),data);
 const head=await fetch(origin+'/market-reference',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal((await fetch(origin+'/market-reference',{method:'OPTIONS'})).status,204);
 const post=await fetch(origin+'/market-reference',{method:'POST',body:'{}'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD, OPTIONS');assert.equal((await fetch(origin+'/market-reference?pair=BTCUSD')).status,404);assert.equal((await fetch(origin+'/arbitrary')).status,404);assert.equal((await fetch(origin+'/market-reference',{method:'OPTIONS',body:'x'})).status,400);assert.equal(views,2);
});
test('unavailable endpoint returns 503 without an old price or provider exception',async t=>{
 const service=createMarketReferenceServer({view:unavailableReference,start(){},stop(){}});await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));t.after(()=>{service.server.closeAllConnections();service.server.close();});const response=await fetch(`http://127.0.0.1:${service.server.address().port}/market-reference`);assert.equal(response.status,503);const body=await response.json();assert.deepEqual(body,unavailableReference());assert.equal('rate'in body,false);assert.equal('sourcePairs'in body,false);
});
test('native Node imports the standalone entry without network activity or TypeScript/DB loaders',async()=>{
 const entry=new URL('../src/market-reference/main.mjs',import.meta.url).href;
 const script=`import http from 'node:http';import https from 'node:https';import assert from 'node:assert/strict';let calls=0;http.request=https.request=()=>{calls++;throw Error('NETWORK_DURING_IMPORT');};await import(${JSON.stringify(entry)});assert.equal(calls,0);console.log('NO_NETWORK_IMPORT_OK');`;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{windowsHide:true,timeout:5000,maxBuffer:8192});assert.equal(result.stdout.trim(),'NO_NETWORK_IMPORT_OK');
});
