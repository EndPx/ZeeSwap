import test from 'node:test';import assert from 'node:assert/strict';
import {continuationTables,continuationDigest} from '../src/native-circle-continuation.ts';
import {serviceFinancialDigest,type ServiceLaunchState} from '../src/testnet-service-launch.ts';
import {RESUME_POLICY,validateExecutionResume,type ExecutionResumeApproval} from '../src/testnet-policy-execution-resume.ts';
function fixture(){
 const now=Date.now(),snapshot=Object.fromEntries(continuationTables.map(t=>[t,[]])) as Record<string,any[]>;
 snapshot.orders=[{state:'SETTLED'}];snapshot.inventory_accounts=[{reserved:'0'}];snapshot.base_attempts=[{confirmed:true}];snapshot.reservations=[{released_at:new Date().toISOString()}];
 const state:ServiceLaunchState={control:{epoch:'243',xmin:'532521',accepting_orders:false,dispatch_enabled:false,reconciliation_required:true},snapshot,globalBusy:false,authorizationRows:0,feeXmin:'original'};
 const approval:ExecutionResumeApproval={version:1,purpose:'ROOT_CLOSED_TESTNET_POLICY_EXECUTION_RESUME',policySha256:RESUME_POLICY,originalEpoch:'242',pausedEpoch:'243',effectiveEpoch:'244',pausedXmin:'532521',financialSha256:serviceFinancialDigest(snapshot),snapshotSha256:continuationDigest(snapshot),executionApprovalSha256:'a'.repeat(64),migrationSha256:'b'.repeat(64),functionBaselineSha256:'c'.repeat(64),verifiedAt:new Date(now).toISOString(),expiresAt:new Date(now+120000).toISOString()};return{state,approval,now};
}
test('Root idle resume binds the actual closed snapshot, monotonic control and finite authority without rewriting raw policy',()=>{
 const {state,approval,now}=fixture();validateExecutionResume(approval,state,now);
 for(const change of[{originalEpoch:'244'},{effectiveEpoch:'242'},{pausedXmin:'other'},{policySha256:'a'.repeat(64)},{snapshotSha256:'a'.repeat(64)},{financialSha256:'a'.repeat(64)},{expiresAt:new Date(now-1).toISOString()},{expiresAt:new Date(now+600000).toISOString()}])assert.throws(()=>validateExecutionResume({...approval,...change} as ExecutionResumeApproval,state,now));
 const changed=structuredClone(state);changed.snapshot.inventory_accounts![0].reserved='1';assert.throws(()=>validateExecutionResume(approval,changed,now),/EXACT_CLOSED_BOOKS/);
 const funded=structuredClone(state);funded.snapshot.orders![0].state='READY';const rebound={...approval,financialSha256:serviceFinancialDigest(funded.snapshot),snapshotSha256:continuationDigest(funded.snapshot)};assert.throws(()=>validateExecutionResume(rebound,funded,now),/NO_PENDING_FINANCIAL_WORK/);
 assert.throws(()=>validateExecutionResume(approval,{...state,globalBusy:true},now),/PAUSED_CLOSED/);
});
