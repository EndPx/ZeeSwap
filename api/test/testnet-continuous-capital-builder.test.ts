import test from 'node:test';import assert from 'node:assert/strict';
import {continuousCurrentCapitalRows} from '../src/testnet-policy-capital-builder.ts';
const policy='a'.repeat(64),source='00000000-0000-4000-8000-000000000101',change='00000000-0000-4000-8000-000000000099';
const output=(n:number,ownChange=false)=>({txid:n.toString(16).padStart(64,'0'),pool:'ironwood',index:0,ownChange,amount:'100000'});
const keys={lookup:(kind:string,value:string)=>Buffer.from(kind+':'+value)};
test('current capital resolves selected receipts and exact confirmed change beyond any historical fourth order',async()=>{
 let calls=0;const db={async query(sql:string,args:any[]){calls++;assert.doesNotMatch(sql,/LIMIT 5/);assert.ok(Buffer.from(args[0]).equals(Buffer.from(policy,'hex')));
  if(sql.includes('d.identity_hash=$2')){assert.ok(sql.includes("q.direction='ZCASH_TO_BASE'"));assert.ok(sql.includes('o.primary_deposit'));const matches=args[1].toString().includes(output(101).txid);return{rows:matches?[{order_id:source,state:'SETTLED'}]:[]};}
  assert.match(sql,/r\.tx_hash=\$2/);assert.match(sql,/r\.zcash_hash=\$2/);assert.match(sql,/r\.confirmed/);return{rows:[{order_id:change,kind:'confirmed-own-change'}]};
 }};
 const a=output(101),b=output(99,true),c={...b,index:1};const actual=await continuousCurrentCapitalRows(db as any,keys as any,policy,[a,b,c]);
 assert.deepEqual(actual,[{kind:'settled-source',orderId:source,output:a},{kind:'confirmed-own-change',orderId:change}]);assert.equal(calls,5);
});
test('ambiguous provenance and overlarge current sample refuse without scanning or accepting unknown capital',async()=>{
 const ambiguous={async query(){return{rows:[{order_id:source},{order_id:change}]};}};
 await assert.rejects(continuousCurrentCapitalRows(ambiguous as any,keys as any,policy,[output(1)]),/SOURCE_IDENTITY/);
 await assert.rejects(continuousCurrentCapitalRows(ambiguous as any,keys as any,policy,Array.from({length:33},(_,i)=>output(i))),/POLICY_CAPITAL_BOUND/);
 const missing={async query(){return{rows:[]};}};assert.deepEqual(await continuousCurrentCapitalRows(missing as any,keys as any,policy,[output(1)]),[]);
});
