import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,type Hex,type TransactionSerialized} from 'viem';
import {g5ControllerNonceReadiness} from '../src/g5-controller-nonce.ts';
async function fixture(){
 const account=privateKeyToAccount(generatePrivateKey()),settlement='0x1111111111111111111111111111111111111111',blockHash=('0x'+'ab'.repeat(32)) as Hex;
 const attempts=await Promise.all([8,9].map(async(nonce,i)=>{const raw=await account.signTransaction({type:'legacy',chainId:84532,nonce,to:settlement,data:'0x1234',value:0n,gas:450000n,gasPrice:20000000n}) as TransactionSerialized;return {sequence:i+3,nonce,raw,hash:keccak256(raw)};}));
 const io={transaction:async(hash:Hex)=>{const a=attempts.find(a=>a.hash===hash)!;return {blockHash,nonce:a.nonce,input:'0x1234',from:account.address,to:settlement,value:0n};},receipt:async(hash:Hex)=>({status:'success',transactionHash:hash,blockHash,blockNumber:100n}),block:async()=>({hash:blockHash})};
 return {input:{operator:account.address,settlement,latestNonce:10,pendingNonce:10,attempts},io};
}
test('two canonical mined originals awaiting application finality permit next nonce',async()=>{
 const f=await fixture();assert.deepEqual(await g5ControllerNonceReadiness(f.input,f.io),{operatorRawPending:false,operatorRawSequence:undefined});
});
test('one original unmined raw or global pending nonce gap prevents another preparation',async()=>{
 const f=await fixture();f.input.latestNonce=9;f.input.pendingNonce=9;const original=f.io.transaction;f.io.transaction=async hash=>hash===f.input.attempts[1].hash?null as any:original(hash);
 assert.deepEqual(await g5ControllerNonceReadiness(f.input,f.io),{operatorRawPending:true,operatorRawSequence:4});
 const g=await fixture();g.input.pendingNonce=11;assert.equal((await g5ControllerNonceReadiness(g.input,g.io)).operatorRawPending,true);
});
test('altered raw identity and changed canonical receipt stop the snapshot',async()=>{
 const f=await fixture();f.input.attempts[0].hash=('0x'+'cd'.repeat(32)) as Hex;await assert.rejects(()=>g5ControllerNonceReadiness(f.input,f.io),/ORIGINAL_RAW_CONTRADICTION/);
 const g=await fixture();g.io.block=async()=>({hash:('0x'+'de'.repeat(32)) as Hex});await assert.rejects(()=>g5ControllerNonceReadiness(g.input,g.io),/MINED_RAW_CONTRADICTION/);
});
