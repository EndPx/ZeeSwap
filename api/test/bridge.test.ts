import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {PrivateData} from '../src/private-data.ts';
import {encodeFunctionData} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createApi} from '../src/http-api.ts';
import {applyEvent,coverage,digest,guard,principal,bridgeCommitment,type VerifiedEvent} from '../src/bridge/model.ts';
import {BridgeService,redemptionAbi} from '../src/bridge/service.ts';
import {BridgeWorker,type BridgeDurableSigner} from '../src/bridge/worker.ts';
import {handleBridge} from '../src/bridge/http.ts';
import {requireReconciled} from '../src/bridge/reconciliation.ts';
import {MemoryBridgeStore,fixtureBooks,fixtureRuntime,forward,reverse,receipt,now,address,token,otherToken,hash} from './bridge-fixture.ts';
function deposited(){const b=fixtureBooks(),o=forward(b);applyEvent(b,{kind:'DEPOSIT',id:o.id,amount:o.amountAtomic,identity:'test:note:0',receipt:receipt()},now);return {b,o};}
function redeemed(){const {b,o}=deposited();applyEvent(b,{kind:'MINT',id:o.id,amount:o.amountAtomic,recipient:o.recipient,receipt:receipt('base-sepolia')},now);const r=reverse(b);applyEvent(b,{kind:'BURN',id:r.id,amount:r.amountAtomic,payer:address,commitment:r.commitment,identity:'test:burn:0',receipt:receipt('base-sepolia','cc'.repeat(32))},now);return {b,o,r};}
function signer():BridgeDurableSigner{return {assertFreshCanonical:async()=>{},recoverOrPrepare:async i=>({intentId:i.intentId,txid:'dd'.repeat(32),raw:'cafe',feeAtomic:'1000',expiryHeight:180}),broadcastOriginal:async()=>{}};}
test('8 decimal principal accepts exact bounds and rejects floating/leading-zero/large amounts',()=>{for(const v of ['0','9999','100000001','1.0','01','1e5',100000,Number.MAX_SAFE_INTEGER])assert.throws(()=>principal(v));assert.equal(principal('10000'),'10000');assert.equal(principal('100000000'),'100000000');});
test('versioned positional commitment matches independent Python vectors in either field order',()=>{
 const common={salt:'a'.repeat(64),id:'12345678-1234-1234-1234-123456789abc',amountAtomic:'100000'};
 const reverse=bridgeCommitment({...common,direction:'ZEETAZ_TO_TAZ',recipient:'utest1fixture',payer:address});assert.equal(reverse,'0xcd12fb9a7a2533fcfb9f6d888b41937c177a586d6d26be04e5d21b2ad3449c1e');assert.equal(digest(['bridge-delivery-v1',common.id,reverse]),'b68d70be02fbd76f7a0d5b0dd5fb5fbec18a037ed3302752da6415f9b0395f3c');
 assert.equal(bridgeCommitment({refundRecipient:'utest1fixture',recipient:address,direction:'TAZ_TO_ZEETAZ',...common}),'0x423b90158a6cb13c4bb171ee78fe88e801c3575790c3106d90157145e2715ed7');
});
test('deposit, mint and burn conserve principal coverage; replay is once only',()=>{
 const {b,o,r}=redeemed();assert.deepEqual(coverage(b),{controlledZatoshi:'100000',inTransitZatoshi:'0',circulatingZatoshi:'0',unpaidRedemptionsZatoshi:'100000',pendingAcknowledgmentsZatoshi:'0',acceptedUnmintedZatoshi:'0',otherRefundsZatoshi:'0',covered:true});
 const before=digest(b);applyEvent(b,{kind:'BURN',id:r.id,amount:r.amountAtomic,payer:address,commitment:r.commitment,identity:'test:burn:0',receipt:receipt('base-sepolia','cc'.repeat(32))},now);assert.equal(digest(b),before);assert.equal(o.status,'MINTED');
});
test('permanent cancellation excludes mint and keeps exact refund principal',()=>{
 const {b,o}=deposited();applyEvent(b,{kind:'CANCEL',id:o.id,receipt:receipt('base-sepolia')},now);assert.equal(coverage(b).otherRefundsZatoshi,'100000');assert.throws(()=>applyEvent(b,{kind:'MINT',id:o.id,amount:o.amountAtomic,recipient:o.recipient,receipt:receipt('base-sepolia','ee'.repeat(32))},now),/MINT_BINDING/);
});
test('wrong payer, duplicate source identity, changed amount and foreign chain are rejected',()=>{
 const {b,o,r}=redeemed(),s=reverse(b);b.supply='100000';for(const event of [
 {kind:'BURN',id:s.id,amount:s.amountAtomic,payer:'0x2222222222222222222222222222222222222222',commitment:s.commitment,identity:'new',receipt:receipt('base-sepolia')},
 {kind:'BURN',id:s.id,amount:s.amountAtomic,payer:address,commitment:s.commitment,identity:'test:burn:0',receipt:receipt('base-sepolia')},
 {kind:'DEPOSIT',id:o.id,amount:'100001',identity:'new',receipt:receipt()},
 {kind:'BURN',id:r.id,amount:r.amountAtomic,payer:address,commitment:r.commitment,identity:'new',receipt:receipt()}
 ] as VerifiedEvent[])assert.throws(()=>applyEvent(b,event,now));
});
test('observed obligations still reconcile during admission pause and stale checkpoints',()=>{
 const b=fixtureBooks(),o=forward(b);b.paused=true;applyEvent(b,{kind:'DEPOSIT',id:o.id,amount:o.amountAtomic,identity:'paused-deposit',receipt:receipt()},now+120000);
 applyEvent(b,{kind:'MINT',id:o.id,amount:o.amountAtomic,recipient:o.recipient,receipt:receipt('base-sepolia')},now+120000);assert.equal(b.supply,'100000');assert.equal(coverage(b).acceptedUnmintedZatoshi,'0');assert.throws(()=>guard(b,now+120000,false),/STALE/);
});
test('inclusion -> reorg -> same inclusion -> native confirmation restores C/D and awaits Base ACK',()=>{
 const {b,r}=redeemed();r.status='PAYOUT_PENDING';r.attempt={intentId:'fixture',txid:'dd'.repeat(32)};const included=receipt('zcash-testnet','dd'.repeat(32));
 applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:included},now);assert.equal(b.controlled,'0');assert.equal(b.inTransit,'100000');assert.equal(coverage(b).unpaidRedemptionsZatoshi,'100000');
 applyEvent(b,{kind:'REORG',target:'DELIVERY',id:r.id,receipt:included},now);assert.equal(b.controlled,'100000');assert.equal(b.inTransit,'0');assert.equal(b.paused,true);
 applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:included},now);applyEvent(b,{kind:'REORG',target:'DELIVERY',id:r.id,receipt:included},now);assert.equal(b.controlled,'100000');
 const reverted=digest(b);applyEvent(b,{kind:'REORG',target:'DELIVERY',id:r.id,receipt:included},now);assert.equal(digest(b),reverted);
 applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:included},now);applyEvent(b,{kind:'CONFIRM',id:r.id,receipt:included},now);assert.equal(b.inTransit,'0');assert.equal(coverage(b).unpaidRedemptionsZatoshi,'0');assert.equal(coverage(b).pendingAcknowledgmentsZatoshi,'100000');assert.equal(r.status,'NATIVE_DELIVERED_AWAITING_ACK');assert.equal(coverage(b).covered,true);
 applyEvent(b,{kind:'REORG',target:'DELIVERY',id:r.id,receipt:included},now);assert.equal(b.incident,true);assert.equal(coverage(b).unpaidRedemptionsZatoshi,'100000');
});
test('post-native-delivery reorg is incident with unpaid liability retained, never automatic remint',()=>{
 const {b,r}=redeemed();r.status='PAYOUT_PENDING';r.attempt={intentId:'fixture',txid:'dd'.repeat(32)};const included=receipt('zcash-testnet','dd'.repeat(32));applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:included},now);applyEvent(b,{kind:'CONFIRM',id:r.id,receipt:included},now);
 applyEvent(b,{kind:'REORG',target:'DELIVERY',id:r.id,receipt:included},now);assert.equal(b.incident,true);assert.equal(b.supply,'0');assert.equal(coverage(b).unpaidRedemptionsZatoshi,'100000');assert.equal(coverage(b).covered,false);
});
function nativeDelivered(){
 const {b,r}=redeemed();r.status='PAYOUT_PENDING';r.attempt={intentId:'synthetic-native',txid:'dd'.repeat(32)};
 const native=receipt('zcash-testnet','dd'.repeat(32));applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:native},now);applyEvent(b,{kind:'CONFIRM',id:r.id,receipt:native},now);
 const ack:VerifiedEvent={kind:'ACK',id:r.id,amount:r.amountAtomic,evidenceCommitment:'0x'+digest([r.salt,r.destination]),receipt:receipt('base-sepolia','0x'+'ee'.repeat(32))};
 return {b,r,native,ack};
}

