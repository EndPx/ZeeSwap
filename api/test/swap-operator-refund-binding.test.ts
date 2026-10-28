import test from 'node:test';import assert from 'node:assert/strict';
import {PrivateData} from '../src/private-data.ts';
import {refundContext} from '../src/source-refunds.ts';
import {decodePgJsonbBytea} from '../src/pg-jsonb-bytea.ts';
import {readOpeningRefundReceipt,requireOpeningRefundChainReceipt} from '../src/swap-operator-refund-binding.ts';
const pg=(b:Buffer)=>String.fromCharCode(92,120)+b.toString('hex');
function fixture(){
 const keys=new PrivateData(Buffer.alloc(32,17),Buffer.alloc(32,29)),id='11111111-1111-4111-8111-111111111111',hash='0x'+'a'.repeat(64);
 const proof={hash,phase:'CANCEL' as const,fee:'21234',blockHeight:12345,blockHash:'0x'+'b'.repeat(64)};
 const row={order_id:id,base_phase:'CANCEL',base_confirmed:true,confirmed:true,base_hash:pg(keys.lookup('base-tx',hash)),base_receipt:pg(keys.seal(proof,refundContext(id,'CANCEL-proof'))),base_height:proof.blockHeight,base_block:proof.blockHash.slice(2),base_fee:proof.fee};
 const receipt={transactionHash:hash,blockNumber:12345n,blockHash:proof.blockHash,gasUsed:21000n,effectiveGasPrice:1n,l1Fee:234n};
 return{keys,id,hash,proof,row,receipt};
}
test('actual PostgreSQL JSONB bytea shape binds HMAC lookup and authenticated original cancellation proof',()=>{
 const {keys,id,hash,row,proof,receipt}=fixture();assert.deepEqual([...row.base_hash.slice(0,2)].map(c=>c.charCodeAt(0)),[92,120]);assert.equal(row.base_hash.length,66);
 assert.notEqual(decodePgJsonbBytea(row.base_hash).toString('hex'),hash.slice(2));
 const actual=readOpeningRefundReceipt(keys,id,hash,row);assert.deepEqual(actual,proof);requireOpeningRefundChainReceipt(actual,receipt);
});
test('raw transaction hash, wrong HMAC domain and malformed/doubled bytea are refused',()=>{
 const{keys,id,hash,row}=fixture();
 for(const base_hash of[pg(Buffer.from(hash.slice(2),'hex')),pg(keys.lookup('zcash-tx',hash)),String.fromCharCode(92)+row.base_hash,row.base_hash.slice(1),'0x'+hash.slice(2),row.base_hash.slice(0,-1),row.base_hash+'zz'])assert.throws(()=>readOpeningRefundReceipt(keys,id,hash,{...row,base_hash}),/^Error: OPENING_ROOT_ORIGINAL_MAIN_REFUND_BINDING$/);
 for(const invalid of[null,Buffer.alloc(32),{type:'Buffer',data:[1]},String.fromCharCode(92,120),'abc'])assert.throws(()=>decodePgJsonbBytea(invalid,32),/INVALID_PG_JSONB_BYTEA/);
});
test('receipt fields, order/phase AAD, ciphertext integrity and independent RPC fee/anchor remain mandatory',()=>{
 const{keys,id,hash,row,proof,receipt}=fixture();
 for(const changed of[{hash:'0x'+'c'.repeat(64)},{phase:'REFUND'},{fee:'21235'},{blockHeight:12346},{blockHash:'0x'+'c'.repeat(64)},{extra:true}])assert.throws(()=>readOpeningRefundReceipt(keys,id,hash,{...row,base_receipt:pg(keys.seal({...proof,...changed},refundContext(id,'CANCEL-proof')))}),/ORIGINAL_MAIN_REFUND_BINDING/);
 for(const context of[refundContext(id,'REFUND-proof'),refundContext('22222222-2222-4222-8222-222222222222','CANCEL-proof')])assert.throws(()=>readOpeningRefundReceipt(keys,id,hash,{...row,base_receipt:pg(keys.seal(proof,context))}),/ORIGINAL_MAIN_REFUND_BINDING/);
 const corrupt=decodePgJsonbBytea(row.base_receipt);corrupt[15]^=1;assert.throws(()=>readOpeningRefundReceipt(keys,id,hash,{...row,base_receipt:pg(corrupt)}),/ORIGINAL_MAIN_REFUND_BINDING/);
 for(const changed of[{base_fee:'1'},{base_height:12346},{base_block:'c'.repeat(64)},{base_confirmed:false},{confirmed:false},{order_id:'wrong'}])assert.throws(()=>readOpeningRefundReceipt(keys,id,hash,{...row,...changed}),/ORIGINAL_MAIN_REFUND_BINDING/);
 for(const changed of[{transactionHash:'0x'+'c'.repeat(64)},{blockNumber:12346n},{blockHash:'0x'+'c'.repeat(64)},{l1Fee:235n},{l1Fee:undefined},{effectiveGasPrice:2n}])assert.throws(()=>requireOpeningRefundChainReceipt(proof,{...receipt,...changed}),/ORIGINAL_MAIN_REFUND_CHAIN_BINDING/);
});
