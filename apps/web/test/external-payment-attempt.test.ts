import test from 'node:test';
import assert from 'node:assert/strict';
import {readExternalPaymentAttempt} from '../src/external-payment-attempt.ts';

const id='22222222-2222-4222-8222-222222222222';
test('previous external payment records are read without writing, clearing or changing submitted transaction IDs',()=>{
 const txid='b'.repeat(64),raw=JSON.stringify({state:'submitted',txid});let reads=0;
 const storage={getItem:(key:string)=>{reads++;assert.equal(key,`zeeswap.noir-send.v1.${id}`);return raw;}};
 assert.deepEqual(readExternalPaymentAttempt(storage,id),{state:'submitted',txid});
 assert.deepEqual(readExternalPaymentAttempt(storage,id),{state:'submitted',txid});
 assert.equal(reads,2);assert.equal(raw,JSON.stringify({state:'submitted',txid}));
 assert.equal(readExternalPaymentAttempt({getItem:()=>null},id),null);
});
test('unknown, malformed or unreadable previous results remain a conservative reconciliation warning',()=>{
 for(const raw of ['{"state":"unknown"}','not-json','null','[]','{}','{"state":"submitted","txid":"invalid"}',JSON.stringify({state:'submitted',txid:'B'.repeat(64)})]){
  assert.deepEqual(readExternalPaymentAttempt({getItem:()=>raw},id),{state:'unknown'});
 }
 assert.deepEqual(readExternalPaymentAttempt({getItem:()=>{throw Error('blocked');}},id),{state:'unknown'});
});
