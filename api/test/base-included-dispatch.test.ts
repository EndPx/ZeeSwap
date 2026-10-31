import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {encodeAbiParameters,encodeEventTopics,type Hex} from 'viem';import {privateKeyToAccount} from 'viem/accounts';
import {BaseContract,settlementAbi,payoutTypedData,payoutCall,type BaseRegistry,type PayoutTerms} from '../src/base-contract.ts';
import {PrivateData} from '../src/private-data.ts';import {reconcileBaseReceipts,inclusionContext} from '../src/base-settlement.ts';
const operator=privateKeyToAccount('0x'+'11'.repeat(32) as Hex),address='0x'+'22'.repeat(20) as Hex,recipient='0x'+'33'.repeat(20) as Hex,hash='0x'+'44'.repeat(32) as Hex,blockHash='0x'+'55'.repeat(32) as Hex;
const registry={chainId:84532,rpcUrl:'http://127.0.0.1:1',operator:operator.address,deployer:operator.address,contracts:{ZeeSwapSettlement:{address},MockUSDC:{address:'0x'+'66'.repeat(20)}}} as BaseRegistry;
const terms:PayoutTerms={id:'0x'+'77'.repeat(32) as Hex,token:registry.contracts.MockUSDC.address,recipient,amount:'100000',nonce:'17',deadline:'2000000000'};
async function chain(phase:'RESERVE'|'PAY'='RESERVE'){
 const base=new BaseContract(registry,true),signature=await operator.signTypedData(payoutTypedData(registry,terms));
 const receipt:any={status:'success',transactionHash:hash,blockNumber:101n,blockHash,gasUsed:100n,effectiveGasPrice:2n,logs:[{address,data:encodeAbiParameters([{type:'uint256'}],[100000n]),topics:encodeEventTopics({abi:settlementAbi,eventName:phase==='RESERVE'?'PayoutReserved':'Paid',args:{id:terms.id,recipient}})}]};
 const tx:any={hash,blockNumber:101n,blockHash,from:operator.address,to:address,value:0n,input:payoutCall(registry,terms,signature,phase)};
 const state={canonical:blockHash,receipt,tx,finalized:100n};
 Object.assign(base.client,{getTransactionReceipt:async()=>{if(!state.receipt)throw Object.assign(Error('missing'),{name:'TransactionReceiptNotFoundError'});return state.receipt;},getTransaction:async()=>state.tx,getBlock:async()=>({hash:state.canonical,timestamp:1700000000n})});
 base.heads=async()=>({latest:{number:102n},finalized:{number:state.finalized}} as any);
 return {base,state};
}
test('canonical L2 inclusion is usable before finality; finalized receipt stays null until actual finality',async()=>{
 const {base,state}=await chain();const included=await base.includedReceipt(hash,'RESERVE',terms);assert.equal(included?.fee,'200');assert.equal(included?.blockNumber,101);
 assert.equal(await base.receipt(hash,'RESERVE',terms),null);state.finalized=101n;assert.deepEqual(await base.receipt(hash,'RESERVE',terms),included);
});
test('included observation rejects wrong event, calldata, operator, receipt identity and reorg',async()=>{
 const {base,state}=await chain();state.canonical='0x'+'88'.repeat(32) as Hex;await assert.rejects(base.includedReceipt(hash,'RESERVE',terms),/BASE_REORG/);state.canonical=blockHash;
 state.tx.from=recipient;await assert.rejects(base.includedReceipt(hash,'RESERVE',terms),/BASE_RECEIPT_MISMATCH/);state.tx.from=operator.address;
 state.tx.hash='0x'+'99'.repeat(32);await assert.rejects(base.includedReceipt(hash,'RESERVE',terms),/BASE_RECEIPT_MISMATCH/);state.tx.hash=hash;
 state.tx.input=payoutCall(registry,terms,'0x','PAY');await assert.rejects(base.includedReceipt(hash,'RESERVE',terms),/BASE_RECEIPT_CALLDATA_MISMATCH/);
 const pay=await chain('PAY');await assert.rejects(pay.base.includedReceipt(hash,'PAY',{...terms,amount:'100001'}),/BASE_RECEIPT_MISMATCH/);
 pay.state.receipt.status='reverted';await assert.rejects(pay.base.includedReceipt(hash,'PAY',terms),/BASE_TRANSACTION_REVERTED/);
});
test('reconciliation persists inclusion separately and does not invoke final accounting before finalized',async()=>{
 const {base}=await chain(),keys=new PrivateData(randomBytes(32),randomBytes(32)),id='fixture-order';let saved:any;
 const row={order_id:id,phase:'RESERVE',terms_payload:keys.seal(terms,`base-terms:${id}:v1`),signed_payload:keys.seal({hash},`base-signed:${id}:RESERVE:v1`)};
 const pool:any={query:async(sql:string,args:any[])=>{
  if(sql.includes('JOIN zee.base_bindings'))return {rows:[row]};
  if(sql.startsWith('SELECT * FROM zee.base_inclusions'))return {rows:[]};
  if(sql.startsWith('SELECT zee.observe_base_inclusion')){saved=args;return {rows:[]};}
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('lock_observer_cycle')||sql.startsWith('INSERT INTO zee.chain_observations'))return {rows:[]};
  if(sql.startsWith('SELECT epoch::text'))return {rows:[{epoch:'1'}]};
  if(sql.startsWith('SELECT block_hash FROM zee.chain_observations'))return {rows:[]};
  throw Error('unexpected accounting call '+sql);
 }};
 pool.connect=async()=>({...pool,release:()=>{}});
 assert.deepEqual(await reconcileBaseReceipts(pool,keys,base,undefined,true),{checked:1,finalized:0});assert.equal(saved[1],'RESERVE');
 const persisted=keys.open(saved[6],inclusionContext(id,'RESERVE')) as any;assert.equal(persisted.hash,hash);assert.equal(persisted.blockHash,blockHash);
});
test('missing or changed prior included receipt durably invalidates; read timeout does not mutate evidence',async()=>{
 const {base,state}=await chain(),keys=new PrivateData(randomBytes(32),randomBytes(32)),id='fixture-order';let invalidated=0;
 const row={order_id:id,phase:'RESERVE',terms_payload:keys.seal(terms,`base-terms:${id}:v1`),signed_payload:keys.seal({hash},`base-signed:${id}:RESERVE:v1`)};
 const pool:any={query:async(sql:string)=>{
  if(sql.includes('JOIN zee.base_bindings'))return {rows:[row]};
  if(sql.startsWith('SELECT * FROM zee.base_inclusions'))return {rows:[{valid:true,block_height:'101',block_hash:blockHash.slice(2),fee:'200'}]};
  if(sql.startsWith('SELECT zee.invalidate_base_inclusion')){invalidated++;return {rows:[]};}
  throw Error('unexpected '+sql);
 }};
 state.receipt=null;await assert.rejects(reconcileBaseReceipts(pool,keys,base,undefined,true),/BASE_INCLUDED_RECEIPT_CHANGED/);assert.equal(invalidated,1);
 base.includedReceipt=async()=>{throw Error('RPC timeout');};await assert.rejects(reconcileBaseReceipts(pool,keys,base,undefined,true),/RPC timeout/);assert.equal(invalidated,1);
});

