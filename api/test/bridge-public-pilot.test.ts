/** Synthetic policy/HTTP faults; no funded-circle or live settlement claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {applyEvent,digest,emptyBooks,type Books,type Anchor} from '../src/bridge/model.ts';
import {BridgeService} from '../src/bridge/service.ts';
import {PublicBridgePilotRuntime,FundedBridgeCircle,validatePublicPilotPermit,type PublicPilotBinding} from '../src/bridge/public-pilot.ts';
import {PublicBridgeStatusCache,createPublicBridgeHttp} from '../src/bridge/public-http.ts';
import {connectBridgeDatabase} from '../src/bridge/database.ts';
import type {BridgeNativeRead} from '../src/bridge/runtime.ts';
import type {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {newAccessToken} from '../src/private-data.ts';
import {MemoryBridgeStore,fixtureBooks,forward,reverse,receipt,address} from './bridge-fixture.ts';

const h='a'.repeat(64),a=(height:number):Anchor=>({height,hash:h,observedAt:new Date().toISOString()});
function fixture(){
 const b=fixtureBooks();b.paused=true;b.feeCapital='20000';const f=forward(b);f.funding={kind:'shielded-deposit',network:'zcash-testnet',address:'utest1owned',memo:'ZEEBRIDGE:'+f.commitment,cutoffHeight:150,cutoffTime:f.expiresAt};
 applyEvent(b,{kind:'DEPOSIT',id:f.id,amount:'100000',identity:'zcash-testnet:'+'b'.repeat(64)+':ironwood:0',receipt:receipt()},Date.now());applyEvent(b,{kind:'MINT',id:f.id,amount:'100000',recipient:f.recipient,receipt:receipt('base-sepolia')},Date.now());const r=reverse(b);
 applyEvent(b,{kind:'BURN',id:r.id,amount:'100000',payer:address,commitment:r.commitment,identity:'synthetic:burn',receipt:receipt('base-sepolia')},Date.now());r.status='PAYOUT_PENDING';r.attempt={intentId:'c'.repeat(64),txid:'d'.repeat(64),raw:'cafe',feeAtomic:'10000',expiryHeight:200};r.feeReservation={maximum:'10000',charged:'10000'};
 const nativeReceipt={...receipt(),transactionHash:'d'.repeat(64)};applyEvent(b,{kind:'INCLUDE',id:r.id,receipt:nativeReceipt},Date.now());applyEvent(b,{kind:'CONFIRM',id:r.id,receipt:nativeReceipt},Date.now());applyEvent(b,{kind:'ACK',id:r.id,amount:'100000',evidenceCommitment:'0x'+digest([r.salt,r.destination]),receipt:receipt('base-sepolia','0x'+'e'.repeat(64))},Date.now());
 const binding:PublicPilotBinding={sha256:'f'.repeat(64),permit:{version:1,purpose:'ROOT_PUBLIC_BRIDGE_PILOT',permitId:'12345678-1234-1234-1234-123456789abc',createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),databaseName:'zee_bridge_20261029',databaseRole:'zee_bridge_runtime_20261029',nativeReadProfileSha256:'d'.repeat(64),contractAddress:address,runtimeCodeHash:'0x'+h,principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,amountAtomic:'100000',maxAcceptedPerDirection:1,maxConcurrent:1,qualificationPermitId:'22345678-1234-1234-1234-123456789abc',qualificationPermitSha256:'c'.repeat(64),qualificationForwardOrderId:f.id,qualificationReverseOrderId:r.id,qualificationNativeProfileSha256:'b'.repeat(64),qualificationRecipientUfvkSha256:'e'.repeat(64)}};
 b.qualification={permitId:binding.permit.qualificationPermitId,permitSha256:binding.permit.qualificationPermitSha256,createdAt:binding.permit.createdAt,expiresAt:binding.permit.expiresAt};
 const state={circle:true,canonical:true,notes:[0,1].map(index=>({pool:'ironwood' as const,txid:'c'.repeat(64),index,value:'10000',height:90,ownChange:false,unspent:true as const,role:'fee' as const,blockHash:h}))};
 const native:BridgeNativeRead={principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,assertNoOutgoing:async()=>{throw Error('historical journal must be explicitly qualified');},assertOutgoingAllowlist:async ids=>{assert.deepEqual(ids,[r.id]);},validate:async()=>{},funding:async o=>({kind:'shielded-deposit',network:'zcash-testnet',address:'utest1owned',memo:'ZEEBRIDGE:'+o.commitment,cutoffHeight:150,cutoffTime:o.expiresAt}),snapshot:async(_orders,checkpoint)=>({version:1,status:'BRIDGE_NATIVE_READ_VERIFIED',principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,notes:structuredClone(state.notes),deposits:[{kind:'DEPOSIT',id:f.id,amount:'100000',identity:f.sourceIdentity!,receipt:f.source!}],controlledZatoshi:'0',feeCapitalZatoshi:'20000',zcash:a(100),...(checkpoint?{verifiedCheckpoint:{height:checkpoint.height,hash:checkpoint.hash}}:{})})};
 const base={profile:{contractAddress:address,runtimeCodeHash:'0x'+h,authorizer:address,principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount},finalized:async()=>({...a(200),hash:'0x'+h}),readAt:async(anchor:Anchor)=>{if(!state.canonical)throw Error('BRIDGE_BASE_REORG');return {anchor,supply:'0',unpaid:'0',gasBalanceWei:'10000000000000',paused:false};}} as unknown as CanonicalBridgeBase;
 const pin={path:'/synthetic/pin',sha256:'b'.repeat(64)},pins={python:pin,worker:pin,profile:pin,approvedRequest:pin,approvedDigest:pin.sha256};
 class SyntheticCircle extends FundedBridgeCircle {async verify(_b:Readonly<Books>){if(!state.circle)throw Error('BRIDGE_FUNDED_CIRCLE_REQUIRED');return [r.id];}assertFresh(){if(!state.circle)throw Error('BRIDGE_FUNDED_CIRCLE_REQUIRED');}}
 const circle=new SyntheticCircle(base,native,binding,pins),pilot=new PublicBridgePilotRuntime(base,native,binding,{databaseName:binding.permit.databaseName,databaseRole:binding.permit.databaseRole,nativeReadProfileSha256:binding.permit.nativeReadProfileSha256},circle),store=new MemoryBridgeStore(b),service=new BridgeService(store,pilot);return {b,f,r,binding,state,native,base,pins,circle,pilot,store,service};
}
test('literal public scope and real funded-circle gate cannot be replaced by deployment/empty metadata',async()=>{
 const f=fixture();const real=new FundedBridgeCircle(f.base,f.native,f.binding,f.pins);await assert.rejects(()=>real.verify(emptyBooks()),/FUNDED_CIRCLE_REQUIRED/);
 await assert.rejects(()=>real.verify(f.b),/ENOENT|FILE/);assert.throws(()=>validatePublicPilotPermit({...f.binding.permit,amountAtomic:'100001'} as any),/SCOPE/);
 f.state.circle=false;await assert.rejects(()=>f.pilot.open(f.store),/FUNDED_CIRCLE_REQUIRED/);assert.equal(f.store.books.paused,true);assert.equal(f.store.books.publicPilot,undefined);
});
test('a funded-circle forward labelled replacement cannot omit the preserved original retirement lineage',async()=>{
 const f=fixture();f.b.orders[f.f.id].replacementCertificateSha256='9'.repeat(64);const real=new FundedBridgeCircle(f.base,f.native,f.binding,f.pins);await assert.rejects(()=>real.verify(f.b),/REPLACEMENT_ORIGINAL_LINEAGE_REQUIRED/);
});
test('public counters are separate, arbitrary valid recipient is preserved, and prospective second accept fails',async()=>{
 const f=fixture();await f.pilot.open(f.store);const status=await f.service.status();assert.equal(status.state,'available');assert.equal(status.forwardEnabled,true);assert.equal(status.reverseEnabled,false,'zero supply is not advertised as reverse inventory');
 const body={direction:'TAZ_TO_ZEETAZ' as const,amountAtomic:'100000',recipient:'0x'+'3'.repeat(40),refundRecipient:'utest1arbitraryvalidated'},t1=newAccessToken(),t2=newAccessToken(),q1=await f.service.quote(body,t1,'public-first'),q2=await f.service.quote(body,t2,'public-second');
 const order=await f.service.accept(q1.id,t1,'public-first');assert.equal(order.recipient,body.recipient);assert.equal(f.store.books.orders[q1.id].pilotPermitSha256,f.binding.sha256);assert.equal(f.store.books.orders[q1.id].acceptedPair?.base.height,200);
 await assert.rejects(()=>f.service.accept(q2.id,t2,'public-second'),/EXPOSURE_LIMIT/);assert.equal(f.store.books.feeCapital,'10000');assert.equal((await f.service.status()).forwardEnabled,false);assert.equal(f.store.books.qualification?.permitSha256,f.binding.permit.qualificationPermitSha256);
});
test('wrong amount, changed permit, expired lease and canonical loss never yield new public instructions',async()=>{
 const f=fixture();await f.pilot.open(f.store);const input={direction:'TAZ_TO_ZEETAZ' as const,amountAtomic:'100001',recipient:address,refundRecipient:'utest1valid'};await assert.rejects(()=>f.service.quote(input,newAccessToken(),'wrong-amount'),/EXPOSURE_LIMIT/);
 f.state.canonical=false;assert.equal((await f.service.status()).forwardEnabled,false);f.state.canonical=true;
 const old=Date.now;try{Date.now=()=>Date.parse(f.binding.permit.expiresAt)+1;await assert.rejects(()=>f.service.quote({...input,amountAtomic:'100000'},newAccessToken(),'expired-lease'),/PERMIT_EXPIRED|STALE/);}finally{Date.now=old;}
 await f.store.update(b=>{b.paused=true;b.publicPilot!.permitSha256='0'.repeat(64);});await assert.rejects(()=>f.pilot.open(f.store),/ORIGINAL_PERMIT_REQUIRED/);
});
test('cached public status preserves original clocks and invalidates financial changes immediately',async()=>{
 const f=fixture();await f.pilot.open(f.store);const cache=new PublicBridgeStatusCache();await cache.refresh(f.store,f.service);const b=await f.store.read(),value=cache.get(b)!;assert.equal(value.state,'available');
 const clocks=JSON.stringify(value.reserveReport);b.pair={base:{...b.pair!.base,observedAt:new Date(Date.now()+100).toISOString()},zcash:b.pair!.zcash};assert.equal(JSON.stringify(cache.get(b)!.reserveReport),clocks);
 b.feeCapital='10000';assert.equal(cache.get(b),undefined);assert.equal(cache.get(await f.store.read(),Date.now()+61000),undefined);
});
test('public HTTP returns fast verified status, rejects cross-origin writes and never exposes a fact-injection route',async t=>{
 const f=fixture();await f.pilot.open(f.store);const cache=new PublicBridgeStatusCache();await cache.refresh(f.store,f.service);const execution={busy:false},{server}=createPublicBridgeHttp(f.store,f.pilot,cache,execution);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const url='http://127.0.0.1:'+(server.address() as any).port;
 const response=await fetch(url+'/v1/bridge/status');assert.equal(response.status,200);assert.equal((await response.json()).state,'available');
 const headers={'content-type':'application/json',authorization:'Bearer '+newAccessToken(),'idempotency-key':'public-http'};assert.equal((await fetch(url+'/v1/bridge/quotes',{method:'POST',headers,body:'{}'})).status,403);
 const foreign=await fetch(url+'/v1/bridge/evidence',{method:'POST',headers:{...headers,origin:'https://zeeswap.endpx.cloud'},body:'{}'});assert.equal(foreign.status,404);
 execution.busy=true;assert.equal((await fetch(url+'/v1/bridge/quotes',{method:'POST',headers:{...headers,origin:'https://zeeswap.endpx.cloud'},body:'{}'})).status,503);
});
test('bridge primary refuses Neon, alternate local port and missing primary binding before network/file access',async()=>{
 for(const url of ['postgresql://zee_bridge_runtime_20261029:x@neon.example/zee_bridge_20261029','postgresql://zee_bridge_runtime_20261029:x@127.0.0.1:5432/zee_bridge_20261029'])await assert.rejects(()=>connectBridgeDatabase(url,{kind:'VPS_POSTGRESQL_PRIMARY',systemIdentifier:'7701863382450487342',ca:{path:'/opt/zeeswap-bridge-testnet/private/postgres-ca.pem',sha256:'a'.repeat(64)},tlsServerName:'bridge-primary.internal'}),/LOCAL_PRIMARY_TRANSPORT_REQUIRED/);
});
