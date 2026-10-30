import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {serviceLifetimeInsert,validateServiceLifetimeAuthorization,type ServiceLifetimeAuthorization} from '../src/testnet-service-lifetime.ts';
import {validateServiceAvailability} from '../src/testnet-service-policy.ts';
const now=Date.parse('2026-10-31T06:00:00.000Z');
export function lifetimeFixture():ServiceLifetimeAuthorization{return{version:1,purpose:'ROOT_TESTNET_SERVICE_NO_EXPIRY',authorizationId:'11111111-1111-4111-8111-111111111111',policySha256:'a'.repeat(64),humanApprovalSha256:'b'.repeat(64),serviceExpiresAt:null,originalActivationXid:'388500',activeEpoch:'242',controlXmin:'388504',profileSha256:'c'.repeat(64),settlementContract:'0x'+'1'.repeat(40),tokenContract:'0x'+'2'.repeat(40),originalExpiresAt:'2026-10-31T11:48:23.898Z',approvedAt:'2026-10-31T06:00:00.000Z',publishBefore:'2026-10-31T06:10:00.000Z',financialAction:false};}
test('nonexpiring service has finite exact Root publication authority and preserves original policy expiry',()=>{
 const a=lifetimeFixture();validateServiceLifetimeAuthorization(a,now);const raw=Buffer.from(JSON.stringify(a)),i=serviceLifetimeInsert(a,raw,now);
 assert.match(i.sql,/service_expires_at/);assert.match(i.sql,/NULL/);assert.ok(i.args.includes(a.originalExpiresAt));
 for(const patch of [{serviceExpiresAt:'2099-01-01T00:00:00Z'},{purpose:'ROOT_RENEW_EXPIRED_POLICY_24H_SAME_QUOTA'},{financialAction:true},{publishBefore:a.approvedAt},{publishBefore:'2026-10-31T06:30:00.001Z'},{controlXmin:'0'},{policySha256:'0'.repeat(64)}])assert.throws(()=>validateServiceLifetimeAuthorization({...a,...patch}as any,now));
 assert.throws(()=>validateServiceLifetimeAuthorization(a,Date.parse(a.publishBefore)),/FINITE_PUBLICATION/);
 assert.throws(()=>serviceLifetimeInsert(a,Buffer.from(JSON.stringify({...a,policySha256:'d'.repeat(64)})),now),/RAW_BINDING/);
 const micro={...a,originalExpiresAt:'2026-10-31 11:48:23.898329+00'};assert.ok(serviceLifetimeInsert(micro,Buffer.from(JSON.stringify(micro)),now).args.includes(micro.originalExpiresAt),'original PostgreSQL microseconds survive SQL binding');
});
test('SQL changes only expiration branch in existing financial gate and availability metadata; all finite guards remain',async()=>{
 const read=async(n:string)=>(await readFile(new URL('../migrations/'+n,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 const baseline=await read('0020_bounded_testnet_service_policy.sql'),successor=await read('0030_testnet_policy_successor.sql'),s=await read('0032_testnet_service_lifetime.sql');
 const body=(s:string,name:string)=>s.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION zee\\.'+name+'\\([\\s\\S]*?END \\$\\$;'))![0];
 assert.equal(body(s,'testnet_policy_gate').replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION').replace(' AND NOT zee.testnet_policy_nonexpiring(p_policy)',''),body(baseline,'testnet_policy_gate'));
 let a=body(s,'testnet_policy_availability').replace(' AND NOT zee.testnet_policy_nonexpiring(p_policy)','').replace("CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN 3 ELSE 1 END",'1').replace('CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN NULL ELSE p.expires_at END','p.expires_at');
 a=a.replace(" || CASE WHEN zee.testnet_policy_nonexpiring(p_policy) THEN jsonb_build_object('lifetime','nonexpiring','lifetimeAuthorizationSha256',(SELECT encode(authorization_sha256,'hex') FROM zee.testnet_service_lifetime_authorizations WHERE policy_sha256=p_policy)) ELSE '{}'::jsonb END",'');assert.equal(a,body(successor,'testnet_policy_availability'));
 assert.doesNotMatch(s,/UPDATE zee\.(orders|quotes|runtime_control|inventory_accounts)|INSERT INTO zee\.(testnet_policy_admissions|testnet_policy_quotes)|pg_advisory.*20261026/);
 assert.match(s,/NEW.control_xmin<>cx/);assert.match(s,/pg_xact_status\(NEW.original_activation_xid\)<>'committed'/);assert.match(s,/CREATE TRIGGER service_lifetime_immutable/);assert.match(s,/REVOKE ALL ON zee.testnet_service_lifetime_authorizations FROM CURRENT_USER/);
});
test('backend requires explicit v3 lifetime proof for null expiry and keeps finite v1 intact',()=>{
 const a:any={version:3,status:'busy',checkedAt:new Date(now).toISOString(),policy:{sha256:'a'.repeat(64),expiresAt:null,lifetime:'nonexpiring',lifetimeAuthorizationSha256:'b'.repeat(64),inputAmountAtomic:'100000',maxConcurrent:1,activeOrders:1,maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingByDirection:{ZCASH_TO_BASE:0,BASE_TO_ZCASH:2},remainingQuotes:20,availableByDirection:{ZCASH_TO_BASE:false,BASE_TO_ZCASH:false}}};
 validateServiceAvailability(a);assert.throws(()=>validateServiceAvailability({...a,version:1}),/LIFETIME/);assert.throws(()=>validateServiceAvailability({...a,policy:{...a.policy,lifetimeAuthorizationSha256:undefined}}),/LIFETIME/);
 const finite={...a,version:1,policy:{...a.policy,expiresAt:new Date(now+60000).toISOString()}};delete finite.policy.lifetime;delete finite.policy.lifetimeAuthorizationSha256;validateServiceAvailability(finite);
});
