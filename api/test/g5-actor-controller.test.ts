import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextG5ActorPhase,runG5ActorBounded,type G5ActorState} from '../src/g5-actor-controller.ts';
const initial=():G5ActorState=>({version:1,sequence:1,phase:'SOURCE_SYNC',incident:false,fundingIntent:false,verified:[],barriers:[]});
test('circle verifies both orders; every five needs a physical barrier',()=>{
 let s=initial();const phases:string[]=[];
 while(s.phase!=='DONE'){
  phases.push(`${s.sequence}:${s.phase}`);s=nextG5ActorPhase(s,{status:'DONE'});
 }
 assert.deepEqual(s.verified,Array.from({length:20},(_,i)=>i+1));assert.deepEqual(s.barriers,[5,10,15,20]);
 assert(phases.indexOf('5:BARRIER')<phases.indexOf('6:QUOTE'));assert(!phases.includes('2:SOURCE_SYNC'));
});
test('unknown funding latches incident and never requests second source send',async()=>{
 const saved:G5ActorState[]=[];let calls=0;
 const result=await runG5ActorBounded({...initial(),phase:'SOURCE_FUND'},{maxSteps:10,maxMilliseconds:1000},{now:()=>0,save:async s=>{saved.push(s);},step:async()=>{calls++;assert.equal(saved[0].fundingIntent,true);throw Error('ambiguous');}});
 assert.equal(calls,1);assert.equal(result.state.incident,true);assert.equal(result.state.fundingIntent,true);
 assert.throws(()=>nextG5ActorPhase(result.state,{status:'DONE'}),/FROZEN/);
});
test('bounded wait stops without blindly retrying and preexisting intent is recovery-only',async()=>{
 let calls=0;const r=await runG5ActorBounded(initial(),{maxSteps:3,maxMilliseconds:1000},{now:()=>0,save:async()=>{},step:async()=>{calls++;return {status:'WAIT'};}});
 assert.equal(calls,1);assert.equal(r.status,'BOUNDED_STOP');
 await assert.rejects(()=>runG5ActorBounded({...initial(),phase:'SOURCE_FUND',fundingIntent:true},{maxSteps:3,maxMilliseconds:1000},{now:()=>0,save:async()=>{},step:async()=>{throw Error('must not execute');}}),/RECOVER_ORIGINAL/);
});
