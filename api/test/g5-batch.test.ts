import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createWalletClient,http,keccak256,encodeFunctionData,parseEther,type Hex,type Address} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {baseSepolia} from 'viem/chains';
import {connect} from '../src/db.ts';
import {requireDevelopment} from '../scripts/config.ts';
import {runtime} from '../scripts/runtime.ts';
import {BaseContract,payoutTypedData,payoutCall,type BaseRegistry} from '../src/base-contract.ts';
import {Repository} from '../src/repository.ts';
import {ingestSnapshot} from '../src/observer.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import {authorizeEscrow,fundingCall,fundingTypedData,observeEscrowFunding,storeEscrowCommit,observeEscrowCommit} from '../src/base-escrow.ts';
import {storeReversePayout,observeReversePayout,storeEscrowSettlement,observeEscrowSettlement,type ReverseZcashVerifier,type PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import {requireG5NonceReady} from '../src/g5-nonce.ts';
import type {BaseSigner,PreparedBaseTransaction} from '../src/base-signer.ts';
const target=requireDevelopment();
if(target.branchId!=='br-wispy-dawn-aorsbba5'||!/^\/zee_test_[0-9a-f]{32}$/.test(new URL(target.adminUrl).pathname))throw Error('Disposable synthetic database required');
const r=await runtime(true),admin=connect(target.adminUrl),worker=connect(r.workerUrl),api=connect(r.apiUrl),repo=new Repository(api,r.keys);
const rpc='http://127.0.0.1:18745',wallet=createWalletClient({chain:baseSepolia,transport:http(rpc)}),operator=privateKeyToAccount(generatePrivateKey());
const token=JSON.parse(readFileSync(new URL('../../contracts/out/MockUSDC.sol/MockUSDC.json',import.meta.url),'utf8'));
const settlement=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapSettlement.sol/ZeeSwapSettlement.json',import.meta.url),'utf8'));
let base:BaseContract,registry:BaseRegistry,deployer:Address,payer:Address;
const orders:{id:string;direction:string;funding?:any;hash?:Hex}[]=[],signed=new Map<string,PreparedBaseTransaction>();
let preparations=0;
async function fresh(){
 const h=await base.heads();
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1100,$1,1091,clock_timestamp(),clock_timestamp()) ON CONFLICT(network) DO UPDATE SET observed_at=clock_timestamp()`,['a'.repeat(64)]);
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp()) ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,[String(h.latest.number),h.latest.hash!.slice(2),String(h.finalized.number),new Date(Number(h.finalized.timestamp)*1000)]);
}
async function finalized(hash?:Hex){
 if(hash){const receipt=await base.client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');}
 await base.client.request({method:'anvil_mine' as any,params:['0x40'] as any});
 for(let i=0;i<60;i++){if(!hash||(await base.heads()).finalized.number>=(await base.client.getTransactionReceipt({hash})).blockNumber){await fresh();return;}await delay(100);}
 throw Error('Canonical Anvil finality timeout');
}
async function tx(data:Hex,address:Address=registry.contracts.ZeeSwapSettlement.address,account:Address=deployer){
 const hash=await wallet.sendTransaction({account,to:address,data});await base.client.waitForTransactionReceipt({hash});return hash;
}
const signer:BaseSigner={authorize:q=>operator.signTypedData(payoutTypedData(registry,q)),async prepare(q,phase){
 const key=q.id+phase,old=signed.get(key);if(old)return old;
 const signature=await this.authorize(q),nonce=await base.client.getTransactionCount({address:operator.address,blockTag:'pending'});
 const raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,data:payoutCall(registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce,value:0n});
 const result={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};signed.set(key,result);preparations++;return result;
}};
before(async()=>{
 [deployer,payer]=await wallet.getAddresses();
 base=new BaseContract({chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{} as any},true);
 await wallet.sendTransaction({account:deployer,to:operator.address,value:parseEther('1')});
 const th=await wallet.deployContract({account:deployer,abi:token.abi,bytecode:token.bytecode.object,args:[deployer,deployer]}),tr=await base.client.waitForTransactionReceipt({hash:th});
 const sh=await wallet.deployContract({account:deployer,abi:settlement.abi,bytecode:settlement.bytecode.object,args:[tr.contractAddress!,deployer,operator.address,operator.address]}),sr=await base.client.waitForTransactionReceipt({hash:sh});
 const deployed=async(receipt:typeof tr)=>({address:receipt.contractAddress!,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,runtimeCodeHash:keccak256((await base.client.getCode({address:receipt.contractAddress!}))!)});
 registry={chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{MockUSDC:await deployed(tr),ZeeSwapSettlement:await deployed(sr)}};base=new BaseContract(registry,true);
 await tx(encodeFunctionData({abi:token.abi,functionName:'mint',args:[deployer,10000000n]}),tr.contractAddress!);
 await tx(encodeFunctionData({abi:token.abi,functionName:'approve',args:[sr.contractAddress!,1000000n]}),tr.contractAddress!);
 await tx(encodeFunctionData({abi:settlement.abi,functionName:'depositInventory',args:[1000000n]}));
 await tx(encodeFunctionData({abi:token.abi,functionName:'mint',args:[payer,200000n]}),tr.contractAddress!);
 await tx(encodeFunctionData({abi:token.abi,functionName:'approve',args:[sr.contractAddress!,200000n]}),tr.contractAddress!,payer);
 await finalized();
 await admin.query("UPDATE zee.assets SET contract_address=$1 WHERE id='mockUSDC'",[tr.contractAddress]);
 await admin.query("INSERT INTO zee.inventory_accounts(asset,purpose,balance) VALUES('mockUSDC','principal',1000000),('TAZ','principal',1000000),('TAZ','fee',130000),('baseETH','fee',300000000000000)");
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
});
after(async()=>{await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false').catch(()=>{});await Promise.all([admin.end(),worker.end(),api.end()]);});
test('five alternating quotes obey max-five admission and form independent real Anvil source escrows',{timeout:90000},async()=>{
 for(let i=0;i<5;i++){
  await fresh();const direction=i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE',owner=randomBytes(32).toString('base64url');
  const q=await repo.issueQuote({direction,inputAmount:'100000',recipient:i%2?'fixture:shielded-'+i:payer,refundRecipient:i%2?payer:'fixture:refund-'+i,payer:i%2?payer:undefined,
   depositReceiver:'fixture:deposit-'+i,payoutFee:i%2?'10000':'50000000000000',refundFee:i%2?'50000000000000':'10000',executionMode:i%2?'base-escrow-v1':'base-settlement-v1',baseContract:registry.contracts.ZeeSwapSettlement.address},owner);
  await repo.accept(q.id,owner);const o:{id:string;direction:string;funding?:any;hash?:Hex}={id:q.id,direction};orders.push(o);
  if(i%2){o.funding=await authorizeEscrow(worker,r.keys,base,q.id,t=>operator.signTypedData(fundingTypedData(base,t)));o.hash=await tx(fundingCall(base,o.funding.terms,o.funding.signature),registry.contracts.ZeeSwapSettlement.address,payer);}
  else{await ingestSnapshot(worker,r.keys,{schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date().toISOString(),scannedHeight:1100,tipHash:'a'.repeat(64),
   blocks:[{height:1100,hash:'a'.repeat(64),time:new Date().toISOString()},{height:1091,hash:'b'.repeat(64),time:new Date(0).toISOString()}],
   outputs:[{txid:String(i+1).repeat(64),pool:'ironwood',index:0,amount:'100000',receiver:'fixture:deposit-'+i,memo:q.memo,height:1091,blockHash:'b'.repeat(64),blockTime:new Date(0).toISOString(),shieldedSource:true}]});}
 }
 const sixthOwner='sixth',sixth=await repo.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:payer,refundRecipient:'fixture:refund-six',depositReceiver:'fixture:six',payoutFee:'50000000000000',refundFee:'10000',executionMode:'base-settlement-v1',baseContract:registry.contracts.ZeeSwapSettlement.address},sixthOwner);
 await assert.rejects(()=>repo.accept(sixth.id,sixthOwner),/unresolved order capacity/);
 await finalized(orders[3].hash);for(const o of orders.filter(o=>o.hash))assert.equal((await observeEscrowFunding(worker,r.keys,base,o.id,o.hash!)).status,'READY');
 assert.equal((await admin.query("SELECT count(*) AS n FROM zee.orders WHERE state='READY'")).rows[0].n,'5');
});
test('targeted claims never steal an earlier order and retain pause, direction and stale-fence protection',async()=>{
 await fresh();const owner=randomUUID(),r4=(await worker.query('SELECT * FROM zee.claim_escrow_job_for_order($1,$2)',[owner,orders[3].id])).rows[0];assert.ok(r4);
 const r4op=(await worker.query('SELECT order_id FROM zee.operations WHERE id=$1',[r4.operation_id])).rows[0];assert.equal(r4op.order_id,orders[3].id);
 assert.equal((await worker.query("SELECT status FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=$1",[orders[1].id])).rows[0].status,'QUEUED');
 assert.equal((await worker.query('SELECT * FROM zee.claim_base_job_for_order($1,$2)',[owner,orders[3].id])).rowCount,0);
 assert.equal((await worker.query('SELECT * FROM zee.claim_escrow_job_for_order($1,$2)',[owner,orders[2].id])).rowCount,0);
 await admin.query('UPDATE zee.runtime_control SET dispatch_enabled=false');assert.equal((await worker.query('SELECT * FROM zee.claim_base_job_for_order($1,$2)',[owner,orders[2].id])).rowCount,0);
 await admin.query('UPDATE zee.runtime_control SET dispatch_enabled=true');
 await admin.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[r4.id]);
 const newer=(await worker.query('SELECT * FROM zee.claim_escrow_job_for_order($1,$2)',[randomUUID(),orders[3].id])).rows[0];assert.ok(BigInt(newer.fence)>BigInt(r4.fence));
 await assert.rejects(()=>worker.query('SELECT zee.check_escrow_dispatch($1,$2,$3,$4)',[orders[3].id,r4.id,owner,r4.fence]),/stale lease/);
 await admin.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");
});
test('five-order targeted execution settles exactly once with serialized real Anvil nonces and balanced ledgers',{timeout:120000},async()=>{
 for(const o of [...orders].reverse()){
  await fresh();
  if(o.direction==='ZCASH_TO_BASE'){
   const before=preparations;
   await dispatchBaseOnce(worker,r.keys,base,signer,fresh,o.id);const a=(await worker.query("SELECT signed_payload FROM zee.base_attempts WHERE order_id=$1 AND phase='RESERVE'",[o.id])).rows[0];
   const s=r.keys.open(a.signed_payload,`base-signed:${o.id}:RESERVE:v1`) as any;await finalized(s.hash);
   await admin.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");
   await dispatchBaseOnce(worker,r.keys,base,signer,fresh,o.id);const p=(await worker.query("SELECT signed_payload FROM zee.base_attempts WHERE order_id=$1 AND phase='PAY'",[o.id])).rows[0];
   const pay=r.keys.open(p.signed_payload,`base-signed:${o.id}:PAY:v1`) as any;await finalized(pay.hash);await reconcileBaseReceipts(worker,r.keys,base);await reconcileBaseReceipts(worker,r.keys,base);assert.equal(preparations,before+2);
  }else{
   const owner=randomUUID(),job=(await worker.query('SELECT * FROM zee.claim_escrow_job_for_order($1,$2)',[owner,o.id])).rows[0];assert.ok(job);
   const sign=async(method:'commitPayout'|'settleEscrow')=>{const nonce=await base.client.getTransactionCount({address:operator.address,blockTag:'pending'}),raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,data:encodeFunctionData({abi:settlement.abi,functionName:method,args:[o.funding.terms.id]}),gas:450000n,gasPrice:1000000n,nonce,value:0n});return {raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};};
   const commit=await sign('commitPayout');await storeEscrowCommit(worker,r.keys,base,o.id,job.id,owner,job.fence,commit);
   await assert.rejects(()=>requireG5NonceReady(worker,r.keys,base,orders[0].id,'RESERVE'),/PREVIOUS_OPERATOR_NONCE/);
   await base.client.sendRawTransaction({serializedTransaction:commit.raw});await finalized(commit.hash);await observeEscrowCommit(worker,r.keys,base,o.id);
   const p:PreparedZcashTransaction={operationId:o.id,recipient:'fixture:shielded-'+orders.indexOf(o),amount:'100000',fee:'10000',feeZatoshi:'10000',txid:orders.indexOf(o).toString().repeat(64),rawTransaction:'aa',expiryHeight:'9999999',selectedNotes:[{pool:'ironwood',txid:'d'.repeat(64),index:orders.indexOf(o),value:'110000'}],outputs:[{recipient:'fixture:shielded-'+orders.indexOf(o),amount:'100000',ownChange:false,index:0}]};
   const verifier:ReverseZcashVerifier={async verifyPrepared(){},async receipt(){return {txid:p.txid,blockHeight:1091,blockHash:'b'.repeat(64),tipHeight:1100,tipHash:'a'.repeat(64),observedAt:new Date().toISOString(),amountZatoshi:'100000',feeZatoshi:'10000',recipient:p.recipient,shielded:true,pool:'ironwood'};}};
   await storeReversePayout(worker,r.keys,o.id,job.id,owner,job.fence,p,verifier);await observeReversePayout(worker,r.keys,o.id,verifier);
   const settle=await sign('settleEscrow');await storeEscrowSettlement(worker,r.keys,base,o.id,job.id,owner,job.fence,settle);await base.client.sendRawTransaction({serializedTransaction:settle.raw});await finalized(settle.hash);await observeEscrowSettlement(worker,r.keys,base,o.id);await observeEscrowSettlement(worker,r.keys,base,o.id);
  }
  assert.equal((await worker.query('SELECT state FROM zee.orders WHERE id=$1',[o.id])).rows[0].state,'SETTLED');
 }
 assert.equal((await worker.query("SELECT count(*) AS n FROM zee.orders WHERE state='SETTLED'")).rows[0].n,'5');
 assert.equal((await worker.query('SELECT count(*) AS n FROM zee.reservations WHERE released_at IS NULL')).rows[0].n,'0');
 assert.equal((await worker.query("SELECT count(*) AS n FROM zee.obligations WHERE state<>'DISCHARGED'")).rows[0].n,'0');
 assert.equal((await worker.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rowCount,0);
 assert.equal((await worker.query('SELECT count(*) AS n FROM zee.base_attempts')).rows[0].n,'6');
 assert.equal((await worker.query('SELECT count(*) AS n FROM zee.reverse_payouts')).rows[0].n,'2');
 assert.equal(await base.client.readContract({address:registry.contracts.ZeeSwapSettlement.address,abi:settlement.abi,functionName:'inventory'}),900000n);
});
