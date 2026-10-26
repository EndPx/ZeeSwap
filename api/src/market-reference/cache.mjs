import {performance} from 'node:perf_hooks';
import {sampleKraken,MAX_AGE_MS,POLL_INTERVAL_MS} from './provider.mjs';

export function unavailableReference(){return {schemaVersion:1,status:'unavailable',source:'Kraken',pair:'ZEC/USDC',priceMode:'reference-only',reason:'MARKET_REFERENCE_UNAVAILABLE',retrievedAt:null,expiresAt:null,exchangeUpdatedAt:null,maxAgeSeconds:30,pollIntervalSeconds:15};}
function cache({sample=sampleKraken,clock=Date.now,monotonic=()=>performance.now()}={}){
 let snapshot=null,inFlight=null,nextAttempt=-Infinity,expiresMonotonic=-Infinity,timer;
 const view=()=>{
  const now=clock();if(!snapshot||now>=Date.parse(snapshot.expiresAt)||now<Date.parse(snapshot.retrievedAt)-5000||monotonic()>=expiresMonotonic)return unavailableReference();
  return structuredClone(snapshot);
 };
 const refresh=()=>{
  if(inFlight)return inFlight;if(monotonic()<nextAttempt)return Promise.resolve(view());nextAttempt=monotonic()+POLL_INTERVAL_MS;
  inFlight=Promise.resolve().then(sample).then(result=>{const now=clock(),remaining=Date.parse(result.expiresAt)-now;
   if(result.status!=='available'||!Number.isFinite(remaining)||remaining<=0||remaining>MAX_AGE_MS||now-Date.parse(result.retrievedAt)>MAX_AGE_MS||Date.parse(result.retrievedAt)>now+5000)throw Error();
   snapshot=structuredClone(result);expiresMonotonic=monotonic()+remaining;
  }).catch(()=>{snapshot=null;expiresMonotonic=-Infinity;}).then(view).finally(()=>{inFlight=null;});return inFlight;
 };
 return Object.freeze({view,refresh,start(){if(!timer){void refresh();timer=setInterval(()=>{void refresh();},POLL_INTERVAL_MS);timer.unref();}},stop(){clearInterval(timer);timer=undefined;}});
}
export function createMarketReferenceCache(){return cache();}
export const testOnly=Object.freeze({cache(options){if(options?.testOnly!==true)throw Error('EXPLICIT_TEST_CACHE_REQUIRED');return cache(options);}});
