import test from 'node:test';
import assert from 'node:assert/strict';
import {validateServiceAvailability} from '../src/testnet-service-policy.ts';
import {validateContinuousPhysicalProof,classifyContinuousOriginal} from '../scripts/administer-continuous-demo.ts';
import {readContinuousClosedJournalPage} from '../src/testnet-continuous-journals.ts';
const digest='a'.repeat(64),now=Date.parse('2026-10-31T10:00:00Z');
function availability(){return{version:5,status:'ready',checkedAt:new Date(now).toISOString(),policy:{id:'fixture',sha256:digest,expiresAt:null,lifetime:'nonexpiring',lifetimeAuthorizationSha256:'b'.repeat(64),capacityBasis:'current-liquidity',capacityAuthorizationSha256:'c'.repeat(64),inputAmountAtomic:'100000',maxAcceptedByDirection:null,remainingByDirection:{ZCASH_TO_BASE:4,BASE_TO_ZCASH:4},maxConcurrent:1,activeOrders:0,remainingQuotes:null,availableByDirection:{ZCASH_TO_BASE:true,BASE_TO_ZCASH:true},quoteRateLimit:{max:32,windowSeconds:120,remaining:32}}};}
test('continuous v5 explicitly removes lifetime counters and preserves exact operation/rate shape',()=>{
 const v=availability();validateServiceAvailability(v);validateServiceAvailability({...v,status:'rate_limited'});
 for(const patch of [{maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2}},{remainingQuotes:32},{maxConcurrent:2},{capacityBasis:'funded-or-active'},{capacityAuthorizationSha256:'0'.repeat(64)},{remainingByDirection:{ZCASH_TO_BASE:1.1,BASE_TO_ZCASH:4}},{remainingByDirection:{ZCASH_TO_BASE:Number.MAX_SAFE_INTEGER+1,BASE_TO_ZCASH:4}},{quoteRateLimit:{max:32,windowSeconds:120,remaining:33}},{inputAmountAtomic:'100001'}])assert.throws(()=>validateServiceAvailability({...v,policy:{...v.policy,...patch}}));
 assert.throws(()=>validateServiceAvailability({...v,version:4}));
});
test('Root physical target proof must be fresh, exact integer and pinned to original policy and parent',()=>{
 const proof={version:1,status:'ROOT_CONTINUOUS_DEMO_PHYSICAL_CAPITAL_VERIFIED',policySha256:digest,parentClosedAuthoritySha256:'b'.repeat(64),ownershipAndProvenanceVerified:true,pendingCalculatedCount:0,observedAt:new Date(now).toISOString(),nativeBalanceZatoshi:'12590000',baseAvailableAtomic:'9900000',baseGasWei:'494318479995905',nativeCapture:{path:'/private/native',sha256:'c'.repeat(64)},baseCapture:{path:'/private/base',sha256:'d'.repeat(64)}};
 validateContinuousPhysicalProof(proof,digest,'b'.repeat(64),now);
 for(const patch of [{ownershipAndProvenanceVerified:false},{pendingCalculatedCount:1},{nativeBalanceZatoshi:'1199999'},{baseAvailableAtomic:'9899999'},{baseGasWei:'99999999999999'},{nativeBalanceZatoshi:12590000},{nativeBalanceZatoshi:'1.2e6'},{observedAt:new Date(now-60001).toISOString()},{observedAt:new Date(now+5001).toISOString()},{policySha256:'c'.repeat(64)}])assert.throws(()=>validateContinuousPhysicalProof({...proof,...patch},digest,'b'.repeat(64),now));
});
test('closed journal SQL pages retain every order past64 and authenticate all historical phase rows',async()=>{
 const rows=Array.from({length:97},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),state:'EXPIRED_UNFUNDED'}));
 const seen:string[]=[],tables=new Set<string>();
 const db={async query(sql:string,args:any[]){
  if(sql.startsWith('SELECT q.*')){assert.match(sql,/o\.id>\$1::uuid/);assert.match(sql,/ORDER BY o\.id LIMIT 32/);return{rows:rows.filter(r=>args[0]===null||r.id>args[0]).slice(0,32)};}
  const table=sql.match(/FROM zee\.([a-z_]+) t WHERE/)?.[1];assert.ok(table);tables.add(table);assert.match(sql,/order_id=ANY\(\$1::uuid\[\]\)/);
  if(['base_attempts','escrow_commits','escrow_settlements','reverse_payouts'].includes(table)){assert.match(sql,/c\.finalized_height>=b\.height/);assert.match(sql,/b\.block_hash=t\.block_hash/);}
  return{rows:args[0].map((order_id:string)=>({order_id}))};
 }};
 let cursor:string|null=null;for(;;){const page=await readContinuousClosedJournalPage(db as any,cursor);seen.push(...page.orders.map(r=>r.id));if(page.orders.length<32)break;cursor=page.orders.at(-1)!.id;}
 assert.deepEqual(seen,rows.map(r=>r.id));assert.equal(tables.size,7);
});

test('original SQL outcomes are resolved before another allocation, credit or closed restart',()=>{
 const expected={testnet_continuous_proceeds:[{deposit_id:'original',amount:'100000'}],ledger_entries:[{asset:'TAZ',bucket:'operator:unreconciled',amount:'-100000'},{asset:'TAZ',bucket:'principal:available',amount:'100000'}]};
 assert.equal(classifyContinuousOriginal('in progress',expected,undefined,false),'pending');
 assert.equal(classifyContinuousOriginal('aborted',expected,undefined,false),'aborted');
 assert.equal(classifyContinuousOriginal('committed',expected,structuredClone(expected),true),'committed');
 assert.equal(classifyContinuousOriginal('committed',expected,structuredClone(expected),false),'pending');
 assert.throws(()=>classifyContinuousOriginal('committed',expected,{...expected,ledger_entries:[]},true),/ORIGINAL_EFFECT_CONFLICT/);
 for(const status of [null,undefined,'unknown','prepared'])assert.throws(()=>classifyContinuousOriginal(status,expected,expected,true),/ORIGINAL_XID_UNKNOWN/);
});
