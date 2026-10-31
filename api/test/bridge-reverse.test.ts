/** Synthetic coordinator faults only. No live Native/Base/DB/signing qualification. */
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {BridgeReverseCoordinator} from '../src/bridge/reverse.ts';
import {PausedBridgeRuntime,type BridgeNativeRead} from '../src/bridge/runtime.ts';
import type {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import type {NativeCommandProfile} from '../src/bridge/adapters/native.ts';
import {BridgeJournal} from '../src/bridge/journal.ts';
import {BridgeWorker,type BridgeDurableSigner} from '../src/bridge/worker.ts';
import {PrivateData} from '../src/private-data.ts';
import {applyEvent,digest,type Anchor,type VerifiedEvent} from '../src/bridge/model.ts';
import type {PermitBinding} from '../src/bridge/operator-qualification.ts';
import {MemoryBridgeStore,fixtureBooks,forward,reverse,receipt,address} from './bridge-fixture.ts';

const H='a'.repeat(64),TX='d'.repeat(64),anchor=(height=100):Anchor=>({height,hash:H,observedAt:new Date().toISOString()});
function setup(){
 const b=fixtureBooks();b.paused=true;const f=forward(b),r=reverse(b);
 applyEvent(b,{kind:'DEPOSIT',id:f.id,amount:'100000',identity:'synthetic:deposit',receipt:receipt()},Date.now());
 applyEvent(b,{kind:'MINT',id:f.id,amount:'100000',recipient:f.recipient,receipt:receipt('base-sepolia')},Date.now());
 applyEvent(b,{kind:'BURN',id:r.id,amount:'100000',payer:address,commitment:r.commitment,identity:'synthetic:burn',receipt:receipt('base-sepolia')},Date.now());
 r.status='PAYOUT_PENDING';r.attempt={intentId:digest(['bridge-delivery-v1',r.id,r.commitment]),txid:TX,raw:'cafe',feeAtomic:'10000',expiryHeight:150};r.feeReservation={maximum:'10000',charged:'10000'};b.feeCapital='90000';
 const accounts={principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount};
 const binding:PermitBinding={sha256:'e'.repeat(64),permit:{version:1,purpose:'ROOT_OPERATOR_FUNDED_CIRCLE',permitId:'12345678-1234-1234-1234-123456789abc',createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),databaseName:'zee_bridge_synthetic',databaseRole:'zee_bridge_runtime_synthetic',nativeReadProfileSha256:'f'.repeat(64),contractAddress:address,runtimeCodeHash:'0x'+H,...accounts,amountAtomic:'100000',maxAcceptedPerDirection:1,maxConcurrent:1,forward:{recipient:address,refundRecipient:f.refundRecipient!},reverse:{payer:address,recipient:r.recipient}}};
 b.qualification={permitId:binding.permit.permitId,permitSha256:binding.sha256,createdAt:binding.permit.createdAt,expiresAt:binding.permit.expiresAt};
 const state={unpaid:'100000',supply:'0',canonical:true,scope:true,commands:[] as string[],capital:{version:1,status:'BRIDGE_NATIVE_CAPITAL_VERIFIED',...accounts,controlledZatoshi:'0',feeCapitalZatoshi:'90000',inTransitZatoshi:'0',notes:Array.from({length:9},(_,index)=>({pool:'ironwood',txid:'c'.repeat(64),index,value:'10000',role:'fee'})),included:{txid:TX,height:90,blockHash:H,principalZatoshi:'100000',confirmations:11},zcash:anchor()},nativeReceipt:{orderId:r.id,approvedDigest:'b'.repeat(64),txid:TX,blockHeight:'90',blockHash:H,amount:'100000',fee:'10000',recipient:r.recipient,confirmations:11,confirmed:true,shielded:true}};
 const native:BridgeNativeRead={...accounts,assertNoOutgoing:async()=>{},assertOutgoingScope:async id=>{assert.equal(id,r.id);if(!state.scope)throw Error('SYNTHETIC_UNKNOWN_OUTGOING');},validate:async()=>{},funding:async()=>{throw Error('unused');},snapshot:async()=>{throw Error('unexpected read snapshot');}};
 const base={profile:{...accounts,contractAddress:address,runtimeCodeHash:'0x'+H,authorizer:address},settlementAnchor:async()=>anchor(200),readAt:async(a:Anchor)=>({anchor:a,supply:state.supply,unpaid:state.unpaid,paused:false}),assertCanonicalOrder:async()=>{if(!state.canonical)throw Error('BRIDGE_REDEMPTION_ALREADY_ACKNOWLEDGED');},verify:async(request:any,o:any):Promise<VerifiedEvent>=>{assert.equal(request.kind,'ACK');return {kind:'ACK',id:o.id,amount:o.amountAtomic,evidenceCommitment:'0x'+digest([o.salt,o.destination]),receipt:receipt('base-sepolia','0x'+'f'.repeat(64))};}} as unknown as CanonicalBridgeBase;
 const runtime=new PausedBridgeRuntime(base,native),coordinator=new BridgeReverseCoordinator(runtime,binding),pin={path:'/synthetic/pinned',sha256:'b'.repeat(64)},pins:NativeCommandProfile={python:pin,worker:pin,profile:pin,approvedRequest:pin,approvedDigest:'b'.repeat(64)};
 coordinator.bindNative(pins,{root:'/opt/zeeswap-bridge-testnet',signingWallet:'/opt/zeeswap-bridge-testnet/signing',viewingWallet:'/opt/zeeswap-bridge-testnet/viewing',...accounts,approvedDigest:pins.approvedDigest,capitalNotes:[{pool:'ironwood',txid:'b'.repeat(64),index:0,value:'100000',role:'principal'},{pool:'ironwood',txid:'c'.repeat(64),index:9,value:'10000',role:'fee'}],extraFeeNotes:structuredClone(state.capital.notes)});
 (coordinator as any).native.command.run=async(command:string)=>{state.commands.push(command);if(command==='capital')return structuredClone(state.capital);if(command==='receipt')return structuredClone(state.nativeReceipt);if(command==='recover')return {intentId:r.attempt!.intentId,txid:TX,rawTransaction:'cafe',feeZatoshi:'10000',expiryHeight:'150'};throw Error('Unexpected native mutation: '+command);};
 return {b,r,binding,state,native,base,runtime,coordinator,store:new MemoryBridgeStore(b),pins};
}

