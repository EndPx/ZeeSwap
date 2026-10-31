import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import type {BridgeBaseProfile} from '../src/bridge/adapters/profile.ts';

const h=(c:string)=>'0x'+c.repeat(64),address=(c:string)=>'0x'+c.repeat(40);
function fixture(){
 const p:BridgeBaseProfile={version:1,mode:'BRIDGE_BASE_TESTNET',chainId:84532,rpcUrls:['https://reader-one.invalid','https://reader-two.invalid'],contractAddress:address('1') as any,runtimeCodeHash:keccak256('0x6000'),deployment:{transactionHash:h('2') as any,blockHeight:50,blockHash:h('3') as any},admin:address('4') as any,operator:address('5') as any,authorizer:address('5') as any,maximumObservationAgeSeconds:60,maximumGas:'21000',gasPriceWei:'1',maximumTransactionCostWei:'21000',minimumGasBalanceWei:'21000',principalAccount:'bridge:p',feeAccount:'bridge:f',swapAccount:'swap'};
 const b=new CanonicalBridgeBase(p),anchor={height:100,hash:h('6'),observedAt:new Date().toISOString()},s={chain:84532,latest:200n,final:180n,ageMs:0,hash:anchor.hash,code:'0x6000' as any,status:'success',contract:p.contractAddress,receiptHeight:50n,receiptHash:p.deployment.blockHash};
 const client={getChainId:async()=>s.chain,getBlock:async(q:any)=>q?.blockTag==='finalized'?{number:s.final}:q?.blockNumber!==undefined?{number:q.blockNumber,hash:q.blockNumber===100n?s.hash:p.deployment.blockHash}:{number:s.latest,timestamp:BigInt(Math.floor((Date.now()-s.ageMs)/1000))},getCode:async()=>s.code,getTransactionReceipt:async()=>({status:s.status,contractAddress:s.contract,blockNumber:s.receiptHeight,blockHash:s.receiptHash}),readContract:async(q:any)=>({decimals:8,admin:p.admin,operator:p.operator,authorizer:p.authorizer,totalSupply:0n,unpaidRedemptionPrincipal:0n,paused:false} as any)[q.functionName],getBalance:async()=>21000n};
 (b.clients as any).splice(0,2,client,client);return {b,s,p,anchor};
}
test('canonical diagnostics preserve successful identity behavior',async()=>{const f=fixture();assert.equal((await f.b.readAt(f.anchor)).supply,'0');});

test('Root opted-in L2 anchor uses the minimum independent latest canonical block without altering finalized()',async()=>{
 const f=fixture();let checked=0;Object.assign(f.b,{fastL2:{recheck:async()=>{checked++;}}});
 f.s.final=99n;await assert.doesNotReject(()=>f.b.readAt(f.anchor));assert.equal(checked,1);
 const heads=[202n,200n];for(let i=0;i<2;i++)Object.assign(f.b.clients[i],{getBlock:async(q:any)=>q?.blockTag==='finalized'?{number:99n}:q?.blockNumber!==undefined?{number:q.blockNumber,hash:h('6')}:{number:heads[i],timestamp:BigInt(Math.floor(Date.now()/1000))}});
 const selected=await f.b.settlementAnchor();assert.equal(selected.height,200);assert.equal(selected.hash,h('6'));
 assert.equal((await f.b.finalized()).height,99);
});
test('two finite independent finalized rounds select only the minimum actual observation; a later lower view still refuses',async()=>{
 const f=fixture(),rounds=[[210n,205n],[208n,180n]],counts=[0,0],headerHash=h('a');
 for(let i=0;i<2;i++){
  const original=f.b.clients[i];(f.b.clients as any)[i]={...original,getBlock:async(q:any)=>{
   if(q?.blockTag==='finalized'){const n=rounds[i][counts[i]++]??179n;return {number:n};}
   if(q?.blockNumber!==undefined)return {number:q.blockNumber,hash:q.blockNumber===180n?headerHash:f.p.deployment.blockHash};
   return {number:300n,timestamp:BigInt(Math.floor(Date.now()/1000))};
  }};
 }
 const selected=await f.b.finalized();assert.equal(selected.height,180);assert.equal(selected.hash,headerHash);assert.deepEqual(counts,[2,2]);
 await assert.rejects(()=>f.b.readAt(selected),(error:any)=>{assert.equal(error.message,'BRIDGE_BASE_FINALITY_COVERS_ANCHOR');assert.equal(error.canonicalDiagnostic.anchorHeight,180);assert.equal(error.canonicalDiagnostic.finalizedHeight,'179');return true;});
});
test('every identity predicate has a precise code and private exact-reader/anchor diagnostics',async()=>{
 const faults:Array<[string,(f:ReturnType<typeof fixture>)=>void]>=[
  ['CHAIN_IDENTITY',f=>{f.s.chain=1;}],['ANCHOR_HASH_IDENTITY',f=>{f.s.hash=h('7');}],['FINALITY_COVERS_ANCHOR',f=>{f.s.final=99n;}],['LATEST_COVERS_FINALIZED',f=>{f.s.latest=179n;}],['LATEST_NOT_STALE',f=>{f.s.ageMs=61000;}],['LATEST_NOT_FUTURE',f=>{f.s.ageMs=-7000;}],['RUNTIME_CODE_IDENTITY',f=>{f.s.code='0x6001';}],['DEPLOYMENT_RECEIPT_SUCCESS',f=>{f.s.status='reverted';}],['DEPLOYMENT_ADDRESS_IDENTITY',f=>{f.s.contract=address('8') as any;}],['DEPLOYMENT_HEIGHT_IDENTITY',f=>{f.s.receiptHeight=51n;}],['DEPLOYMENT_HASH_IDENTITY',f=>{f.s.receiptHash=h('9') as any;}],['ANCHOR_COVERS_DEPLOYMENT',f=>{f.p.deployment.blockHeight=101;f.s.receiptHeight=101n;}],
 ];
 for(const [code,change] of faults){const f=fixture();change(f);await assert.rejects(()=>f.b.readAt(f.anchor),(error:any)=>{assert.equal(error.message,'BRIDGE_BASE_'+code);assert.equal(error.canonicalDiagnostic.failedPredicate,code);assert.equal(error.canonicalDiagnostic.anchorHeight,100);assert.equal(error.canonicalDiagnostic.anchorHash,f.anchor.hash);assert.equal(typeof error.canonicalDiagnostic.reader,'number');assert.ok(!JSON.stringify(error.canonicalDiagnostic).includes('https://'));return true;});}
});
