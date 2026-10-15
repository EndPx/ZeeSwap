import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePreparedZcash,type PreparedZcashTransaction,type ReversePayoutTerms} from '../src/reverse-settlement.ts';

// Public synthetic fixture matching the real SDK's exact-funded output shape.
// Synthetic bytes do not establish actual transaction validity or settlement.
const terms:ReversePayoutTerms={orderId:'fixture-order',operationId:'fixture-operation',recipient:'fixture:recipient',amountZatoshi:'100000',maxFeeZatoshi:'10000'};
function prepared():PreparedZcashTransaction{return {
 operationId:terms.orderId,amount:'100000',fee:'10000',recipient:terms.recipient,txid:'a'.repeat(64),rawTransaction:'010203',feeZatoshi:'10000',expiryHeight:'4504576',
 selectedNotes:[{pool:'ironwood',txid:'b'.repeat(64),index:0,value:'100000'},{pool:'ironwood',txid:'c'.repeat(64),index:1,value:'10000'}],
 outputs:[{recipient:terms.recipient,amount:'100000',ownChange:false,index:0},{recipient:'fixture:internal-change',amount:'0',ownChange:true,index:1}]
};}
test('exact-funded SDK zero own-change is accepted without removing outputs, indices or changing original bytes',()=>{
 const p=prepared(),before=structuredClone(p);validatePreparedZcash(p,terms);assert.deepEqual(p,before);
 assert.equal(p.outputs.length,2);assert.equal(p.outputs[1].amount,'0');assert.equal(p.outputs[1].index,1);
});
test('zero external output remains forbidden even when quote and metadata claim zero',()=>{
 const p=prepared();p.outputs[0].amount='0';p.amount='0';
 assert.throws(()=>validatePreparedZcash(p,{...terms,amountZatoshi:'0'}),/INVALID_PREPARED_ZCASH_PAYOUT/);
});
test('only canonical string zero is accepted for internal change',()=>{
 for(const amount of ['00','-0','+0','0.0','0e0',' 0','0 ','-1','01',0,false,null]){
  const p=prepared();p.outputs[1].amount=amount as any;assert.throws(()=>validatePreparedZcash(p,terms),/INVALID_PREPARED_ZCASH_PAYOUT/,String(amount));
 }
});
test('zero-change does not bypass exact input/output/fee conservation',()=>{
 const p=prepared();p.selectedNotes[1].value='10001';assert.throws(()=>validatePreparedZcash(p,terms),/INVALID_PREPARED_ZCASH_NOTES/);
 const inflated=prepared();inflated.outputs[1].amount='1';assert.throws(()=>validatePreparedZcash(inflated,terms),/INVALID_PREPARED_ZCASH_NOTES/);
});
test('zero-change retains unique indices, recipient binding, boolean ownership and positive selected notes',()=>{
 for(const change of [(p:PreparedZcashTransaction)=>{p.outputs[1].index=0;},(p:PreparedZcashTransaction)=>{p.outputs[0].recipient='fixture:attacker';},
  (p:PreparedZcashTransaction)=>{p.outputs[1].ownChange=false;},(p:PreparedZcashTransaction)=>{p.outputs[1].ownChange='true' as any;},
  (p:PreparedZcashTransaction)=>{p.selectedNotes[1].value='0';}]){
  const p=prepared();change(p);assert.throws(()=>validatePreparedZcash(p,terms));
 }
});
