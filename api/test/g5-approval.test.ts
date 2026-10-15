import test from 'node:test';
import assert from 'node:assert/strict';
import {g5ApproveAfterFreshCommit} from '../src/g5-approval.ts';
test('fresh pending COMMIT writes no approval even after an older finalized database observation',async()=>{
 let approvals=0;const olderDatabaseCommitFinalized=true;assert.ok(olderDatabaseCommitFinalized);
 const result=await g5ApproveAfterFreshCommit(async()=>({status:'AWAITING_BASE_FINALITY'}),async()=>{approvals++;return {status:'APPROVED'};});
 assert.deepEqual(result,{status:'AWAITING_BASE_FINALITY',phase:'APPROVE_WALLET'});assert.equal(approvals,0);
 assert.deepEqual(await g5ApproveAfterFreshCommit(async()=>({status:'COMMIT_FINALIZED'}),async()=>{approvals++;return {status:'APPROVED'};}),{status:'APPROVED'});assert.equal(approvals,1);
});
test('fresh contradictory COMMIT failures and unknown statuses remain hard failures without approval',async()=>{
 let approvals=0;const approve=async()=>{approvals++;};
 await assert.rejects(()=>g5ApproveAfterFreshCommit(async()=>{throw Error('BASE_ESCROW_COMMIT_MISMATCH');},approve),/COMMIT_MISMATCH/);
 await assert.rejects(()=>g5ApproveAfterFreshCommit(async()=>({status:'OTHER'}),approve),/UNEXPECTED_FRESH/);assert.equal(approvals,0);
});
