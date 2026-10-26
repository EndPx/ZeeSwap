import http from 'node:http';
import https from 'node:https';

export const MAX_AGE_MS=30_000;
export const POLL_INTERVAL_MS=15_000;
const BODY_LIMIT=65_536;
const TIMEOUT_MS=4_000;
const PATHS=Object.freeze({status:'/0/public/SystemStatus',pairs:'/0/public/AssetPairs?pair=ZECUSD,USDCUSD',ticker:'/0/public/Ticker?pair=ZECUSD,USDCUSD'});
const ORIGIN='https://api.kraken.com';
const agent=new https.Agent({keepAlive:true,maxSockets:3,maxFreeSockets:3,timeout:5_000});
const SCALE=10n**18n,DISPLAY=10n**12n;
const fail=()=>{throw Error('MARKET_REFERENCE_UNAVAILABLE');};

export function positiveDecimal(value){
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/.test(value))return fail();
 const [whole,fraction='']=value.split('.'),scaled=BigInt(whole)*SCALE+BigInt(fraction.padEnd(18,'0'));
 if(scaled<=0n)return fail();return scaled;
}
function fixed(value){return `${value/DISPLAY}.${(value%DISPLAY).toString().padStart(12,'0')}`;}
function ratio(numerator,denominator,up=false){
 if(numerator<=0n||denominator<=0n)return fail();const n=numerator*DISPLAY,value=up?(n+denominator-1n)/denominator:n/denominator;
 if(value<=0n)return fail();return fixed(value);
}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value;}
function envelope(value){const v=object(value);if(!Array.isArray(v.error)||v.error.length||!v.result)return fail();return object(v.result);}
function timestamp(value){
 if(typeof value!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value))return fail();
 const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,19)!==value.slice(0,19))return fail();return n;
}
function fresh(instant,now){if(!Number.isFinite(instant)||!Number.isFinite(now)||now-instant>MAX_AGE_MS||instant-now>5_000)return fail();}

export function validateProviderHeaders(headers,receivedAt){
 const date=headers.date;if(typeof date!=='string'||new Date(Date.parse(date)).toUTCString()!==date)return fail();const serverAt=Date.parse(date);fresh(serverAt,receivedAt);
 const age=headers.age===undefined?0:typeof headers.age==='string'&&/^(0|[1-9][0-9]{0,2})$/.test(headers.age)?Number(headers.age):NaN;
 if(!Number.isSafeInteger(age)||age>30)return fail();
 const cache=headers['cache-control'];if(cache!==undefined&&(typeof cache!=='string'||cache.length>1024))return fail();
 if(cache){for(const directive of cache.toLowerCase().split(',').map(v=>v.trim())){
  if(/^(stale-if-error|stale-while-revalidate)\s*=/.test(directive)&&! /^(stale-if-error|stale-while-revalidate)\s*=\s*0$/.test(directive))return fail();
  if(/^(max-age|s-maxage|stale-if-error|stale-while-revalidate)\s*=/.test(directive)&&! /^(max-age|s-maxage|stale-if-error|stale-while-revalidate)\s*=\s*(0|[1-9][0-9]{0,8})$/.test(directive))return fail();
 }}
 if(headers.warning!==undefined&&(typeof headers.warning!=='string'||/(^|,)\s*11[01]\b/.test(headers.warning)))return fail();
 if(typeof headers['cf-cache-status']==='string'&&['STALE','UPDATING'].includes(headers['cf-cache-status'].toUpperCase()))return fail();
 if(typeof headers['content-type']!=='string'||! /^application\/json(?:\s*;|$)/i.test(headers['content-type']))return fail();
 if(headers['content-encoding']!==undefined&&headers['content-encoding']!=='identity')return fail();
 const length=headers['content-length'];if(length!==undefined&&(typeof length!=='string'||! /^(0|[1-9][0-9]{0,6})$/.test(length)||Number(length)>BODY_LIMIT))return fail();
 // HTTP freshness is additional to retrieval TTL. A cached response never gets
 // a new full lifetime merely because this service downloaded it again.
 return Math.min(receivedAt+MAX_AGE_MS,serverAt+MAX_AGE_MS,receivedAt+MAX_AGE_MS-age*1000);
}

