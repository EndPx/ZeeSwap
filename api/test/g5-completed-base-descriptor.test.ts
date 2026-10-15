import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {encodeAbiParameters,encodeEventTopics,keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {PrivateData} from '../src/private-data.ts';
import {loadBaseRegistry,publicSettlementId,authNonce,settlementAbi} from '../src/base-contract.ts';
import {fundingTypedData,fundingCall} from '../src/base-escrow.ts';
import {depositIdentity,type DepositInput} from '../src/repository.ts';
import {bindG5CompletedBaseOriginal,loadG5CompletedBaseDescriptor} from '../scripts/g5-completed-base-descriptor.ts';

async function fixture(reverse:boolean){
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),orderId=randomUUID(),settlement=randomUUID(),payer=privateKeyToAccount(('0x'+'22'.repeat(32)) as Hex),operator=privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex);
 const registry={...loadBaseRegistry(),operator:operator.address},manifest='D:/synthetic/g5.json',slot={orderId,sequence:reverse?2:1,direction:reverse?'BASE_TO_ZCASH':'ZCASH_TO_BASE',owner:'synthetic-owner'};
 const terms={id:publicSettlementId(settlement),token:registry.contracts.MockUSDC.address,payer:payer.address,refundRecipient:payer.address,amount:'100000',nonce:authNonce(publicSettlementId(settlement),'Funding'),fundingCutoff:'2000000000',cancellationAvailableAt:'2000005000'};
 const sig=await operator.signTypedData(fundingTypedData({registry} as any,terms)),funding={terms,signature:sig,to:registry.contracts.ZeeSwapSettlement.address,data:fundingCall({registry} as any,terms,sig),value:'0'};
 const raw=await payer.signTransaction({type:'legacy',chainId:84532,nonce:7,to:funding.to,data:funding.data,value:0n,gas:450000n,gasPrice:20000000n}),hash=keccak256(raw);
 const approved={version:1,branchId:'synthetic-branch',sequence:2,orderId,funding},journal={approved,raw,hash,nonce:7,maxCost:'10000000000000'};
 const config:any={sequence:2,runConfig:manifest,stateFile:'synthetic-state',payer:payer.address,fundingTransactionHash:hash,baseSignerPrivateConfig:'//wsl.localhost/Ubuntu/home/albary/zeeswap-g5-retry/order-02/reverse-base-signer.json'};
 const saved={orderId,owner:slot.owner,funding},identityInput={network:'base-sepolia',txid:hash.slice(2),index:3,emitter:registry.contracts.ZeeSwapSettlement.address,reference:randomUUID(),receiver:`escrow:${terms.id}`,amount:'100000',height:70,blockHash:'ab'.repeat(32),blockTime:new Date(),shielded:false} as DepositInput;
 const identity=depositIdentity(identityInput),deposit={id:randomUUID(),order_id:orderId,network:'base-sepolia',classification:'EXACT',confirmed_at:new Date(),amount:'100000',block_height:'70',block_hash:identityInput.blockHash,
  identity_hash:keys.lookup('deposit',identity),private_payload:keys.seal(identityInput,`deposit:${identity}:v1`),receiver_hash:keys.lookup('receiver',identityInput.receiver),reference_hash:keys.lookup('reference',identityInput.reference)};
 const rows:any[]=[];for(const phase of reverse?['COMMIT','SETTLE']:['RESERVE','PAY']){
  const context=reverse?`${phase==='COMMIT'?'escrow-commit':'escrow-settle'}:${orderId}:v1`:`base-signed:${orderId}:${phase}:v1`;
  rows.push({order_id:orderId,phase,confirmed:true,receipt_payload:Buffer.from('synthetic-present'),signed_payload:keys.seal({raw,hash,nonce:phase==='COMMIT'||phase==='RESERVE'?8:9,maxCost:journal.maxCost},context),tx_hash:keys.lookup('base-tx',hash),max_cost:journal.maxCost,block_height:phase==='COMMIT'||phase==='RESERVE'?'80':'100',block_hash:'cd'.repeat(32),actual_fee:'1000'});
 }
 const calls:string[]=[],reads:string[]=[],quote={id:orderId,direction:'BASE_TO_ZCASH',execution_mode:'base-escrow-v1',base_contract:registry.contracts.ZeeSwapSettlement.address,settlement_id:settlement,input_amount:'100000',output_amount:'100000',funding_cutoff_time:new Date(2000000000000),cancellation_available_at:new Date(2000005000000),
  private_payload:keys.seal({executionMode:'base-escrow-v1',baseContract:registry.contracts.ZeeSwapSettlement.address,inputAmount:'100000',outputAmount:'100000',payer:payer.address,refundRecipient:payer.address,depositReceiver:`escrow:${terms.id}`},`quote:${orderId}:v1`)};
 const receipt={logs:[{address:registry.contracts.ZeeSwapSettlement.address,topics:encodeEventTopics({abi:settlementAbi,eventName:'Funded',args:{id:terms.id,payer:payer.address}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[100000n,2000005000n]),logIndex:3}]};
 const c:any={config:{branchId:'synthetic-branch',reverseOrders:[{sequence:2,configFile:'synthetic-config'}]},r:{keys},base:{registry,client:{async getTransactionReceipt(){return receipt;}}},worker:{async query(sql:string){calls.push(sql);assert.match(sql,/^SELECT /);
  if(sql.startsWith('SELECT state,primary_deposit'))return {rows:[{state:'SETTLED',primary_deposit:deposit.id}]};
  if(sql.includes('FROM zee.quotes q'))return {rows:[quote]};
  if(sql.includes('FROM zee.base_bindings'))return {rows:[{terms_payload:keys.seal({id:terms.id,amount:'100000'},`base-terms:${orderId}:v1`)}]};
  if(sql.includes('FROM zee.escrow_bindings'))return {rows:[{terms_payload:keys.seal({terms,signature:sig},`escrow-terms:${orderId}:v1`)}]};
  if(sql.includes('FROM zee.base_attempts'))return {rows};
  if(sql.includes('FROM zee.escrow_commits'))return {rows:[rows[0]]};
  if(sql.includes('FROM zee.escrow_settlements'))return {rows:[rows[1]]};
  if(sql.includes('FROM zee.deposits'))return {rows:[deposit]};throw Error('unexpected synthetic query');}}};
 const read=async(path:string)=>{reads.push(path);if(path==='synthetic-config')return config;if(path==='synthetic-state')return saved;if(path.startsWith('//wsl.localhost/Ubuntu/home/albary/zeeswap-g5/refunds/payer-journal/'))return journal;throw Error('unexpected synthetic path');};
 return {keys,c,slot,read,manifest,rows,deposit,config,saved,journal,receipt,reads,calls};
}

