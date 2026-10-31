import test from 'node:test';import assert from 'node:assert/strict';
import {decodeAvailability,serviceCanQuote,servicePolicyIsCurrent,availabilityCopy} from '../src/availability.ts';
export function ready(){return{version:1,status:'ready',checkedAt:new Date().toISOString(),policy:{id:'00000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString(),inputAmountAtomic:'100000',maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:1},maxConcurrent:1,activeOrders:0,remainingQuotes:32,availableByDirection:{ZCASH_TO_BASE:true,BASE_TO_ZCASH:true}}};}
test('dedicated safe availability gates both directions without changing health schema',()=>{const a=decodeAvailability(ready());assert.equal(serviceCanQuote(a,'BASE_TO_ZCASH'),true);assert.match(availabilityCopy(a),/bounded testnet quote/);a.policy!.remainingByDirection.BASE_TO_ZCASH=0;a.policy!.availableByDirection.BASE_TO_ZCASH=false;assert.equal(serviceCanQuote(decodeAvailability(a),'BASE_TO_ZCASH'),false);});
test('malformed, inconsistent, leaked or stale responses fail closed',()=>{for(const mutate of [(a:any)=>a.extra='private',(a:any)=>a.policy.owner='secret',(a:any)=>a.policy.activeOrders=1,(a:any)=>a.policy.remainingByDirection.BASE_TO_ZCASH=0,(a:any)=>a.checkedAt=new Date(Date.now()-61000).toISOString(),(a:any)=>a.policy.expiresAt=new Date(Date.now()-1).toISOString()]){const a=ready();mutate(a);assert.throws(()=>decodeAvailability(a));}});
test('a busy worker or unavailable proof closes admission but preserves status visibility',()=>{for(const status of ['busy','source_unavailable','worker_unavailable','capital_unavailable','policy_expired','paused'] as const){const a=ready();a.status=status;a.policy.availableByDirection={ZCASH_TO_BASE:false,BASE_TO_ZCASH:false};assert.equal(serviceCanQuote(decodeAvailability(a),'ZCASH_TO_BASE'),false);}assert.equal(serviceCanQuote(undefined,'ZCASH_TO_BASE'),false);});

function nonexpiring(now:number){const finite=ready();return {...finite,version:3,checkedAt:new Date(now).toISOString(),policy:{...finite.policy,expiresAt:null,lifetime:'nonexpiring',lifetimeAuthorizationSha256:'b'.repeat(64)}};}
test('qualified v3 service has no lifetime deadline while fresh readiness and remaining capacity still apply',()=>{
 const now=Date.parse('2026-10-31T00:00:00Z'),a=decodeAvailability(nonexpiring(now),now);
 assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now),true);
 assert.equal(servicePolicyIsCurrent(a,now+365*86400000),true);
 assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now+60001),false);
 const refreshed=nonexpiring(now+365*86400000);refreshed.policy.remainingQuotes=31;refreshed.policy.remainingByDirection={ZCASH_TO_BASE:1,BASE_TO_ZCASH:0};refreshed.policy.availableByDirection.BASE_TO_ZCASH=false;
 const next=decodeAvailability(refreshed,now+365*86400000);
 assert.equal(serviceCanQuote(next,'ZCASH_TO_BASE',now+365*86400000),true);
 assert.equal(serviceCanQuote(next,'BASE_TO_ZCASH',now+365*86400000),false);
 assert.equal(next.policy!.remainingQuotes,31);
});
test('null expiry requires exact v3 lifetime and nonzero authorization hash',()=>{
 const now=Date.now();
 for(const mutate of [(a:any)=>a.version=1,(a:any)=>a.version=2,(a:any)=>a.version=4,(a:any)=>delete a.policy.lifetime,(a:any)=>a.policy.lifetime='forever',(a:any)=>delete a.policy.lifetimeAuthorizationSha256,(a:any)=>a.policy.lifetimeAuthorizationSha256='0'.repeat(64),(a:any)=>a.policy.lifetimeAuthorizationSha256='b'.repeat(63),(a:any)=>a.policy.lifetimeAuthorizationSha256='G'.repeat(64),(a:any)=>a.policy.expiresAt=new Date(now+60000).toISOString(),(a:any)=>a.policy.expiresAt=undefined,(a:any)=>a.policy.owner='private']){
  const a=nonexpiring(now);mutate(a);assert.throws(()=>decodeAvailability(a,now));
 }
 const legacy:any=ready();legacy.policy.expiresAt=null;assert.throws(()=>decodeAvailability(legacy,now));
});
test('v3 preserves stale, source, worker, budget, concurrency and directional readiness gates',()=>{
 const now=Date.now();
 for(const status of ['source_unavailable','worker_unavailable','capital_unavailable','paused','busy','policy_exhausted','reconciling','disabled']){
  const a=nonexpiring(now);a.status=status;a.policy.availableByDirection={ZCASH_TO_BASE:false,BASE_TO_ZCASH:false};assert.equal(serviceCanQuote(decodeAvailability(a,now),'ZCASH_TO_BASE',now),false);
 }
 for(const mutate of [(a:any)=>a.checkedAt=new Date(now-60001).toISOString(),(a:any)=>a.checkedAt=new Date(now+5001).toISOString(),(a:any)=>a.policy.remainingQuotes=0,(a:any)=>a.policy.activeOrders=1,(a:any)=>a.policy.maxConcurrent=2,(a:any)=>a.policy.maxAcceptedByDirection.BASE_TO_ZCASH=3,(a:any)=>a.policy.remainingByDirection.BASE_TO_ZCASH=0]){const a=nonexpiring(now);mutate(a);assert.throws(()=>decodeAvailability(a,now));}
 const disabled={version:3,status:'disabled',checkedAt:new Date(now).toISOString(),policy:null};assert.equal(serviceCanQuote(decodeAvailability(disabled,now),'ZCASH_TO_BASE',now),false);assert.throws(()=>decodeAvailability({...disabled,status:'ready'},now));
});