test('fast dispatcher advances an included unconfirmed reserve to PAY and retries only identical signed bytes',async()=>{
 const {dispatchBaseOnce}=await import('../src/base-settlement.ts');
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),id='00000000-0000-4000-8000-000000000001';
 const {publicSettlementId,authNonce}=await import('../src/base-contract.ts');
 const settlement='00000000-0000-4000-8000-000000000002',payout={...terms,id:publicSettlementId(settlement),nonce:authNonce(publicSettlementId(settlement),'Payout')};
 const reserveReceipt={hash,blockNumber:101,blockHash,phase:'RESERVE',id:payout.id,recipient,amount:'100000',fee:'200'};
 const attempts:any[]=[{phase:'RESERVE',confirmed:false,signed_payload:keys.seal({hash},`base-signed:${id}:RESERVE:v1`)}];
 let preparations=0,stores=0,confirmations=0;const broadcasts:Hex[]=[];
 const quote={id,execution_mode:'base-settlement-v1',base_contract:address,output_amount:'100000',settlement_id:settlement,private_payload:keys.seal({executionMode:'base-settlement-v1',baseContract:address,outputAmount:'100000',recipient},`quote:${id}:v1`)};
 const pool:any={query:async(sql:string,args:any[])=>{
  if(sql.includes('JOIN zee.base_bindings'))return {rows:[]};
  if(sql.includes('zee.claim_base_job'))return {rows:[{id:'job',operation_id:'operation',fence:'1'}]};
  if(sql.includes('op.id AS operation_id'))return {rows:[quote]};
  if(sql.includes('zee.pin_base_terms'))return {rows:[{payload:keys.seal(payout,`base-terms:${id}:v1`)}]};
  if(sql==='SELECT * FROM zee.base_attempts WHERE order_id=$1')return {rows:attempts};
  if(sql.startsWith('SELECT * FROM zee.base_inclusions'))return {rows:[]};
  if(sql.startsWith('SELECT zee.store_base_attempt')){stores++;assert.equal(args[4],'PAY');attempts.push({phase:'PAY',confirmed:false,signed_payload:args[6]});return {rows:[]};}
  if(sql.includes('confirm_base_attempt')){confirmations++;throw Error('must not confirm inclusion');}
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('lock_observer_cycle')||sql.startsWith('INSERT INTO zee.chain_observations')||sql.includes('zee.observe_base_inclusion')||sql.includes('zee.check_base_dispatch'))return {rows:[]};
  if(sql.startsWith('SELECT epoch::text'))return {rows:[{epoch:'1'}]};
  if(sql.startsWith('SELECT block_hash FROM zee.chain_observations'))return {rows:[]};
  throw Error('unexpected '+sql);
 }};pool.connect=async()=>({...pool,release:()=>{}});
 const base:any={registry,preflight:async()=>{},assertSignature:async()=>{},state:async()=>1,
  receipt:async()=>null,includedReceipt:async(h:Hex,phase:string)=>phase==='RESERVE'?reserveReceipt:null,
  client:{getBlock:async()=>({hash:blockHash,timestamp:1700000000n}),getTransaction:async()=>null,getTransactionCount:async()=>0,
   sendRawTransaction:async({serializedTransaction}:{serializedTransaction:Hex})=>{broadcasts.push(serializedTransaction);return (await import('viem')).keccak256(serializedTransaction);}}};
 const signer={authorize:(q:PayoutTerms)=>operator.signTypedData(payoutTypedData(registry,q)),prepare:async(q:PayoutTerms,phase:'RESERVE'|'PAY')=>{
  preparations++;assert.equal(phase,'PAY');const signature=await operator.signTypedData(payoutTypedData(registry,q));
  const raw=await operator.signTransaction({chainId:84532,type:'legacy',to:address,data:payoutCall(registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce:0,value:0n});
  return {raw,hash:(await import('viem')).keccak256(raw),nonce:0,maxCost:'10000000000000'};
 }};
 assert.deepEqual(await dispatchBaseOnce(pool,keys,base,signer,undefined,id,true),{status:'AWAITING_BASE_FINALITY',phase:'PAY'});
 assert.deepEqual(await dispatchBaseOnce(pool,keys,base,signer,undefined,id,true),{status:'AWAITING_BASE_FINALITY',phase:'PAY'});
 assert.equal(preparations,1);assert.equal(stores,1);assert.equal(confirmations,0);assert.equal(broadcasts.length,2);assert.equal(broadcasts[0],broadcasts[1]);assert.equal(attempts[0].confirmed,false);
});
