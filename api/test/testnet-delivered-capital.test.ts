import test from 'node:test';
import assert from 'node:assert/strict';
import {excludeDeliveredHeldNotes,deliveredPendingSpends} from '../src/testnet-delivered-capital.ts';
import {requirePolicyCapitalProvenance} from '../src/testnet-policy-capital.ts';
const policy='a'.repeat(64),txid='b'.repeat(64),blockHash='c'.repeat(64);
const output={network:'zcash-testnet',pool:'ironwood',txid,index:0,amount:'100000',height:10,blockHash,receiver:'private-fixture',shieldedSource:true,ownChange:false};
const held={pool:'ironwood' as const,txid,index:0,value:'100000'},owned={pool:'ironwood' as const,txid:'d'.repeat(64),index:0,value:'1200000'};
const row={classification:'EXACT',confirmed_at:new Date(),shielded:true,amount:'100000',block_height:'10',block_hash:blockHash,private_payload:Buffer.from('fixture')};
const keys={lookup:()=>Buffer.alloc(32,1),open:()=>output};

test('canonical delivered source is held, excluded from spending and never added to owned capital',async()=>{
 const db={async query(sql:string,args:unknown[]){assert.match(sql,/o\.primary_deposit/);assert.match(sql,/testnet_order_delivery_included\(o\.id\)/);assert.deepEqual(args[0],Buffer.from(policy,'hex'));return{rows:[row]};}};
 const notes=await excludeDeliveredHeldNotes(db as any,keys as any,policy,[held,owned],[output]);
 assert.deepEqual(notes,[owned]);assert.deepEqual(requirePolicyCapitalProvenance(notes,[owned]),[owned]);
 assert.equal([held,owned].reduce((n,r)=>n+BigInt(r.value),0n),1300000n);
});

test('unknown or no-longer-delivered source remains subject to the ordinary provenance refusal',async()=>{
 const notes=await excludeDeliveredHeldNotes({query:async()=>({rows:[]})} as any,keys as any,policy,[held,owned],[output]);
 assert.deepEqual(notes,[held,owned]);assert.throws(()=>requirePolicyCapitalProvenance(notes,[owned]),/UNEXPLAINED_NOTE/);
});

test('held-note recognition refuses altered amount, private receipt and ambiguous matches',async()=>{
 for(const changed of [{amount:'99999'},{confirmed_at:null},{block_hash:'e'.repeat(64)}])await assert.rejects(excludeDeliveredHeldNotes({query:async()=>({rows:[{...row,...changed}]})} as any,keys as any,policy,[held,owned],[output]),/HELD_SOURCE_PROOF/);
 await assert.rejects(excludeDeliveredHeldNotes({query:async()=>({rows:[row]})} as any,{...keys,open:()=>({...output,receiver:'wrong'})} as any,policy,[held,owned],[output]),/HELD_SOURCE_PROOF/);
 await assert.rejects(excludeDeliveredHeldNotes({query:async()=>({rows:[row,row]})} as any,keys as any,policy,[held,owned],[output]),/HELD_SOURCE_IDENTITY/);
});

test('pending spends retain both original gas fees even after RESERVE confirmation, with exact integers',async()=>{
 const db={async query(sql:string){assert.match(sql,/testnet_order_delivery_included/);assert.doesNotMatch(sql,/NOT .*confirmed/);return{rows:[{principal:'100000',fee:'9007199254740993'}]};}};
 assert.deepEqual(await deliveredPendingSpends(db as any,policy),{principal:100000n,fee:9007199254740993n});
 await assert.rejects(deliveredPendingSpends({query:async()=>({rows:[{principal:'1.5',fee:'0'}]})} as any,policy),/INCLUDED_SPEND_PROOF/);
});