test('native confirmation records pending acknowledgment separately; opaque bound ACK alone completes exactly once',()=>{
 const {b,r,ack}=nativeDelivered();
 assert.equal(r.status,'NATIVE_DELIVERED_AWAITING_ACK');assert.equal(r.acknowledgment,undefined);
 assert.deepEqual(coverage(b),{controlledZatoshi:'0',inTransitZatoshi:'0',circulatingZatoshi:'0',unpaidRedemptionsZatoshi:'0',pendingAcknowledgmentsZatoshi:'100000',acceptedUnmintedZatoshi:'0',otherRefundsZatoshi:'0',covered:true});
 assert.match(ack.kind==='ACK'?ack.evidenceCommitment:'',/^0x[0-9a-f]{64}$/);
 assert.ok(!JSON.stringify(ack).includes(r.recipient));assert.ok(!JSON.stringify(ack).includes(r.salt));
 applyEvent(b,ack,now);assert.equal(r.status,'COMPLETED');assert.deepEqual(r.acknowledgment,ack.receipt);assert.equal(coverage(b).pendingAcknowledgmentsZatoshi,'0');
 const completed=digest(b);applyEvent(b,ack,now);assert.equal(digest(b),completed);
 assert.throws(()=>applyEvent(b,{...ack,amount:'100001'} as VerifiedEvent,now),/EVENT_CONFLICT/);
});