test('production descriptor reads actual protected row/AAD shapes for both completed directions',async()=>{
 for(const reverse of [false,true]){const f=await fixture(reverse),result=await loadG5CompletedBaseDescriptor(f.c,f.slot,f.read,f.manifest);
  assert.equal(result.state,'SETTLED');assert.equal(result.originals.length,2);assert.equal(result.direction,f.slot.direction);
  if(result.direction==='BASE_TO_ZCASH'){assert.equal(result.sourceFund.eventIndex,3);assert.equal(result.sourceFund.signed.hash,f.journal.hash);assert.match(f.reads[2],/^\/\/wsl.localhost\/Ubuntu\//);}else assert.deepEqual(f.reads,[]);
  assert.ok(f.calls.every(sql=>sql.startsWith('SELECT ')));
 }
});

test('row hash, cap, confirmation, order and encrypted AAD are binding before any lag assessment',async()=>{
 for(const mutate of [
  (f:any)=>{f.rows[0].tx_hash=Buffer.alloc(32);},(f:any)=>{f.rows[0].max_cost='1';},(f:any)=>{f.rows[0].confirmed=false;},(f:any)=>{f.rows[0].order_id=randomUUID();},(f:any)=>{f.rows[0].signed_payload=f.rows[1].signed_payload;},
 ]){const f=await fixture(false);mutate(f);await assert.rejects(()=>loadG5CompletedBaseDescriptor(f.c,f.slot,f.read,f.manifest),/G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED/);}
 const f=await fixture(false);assert.throws(()=>bindG5CompletedBaseOriginal(f.keys,f.rows[0],f.slot.orderId,'PAY',`base-signed:${f.slot.orderId}:RESERVE:v1`),/G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED/);
});

test('reverse original source identity, private approvals, run and correct Base WSL anchor remain mandatory',async()=>{
 for(const mutate of [
  (f:any)=>{f.deposit.identity_hash=Buffer.alloc(32);},(f:any)=>{f.receipt.logs[0].logIndex=4;},(f:any)=>{f.deposit.receiver_hash=Buffer.alloc(32);},
  (f:any)=>{f.config.baseSignerPrivateConfig=f.config.baseSignerPrivateConfig.replace('/Ubuntu/','/Ubuntu-24.04/');},
  (f:any)=>{f.config.runConfig='D:/synthetic/other.json';},(f:any)=>{f.saved.owner='other';},(f:any)=>{f.journal.approved={...f.journal.approved,sequence:4};},
  (f:any)=>{f.config.branchId='wrong-present-branch';},
  (f:any)=>{f.config.fundingTransactionHash='0x'+'ff'.repeat(32);},(f:any)=>{f.deposit.confirmed_at=null;},
 ]){const f=await fixture(true);mutate(f);await assert.rejects(()=>loadG5CompletedBaseDescriptor(f.c,f.slot,f.read,f.manifest),/G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED/);}
});

test('descriptor provider errors are reduced to one fixed static error and never typed WAIT',async()=>{
 const f=await fixture(true);f.c.base.client.getTransactionReceipt=async()=>{throw Error('G5_COMPLETED_BASE_SECRET_TOKEN');};
 await assert.rejects(()=>loadG5CompletedBaseDescriptor(f.c,f.slot,f.read,f.manifest),error=>{assert.equal((error as Error).message,'G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED');return true;});
});
