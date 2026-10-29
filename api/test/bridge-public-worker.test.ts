/** Synthetic bounded-observer/uncertainty contracts, not live settlement proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBooks,makeOrder,digest,type Anchor} from '../src/bridge/model.ts';
import {PublicBridgeWorker} from '../src/bridge/public-worker.ts';
import type {PublicBridgePilotRuntime} from '../src/bridge/public-pilot.ts';
import {MemoryBridgeStore,address} from './bridge-fixture.ts';
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),anchor=(n:number):Anchor=>({height:n,hash:hash(n),observedAt:new Date().toISOString()});
function sourceFixture(){
 const b={...emptyBooks(),paused:true,controlled:'100000',supply:'100000',feeCapital:'20000',principalAccount:'bridge:p',feeAccount:'bridge:f',swapAccount:'swap',pair:{zcash:{...anchor(100),hash:'a'.repeat(64)},base:anchor(1000)}};
 const o=makeOrder({direction:'ZEETAZ_TO_TAZ',amountAtomic:'100000',payer:address,recipient:'utest1synthetic'},'','public-source',Date.now());o.accepted=true;o.status='AWAITING_BURN';o.pilotPermitSha256='f'.repeat(64);o.acceptedPair=structuredClone(b.pair);b.orders[o.id]=o;
 const state={disagree:false,requests:[] as Array<{reader:number;from:number;to:number}>};
 const block=(n:number)=>({number:BigInt(n),hash:hash(n),parentHash:hash(n-1)});
 const base={profile:{contractAddress:address},finalized:async()=>anchor(3000),readAt:async()=>({anchor:anchor(3000),supply:'0',unpaid:'100000',paused:false}),clients:[0,1].map(reader=>({getBlock:async({blockNumber}:any)=>block(Number(blockNumber)),getLogs:async(q:any)=>{state.requests.push({reader,from:Number(q.fromBlock),to:Number(q.toBlock)});return Number(q.fromBlock)<=2500&&Number(q.toBlock)>=2500&&!(reader===1&&state.disagree)?[{address,topics:['0x'+'a'.repeat(64)],data:'0x',blockHash:hash(2500),blockNumber:2500n,transactionHash:hash(9999),transactionIndex:0,logIndex:0,removed:false}]:[];}})),verify:async(_request:any,current:any)=>({kind:'BURN',id:current.id,amount:'100000',payer:address,commitment:current.commitment,identity:'base:synthetic:'+current.commitment,receipt:{network:'base-sepolia',transactionHash:hash(9999),blockHeight:2500,blockHash:hash(2500)}})};
 const pilot={binding:{sha256:'f'.repeat(64)},base,assertBinding:()=>{},assertOrder:(current:any)=>{assert.equal(current.id,o.id);},observe:async()=>({s:{zcash:{...anchor(100),hash:'a'.repeat(64)}},c:{anchor:anchor(3000)}}),recheck:async(current:any)=>{assert.equal(current.supply,'0');assert.equal(current.orders[o.id].status,'REDEMPTION_PENDING');}} as unknown as PublicBridgePilotRuntime;
 const store=new MemoryBridgeStore(b),worker=new PublicBridgeWorker(store,pilot,{} as any,{} as any,{} as any,{} as any,'/synthetic');return {store,worker,o,state,pilot};
}
test('public burn observer advances only finite canonical seams then verifies the exact final burn',async()=>{
 const f=sourceFixture();await f.worker.scanBurn(f.o.id);let b=await f.store.read();assert.equal(b.orders[f.o.id].status,'AWAITING_BURN');assert.equal(b.orders[f.o.id].baseScanCursor?.height,1995);assert.equal(f.state.requests.length,10);assert.ok(f.state.requests.every(r=>r.to-r.from+1<=200));
 await f.worker.scanBurn(f.o.id);b=await f.store.read();assert.equal(b.orders[f.o.id].status,'REDEMPTION_PENDING');assert.equal(b.supply,'0');assert.equal(b.controlled,'100000');assert.equal(b.orders[f.o.id].source?.blockHeight,2500);
});
test('independent event disagreement never publishes that interval or burns a ledger liability',async()=>{
 const f=sourceFixture();await f.worker.scanBurn(f.o.id);f.state.disagree=true;await assert.rejects(()=>f.worker.scanBurn(f.o.id),/SCAN_DISAGREEMENT/);const b=await f.store.read();assert.equal(b.orders[f.o.id].status,'AWAITING_BURN');assert.equal(b.supply,'100000');assert.ok(b.orders[f.o.id].baseScanCursor!.height<2500);
});
test('a Base broadcast callback failure cannot cause another public-worker submission',async()=>{
 const f=sourceFixture();await f.store.update(b=>{const o=b.orders[f.o.id];o.direction='TAZ_TO_ZEETAZ';o.status='DEPOSIT_FINALIZED';o.recipient=address;});let submissions=0;
 (f.pilot as any).refresh=async()=>{};(f.pilot as any).base.verify=async()=>{throw Error('BRIDGE_BASE_ORIGINAL_NOT_FINAL');};
 const signer={prepare:async()=>({operationId:'a'.repeat(64),phase:'MINT',orderId:f.o.id,raw:'0xcafe',hash:hash(777),nonce:0,maxCostWei:'10000000000000',calldata:'0x'}),broadcast:async()=>{submissions++;throw Error('BRIDGE_BASE_BROADCAST_UNKNOWN');}};
 const worker=new PublicBridgeWorker(f.store,f.pilot,{} as any,signer as any,{} as any,{} as any,'/synthetic');await worker.tick();await assert.rejects(()=>worker.tick(),/BROADCAST_UNKNOWN/);assert.equal(submissions,1);assert.equal(f.store.books.orders[f.o.id].baseBroadcastAttempted?.MINT,true);await assert.rejects(()=>worker.tick(),/ORIGINAL_NOT_FINAL/);assert.equal(submissions,1);assert.equal(f.store.books.orders[f.o.id].baseEffects?.MINT?.raw,'0xcafe');
});
