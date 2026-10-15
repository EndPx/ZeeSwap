import test from 'node:test';
import assert from 'node:assert/strict';
import {nextG5PreparePriority,selectG5PreparePriority} from '../src/g5-prepare-priority.ts';
test('known post-prepare wait holds exact order across no-eligible lease waits before another preparation',()=>{
 const a={sequence:3,stage:'DISPATCH'},b={sequence:5,stage:'DISPATCH'};let pin=nextG5PreparePriority(undefined,a,'OBSERVER_WAIT',a);
 assert.equal(selectG5PreparePriority([b,a],pin),a);pin=nextG5PreparePriority(pin,a,'NO_ELIGIBLE_JOB',a);assert.equal(selectG5PreparePriority([b,a],pin),a);
 assert.throws(()=>nextG5PreparePriority(pin,b,'OBSERVER_WAIT',b),/DIFFERENT_ORDER/);pin=nextG5PreparePriority(pin,a,'AWAITING_BASE_FINALITY',a);assert.equal(pin,undefined);
});
test('COMMIT and SETTLE original preparation pins continue through broadcast and release only at known original broadcast outcome',()=>{
 for(const [prepare,signed,broadcast] of [['PREPARE_COMMIT','COMMIT_SIGNED_DURABLY','BROADCAST_COMMIT'],['PREPARE_SETTLE','SETTLE_SIGNED_DURABLY','BROADCAST_SETTLE']] as const){
  const before={sequence:4,stage:prepare},after={sequence:4,stage:broadcast};let pin=nextG5PreparePriority(undefined,before,'OBSERVER_WAIT',before);pin=nextG5PreparePriority(pin,before,signed,after);assert.deepEqual(pin,after);
  pin=nextG5PreparePriority(pin,after,'OBSERVER_WAIT',after);assert.deepEqual(pin,after);assert.equal(nextG5PreparePriority(pin,after,'ALREADY_FINALIZED',{sequence:4,stage:'OBSERVE_COMMIT'}),undefined);
 }
});
test('priority policy cannot clear or reinterpret unknown outcomes and refuses a changed phase',()=>{
 const before={sequence:4,stage:'PREPARE_COMMIT'},pin=nextG5PreparePriority(undefined,before,'OBSERVER_WAIT',before)!;
 assert.equal(nextG5PreparePriority(pin,before,'UNRECOGNIZED_FAILURE',before),pin);assert.throws(()=>selectG5PreparePriority([{sequence:4,stage:'OBSERVE_COMMIT'}],pin),/PHASE_CHANGED/);
 assert.equal(nextG5PreparePriority(undefined,{sequence:4,stage:'OBSERVE_SOURCE'},'OBSERVER_WAIT',{sequence:4,stage:'OBSERVE_SOURCE'}),undefined);
});
