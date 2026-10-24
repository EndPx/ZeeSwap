import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrivateData} from '../../src/private-data.ts';
import {depositIdentity,type DepositInput} from '../../src/repository.ts';
import {approvedLiveReverseCapital} from '../../src/live-reverse-capital.ts';
test('only explicit native receipt matching SETTLED SQL source proceeds can extend input whitelist',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capital-source-'));
 try{
  const keys=new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2)),txid='a'.repeat(64),blockHash='b'.repeat(64);
  const deposit:DepositInput={network:'zcash-testnet',txid,index:0,pool:'ironwood',reference:'fixture',receiver:'utest1fixture',amount:'100000',height:4532200,blockHash,blockTime:new Date(),shielded:true};
  const identity=depositIdentity(deposit),proof={snapshot:{outputs:[{txid,index:0,pool:'ironwood',amount:'100000',receiver:deposit.receiver,height:deposit.height,blockHash,shieldedSource:true}]}};
  const path=join(root,'source.json'),bytes=JSON.stringify(proof);await writeFile(path,bytes);
  const source={kind:'settled-source' as const,path,sha256:createHash('sha256').update(bytes).digest('hex'),orderId:'11111111-2222-3333-4444-555555555555'};
  const row={state:'SETTLED',direction:'ZCASH_TO_BASE',classification:'EXACT',confirmed_at:new Date(),shielded:true,amount:'100000',block_height:4532200,block_hash:blockHash,private_payload:keys.seal(deposit,`deposit:${identity}:v1`)};
  const pool=(change:object={})=>({async query(_sql:string,args:any[]){assert.equal(args[0],source.orderId);assert.ok(args[1].equals(keys.lookup('deposit',identity)));return {rows:[{...row,...change}]};}}) as any;
  assert.deepEqual(await approvedLiveReverseCapital(pool(),keys,[source]),[{pool:'ironwood',txid,index:0,value:'100000'}]);
  for(const changed of [{state:'READY'},{amount:'100001'},{block_hash:'c'.repeat(64)},{classification:'QUARANTINED'}])await assert.rejects(approvedLiveReverseCapital(pool(changed),keys,[source]),/LIVE_SOURCE_CAPITAL_NOT_SETTLED/);
  await assert.rejects(approvedLiveReverseCapital(pool(),keys,[{...source,kind:'refund-source'}]),/REFUND_CAPITAL_ONLY_FOR_OWN_ORDER/);
  await assert.rejects(approvedLiveReverseCapital(pool(),keys,[{...source,sha256:'0'.repeat(64)}]),/LIVE_CAPITAL_APPROVAL_BYTES_CHANGED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
