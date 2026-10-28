import test from 'node:test';import assert from 'node:assert/strict';
import {serviceNativeDenseCanonical,serviceNativeTiledCanonical} from '../src/testnet-service-source-compat.ts';
import type {CanonicalReader} from '../src/integrations/observation/chef.ts';import type {Header} from '../src/integrations/observation/types.ts';
const min=4531977,tip=4552089,money=4540000,final=tip-9,hash=(h:number)=>h.toString(16).padStart(64,'0'),stamp='2026-10-29T00:00:00.000Z';
const header=(height:number):Header=>({height,hash:hash(height),parentHash:hash(height-1),time:stamp});
function fixture(o:{fork?:number;lateBoundaryFork?:boolean;lateSampleFork?:boolean;wrongSource?:boolean;abort?:AbortController}={}){
 const reads=new Set<number>(),signals:AbortSignal[]=[],samples:number[]=[];let tops=0,finished=false;
 const factory=(range?:{fromHeight:number;throughHeight:number}):CanonicalReader=>({
  sample:async signal=>{signal.throwIfAborted();signals.push(signal);const h=range?tip+100:tip+10+(++tops);if(!range)samples.push(h);return{sourceId:o.wrongSource?'wrong':'native',checkedAt:stamp,head:header(h)};},
  header:async(h,signal)=>{signal.throwIfAborted();signals.push(signal);reads.add(h);if(h===min+100)o.abort?.abort(Error('ORIGINAL_SERVICE_180S_DEADLINE'));signal.throwIfAborted();if(h===tip)finished=true;
   return h===o.fork||finished&&(o.lateBoundaryFork&&h===min+9999||o.lateSampleFork&&h===samples[0])?{...header(h),hash:hash(777)}:header(h);}
 });return{factory,reads,signals,samples};
}
test('service preparation densely covers actual growing prefix with sampled-head fences and original signal',async()=>{
 const f=fixture(),signal=AbortSignal.timeout(180000),wanted=[min,money,final,tip];
 await assert.rejects(serviceNativeDenseCanonical(wanted,f.factory,'native',signal),/TWO_PHASE_BOUND/);
 const result=await serviceNativeTiledCanonical(wanted,f.factory,'native',signal);assert.equal(result.phases.length,3);assert.equal(result.samples.length,3);
 assert.equal(result.phases[0]!.throughHeight,result.phases[1]!.fromHeight);assert.equal(result.phases[1]!.throughHeight,result.phases[2]!.fromHeight);
 for(let h=min;h<=tip;h++)assert.ok(f.reads.has(h),'missing dense interior '+h);
 for(const h of wanted)assert.deepEqual(result.headers.get(h),header(h));assert.ok(f.signals.every(s=>s===signal));for(const h of f.samples)assert.ok(f.reads.has(h),'unfenced sampled head '+h);
});
test('financial interior fork, fresh seam change and earlier sampled-head change all reject',async()=>{
 for(const [options,expected]of[[{fork:money},/HEADER_GAP_OR_FORK/],[{lateBoundaryFork:true},/TILED_BOUNDARY_CHANGED/],[{lateSampleFork:true},/SERVICE_NATIVE_HEAD_CHANGED/]]as const){const f=fixture(options);await assert.rejects(serviceNativeTiledCanonical([min,money,final,tip],f.factory,'native',AbortSignal.timeout(180000)),expected);}
});
test('wrong source, original deadline and retained-count bound remain mandatory',async()=>{
 await assert.rejects(serviceNativeTiledCanonical([min,tip],fixture({wrongSource:true}).factory,'native',AbortSignal.timeout(180000)),/CANONICAL_SOURCE/);
 const controller=new AbortController(),f=fixture({abort:controller});await assert.rejects(serviceNativeTiledCanonical([min,tip],f.factory,'native',controller.signal),/ORIGINAL_SERVICE_180S_DEADLINE/);
 await assert.rejects(serviceNativeTiledCanonical(Array(10005).fill(min),fixture().factory,'native',AbortSignal.timeout(180000)),/AUDIT_BOUND/);
});
