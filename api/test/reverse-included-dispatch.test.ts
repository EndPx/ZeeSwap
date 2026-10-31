import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,type Hex} from 'viem';import {privateKeyToAccount} from 'viem/accounts';
import {BaseContract,settlementAbi,publicSettlementId,type BaseRegistry} from '../src/base-contract.ts';
import {fundingTypedData,fundingCall,escrowTerms,observeEscrowFunding,observeEscrowCommit,escrowInclusionContext} from '../src/base-escrow.ts';import {PrivateData} from '../src/private-data.ts';
const operator=privateKeyToAccount('0x'+'11'.repeat(32) as Hex),contract='0x'+'22'.repeat(20) as Hex,payer='0x'+'33'.repeat(20) as Hex,token='0x'+'44'.repeat(20) as Hex,hash='0x'+'55'.repeat(32) as Hex,blockHash='0x'+'66'.repeat(32) as Hex,tipHash='0x'+'77'.repeat(32) as Hex,finalHash='0x'+'88'.repeat(32) as Hex;
async function fixture(phase:'FUND'|'COMMIT'){
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),id='00000000-0000-4000-8000-000000000001',settlement='00000000-0000-4000-8000-000000000002';
 const registry={chainId:84532,rpcUrl:'http://127.0.0.1:1',operator:operator.address,contracts:{ZeeSwapSettlement:{address:contract},MockUSDC:{address:token}}} as BaseRegistry,base=new BaseContract(registry,true);
 const quote={inputAmount:'100000',outputAmount:'100000',payer,refundRecipient:payer,recipient:'fixture:zcash',executionMode:'base-escrow-v1',baseContract:contract,depositReceiver:`escrow:${publicSettlementId(settlement)}`,reference:'private-reference'};
 const row={id,direction:'BASE_TO_ZCASH',execution_mode:'base-escrow-v1',base_contract:contract,input_amount:'100000',output_amount:'100000',settlement_id:settlement,funding_cutoff_time:new Date(2000000000*1000),cancellation_available_at:new Date(2000007200*1000),private_payload:keys.seal(quote,`quote:${id}:v1`)};
 const state:any={receipt:null,tx:null,chainState:phase==='FUND'?4:5,canonicalTip:tipHash,confirmations:0,observed:[]};let pinned:Buffer;
 const pool:any={query:async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT q.*,o.funding_cutoff_time'))return {rows:[row]};
  if(sql==='SELECT private_payload FROM zee.quotes WHERE id=$1')return {rows:[row]};
  if(sql.startsWith('SELECT terms_payload FROM zee.escrow_bindings'))return {rows:[{terms_payload:pinned}]};
  if(sql==='SELECT * FROM zee.escrow_commits WHERE order_id=$1')return {rows:[{signed_payload:keys.seal({hash},`escrow-commit:${id}:v1`)}]};
  if(sql.startsWith('SELECT * FROM zee.escrow_inclusions'))return {rows:[]};
  if(sql.startsWith('SELECT zee.observe_deposit'))return {rows:[{id:'deposit'}]};
  if(sql.includes('confirm_deposit')||sql.includes('confirm_escrow_commit')){state.confirmations++;return {rows:[{id:'deposit'}]};}
  if(sql.startsWith('SELECT zee.observe_escrow_inclusion')){state.observed.push(args);return {rows:[]};}
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('lock_observer_cycle')||sql.startsWith('INSERT INTO zee.chain_observations')||sql.startsWith('INSERT INTO zee.scanner_checkpoints'))return {rows:[]};
  if(sql.startsWith('SELECT epoch::text'))return {rows:[{epoch:'1'}]};
  if(sql.startsWith('SELECT block_hash FROM zee.chain_observations')||sql.startsWith('SELECT * FROM zee.scanner_checkpoints'))return {rows:[]};
  throw Error('unexpected '+sql);
 }};pool.connect=async()=>({...pool,release:()=>{}});
 const terms=await escrowTerms(pool,keys,base,id),signature=await operator.signTypedData(fundingTypedData(base,terms));pinned=keys.seal({terms,signature},`escrow-terms:${id}:v1`);
 state.receipt={transactionHash:hash,status:'success',blockNumber:105n,blockHash,gasUsed:100n,effectiveGasPrice:2n,logs:[{address:contract,logIndex:0,data:phase==='FUND'?encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[100000n,2000007200n]):'0x',topics:phase==='FUND'?encodeEventTopics({abi:settlementAbi,eventName:'Funded',args:{id:terms.id,payer}}):encodeEventTopics({abi:settlementAbi,eventName:'PayoutCommitted',args:{id:terms.id}})}]};
 state.tx={hash,blockHash,blockNumber:105n,from:phase==='FUND'?payer:operator.address,to:contract,value:0n,input:phase==='FUND'?fundingCall(base,terms,signature):encodeFunctionData({abi:settlementAbi,functionName:'commitPayout',args:[terms.id]})};
 base.heads=async()=>({latest:{number:110n,hash:tipHash,timestamp:1700000000n},finalized:{number:100n,hash:finalHash,timestamp:1700000000n}} as any);
 Object.assign(base.client,{getTransactionReceipt:async()=>state.receipt,getTransaction:async()=>state.tx,getBlock:async({blockNumber}:{blockNumber:bigint})=>({hash:blockNumber===110n?state.canonicalTip:blockNumber===100n?finalHash:blockHash,timestamp:1700000000n}),readContract:async({functionName}:{functionName:string})=>functionName==='states'?state.chainState:[payer,payer,100000n,2000007200n]});
 return {pool,keys,base,id,state};
}
test('actual FUND inclusion validates call/event/state and creates only included observation before finalized',async()=>{
 const f=await fixture('FUND');assert.deepEqual(await observeEscrowFunding(f.pool,f.keys,f.base,f.id,hash),{status:'AWAITING_BASE_FINALITY'});assert.equal(f.state.observed.length,0);
 assert.deepEqual(await observeEscrowFunding(f.pool,f.keys,f.base,f.id,hash,true),{status:'READY',depositId:'deposit'});assert.equal(f.state.confirmations,0);assert.equal(f.state.observed.length,1);
 const proof=f.keys.open(f.state.observed[0][7],escrowInclusionContext(f.id,'FUND')) as any;assert.equal(proof.transactionHash,hash);assert.equal(proof.phase,'FUND');assert.equal(proof.finalizedHeight,undefined);
});
test('actual COMMIT inclusion validates exact original tx and keeps final confirmation untouched',async()=>{
 const f=await fixture('COMMIT');assert.deepEqual(await observeEscrowCommit(f.pool,f.keys,f.base,f.id,true),{status:'COMMIT_INCLUDED'});assert.equal(f.state.confirmations,0);assert.equal(f.state.observed.length,1);
 const proof=f.keys.open(f.state.observed[0][7],escrowInclusionContext(f.id,'COMMIT')) as any;assert.equal(proof.phase,'COMMIT');assert.equal(proof.fee,'200');
});
test('fast FUND and COMMIT reject mismatched transaction block/hash/calldata and canonical state snapshot reorg',async()=>{
 for(const phase of ['FUND','COMMIT'] as const){
  const f=await fixture(phase),observe=()=>phase==='FUND'?observeEscrowFunding(f.pool,f.keys,f.base,f.id,hash,true):observeEscrowCommit(f.pool,f.keys,f.base,f.id,true);
  f.state.tx.blockHash=tipHash;await assert.rejects(observe(),/RECEIPT_IDENTITY_MISMATCH/);f.state.tx.blockHash=blockHash;
  f.state.tx.hash=tipHash;await assert.rejects(observe(),/RECEIPT_IDENTITY_MISMATCH/);f.state.tx.hash=hash;
  f.state.tx.input='0x00';await assert.rejects(observe(),/MISMATCH/);
  const g=await fixture(phase);g.state.canonicalTip=blockHash;await assert.rejects(phase==='FUND'?observeEscrowFunding(g.pool,g.keys,g.base,g.id,hash,true):observeEscrowCommit(g.pool,g.keys,g.base,g.id,true),/BASE_REORG/);assert.equal(g.state.observed.length,0);
 }
});
