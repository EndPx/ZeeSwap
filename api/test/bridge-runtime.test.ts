/** Synthetic fault contracts for the real read adapter boundary; no live proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBooks,makeOrder,type Books,type Anchor} from '../src/bridge/model.ts';
import {BridgeService} from '../src/bridge/service.ts';
import {PausedBridgeRuntime,BridgeMintCoordinator,validateNativeSnapshot,type BridgeNativeRead,type NativeReadSnapshot} from '../src/bridge/runtime.ts';
import type {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {MemoryBridgeStore} from './bridge-fixture.ts';
import {OperatorQualificationRuntime,type QualificationPermit} from '../src/bridge/operator-qualification.ts';
import {newAccessToken} from '../src/private-data.ts';

const address='0x'+'1'.repeat(40),hash='a'.repeat(64),anchor=(height=100):Anchor=>({height,hash,observedAt:new Date().toISOString()});
function setup(){
 const accounts={principalAccount:'bridge:p',feeAccount:'bridge:f',swapAccount:'swap'};
 const state={supply:'0',unpaid:'0',paused:true,snapshot:{version:1,status:'BRIDGE_NATIVE_READ_VERIFIED',...accounts,notes:[],deposits:[],controlledZatoshi:'0',feeCapitalZatoshi:'0',zcash:anchor()} as NativeReadSnapshot,outgoing:false};
 const native:BridgeNativeRead={...accounts,assertNoOutgoing:async()=>{if(state.outgoing)throw Error('BRIDGE_NATIVE_OUTGOING_RECONCILIATION_REQUIRED');},validate:async()=>{},funding:async()=>{throw Error('unused');},snapshot:async(_orders,checkpoint)=>({...structuredClone(state.snapshot),...(checkpoint?{verifiedCheckpoint:{height:checkpoint.height,hash:checkpoint.hash}}:{})})};
 const base={profile:{...accounts,contractAddress:address,runtimeCodeHash:'0x'+hash,authorizer:address},settlementAnchor:async()=>({...anchor(200),hash:'0x'+hash}),readAt:async(a:Anchor)=>({anchor:a,supply:state.supply,unpaid:state.unpaid,gasBalanceWei:'10000000000000',paused:state.paused})} as unknown as CanonicalBridgeBase;
 const store=new MemoryBridgeStore(emptyBooks()),runtime=new PausedBridgeRuntime(base,native);return {state,native,base,store,runtime};
}
test('actual-zero reconciliation initializes account bindings and remains HTTP paused',async()=>{
 const {store,runtime}=setup();await runtime.refreshPaused(store);const b=await store.read();assert.equal(b.paused,true);assert.equal(b.controlled,'0');assert.equal(b.feeCapital,'0');assert.equal(b.principalAccount,'bridge:p');
 const status=await new BridgeService(store,runtime).status();assert.equal(status.state,'paused');assert.equal(status.forwardEnabled,false);assert.equal(status.reverseEnabled,false);assert.equal(status.asset.tokenAddress,address);
 await store.update(b=>{b.paused=false;});await assert.rejects(()=>runtime.recheck(store.books),/PAUSED_QUALIFICATION_ONLY/);
});
test('unexpected physical capital cannot create a book credit or a successful initial seed',async()=>{
 const {state,store,runtime}=setup();state.snapshot.controlledZatoshi='100000';state.snapshot.notes=[note('principal','100000')];
 await assert.rejects(()=>runtime.refreshPaused(store),/EMPTY_INITIALIZATION_REQUIRED/);assert.deepEqual(await store.read(),emptyBooks());
});
test('a conservatively lower current finality observation cannot move the accepted paired checkpoint backward',async()=>{
 const {store,runtime,base}=setup();await runtime.refreshPaused(store);const before=JSON.stringify(await store.read());
 base.settlementAnchor=async()=>({...anchor(199),hash:'0x'+hash});
 await assert.rejects(()=>runtime.refreshPaused(store),/BASE_CHECKPOINT_REGRESSION/);assert.equal(JSON.stringify(await store.read()),before);
});
function note(role:'principal'|'fee',value:string){return {pool:'ironwood' as const,txid:(role==='principal'?'b':'c').repeat(64),index:0,value,height:90,ownChange:false,unspent:true as const,role,blockHash:hash};}
test('fresh accepted deposit, exact fee reserve and concrete bounded mint proof',async()=>{
 const {state,store,runtime,base}=setup();await runtime.refreshPaused(store);
 const o=makeOrder({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:address,refundRecipient:'utest1synthetic'},'','test-order',Date.now());
 o.status='AWAITING_DEPOSIT';o.accepted=true;o.feeReservation={maximum:'10000'};o.funding={kind:'shielded-deposit',network:'zcash-testnet',address:'utest1owned',memo:'ZEEBRIDGE:'+o.commitment,cutoffHeight:120,cutoffTime:o.expiresAt};
 await store.update(b=>{b.orders[o.id]=o;});state.snapshot.notes=[note('principal','100000'),note('fee','10000')];state.snapshot.controlledZatoshi='100000';state.snapshot.feeCapitalZatoshi='10000';
 state.snapshot.deposits=[{kind:'DEPOSIT',id:o.id,amount:'100000',identity:'zcash-testnet:'+'b'.repeat(64)+':ironwood:0',receipt:{network:'zcash-testnet',transactionHash:'b'.repeat(64),blockHeight:90,blockHash:hash}}];
 await runtime.refreshPaused(store);const b=await store.read();assert.equal(b.controlled,'100000');assert.equal(b.feeCapital,'0');assert.equal(b.orders[o.id].status,'DEPOSIT_FINALIZED');assert.equal(b.paused,true);
 await runtime.assertMintSource(b.orders[o.id],b);
 b.qualification={permitId:'12345678-1234-1234-1234-123456789abc',permitSha256:'e'.repeat(64),createdAt:'2026-01-01T00:00:00.000Z',expiresAt:'2026-01-01T01:00:00.000Z'};
 const coordinator=new BridgeMintCoordinator(runtime,{...b.qualification,forwardRecipient:o.recipient,forwardRefundRecipient:o.refundRecipient!});await assert.rejects(()=>coordinator.assert(base,b.orders[o.id],b),/CONTRACT_PAUSED/);state.paused=false;await coordinator.assert(base,b.orders[o.id],b);
 await assert.rejects(()=>new BridgeMintCoordinator(runtime).assert(base,b.orders[o.id],b),/ORIGINAL_PERMIT_REQUIRED/);
 await assert.rejects(()=>coordinator.assert({...base} as CanonicalBridgeBase,b.orders[o.id],b),/FIRST_CIRCLE_MINT_SCOPE/);
 await assert.rejects(()=>coordinator.assert(base,{...b.orders[o.id],amountAtomic:'100001'},b),/FIRST_CIRCLE_MINT_SCOPE/);
 const changed=structuredClone(b);changed.orders[o.id].recipient='0x'+'2'.repeat(40);await assert.rejects(()=>coordinator.assert(base,b.orders[o.id],changed),/ORDER_BOOK_BINDING/);
 state.snapshot.deposits[0].receipt.blockHash='d'.repeat(64);await assert.rejects(()=>runtime.assertMintSource(b.orders[o.id],b),/ACCEPTED_SOURCE_CONFLICT/);
 state.snapshot.deposits=[];await assert.rejects(()=>runtime.refreshPaused(store),/ACCEPTED_SOURCE_CONFLICT/);
});
function permit():QualificationPermit{return {version:1,purpose:'ROOT_OPERATOR_FUNDED_CIRCLE',permitId:'12345678-1234-1234-1234-123456789abc',createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),databaseName:'zee_bridge_20261029',databaseRole:'zee_bridge_runtime_20261029',nativeReadProfileSha256:'d'.repeat(64),contractAddress:address,runtimeCodeHash:'0x'+hash,principalAccount:'bridge:p',feeAccount:'bridge:f',swapAccount:'swap',amountAtomic:'100000',maxAcceptedPerDirection:1,maxConcurrent:1,forward:{recipient:address,refundRecipient:'utest1synthetic'},reverse:{payer:address,recipient:'utest1reverse'}};}
async function operatorSetup(openingNotes=1){
 const f=setup(),fees=Array.from({length:openingNotes},(_,index)=>({...note('fee','10000'),index})),amount=String(openingNotes*10000);f.state.snapshot.notes=fees;f.state.snapshot.feeCapitalZatoshi=amount;Object.defineProperty(f.native,'openingFeeNotes',{value:fees.map(fee=>({pool:fee.pool,txid:fee.txid,index:fee.index,value:fee.value}))});await f.runtime.initializePausedWithVerifiedOpeningFees(f.store,amount);
 f.native.funding=async o=>({kind:'shielded-deposit',network:'zcash-testnet',address:'utest1owned',memo:'ZEEBRIDGE:'+o.commitment,cutoffHeight:120,cutoffTime:o.expiresAt});
 const binding={permit:permit(),sha256:'e'.repeat(64)},context={databaseName:binding.permit.databaseName,databaseRole:binding.permit.databaseRole,nativeReadProfileSha256:binding.permit.nativeReadProfileSha256},operator=new OperatorQualificationRuntime(f.base,f.native,binding,context);
 return {...f,binding,context,operator,service:new BridgeService(f.store,operator)};
}
test('Root-permitted book transitions use normal quote/accept and leave strict paused runtime intact',async()=>{
 const {store,runtime,operator,service}=await operatorSetup();await operator.openQualification(store);assert.equal(store.books.paused,false);
 await assert.rejects(()=>runtime.recheck(store.books),/PAUSED_QUALIFICATION_ONLY/);
 const token=newAccessToken(),q=await service.quote(operator.input('TAZ_TO_ZEETAZ'),token,'qualification-key');const accepted=await service.accept(q.id,token,'qualification-key');assert.equal(accepted.status,'AWAITING_DEPOSIT');assert.equal(store.books.feeCapital,'0');
 await operator.closeQualification(store);assert.equal(store.books.paused,true);assert.equal(store.books.qualification?.permitSha256,'e'.repeat(64));
});
test('prospective second acceptance is refused before another fee reservation or instructions',async()=>{
 const {store,operator,service}=await operatorSetup(2);await operator.openQualification(store);
 const t1=newAccessToken(),t2=newAccessToken(),q1=await service.quote(operator.input('TAZ_TO_ZEETAZ'),t1,'first-qualification'),q2=await service.quote(operator.input('TAZ_TO_ZEETAZ'),t2,'second-qualification');
 await service.accept(q1.id,t1,'first-qualification');
 // There is enough physical fee capital for another order: only the permit's
 // independent prospective exposure limit must prevent this acceptance.
 await assert.rejects(()=>service.accept(q2.id,t2,'second-qualification'),/DIRECTION_LIMIT/);assert.equal(store.books.feeCapital,'10000');
 const second=store.books.orders[q2.id];assert.throws(()=>operator.assertAcceptance(second,store.books),/DIRECTION_LIMIT/);
 assert.equal(second.accepted,undefined);assert.equal(Object.values(store.books.orders).filter(o=>o.accepted).length,1);
 const reverse=makeOrder(operator.input('ZEETAZ_TO_TAZ'),'','reverse-qualification',Date.now());assert.throws(()=>operator.assertAcceptance(reverse,store.books),/CONCURRENCY_LIMIT/);
});
test('expired permit stops new admission but closing preserves original liability metadata',async()=>{
 const {store,operator,binding}=await operatorSetup();await operator.openQualification(store);const originalNow=Date.now;
 try{Date.now=()=>Date.parse(binding.permit.expiresAt)+1;await assert.rejects(()=>operator.recheck(store.books),/PERMIT_EXPIRED/);await operator.closeQualification(store);assert.equal(store.books.paused,true);assert.equal(store.books.qualification?.expiresAt,binding.permit.expiresAt);}finally{Date.now=originalNow;}
});
test('another Root permit cannot reset the persisted qualification counters',async()=>{
 const {store,operator,binding,context,base,native}=await operatorSetup();await operator.openQualification(store);await operator.closeQualification(store);
 const other={permit:{...binding.permit,permitId:'22345678-1234-1234-1234-123456789abc'},sha256:'f'.repeat(64)},replacement=new OperatorQualificationRuntime(base,native,other,context);
 await assert.rejects(()=>replacement.openQualification(store),/ORIGINAL_PERMIT_REQUIRED/);assert.equal(store.books.qualification?.permitId,binding.permit.permitId);
});
test('explicit fee-only opening requires exact pinned mature fee identities and cannot repeat',async()=>{
 const {state,store,runtime,native}=setup();const fee=note('fee','10000');state.snapshot.notes=[fee];state.snapshot.feeCapitalZatoshi='10000';
 Object.defineProperty(native,'openingFeeNotes',{value:[{pool:fee.pool,txid:fee.txid,index:fee.index,value:fee.value}],configurable:true});
 await runtime.initializePausedWithVerifiedOpeningFees(store,'10000');assert.equal(store.books.feeCapital,'10000');assert.equal(store.books.controlled,'0');assert.equal(store.books.paused,true);
 await assert.rejects(()=>runtime.initializePausedWithVerifiedOpeningFees(store,'10000'),/EMPTY_INITIALIZATION_REQUIRED/);
 for(const amount of ['0','100001','110000','9999'])await assert.rejects(()=>runtime.initializePausedWithVerifiedOpeningFees(store,amount),/FEE_CAP/);
});
test('fee-opening rejects unallocated principal or a mismatched protected fee-note identity',async()=>{
 for(const fault of ['principal','pin']){
  const {state,store,runtime,native}=setup();const fee=note('fee','10000');state.snapshot.notes=[fee];state.snapshot.feeCapitalZatoshi='10000';
  Object.defineProperty(native,'openingFeeNotes',{value:[{pool:fee.pool,txid:'d'.repeat(64),index:fee.index,value:fee.value}]});
  if(fault==='principal'){state.snapshot.notes.push(note('principal','100000'));state.snapshot.controlledZatoshi='100000';}
  await assert.rejects(()=>runtime.initializePausedWithVerifiedOpeningFees(store,'10000'),/OPENING_FEE/);assert.deepEqual(await store.read(),emptyBooks());
 }
});
test('unknown outgoing state or independent journals fence read reconciliation',async()=>{
 const {state,store,runtime}=setup();await runtime.refreshPaused(store);state.outgoing=true;
 await assert.rejects(()=>runtime.refreshPaused(store),/OUTGOING_RECONCILIATION/);state.outgoing=false;
 await store.update(b=>{b.inTransit='1';});await assert.rejects(()=>runtime.refreshPaused(store),/OUTGOING_RECONCILIATION/);
});
test('physical sums, independent unpaid counter and prior checkpoint cannot be asserted by labels',async()=>{
 const {state,native,store,runtime}=setup();await runtime.refreshPaused(store);state.unpaid='1';await assert.rejects(()=>runtime.refreshPaused(store),/BOOKS_MISMATCH/);state.unpaid='0';
 const s=structuredClone(state.snapshot);s.controlledZatoshi='1';assert.throws(()=>validateNativeSnapshot(s,native,[]),/SUM_MISMATCH/);
 assert.throws(()=>validateNativeSnapshot(state.snapshot,native,[],Date.now(),anchor()),/PRIOR_CHECKPOINT/);
 state.snapshot.notes=[note('principal','1'),note('principal','1')];state.snapshot.controlledZatoshi='2';await assert.rejects(()=>runtime.refreshPaused(store),/PHYSICAL_NOTE_BINDING/);
});
