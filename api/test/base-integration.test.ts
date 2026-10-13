import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { createWalletClient,http,keccak256,parseEther,encodeFunctionData,type Address } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { connect } from '../src/db.ts';
import { requireDevelopment } from '../scripts/config.ts';
import { runtime } from '../scripts/runtime.ts';
import { BaseContract,payoutTypedData,payoutCall,type BaseRegistry,type PayoutTerms } from '../src/base-contract.ts';
import { validatePrepared,type BaseSigner,type PreparedBaseTransaction } from '../src/base-signer.ts';
import { dispatchBaseOnce,reconcileBaseReceipts } from '../src/base-settlement.ts';
import { ingestSnapshot } from '../src/observer.ts';
import { createApi } from '../src/http-api.ts';
import { Repository } from '../src/repository.ts';

const settings=requireDevelopment();
if(settings.branchId!=='br-wispy-dawn-aorsbba5')throw Error('Dedicated settlement fixture branch required');
const r=await runtime(true),admin=connect(settings.adminUrl),worker=connect(r.workerUrl),api=connect(r.apiUrl);
const rpc='http://127.0.0.1:18745';
const operator=privateKeyToAccount(generatePrivateKey());
const wallet=createWalletClient({chain:baseSepolia,transport:http(rpc)});
const tokenArtifact=JSON.parse(readFileSync(new URL('../../contracts/out/MockUSDC.sol/MockUSDC.json',import.meta.url),'utf8'));
const settlementArtifact=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapSettlement.sol/ZeeSwapSettlement.json',import.meta.url),'utf8'));
let base:BaseContract,registry:BaseRegistry,deployer:Address,recipient:Address,server:ReturnType<typeof createApi>,origin:string;
let order:any,accepted:any,terms:PayoutTerms,sourceHeight:number;
const owner=randomBytes(32).toString('base64url');
const journal=new Map<string,PreparedBaseTransaction>();let preparations=0;
const signer:BaseSigner={
 authorize:q=>operator.signTypedData(payoutTypedData(registry,q)),
 async prepare(q,phase){
  const id=`${q.id}:${phase}`;const previous=journal.get(id);if(previous)return previous;
  preparations++;
  const signature=await this.authorize(q),nonce=await base.client.getTransactionCount({address:operator.address,blockTag:'pending'});
  const raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,
   data:payoutCall(registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce,value:0n});
  const result={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};journal.set(id,result);return result;
 }
};
async function seedFresh(){
 const h=await base.heads();
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',$1::bigint,$2,$1::bigint-9,clock_timestamp(),clock_timestamp())
 ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$1::bigint-9,finalized_time=clock_timestamp(),observed_at=clock_timestamp()`,[sourceHeight,'a'.repeat(64)]);
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp())
 ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,
 [Number(h.latest.number),h.latest.hash!.slice(2),Number(h.finalized.number),new Date(Number(h.finalized.timestamp)*1000)]);
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
}
async function expireLease(){await admin.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");await seedFresh();}
async function mineFinality(){await base.client.request({method:'anvil_mine' as any,params:['0x40'] as any});}
const request=(path:string,method='GET',body?:unknown,token=owner)=>fetch(origin+path,{method,
 headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});

before(async()=>{
 const accounts=await wallet.getAddresses();[deployer,recipient]=accounts;
 const starter=new BaseContract({chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{} as any},true);
 assert.equal(await starter.client.getChainId(),84532);
 // Only the explicitly loopback Anvil node receives these fixture transactions.
 await wallet.sendTransaction({account:deployer,to:operator.address,value:parseEther('1')});
 const tokenHash=await wallet.deployContract({account:deployer,abi:tokenArtifact.abi,bytecode:tokenArtifact.bytecode.object,args:[deployer,deployer]});
 const t=await starter.client.waitForTransactionReceipt({hash:tokenHash});
 const settlementHash=await wallet.deployContract({account:deployer,abi:settlementArtifact.abi,bytecode:settlementArtifact.bytecode.object,args:[t.contractAddress!,deployer,operator.address,operator.address]});
 const s=await starter.client.waitForTransactionReceipt({hash:settlementHash});
 const deployment=async(receipt:typeof t)=>({address:receipt.contractAddress!,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,
  runtimeCodeHash:keccak256((await starter.client.getCode({address:receipt.contractAddress!}))!)});
 registry={chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{MockUSDC:await deployment(t),ZeeSwapSettlement:await deployment(s)}};
 base=new BaseContract(registry,true);
 for(const data of [encodeFunctionData({abi:tokenArtifact.abi,functionName:'mint',args:[deployer,100000000n]}),
  encodeFunctionData({abi:tokenArtifact.abi,functionName:'approve',args:[s.contractAddress!,100000000n]})])
  await wallet.sendTransaction({account:deployer,to:t.contractAddress!,data});
 await wallet.sendTransaction({account:deployer,to:s.contractAddress!,data:encodeFunctionData({abi:settlementArtifact.abi,functionName:'depositInventory',args:[100000000n]})});
 await mineFinality();
 sourceHeight=Number((await admin.query("SELECT COALESCE(max(scanned_height),1000)::text AS height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0].height)+100;
 await admin.query(`INSERT INTO zee.inventory_accounts SELECT id,p,CASE WHEN id='baseETH' THEN 1000000000000000000 ELSE 1000000000 END,0
  FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)
  ON CONFLICT(asset,purpose) DO UPDATE SET balance=EXCLUDED.balance WHERE zee.inventory_accounts.reserved=0`);
 await seedFresh();
 server=createApi({pool:api,keys:r.keys,integrationOnly:true,base,baseFeeBudget:'100000000000000',wallet:{
  validate:async(address:string)=>{if(!address.startsWith('fixture:'))throw Error('INVALID_ZCASH_RECEIVER');return address;},
  allocate:async()=>`fixture:${randomUUID()}`,snapshot:async()=>{throw Error('no real Zcash wallet in this test');}}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{
 if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
 await admin.query('SELECT zee.enter_reconciliation()');await admin.query('UPDATE zee.inventory_accounts SET balance=0 WHERE reserved=0');
 await Promise.all([admin.end(),worker.end(),api.end()]);
});

test('real contract preflight verifies code, token, roles and finalized deployments on Anvil',async()=>{
 const health=await base.preflight();assert.equal(health.availableInventory,'100000000');
 const wrong=new BaseContract({...registry,contracts:{...registry.contracts,MockUSDC:{...registry.contracts.MockUSDC,runtimeCodeHash:`0x${'00'.repeat(32)}`}}},true);
 await assert.rejects(()=>wrong.preflight(),/BASE_DEPLOYMENT_NOT_READY/);
 assert.throws(()=>new BaseContract(registry),/INVALID_BASE_CONFIG/);
});
test('HTTP acceptance binds new forward order; synthetic shielded input creates a READY operation',async()=>{
 const response=await request('/v1/quotes','POST',{direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient,refundRecipient:'fixture:refund'});
 assert.equal(response.status,201,await response.clone().text());order=await response.json();assert.equal(order.executionMode,'base-settlement-v1');
 const a=await request(`/v1/orders/${order.id}/accept`,'POST',{});assert.equal(a.status,200,await a.clone().text());accepted=await a.json();
 const height=sourceHeight+1;sourceHeight+=10;const time=new Date().toISOString(),hash='a'.repeat(64);
 await ingestSnapshot(worker,r.keys,{schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,
  scannedHeight:sourceHeight,tipHash:hash,blocks:[{height,hash,time},{height:sourceHeight,hash,time}],outputs:[{
   txid:randomBytes(32).toString('hex'),index:0,pool:'ironwood',amount:'100000',receiver:accepted.funding.receiver,
   memo:accepted.funding.memo,height,blockHash:hash,blockTime:time,shieldedSource:true}]});
 assert.equal((await (await request(`/v1/orders/${order.id}`)).json() as any).status,'READY');
});
test('invalid signer bytes are rejected before a persisted attempt or any broadcast',async()=>{
 const nonce=await base.client.getTransactionCount({address:operator.address});
 await assert.rejects(()=>dispatchBaseOnce(worker,r.keys,base,{authorize:signer.authorize,prepare:async()=>({raw:'0x00',hash:'0x00',nonce:0,maxCost:'1'})}));
 assert.equal((await worker.query('SELECT count(*) FROM zee.base_attempts WHERE order_id=$1',[order.id])).rows[0].count,'0');
 assert.equal(await base.client.getTransactionCount({address:operator.address}),nonce);
 const lease=(await worker.query('SELECT j.* FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=$1',[order.id])).rows[0];
 await expireLease();
 await assert.rejects(()=>worker.query('SELECT zee.check_base_dispatch($1,$2,$3,$4)',[order.id,lease.id,lease.lease_owner,lease.fence]),/stale lease/);
});
test('an expired recorded authorization is retained without broadcasting new bytes',async()=>{
 const originalNow=Date.now;const nonce=await base.client.getTransactionCount({address:operator.address});
 try{
  await assert.rejects(()=>dispatchBaseOnce(worker,r.keys,base,{
   authorize:signer.authorize,
   prepare:async(q,phase)=>{const signed=await signer.prepare(q,phase);Date.now=()=>Number(q.deadline)*1000+1000;return signed;}
  }),/BASE_AUTHORIZATION_EXPIRED_RECONCILE/);
 }finally{Date.now=originalNow;}
 assert.equal(await base.client.getTransactionCount({address:operator.address}),nonce);
 assert.equal((await worker.query('SELECT count(*) FROM zee.base_attempts WHERE order_id=$1',[order.id])).rows[0].count,'1');
 await expireLease();
});
test('uncertain broadcast retains signed bytes; next cycle reconciles instead of duplicating reserve',async()=>{
 const send=base.client.sendRawTransaction;
 base.client.sendRawTransaction=async(args)=>{await send(args);throw Error('simulated response loss after submission');};
 try{await assert.rejects(()=>dispatchBaseOnce(worker,r.keys,base,signer),/BASE_BROADCAST_UNCERTAIN/);}
 finally{base.client.sendRawTransaction=send;}
 assert.equal((await worker.query('SELECT count(*) FROM zee.base_attempts WHERE order_id=$1',[order.id])).rows[0].count,'1');
 assert.equal(preparations,1);
 assert.equal((await reconcileBaseReceipts(worker,r.keys,base)).finalized,0);
 assert.equal((await (await request(`/v1/orders/${order.id}`)).json() as any).status,'READY');
 await mineFinality();
 // Restart the observer/service object while retaining the independent signer journal.
 base=new BaseContract(registry,true);await expireLease();
 const result=await dispatchBaseOnce(worker,r.keys,base,signer);assert.equal(result.status,'AWAITING_BASE_FINALITY');assert.equal(result.phase,'PAY');
 assert.equal(preparations,2);
});
test('finalized Paid receipt settles exact amount, discharges liability and releases unused fees once',async()=>{
 assert.equal((await reconcileBaseReceipts(worker,r.keys,base)).finalized,0);
 await mineFinality();
 await reconcileBaseReceipts(worker,r.keys,base);
 const view=await (await request(`/v1/orders/${order.id}`)).json() as any;
 assert.equal(view.status,'SETTLED');assert.equal(view.destination.status,'FINALIZED');assert.match(view.destination.transactionHash,/^0x[0-9a-f]{64}$/);
 assert.equal(await base.client.readContract({address:registry.contracts.MockUSDC.address,abi:tokenArtifact.abi,functionName:'balanceOf',args:[recipient]}),100000n);
 const before=(await worker.query('SELECT count(*) FROM zee.ledger_entries WHERE order_id=$1',[order.id])).rows[0].count;
 await reconcileBaseReceipts(worker,r.keys,base);assert.equal((await dispatchBaseOnce(worker,r.keys,base,signer)).status,'NO_ELIGIBLE_JOB');
 assert.equal((await worker.query('SELECT count(*) FROM zee.ledger_entries WHERE order_id=$1',[order.id])).rows[0].count,before);
 assert.equal((await worker.query("SELECT count(*) FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL",[order.id])).rows[0].count,'0');
 assert.equal((await worker.query("SELECT state FROM zee.obligations WHERE order_id=$1",[order.id])).rows[0].state,'DISCHARGED');
 assert.equal((await worker.query('SELECT asset,sum(amount)::text AS balance FROM zee.ledger_entries WHERE order_id=$1 GROUP BY asset',[order.id])).rows.every(row=>row.balance==='0'),true);
 assert.equal((await request(`/v1/orders/${order.id}`,'GET',undefined,randomBytes(32).toString('base64url'))).status,404);
 const job=(await worker.query('SELECT j.status FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=$1',[order.id])).rows[0];assert.equal(job.status,'DONE');
});
test('receipt matching rejects unrelated expected recipient; API role cannot mutate attempts',async()=>{
 const stored=(await worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[order.id])).rows[0];
 terms=r.keys.open(stored.terms_payload,`base-terms:${order.id}:v1`) as PayoutTerms;
 const paid=journal.get(`${terms.id}:PAY`)!;
 await assert.rejects(()=>base.receipt(paid.hash,'PAY',{...terms,recipient:deployer}),/BASE_RECEIPT_MISMATCH/);
 await assert.rejects(()=>api.query('UPDATE zee.base_attempts SET confirmed=false'),/permission denied/);
 const signature=await signer.authorize(terms);
 await assert.rejects(()=>validatePrepared(registry,{...terms,amount:'200000'},signature,'PAY',paid),/INVALID_BASE_SIGNATURE/);
 await assert.rejects(()=>validatePrepared(registry,terms,signature,'PAY',{...paid,maxCost:'999999999999999'}),/INVALID_SIGNER_FEE_CAP/);
});
test('turning on Base integration cannot accept an observation-only legacy quote',async()=>{
 await seedFresh();
 const legacy=await new Repository(api,r.keys).issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient,
  refundRecipient:'fixture:legacy',depositReceiver:`fixture:${randomUUID()}`,payoutFee:'100000000000000',refundFee:'10000'},owner);
 const response=await request(`/v1/orders/${legacy.id}/accept`,'POST',{});
 assert.equal(response.status,409);assert.equal((await response.json() as any).error,'QUOTE_MODE_MISMATCH');
 assert.equal((await (await request(`/v1/orders/${legacy.id}`)).json() as any).funding,undefined);
});