test('canonical native receipt moves principal into pending Base ACK; only observed ACK closes it',async()=>{
 const {coordinator,store,r,state,base}=setup();await coordinator.reconcileNative(store,r.id);let b=await store.read();assert.equal(b.orders[r.id].status,'NATIVE_DELIVERED_AWAITING_ACK');assert.equal(b.controlled,'0');assert.equal(b.inTransit,'0');assert.equal(state.unpaid,'100000');
 await coordinator.assertAck(base,b.orders[r.id],b);state.unpaid='0';await coordinator.observeAck(store,r.id,('0x'+'f'.repeat(64)) as `0x${string}`);b=await store.read();assert.equal(b.orders[r.id].status,'COMPLETED');assert.equal(b.orders[r.id].acknowledgment?.network,'base-sepolia');assert.ok(state.commands.every(x=>['capital','receipt'].includes(x)));
});

test('native receipt wrong amount, recipient, txid, original block or insufficient confirmation rolls back publication',async()=>{
 for(const change of ['amount','recipient','txid','blockHash','confirmed','confirmations'] as const){const {coordinator,store,r,state}=setup();Object.assign(state.nativeReceipt,{[change]:change==='confirmed'?false:change==='confirmations'?9:change==='blockHash'?'f'.repeat(64):'wrong'});const before=digest(await store.read());await assert.rejects(()=>coordinator.reconcileNative(store,r.id),/CONFIRMED_RECEIPT_BINDING/);assert.equal(digest(await store.read()),before);}
});

test('incomplete inclusion stays in transit and never reads a final receipt',async()=>{
 const {coordinator,store,r,state}=setup();state.capital.included.confirmations=9;state.capital.inTransitZatoshi='100000';await coordinator.reconcileNative(store,r.id);assert.equal((await store.read()).orders[r.id].status,'IN_TRANSIT');assert.ok(!state.commands.includes('receipt'));
});