function fundedCapacity(now:number){const a=nonexpiring(now);return {...a,version:4,policy:{...a.policy,capacityBasis:'funded-or-active',capacityAuthorizationSha256:'c'.repeat(64)}};}
function continuousCapacity(now:number){const a=fundedCapacity(now);return {...a,version:5,policy:{...a.policy,capacityBasis:'current-liquidity',maxAcceptedByDirection:null,remainingQuotes:null,remainingByDirection:{ZCASH_TO_BASE:15,BASE_TO_ZCASH:7},quoteRateLimit:{max:32,windowSeconds:120,remaining:32}}};}
test('v5 admits current liquidity beyond historical quotas and a rolling quote cooldown recovers',()=>{
 const now=Date.now(),payload=continuousCapacity(now),a=decodeAvailability(payload,now);
 assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now),true);assert.equal(a.policy!.remainingByDirection.ZCASH_TO_BASE,15);assert.equal(a.policy!.remainingQuotes,null);assert.equal(a.policy!.maxAcceptedByDirection,null);assert.equal(availabilityCopy(a),'Ready for a testnet quote');
 payload.status='rate_limited';payload.policy.quoteRateLimit.remaining=0;payload.policy.availableByDirection={ZCASH_TO_BASE:false,BASE_TO_ZCASH:false};
 const cooldown=decodeAvailability(payload,now);assert.equal(serviceCanQuote(cooldown,'ZCASH_TO_BASE',now),false);assert.match(availabilityCopy(cooldown),/cooling down/);
 payload.status='ready';payload.policy.quoteRateLimit.remaining=1;payload.policy.availableByDirection.ZCASH_TO_BASE=true;assert.equal(serviceCanQuote(decodeAvailability(payload,now),'ZCASH_TO_BASE',now),true);
});
test('v5 rejects invented unlimited capacity, malformed rate windows and inconsistent readiness',()=>{
 const now=Date.now();
 for(const mutate of [(a:any)=>a.policy.maxAcceptedByDirection={ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},(a:any)=>a.policy.remainingQuotes=32,(a:any)=>a.policy.capacityBasis='funded-or-active',(a:any)=>a.policy.capacityAuthorizationSha256='0'.repeat(64),(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=null,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=Number.MAX_SAFE_INTEGER+1,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=-1,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=1.5,(a:any)=>a.policy.quoteRateLimit.windowSeconds=121,(a:any)=>a.policy.quoteRateLimit.max=33,(a:any)=>a.policy.quoteRateLimit.remaining=33,(a:any)=>a.policy.quoteRateLimit.remaining=0,(a:any)=>a.policy.quoteRateLimit.extra=true,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=0,(a:any)=>a.policy.activeOrders=1,(a:any)=>a.checkedAt=new Date(now-60001).toISOString(),(a:any)=>a.policy.extra='private']){const a=continuousCapacity(now);mutate(a);assert.throws(()=>decodeAvailability(a,now));}
 for(const status of ['source_unavailable','worker_unavailable','capital_unavailable','paused','busy','reconciling']){const a=continuousCapacity(now);a.status=status;a.policy.availableByDirection={ZCASH_TO_BASE:false,BASE_TO_ZCASH:false};assert.equal(serviceCanQuote(decodeAvailability(a,now),'ZCASH_TO_BASE',now),false);}
});
test('v4 funded-or-active capacity permits only fresh authorized remaining routes with unchanged quote count',()=>{
 const now=Date.now(),payload=fundedCapacity(now);payload.policy.remainingQuotes=30;
 const a=decodeAvailability(payload,now);assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now),true);assert.equal(a.policy!.remainingQuotes,30);assert.equal(servicePolicyIsCurrent(a,now+365*86400000),true);assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now+60001),false);
 payload.policy.remainingByDirection.ZCASH_TO_BASE=0;payload.policy.availableByDirection.ZCASH_TO_BASE=false;
 const noForward=decodeAvailability(payload,now);assert.equal(serviceCanQuote(noForward,'ZCASH_TO_BASE',now),false);assert.equal(serviceCanQuote(noForward,'BASE_TO_ZCASH',now),true);
});
test('v4 requires exact separate lifetime and capacity authorization without accepting legacy or leaked fields',()=>{
 const now=Date.now();
 for(const mutate of [(a:any)=>delete a.policy.capacityBasis,(a:any)=>a.policy.capacityBasis='all-accepted',(a:any)=>delete a.policy.capacityAuthorizationSha256,(a:any)=>a.policy.capacityAuthorizationSha256='0'.repeat(64),(a:any)=>a.policy.capacityAuthorizationSha256='C'.repeat(64),(a:any)=>a.policy.capacityAuthorizationSha256='c'.repeat(63),(a:any)=>delete a.policy.lifetimeAuthorizationSha256,(a:any)=>a.policy.lifetimeAuthorizationSha256='0'.repeat(64),(a:any)=>a.version=3,(a:any)=>a.policy.expiresAt=new Date(now+60000).toISOString(),(a:any)=>a.policy.closedOrders=['private']]){const a=fundedCapacity(now);mutate(a);assert.throws(()=>decodeAvailability(a,now));}
 const a:any=fundedCapacity(now);delete a.policy.capacityAuthorizationSha256;assert.equal(servicePolicyIsCurrent(a,now),false);assert.equal(serviceCanQuote(a,'ZCASH_TO_BASE',now),false);
});
test('v4 keeps finite readiness, concurrency, quote and two-order direction capacity guards',()=>{
 const now=Date.now();
 for(const mutate of [(a:any)=>a.checkedAt=new Date(now-60001).toISOString(),(a:any)=>a.checkedAt=new Date(now+5001).toISOString(),(a:any)=>a.policy.activeOrders=1,(a:any)=>a.policy.maxConcurrent=2,(a:any)=>a.policy.remainingQuotes=0,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=3,(a:any)=>a.policy.maxAcceptedByDirection.ZCASH_TO_BASE=3,(a:any)=>a.policy.remainingByDirection.ZCASH_TO_BASE=0]){const a=fundedCapacity(now);mutate(a);assert.throws(()=>decodeAvailability(a,now));}
 for(const status of ['source_unavailable','worker_unavailable','capital_unavailable','paused','busy','reconciling','policy_exhausted']){const a=fundedCapacity(now);a.status=status;a.policy.availableByDirection={ZCASH_TO_BASE:false,BASE_TO_ZCASH:false};assert.equal(serviceCanQuote(decodeAvailability(a,now),'ZCASH_TO_BASE',now),false);}
});
