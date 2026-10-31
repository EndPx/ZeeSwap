import test from 'node:test';import assert from 'node:assert/strict';
import {requireClosedStartQualification} from '../scripts/check-testnet-closed-start.ts';
const info={status:'CLOSED_SERVICE_QUALIFIED',paused:false,warm:true,open:false,sourceFresh:true,financialWorkerLease:false},pid=12345,unit={ActiveState:'activating',MainPID:'0',ControlPID:String(pid)};
test('ExecCondition permits only its own activating ControlPID with exact closed warm qualification',()=>{
 assert.doesNotThrow(()=>requireClosedStartQualification(info,unit,pid,false));
 for(const ActiveState of ['inactive','failed'])assert.doesNotThrow(()=>requireClosedStartQualification(info,{ActiveState,MainPID:'0',ControlPID:'0'},pid,false));
 assert.doesNotThrow(()=>requireClosedStartQualification({...info,warm:false,open:true},unit,pid,false));
});
test('other checker, live worker, unknown unit transition or pending recovery refuses',()=>{
 for(const change of [{ControlPID:'54321'},{MainPID:'54321'},{ActiveState:'active'},{ActiveState:'deactivating'},{ControlPID:'0'}])assert.throws(()=>requireClosedStartQualification(info,{...unit,...change},pid,false));
 assert.throws(()=>requireClosedStartQualification(info,unit,pid,true),/SOURCE_RECOVERY_ACTIVE/);
});
test('paused, stale, leased, unqualified and nonwarm financial state refuses',()=>{
 for(const change of [{paused:true},{sourceFresh:false},{financialWorkerLease:true},{warm:false,open:false},{status:'CLOSED_SERVICE_REFUSED'}])assert.throws(()=>requireClosedStartQualification({...info,...change},unit,pid,false),/QUALIFICATION/);
});