test('orphaned or changed native inclusion, unknown outgoing and acknowledged source fence payout/ACK',async()=>{
 for(const change of ['orphan','txid','blockHash','incomplete','outgoing','base-ack']){
  const {coordinator,store,r,state,base}=setup();await coordinator.reconcileNative(store,r.id);const b=await store.read();
  if(change==='orphan')(state.capital as any).included=null;
  if(change==='txid')state.capital.included.txid='f'.repeat(64);
  if(change==='blockHash')state.capital.included.blockHash='f'.repeat(64);
  if(change==='incomplete')state.capital.included.confirmations=9;
  if(change==='outgoing')state.scope=false;
  if(change==='base-ack')state.canonical=false;
  await assert.rejects(()=>coordinator.assertAck(base,b.orders[r.id],b),/ACK_DELIVERY_REORG|UNKNOWN_OUTGOING|ALREADY_ACKNOWLEDGED/);
 }
});

test('ACK observation refuses an orphaned native inclusion even with an old matching receipt',async()=>{
 const {coordinator,store,r,state}=setup();await coordinator.reconcileNative(store,r.id);(state.capital as any).included=null;state.unpaid='0';const before=digest(await store.read());
 await assert.rejects(()=>coordinator.observeAck(store,r.id,('0x'+'f'.repeat(64)) as `0x${string}`),/DELIVERY_REORG|INCLUDED_BINDING/);assert.equal(digest(await store.read()),before);
});

test('native receipt must explicitly contain a safe integral confirmation count',async()=>{
 for(const confirmations of [undefined,NaN,10.5]){
  const {coordinator,store,r,state}=setup();(state.nativeReceipt as any).confirmations=confirmations;const before=digest(await store.read());
  await assert.rejects(()=>coordinator.reconcileNative(store,r.id),/CONFIRMED_RECEIPT_BINDING/);assert.equal(digest(await store.read()),before);
 }
});

test('physical fee identities, exact sums and Base unpaid counter cannot be replaced with a capital label',async()=>{
 for(const change of ['note','role','duplicate','sum','counter']){
  const {coordinator,store,r,state}=setup();
  if(change==='note')state.capital.notes[0].txid='f'.repeat(64);
  if(change==='role')state.capital.notes[0].role='principal';
  if(change==='duplicate')state.capital.notes[1]=structuredClone(state.capital.notes[0]);
  if(change==='sum')state.capital.feeCapitalZatoshi='90001';
  if(change==='counter')state.unpaid='0';
  const before=digest(await store.read());await assert.rejects(()=>coordinator.reconcileNative(store,r.id),/CAPITAL_NOTE|CAPITAL_SUM|BOOK_RECONCILIATION/);assert.equal(digest(await store.read()),before);
 }
});

test('original Root permit and exact amount/order/profile are required before native calls',async()=>{
 const {coordinator,b,r,state,base}=setup();
 for(const change of ['permit','id','amount','recipient','payer']){const changed=structuredClone(b),o=changed.orders[r.id];if(change==='permit')changed.qualification!.permitSha256='f'.repeat(64);if(change==='id')changed.qualification!.permitId='other';if(change==='amount')o.amountAtomic='100001';if(change==='recipient')o.recipient='other';if(change==='payer')o.payer='0x'+'2'.repeat(40);await assert.rejects(()=>coordinator.assertPayout(o,changed),/ORIGINAL_SCOPE/);}
 assert.equal(state.commands.length,0);assert.throws(()=>coordinator.bindNative({} as any,{root:'/wrong'}),/PROFILE_BINDING/);assert.throws(()=>new BridgeReverseCoordinator({} as PausedBridgeRuntime,{} as PermitBinding),/CONCRETE/);
 state.canonical=false;await assert.rejects(()=>coordinator.assertAck(base,{...r,status:'NATIVE_DELIVERED_AWAITING_ACK',destination:receipt()},b),/ORIGINAL_SCOPE/);
});

