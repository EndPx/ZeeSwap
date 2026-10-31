import test from 'node:test';
import assert from 'node:assert/strict';
import type {BaseContract,IncludedBaseReceipt} from '../src/base-contract.ts';
import {canonicalIncludedPayout} from '../src/forward-destination.ts';
const proof:IncludedBaseReceipt={phase:'PAY',hash:`0x${'1'.repeat(64)}`,blockHash:`0x${'2'.repeat(64)}`,blockNumber:100,fee:'123',id:`0x${'3'.repeat(64)}`,recipient:`0x${'4'.repeat(40)}`,amount:'100000'};
const expected={recipient:proof.recipient,amount:'100000',blockHeight:'100'};
function base(overrides:Record<string,unknown>={}){return {client:{getChainId:async()=>84532,getBlock:async()=>({hash:proof.blockHash}),getTransactionReceipt:async()=>({status:'success',transactionHash:proof.hash,blockHash:proof.blockHash,blockNumber:100n}),...overrides}} as unknown as Pick<BaseContract,'client'>;}
test('authenticated exact PAY observation can project delivery before Base finality',async()=>{assert.equal(await canonicalIncludedPayout(base(),proof,expected),true);});
test('reservation, wrong terms and malformed inclusion cannot project delivery',async()=>{
 for(const changed of [{phase:'RESERVE'},{hash:'x'},{blockHash:'x'},{blockNumber:0},{amount:'99999'},{recipient:`0x${'5'.repeat(40)}`}])await assert.rejects(canonicalIncludedPayout(base(),{...proof,...changed} as IncludedBaseReceipt,expected),/DESTINATION_EVIDENCE_UNAVAILABLE/);
 await assert.rejects(canonicalIncludedPayout(base(),proof,{...expected,blockHeight:'101'}),/DESTINATION_EVIDENCE_UNAVAILABLE/);
});
test('reorg, failed receipt, wrong network, missing receipt or unavailable RPC withholds INCLUDED',async()=>{
 for(const overrides of [{getChainId:async()=>1},{getBlock:async()=>({hash:`0x${'6'.repeat(64)}`})},{getTransactionReceipt:async()=>({status:'reverted',transactionHash:proof.hash,blockHash:proof.blockHash,blockNumber:100n})},{getTransactionReceipt:async()=>({status:'success',transactionHash:proof.hash,blockHash:proof.blockHash,blockNumber:101n})},{getTransactionReceipt:async()=>{throw Error('TransactionNotFoundError');}}])assert.equal(await canonicalIncludedPayout(base(overrides),proof,expected),false);
});
