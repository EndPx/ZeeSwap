import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveCapital} from '../../src/live-capital.ts';
const txid='a'.repeat(64),hash='b'.repeat(64),tipHash='c'.repeat(64),time=new Date().toISOString();
const approval={fundingTxid:txid,expectedAmountZatoshi:'12500000',birthday:4532047,principalZatoshi:'200000',feeZatoshi:'20000'};
function proof(){return {version:1,fundingTxid:txid,capitalBalanceZatoshi:'12500000',capitalNotes:[{pool:'ironwood',txid,index:0,value:'12500000',height:4532057,blockHash:hash}],snapshot:{schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,scannedHeight:4532066,tipHash,
 blocks:[{height:4532057,hash,time},{height:4532066,hash:tipHash,time}],outputs:[{txid,index:0,pool:'ironwood',amount:'12500000',receiver:'utest1fixture',memo:null,height:4532057,blockHash:hash,blockTime:time,shieldedSource:true}]}};}
test('new capital proof explicitly separates approved principal, fee and physical remainder',()=>{
 const result=validateLiveCapital(proof(),approval);
 assert.equal(result.principalZatoshi,'200000');assert.equal(result.feeZatoshi,'20000');assert.equal(result.unallocatedZatoshi,'12280000');
});
test('capital proof refuses old funds, missing confirmation, privacy and over-allocation',()=>{
 const old=proof();old.capitalNotes[0]!.height=4500000;assert.throws(()=>validateLiveCapital(old,approval));
 const privacy=proof();privacy.snapshot.outputs[0]!.shieldedSource=false;assert.throws(()=>validateLiveCapital(privacy,approval));
 const wrong=proof();wrong.capitalNotes[0]!.value='90000';assert.throws(()=>validateLiveCapital(wrong,approval));
 assert.throws(()=>validateLiveCapital(proof(),{...approval,principalZatoshi:'12500000'}));
 const pending=proof();pending.snapshot.scannedHeight=4532065;pending.snapshot.blocks[1]!.height=4532065;assert.throws(()=>validateLiveCapital(pending,approval));
});