function boundedGet(url,allowed,{clock=Date.now,timeoutMs=TIMEOUT_MS,testOnly=false}={}){
 if(!allowed.has(url)||(!testOnly&&!url.startsWith(ORIGIN+'/')))return Promise.reject(Error('MARKET_REFERENCE_UNAVAILABLE'));
 return new Promise((resolve,reject)=>{
  let done=false,size=0;const chunks=[];let response;
  const rejectSafe=()=>{if(done)return;done=true;clearTimeout(timer);response?.destroy();request.destroy();reject(Error('MARKET_REFERENCE_UNAVAILABLE'));};
  const transport=testOnly?http:https;
  // Fixed public GET only. Node's normal HTTPS certificate/hostname validation
  // is retained. Redirects, authentication, retries and environment URLs do not exist.
  const request=transport.request(url,{method:'GET',agent:testOnly?false:agent,maxHeaderSize:8192,headers:{Accept:'application/json','Accept-Encoding':'identity','Cache-Control':'no-cache',Pragma:'no-cache','User-Agent':'ZeeSwap-Market-Reference/1'}},res=>{
   response=res;if(res.statusCode!==200){rejectSafe();return;}
   res.on('error',rejectSafe);res.on('aborted',rejectSafe);
   res.on('data',chunk=>{size+=chunk.length;if(size>BODY_LIMIT){rejectSafe();return;}chunks.push(chunk);});
   res.on('end',()=>{if(done)return;try{const receivedAt=clock(),expiresAt=validateProviderHeaders(res.headers,receivedAt),value=JSON.parse(Buffer.concat(chunks).toString('utf8'));done=true;clearTimeout(timer);resolve({value,receivedAt,expiresAt});}catch{rejectSafe();}});
  });
  const timer=setTimeout(rejectSafe,timeoutMs);request.on('error',rejectSafe);request.end();
 });
}

export function assembleReference(responses,now=Date.now()){
 const {status,pairs,ticker}=responses,health=envelope(status.value),metadata=envelope(pairs.value),quotes=envelope(ticker.value);
 const systemAt=timestamp(health.timestamp);fresh(systemAt,now);if(health.status!=='online')return fail();
 for(const response of [status,pairs,ticker]){fresh(response.receivedAt,now);if(!Number.isFinite(response.expiresAt)||response.expiresAt<=now||response.expiresAt>response.receivedAt+MAX_AGE_MS)return fail();}
 const keys=['USDCUSD','XZECZUSD'];if(Object.keys(metadata).sort().join()!==keys.join()||Object.keys(quotes).sort().join()!==keys.join())return fail();
 const expected=[{key:'XZECZUSD',base:'XZEC',quote:'ZUSD',altname:'ZECUSD',wsname:'ZEC/USD'},{key:'USDCUSD',base:'USDC',quote:'ZUSD',altname:'USDCUSD',wsname:'USDC/USD'}];
 const legs=expected.map(e=>{
  const m=object(metadata[e.key]),q=object(quotes[e.key]);if(m.base!==e.base||m.quote!==e.quote||m.altname!==e.altname||m.wsname!==e.wsname||m.status!=='online'||!Array.isArray(q.a)||!Array.isArray(q.b))return fail();
  const bid=positiveDecimal(q.b[0]),ask=positiveDecimal(q.a[0]);if(bid>ask)return fail();return {bid,ask,public:{pair:e.wsname,providerPair:e.key,bid:q.b[0],ask:q.a[0],mid:ratio(bid+ask,2n*SCALE)}};
 });
 const [zec,usdc]=legs,retrievedAt=Math.min(status.receivedAt,pairs.receivedAt,ticker.receivedAt),expiresAt=Math.min(retrievedAt+MAX_AGE_MS,status.expiresAt,pairs.expiresAt,ticker.expiresAt,systemAt+MAX_AGE_MS);
 if(expiresAt<=now)return fail();
 return {schemaVersion:1,status:'available',source:'Kraken',pair:'ZEC/USDC',priceMode:'reference-only',marketAssets:{base:'ZEC',quote:'USDC',via:'USD'},rate:{mid:ratio(zec.bid+zec.ask,usdc.bid+usdc.ask),bid:ratio(zec.bid,usdc.ask),ask:ratio(zec.ask,usdc.bid,true),decimals:12},sourcePairs:legs.map(l=>l.public),retrievedAt:new Date(retrievedAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),exchangeUpdatedAt:null,maxAgeSeconds:30,pollIntervalSeconds:15};
}
function sampler(origin,testOnly=false,clock=Date.now,timeoutMs=TIMEOUT_MS){
 const urls=Object.fromEntries(Object.entries(PATHS).map(([key,path])=>[key,origin+path])),allowed=new Set(Object.values(urls));
 return async()=>{if(!testOnly&&process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')return fail();const entries=await Promise.all(Object.entries(urls).map(async([key,url])=>[key,await boundedGet(url,allowed,{clock,timeoutMs,testOnly})]));return assembleReference(Object.fromEntries(entries),clock());};
}
export const sampleKraken=sampler(ORIGIN);

/** Explicit test-only local HTTP seam; never driven by environment or public API. */
export const testOnly=Object.freeze({sampler({origin,clock=Date.now,timeoutMs=TIMEOUT_MS,testOnly:enabled}){
 const u=new URL(origin);if(enabled!==true||u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/'||u.username||u.password||u.search||u.hash||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>TIMEOUT_MS)throw Error('TEST_ONLY_LOCAL_UPSTREAM_REQUIRED');
 return sampler(u.origin,true,clock,timeoutMs);
}});
