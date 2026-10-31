import test from 'node:test';import assert from 'node:assert/strict';
import {requireClosedStartQualification,closedInspectorExport} from '../scripts/check-testnet-closed-start.ts';
const info={status:'CLOSED_SERVICE_QUALIFIED',paused:false,warm:true,open:false,sourceFresh:true,financialWorkerLease:false},pid=12345,unit={ActiveState:'activating',MainPID:'0',ControlPID:String(pid)};
test('only the two explicit closed inspector entry names may be imported',()=>{
 assert.equal(closedInspectorExport('/opt/zeeswap-testnet/releases/original/app/api/scripts/recover-testnet-closed-service.ts'),'closedServiceAction');
 assert.equal(closedInspectorExport('/opt/zeeswap-testnet/releases/continuous/app/api/scripts/administer-continuous-demo.ts'),'continuousClosedServiceAction');
 for(const path of ['/api/scripts/arbitrary.ts','/api/scripts/administer-continuous-demo.ts/other','/api/scripts/not-administer-continuous-demo.ts'])assert.throws(()=>closedInspectorExport(path),/ENTRY/);
});
test('ExecCondition permits only its own activating ControlPID with exact closed warm qualification',()=>{
 assert.doesNotThrow(()=>requireClosedStartQualification(info,unit,pid,false));
 for(const ActiveState of ['inactive','failed'])assert.doesNotThrow(()=>requireClosedStartQualification(info,{ActiveState,MainPID:'0',ControlPID:'0'},pid,false));
 assert.doesNotThrow(()=>requireClosedStartQualification({...info,warm:false,open:true},unit,pid,false));
});
test('other checker, live worker, unknown unit transition or pending recovery refuses',()=>{
 for(const change of [{ControlPID:'54321'},{MainPID:'54321'},{ActiveState:'active'},{ActiveState:'deactivating'},{ControlPID:'0'}])assert.throws(()=>requireClosedStartQualification(info,{...unit,...change},pid,false));
 assert.throws(()=>requireClosedStartQualification(info,unit,pid,true),/SOURCE_RECOVERY_ACTIVE/);
 assert.throws(()=>requireClosedStartQualification({...info,pendingPublication:true},unit,pid,false),/ORIGINAL_TRANSACTION_PENDING/);
});
test('paused, stale, leased, unqualified and nonwarm financial state refuses',()=>{
 for(const change of [{paused:true},{sourceFresh:false},{financialWorkerLease:true},{warm:false,open:false},{status:'CLOSED_SERVICE_REFUSED'}])assert.throws(()=>requireClosedStartQualification({...info,...change},unit,pid,false),/QUALIFICATION/);
});
