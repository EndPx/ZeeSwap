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