test('ACK rejects a missing native confirmation, changed amount, salt or destination commitment, and wrong chain',()=>{
 const pending=nativeDelivered();
 for(const change of ['amount','salt','destination','network','unconfirmed']){
  const {b,r,ack}=nativeDelivered();if(ack.kind!=='ACK')throw Error('fixture');
  if(change==='amount')ack.amount='100001';
  if(change==='salt')ack.evidenceCommitment='0x'+digest(['different-salt',r.destination]);
  if(change==='destination')ack.evidenceCommitment='0x'+digest([r.salt,{...r.destination,transactionHash:'ff'.repeat(32)}]);
  if(change==='network')ack.receipt=receipt('zcash-testnet');
  if(change==='unconfirmed')r.status='IN_TRANSIT';
  const before=digest(b);assert.throws(()=>applyEvent(b,ack,now),/ACK_BINDING|RECEIPT_IDENTITY/);assert.equal(digest(b),before);
 }
 const {b,r}=redeemed();const before=digest(b);
 assert.throws(()=>applyEvent(b,{...pending.ack,id:r.id} as VerifiedEvent,now),/ACK_BINDING/);assert.equal(digest(b),before);
});

test('delivery and ACK reorgs freeze completed orders without reminting or restoring reusable capital',()=>{
 for(const target of ['DELIVERY','ACK'] as const){
  const {b,r,native,ack}=nativeDelivered();applyEvent(b,ack,now);
  const fact={kind:'REORG' as const,id:r.id,target,receipt:target==='ACK'?ack.receipt:native};
  assert.throws(()=>applyEvent(b,{...fact,receipt:{...fact.receipt,transactionHash:'fa'.repeat(32)}},now),/REORG_BINDING/);
  applyEvent(b,fact,now);assert.equal(r.status,'FROZEN');assert.equal(r.frozenFrom,'COMPLETED');assert.equal(b.incident,true);assert.equal(b.paused,true);assert.equal(b.supply,'0');assert.equal(b.controlled,'0');assert.equal(b.inTransit,'0');assert.equal(coverage(b).unpaidRedemptionsZatoshi,target==='ACK'?'0':'100000');assert.equal(coverage(b).pendingAcknowledgmentsZatoshi,target==='ACK'?'100000':'0');assert.equal(coverage(b).covered,target==='ACK');
  const frozen=digest(b);applyEvent(b,fact,now);assert.equal(digest(b),frozen);assert.throws(()=>guard(b,now,false),/INCIDENT/);
 }
});