test('explicit recovery only obtains original SDK bytes after durable interrupted-signing marker',async t=>{
 const {coordinator,b,r,state,binding,pins}=setup(),root=await mkdtemp(join(tmpdir(),'zee-reverse-recover-'));t.after(()=>rm(root,{recursive:true,force:true}));
 b.controlled='100000';state.capital.controlledZatoshi='100000';state.capital.notes.push({pool:'ironwood',txid:'b'.repeat(64),index:0,value:'100000',role:'principal'});state.capital.feeCapitalZatoshi='100000';state.capital.notes.push({pool:'ironwood',txid:'c'.repeat(64),index:9,value:'10000',role:'fee'});(state.capital as any).included=null;
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),journal=new BridgeJournal(root,keys),id=r.attempt!.intentId,identity={orderId:r.id,commitment:r.commitment,source:r.source,permitSha256:binding.sha256,profileSha256:pins.profile.sha256};let calculates=0;
 await assert.rejects(()=>journal.prepareOnce(id,identity,async()=>{calculates++;throw Error('synthetic signing interrupted');}),/interrupted/);
 await assert.rejects(()=>journal.prepareOnce(id,identity,async()=>{calculates++;throw Error('must not calculate');}),/SIGNING_RECONCILIATION/);assert.equal(calculates,1);
 const adapter=coordinator.signerAdapter(new BridgeJournal(root,keys),'recover');await adapter.assertFreshCanonical(r,b);
 const intent={intentId:id,orderId:r.id,recipient:r.recipient,amountAtomic:r.amountAtomic,maxFeeAtomic:'10000',principalAccount:b.principalAccount,feeAccount:b.feeAccount};
 const result=await adapter.recoverOrPrepare(intent);assert.equal(result.txid,TX);assert.equal(result.raw,'cafe');assert.equal(state.commands.filter(x=>x==='recover').length,1);assert.ok(!state.commands.some(x=>x==='prepare'||x==='broadcast'));
 assert.deepEqual(await adapter.recoverOrPrepare(intent),result);assert.equal(state.commands.filter(x=>x==='recover').length,1);
 await assert.rejects(()=>journal.recoverPreparedOnce(id,{...identity,permitSha256:'f'.repeat(64)},async()=>{throw Error('callback reached');}),/RECONCILIATION/);
});


test('journal recovery cannot start without an original marker or reenter a broadcast-unknown record',async t=>{
 const root=await mkdtemp(join(tmpdir(),'zee-reverse-journal-'));t.after(()=>rm(root,{recursive:true,force:true}));const keys=new PrivateData(randomBytes(32),randomBytes(32)),journal=new BridgeJournal(root,keys),id='a'.repeat(64),binding={original:'synthetic'},prepared={intentId:id,txid:TX,raw:'cafe',feeAtomic:'10000',expiryHeight:150};let recoveries=0,broadcasts=0;
 const recover=async()=>{recoveries++;return prepared;};
 await assert.rejects(()=>journal.recoverPreparedOnce(id,binding,recover),/RECONCILIATION/);assert.equal(recoveries,0);
 await assert.rejects(()=>journal.prepareOnce(id,binding,async()=>{throw Error('interrupted');}),/interrupted/);
 await assert.rejects(()=>journal.recoverPreparedOnce(id,binding,async()=>{throw Error('original SDK export unavailable');}),/export unavailable/);
 await assert.rejects(()=>journal.prepareOnce(id,binding,async()=>{throw Error('must not sign again');}),/SIGNING_RECONCILIATION/);
 await journal.recoverPreparedOnce(id,binding,recover);assert.equal(recoveries,1);
 await assert.rejects(()=>journal.broadcastOnce(id,prepared,async()=>{broadcasts++;throw Error('unknown broadcast');}),/unknown broadcast/);
 await assert.rejects(()=>new BridgeJournal(root,keys).recoverPreparedOnce(id,binding,recover),/RECONCILIATION/);assert.equal(recoveries,1);assert.equal(broadcasts,1);
});


