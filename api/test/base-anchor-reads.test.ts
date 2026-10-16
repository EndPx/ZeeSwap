import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {readBaseAnchorsBounded} from '../src/base-anchor-reads.ts';

test('all99 anchors are read exactly once with concurrency at most4 and stable result order despite out-of-order completion',async()=>{
 const anchors=Array.from({length:99},(_,i)=>({height:String(i),hash:'fixture:'+i}));let active=0,max=0;
 const started:number[]=[],completed:number[]=[],pending:{index:number;resolve:()=>void}[]=[];
 const result=readBaseAnchorsBounded(anchors,async a=>{const index=Number(a.height);started.push(index);active++;max=Math.max(max,active);
  await new Promise<void>(resolve=>pending.push({index,resolve}));active--;completed.push(index);return {...a,canonical:true};
 });
 while(completed.length<anchors.length){await setImmediate();for(const task of pending.splice(0).reverse())task.resolve();}
 assert.deepEqual(await result,anchors.map(a=>({...a,canonical:true})));assert.equal(max,4);assert.equal(active,0);
 assert.deepEqual(started,anchors.map((_,i)=>i));assert.equal(new Set(completed).size,99);assert.notDeepEqual(completed,started);
});
test('failure schedules no more anchors and drains all started requests before propagating the original error',async()=>{
 const error=Error('BASE_RPC_UNAVAILABLE'),started:number[]=[],settled:number[]=[],pending=new Map<number,{resolve:()=>void;reject:(e:unknown)=>void}>();let escaped=false;
 const run=readBaseAnchorsBounded(Array.from({length:99},(_,i)=>i),async i=>{started.push(i);try{await new Promise<void>((resolve,reject)=>pending.set(i,{resolve,reject}));return i;}finally{settled.push(i);}}).catch(e=>{escaped=true;throw e;});
 assert.deepEqual(started,[0,1,2,3]);pending.get(1)!.reject(error);await setImmediate();assert.equal(escaped,false);assert.deepEqual(started,[0,1,2,3]);
 pending.get(3)!.resolve();pending.get(2)!.reject(Error('SECONDARY_SECRET'));await setImmediate();assert.equal(escaped,false);
 pending.get(0)!.resolve();await assert.rejects(run,e=>e===error);assert.deepEqual(settled.sort(),[0,1,2,3]);assert.deepEqual(started,[0,1,2,3]);
});
test('empty anchors perform no read and a synchronous throw still drains started workers',async()=>{
 let calls=0;assert.deepEqual(await readBaseAnchorsBounded([],async()=>{calls++;}),[]);assert.equal(calls,0);
 const error=Error('ANCHOR_INVALID');await assert.rejects(readBaseAnchorsBounded([1,2,3,4,5],()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,1);
});
import {refreshReverseObservers} from '../src/reverse-observer-refresh.ts';
test('production refresh excludes only anchors above the fetched latest head and never publishes a failed drained batch',async()=>{
 const hash='ab'.repeat(32),time=new Date().toISOString(),source={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,scannedHeight:1000,tipHash:hash,blocks:[{height:1000,hash,time},{height:991,hash,time}],outputs:[]},before=structuredClone(source);
 const started:bigint[]=[],pending=new Map<bigint,{resolve:(v:any)=>void;reject:(e:unknown)=>void}>();let connected=0,escaped=false;
 const pool={query:async()=>({rows:[...Array.from({length:99},(_,i)=>({height:String(i)})),{height:'101'}]}),connect:async()=>{connected++;throw Error('MUST_NOT_PUBLISH');}};
 const base={heads:async()=>({latest:{number:100n,hash:'0x'+hash},finalized:{number:90n,hash:'0x'+hash}}),client:{getBlock:async({blockNumber}:any)=>{started.push(blockNumber);return new Promise((resolve,reject)=>pending.set(blockNumber,{resolve,reject}));}}};
 const error=Error('BASE_RPC_UNAVAILABLE'),run=refreshReverseObservers(pool as any,base as any,source).catch(e=>{escaped=true;throw e;});
 await setImmediate();assert.deepEqual(started,[0n,1n,2n,3n]);pending.get(0n)!.reject(error);await setImmediate();assert.equal(escaped,false);
 for(const n of [3n,2n,1n])pending.get(n)!.resolve({hash:'0x'+hash,timestamp:1n});
 await assert.rejects(run,e=>e===error);assert.equal(connected,0);assert.equal(started.includes(101n),false);assert.deepEqual(started,[0n,1n,2n,3n]);assert.deepEqual(source,before);
});