test('Base burn source reorg is bound to the actual source and freezes repayment',()=>{const {b,r}=redeemed();applyEvent(b,{kind:'REORG',target:'SOURCE',id:r.id,receipt:r.source!},now);assert.equal(b.incident,true);assert.throws(()=>guard(b,now,false),/INCIDENT/);});
test('admission rejects stale, deficit and shared inventories while safe paused repayment remains eligible',()=>{
 const {b}=redeemed();b.paused=true;assert.doesNotThrow(()=>guard(b,now,false));assert.throws(()=>guard(b,now,true),/PAUSED/);b.paused=false;b.controlled='99999';assert.throws(()=>guard(b,now,true),/PAUSED/);b.feeAccount=b.principalAccount;assert.throws(()=>guard(b,now,false),/ISOLATION/);
});
test('independent reserve reconciliation rejects changed counters, code identity and checkpoint',async()=>{
 const store=new MemoryBridgeStore(),runtime=fixtureRuntime(store),r=await runtime.recheck(store.books);requireReconciled(store.books,r,runtime,now);
 assert.throws(()=>requireReconciled(store.books,{...r,circulatingZatoshi:'1'},runtime,now),/BOOKS/);
 assert.throws(()=>requireReconciled(store.books,{...r,decimals:18 as 8},runtime,now),/IDENTITY/);
 assert.throws(()=>requireReconciled(store.books,{...r,pair:{...r.pair,base:{...r.pair.base,height:201}}},runtime,now),/CHECKPOINT/);
});
test('quote idempotency, private capability reads and accepted funding survive admission pause',async()=>{
 const store=new MemoryBridgeStore(),service=new BridgeService(store,fixtureRuntime(store)),input={direction:'TAZ_TO_ZEETAZ' as const,amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'};
 const q=await service.quote(input,token,'http-key-1',now);assert.equal((await service.quote(input,token,'http-key-1',now)).id,q.id);
 assert.equal((await service.quote({refundRecipient:input.refundRecipient,recipient:input.recipient,amountAtomic:input.amountAtomic,direction:input.direction},token,'http-key-1',now)).id,q.id);
 await assert.rejects(()=>service.quote({...input,amountAtomic:'100001'},token,'http-key-1',now),/CONFLICT/);
 await assert.rejects(()=>service.order(q.id,otherToken),/NOT_FOUND/);const order=await service.accept(q.id,token,'accept-key',now);assert.equal(order.status,'AWAITING_DEPOSIT');assert.equal(order.funding?.kind,'shielded-deposit');
 store.books.paused=true;assert.equal((await service.accept(q.id,token,'accept-key',now)).id,q.id);
});
test('fee reservation precedes signing; ambiguous signer failure retains intent and excludes competing principal',async()=>{
 const {b,r}=redeemed(),s=reverse(b);s.status='REDEMPTION_PENDING';s.source=receipt('base-sepolia','ee'.repeat(32));s.deliveryKind='REDEMPTION';b.controlled='200000';const store=new MemoryBridgeStore(b);let signs=0;
 const bad=signer();bad.recoverOrPrepare=async()=>{signs++;throw Error('private adapter timeout');};const w=new BridgeWorker(store,{verify:async()=>{throw Error();}},bad);
 await assert.rejects(()=>w.prepare(r.id,'10000',now),/timeout/);assert.equal(store.books.feeCapital,'0');assert.ok(store.books.orders[r.id].attempt?.intentId);assert.equal(store.books.orders[r.id].status,'PAYOUT_PENDING');
 await assert.rejects(()=>w.prepare(s.id,'10000',now),/FEE_CAPITAL/);assert.equal(signs,1);await assert.rejects(()=>w.prepare(r.id,'9000',now),/IMMUTABLE/);
});
test('durable signer retries recover exact bytes, charge once, and never broadcast replacement',async()=>{
 const {b,r}=redeemed(),store=new MemoryBridgeStore(b),s=signer();let broadcasts=0;s.broadcastOriginal=async()=>{broadcasts++;throw Error('unknown outcome');};const w=new BridgeWorker(store,{verify:async()=>{throw Error();}},s);
 const first=await w.prepare(r.id,'10000',now),second=await w.prepare(r.id,'10000',now);assert.deepEqual(second,first);assert.equal(store.books.feeCapital,'9000');
 await assert.rejects(()=>w.broadcast(r.id,now),/unknown/);assert.equal(broadcasts,1);assert.deepEqual(store.books.orders[r.id].attempt,first);assert.equal(store.books.orders[r.id].broadcastAttempted,true);await assert.rejects(()=>w.broadcast(r.id,now),/RECONCILIATION/);assert.equal(broadcasts,1);
 s.recoverOrPrepare=async i=>({...first,intentId:i.intentId,txid:'ee'.repeat(32)});await assert.rejects(()=>w.prepare(r.id,'10000',now),/ORIGINAL/);assert.equal(store.books.feeCapital,'9000');
});
test('accepted forward reserves refund fee and finalized mint releases the unused reserve exactly once',async()=>{
 const store=new MemoryBridgeStore(),service=new BridgeService(store,fixtureRuntime(store));const q=await service.quote({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'},token,'fee-quote-key',now);
 await service.accept(q.id,token,'fee-accept-key',now);assert.equal(store.books.feeCapital,'0');assert.equal((await service.status(now)).state,'paused');
 applyEvent(store.books,{kind:'DEPOSIT',id:q.id,amount:'100000',identity:'fee:deposit',receipt:receipt()},now);const mint={kind:'MINT' as const,id:q.id,amount:'100000',recipient:address,receipt:receipt('base-sepolia')};applyEvent(store.books,mint,now);applyEvent(store.books,mint,now);assert.equal(store.books.feeCapital,'10000');
});
test('cutoff timestamps and mismatched token-contract configurations are rejected',async()=>{
 const store=new MemoryBridgeStore(),runtime=fixtureRuntime(store),service=new BridgeService(store,runtime);const q=await service.quote({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'},token,'cutoff-key',now);
 runtime.funding=async()=>({kind:'shielded-deposit',network:'zcash-testnet',address:'test:shielded-deposit',memo:'opaque',cutoffHeight:150,cutoffTime:'not-a-date'});await assert.rejects(()=>service.accept(q.id,token,'cutoff-accept',now),/FUNDING_BINDING/);assert.equal(store.books.feeCapital,'10000');assert.equal(store.books.orders[q.id].status,'QUOTED');
 assert.throws(()=>new BridgeService(store,{...runtime,tokenAddress:'0x2222222222222222222222222222222222222222'}),/TOKEN_CONTRACT/);
});
test('expired original transactions cannot be freshly prepared or broadcast',async()=>{
 const {b,r}=redeemed(),store=new MemoryBridgeStore(b),s=signer();s.recoverOrPrepare=async i=>({intentId:i.intentId,txid:'dd'.repeat(32),raw:'cafe',feeAtomic:'1000',expiryHeight:1});const w=new BridgeWorker(store,{verify:async()=>{throw Error();}},s);
 await assert.rejects(()=>w.prepare(r.id,'10000',now),/SIGNED_BINDING/);assert.equal(store.books.feeCapital,'0');assert.equal(store.books.orders[r.id].attempt?.txid,undefined);
});
test('reverse funding requires exact signed EIP712 payer/amount/commitment/domain and calldata',async()=>{
 const store=new MemoryBridgeStore(),runtime=fixtureRuntime(store);
 // Publicly known deterministic synthetic test key, never funded or used live.
 const account=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`);runtime.authorizerAddress=account.address;
 runtime.funding=async o=>{const terms={id:o.commitment,payer:o.payer!,amount:o.amountAtomic,payoutCommitment:o.commitment,nonce:'1',deadline:Math.floor(Date.parse(o.expiresAt)/1000).toString()},message={id:terms.id as `0x${string}`,payer:terms.payer as `0x${string}`,amount:BigInt(terms.amount),payoutCommitment:terms.payoutCommitment as `0x${string}`,nonce:1n,deadline:BigInt(terms.deadline)};
  const signature=await account.signTypedData({domain:{name:'ZeeSwapBridge',version:'1',chainId:84532,verifyingContract:address},types:{Redemption:redemptionAbi[0].inputs[0].components},primaryType:'Redemption',message});
  return {kind:'authenticated-burn',network:'base-sepolia',chainId:84532,contract:address,token:address,terms,signature,calldata:encodeFunctionData({abi:redemptionAbi,functionName:'requestRedemption',args:[message,signature]})};
 };
 const service=new BridgeService(store,runtime),q=await service.quote({direction:'ZEETAZ_TO_TAZ',amountAtomic:'100000',recipient:'test:shielded-recipient',payer:address},token,'burn-quote-key',now);
 const original=runtime.funding;runtime.funding=async o=>{const f=await original(o);if(f.kind==='authenticated-burn')f.signature='0x'+'00'.repeat(65);return f;};await assert.rejects(()=>service.accept(q.id,token,'burn-accept-key',now));assert.equal(store.books.orders[q.id].status,'QUOTED');assert.equal(store.books.feeCapital,'10000');
 runtime.funding=original;const order=await service.accept(q.id,token,'burn-accept-key',now);assert.equal(order.status,'AWAITING_BURN');assert.equal(order.funding?.kind,'authenticated-burn');assert.equal(store.books.supply,'0');assert.equal(coverage(store.books).unpaidRedemptionsZatoshi,'0');assert.equal(store.books.feeCapital,'0');
});
test('main API readOnly blocks configured bridge writes and private routes share rate limits',async t=>{
 const store=new MemoryBridgeStore(),runtime=fixtureRuntime(store),service=new BridgeService(store,runtime);let funding=0;runtime.funding=async()=>{funding++;throw Error();};const server=createApi({pool:{} as any,keys:new PrivateData(randomBytes(32),randomBytes(32)),wallet:{} as any,readOnly:true,bridge:service});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':'test-http-key'};
 assert.equal((await(await fetch(base+'/v1/bridge/status')).json()).state,'unavailable');
 for(let i=0;i<60;i++)assert.equal((await fetch(base+'/v1/bridge/quotes',{method:'POST',headers,body:'{}'})).status,503);
 assert.equal((await fetch(base+'/v1/bridge/orders/x',{headers})).status,429);assert.equal(funding,0);assert.equal(Object.keys(store.books.orders).length,0);
});
test('HTTP default is truthful unavailable, rejects auth, and does not expose private adapter errors',async t=>{
 const server=createServer((req,res)=>{void handleBridge(req,res,new URL(req.url!,'http://localhost').pathname);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const status=await (await fetch(base+'/v1/bridge/status')).json();assert.equal(status.state,'unavailable');assert.equal(status.asset.tokenAddress,null);assert.equal((await fetch(base+'/v1/bridge/orders/x')).status,401);assert.equal((await fetch(base+'/v1/bridge/orders',{method:'POST',headers:{Authorization:'Bearer '+token}})).status,503);
});
test('HTTP configured synthetic adapter supports quote/accept/private status and no fact-injection route',async t=>{
 const store=new MemoryBridgeStore(),runtime=fixtureRuntime(store),service=new BridgeService(store,runtime);const server=createServer((req,res)=>{void handleBridge(req,res,new URL(req.url!,'http://localhost').pathname,service);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':'test-http-key'};
 const q=await(await fetch(base+'/v1/bridge/quotes',{method:'POST',headers,body:JSON.stringify({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'})})).json();assert.equal(q.status,'QUOTED');
 const o=await(await fetch(base+'/v1/bridge/orders',{method:'POST',headers,body:JSON.stringify({quoteId:q.id})})).json();assert.equal(o.status,'AWAITING_DEPOSIT');assert.equal((await fetch(base+'/v1/bridge/orders/'+o.id,{headers:{Authorization:'Bearer '+otherToken}})).status,404);
 assert.equal((await fetch(base+'/v1/bridge/observe',{method:'POST',headers,body:'{"finalized":true}'})).status,404);
 runtime.recheck=async()=>{throw Error('private:memo full secret');};const failed=await(await fetch(base+'/v1/bridge/status')).text();assert.ok(!failed.includes('secret'));assert.ok(failed.includes('unavailable'));
});