async function provingClockFixture(t:TestContext,refresh:'fresh'|'stale'|'absent'){
 const {b,r}=setup();let clock=Date.now();t.mock.method(Date,'now',()=>clock);
 const initial={zcash:anchor(100),base:anchor(200)};b.pair=structuredClone(initial);b.controlled='100000';b.feeCapital='100000';r.status='REDEMPTION_PENDING';delete r.attempt;delete r.feeReservation;
 const store=new MemoryBridgeStore(b),root=await mkdtemp(join(tmpdir(),'zee-proving-clock-'));t.after(()=>rm(root,{recursive:true,force:true}));const journal=new BridgeJournal(root,new PrivateData(randomBytes(32),randomBytes(32))),id=digest(['bridge-delivery-v1',r.id,r.commitment]),binding={orderId:r.id,source:r.source};
 const signed={intentId:id,txid:TX,raw:'cafe',feeAtomic:'10000',expiryHeight:150};let calculates=0,refreshes=0;
 const signer:BridgeDurableSigner={assertFreshCanonical:async()=>{},recoverOrPrepare:async intent=>{assert.equal(intent.intentId,id);return journal.prepareOnce(id,binding,async()=>{calculates++;clock+=61001;return signed;});},broadcastOriginal:async()=>{throw Error('must not broadcast');}};
 let observedPair:typeof initial|undefined;
 if(refresh!=='absent')signer.refreshCanonicalPair=async()=>{refreshes++;observedPair=refresh==='fresh'?{zcash:{...anchor(101),observedAt:new Date(Date.now()).toISOString()},base:{...anchor(201),observedAt:new Date(Date.now()).toISOString()}}:structuredClone(initial);return observedPair;};
 const worker=new BridgeWorker(store,{verify:async()=>{throw Error('must not observe');}},signer);
 return {worker,store,r,initial,signed,id,binding,journal,calculates:()=>calculates,refreshes:()=>refreshes,observedPair:()=>observedPair};
}

test('post-proving canonical reread refreshes both anchors after >60 seconds and persists original signed bytes once',async t=>{
 const f=await provingClockFixture(t,'fresh'),signed=await f.worker.prepare(f.r.id,'10000');
 assert.deepEqual(signed,f.signed);const b=await f.store.read();assert.deepEqual(b.pair,f.observedPair());assert.equal(b.pair!.zcash.height,101);assert.equal(b.pair!.base.height,201);assert.deepEqual(b.orders[f.r.id].attempt,f.signed);assert.equal(b.orders[f.r.id].feeReservation?.charged,'10000');assert.equal(b.feeCapital,'90000');assert.equal(f.calculates(),1);assert.equal(f.refreshes(),1);
 assert.deepEqual(await f.worker.prepare(f.r.id,'10000'),f.signed);assert.equal(f.calculates(),1);assert.equal((await f.store.read()).feeCapital,'90000');
});

test('without a post-proving reread the aged pair refuses publication and preserves only intent/reservation',async t=>{
 const f=await provingClockFixture(t,'absent');await assert.rejects(()=>f.worker.prepare(f.r.id,'10000'),/STALE_CHECKPOINT/);
 const b=await f.store.read();assert.deepEqual(b.pair,f.initial);assert.deepEqual(b.orders[f.r.id].attempt,{intentId:f.id});assert.equal(b.orders[f.r.id].feeReservation?.charged,undefined);assert.equal(b.feeCapital,'90000','maximum reservation persists; no signed fee charge is published');assert.equal(f.calculates(),1);
 const original=await f.journal.recoverPreparedOnce(f.id,f.binding,async()=>{throw Error('must not sign or recover again');});assert.deepEqual(original,f.signed);assert.equal(f.calculates(),1);
});

test('a stale post-proving callback cannot renew the checkpoint clock or publish the signed record',async t=>{
 const f=await provingClockFixture(t,'stale');await assert.rejects(()=>f.worker.prepare(f.r.id,'10000'),/STALE_CHECKPOINT/);
 const b=await f.store.read();assert.deepEqual(b.pair,f.initial);assert.deepEqual(b.orders[f.r.id].attempt,{intentId:f.id});assert.equal(b.orders[f.r.id].feeReservation?.charged,undefined);assert.equal(b.feeCapital,'90000');assert.equal(f.refreshes(),1);assert.equal(f.calculates(),1);
});
