import test from 'node:test';import assert from 'node:assert/strict';
import {closedTipCase,validateClosedTipApproval,validateClosedTipBefore,validateClosedTipDiagnostic,expectedClosedTipAfter,validateClosedTipIntent,classifyClosedTipCommit,finishClosedTipBoundary} from '../src/app-chef-closed-tip-repair.ts';
import {parseClosedTipArgs} from '../scripts/repair-linux-chef-closed-tip.ts';
import {digest} from '../src/integrations/observation/types.ts';
import {closedTipFixture,closedTipIntent,hash} from './fixtures/closed-tip-fixture.ts';
test('closed-history approval binds exact scope, source, current financial digest and active metadata expiry',()=>{
 const f=closedTipFixture();validateClosedTipApproval(f.approval,f.context);validateClosedTipBefore(f.state,f.approval,f.oldCursor,f.approval.oldCursorSha256);validateClosedTipDiagnostic(f.report,f.state,f.approval);
 for(const patch of [{noFinance:false},{metadataOnly:false},{financialDigest:hash(80)},{sourceIdentity:{generation:'other'}},{expiresAt:new Date(Date.parse(f.approval.verifiedAt)+7200001).toISOString()}])assert.throws(()=>validateClosedTipApproval({...f.approval,...patch} as any,f.context));
 assert.throws(()=>validateClosedTipApproval(f.approval,f.context,Date.parse(f.approval.expiresAt)),/APPROVAL_TIME/);
 for(const mutate of [(s:any)=>s.control.epoch='218',(s:any)=>s.books.orders.push({id:2}),(s:any)=>s.authorizationRows='1',(s:any)=>s.triggers.bindings[0].enabled='D',(s:any)=>s.checkpoints[1].observed_at='2026-10-25T16:00:00Z']){const bad=structuredClone(f.state);mutate(bad);assert.throws(()=>validateClosedTipBefore(bad,f.approval,f.oldCursor,f.approval.oldCursorSha256));}
});
test('diagnostic conflict report is not authority: exact sole unfinalized tip, current full metadata and financial anchors are required',()=>{
 const f=closedTipFixture();for(const mutate of [(r:any)=>r.noRepairAttestation=true,(r:any)=>r.complete=false,(r:any)=>r.financialAnchorConflictCount=1,(r:any)=>r.conflicts.push({...r.conflicts[0],height:4540628}),(r:any)=>r.firstCommonAncestorRecentSuffix.height=4540627,(r:any)=>r.rows.pop(),(r:any)=>r.cursor.sha256=hash(85)]){const bad=structuredClone(f.report);mutate(bad);assert.throws(()=>validateClosedTipDiagnostic(bad,f.state,f.approval));}
});
test('intended result repairs one row and rewinds only checkpoint/cursor, preserving finalized and observation time with epoch plus two',()=>{
 const f=closedTipFixture(),intent=closedTipIntent(f),after=expectedClosedTipAfter(f.state,f.approval,intent.expectedXmin),beforeNative=f.state.checkpoints[1]!,afterNative=after.checkpoints[1]!;
 assert.equal(after.control.epoch,'219');assert.equal(after.control.xmin,'900');assert.equal(afterNative.scanned_height,'4540628');assert.equal(afterNative.finalized_height,'4540620');assert.equal(afterNative.finalized_time,beforeNative.finalized_time);assert.equal(afterNative.observed_at,beforeNative.observed_at);assert.equal(digest(after.books),digest(f.state.books));assert.deepEqual(after.checkpoints[0],f.state.checkpoints[0]);assert.equal(after.rows.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(f.state.rows[i])).length,1);
 validateClosedTipIntent(intent,f.approval,intent.approvalSha256);assert.equal(intent.newCursor.processedThrough,closedTipCase.common);
 for(const mutate of [(v:any)=>v.after.control.epoch='217',(v:any)=>v.after.checkpoints[1].observed_at='2026-10-25T17:00:00Z',(v:any)=>v.newCursor.tipHash=hash(86),(v:any)=>v.expectedXmin='901']){const bad=structuredClone(intent);mutate(bad);assert.throws(()=>validateClosedTipIntent(bad,f.approval,intent.approvalSha256));}
});
test('unknown/aborted/intervened COMMIT never replays or removes markers; lease loss retains the marker',async()=>{
 const f=closedTipFixture(),intent=closedTipIntent(f);assert.equal(classifyClosedTipCommit('committed',intent.after,intent),'COMMITTED_EXACT');assert.equal(classifyClosedTipCommit('aborted',intent.before,intent),'ABORTED_EXACT_NO_REPLAY');assert.equal(classifyClosedTipCommit('unknown',intent.after,intent),'UNKNOWN_OR_INTERVENED_NO_REPLAY');
 const intervened={...intent.after,control:{...intent.after.control,xmin:'901'}};assert.equal(classifyClosedTipCommit('committed',intervened,intent),'UNKNOWN_OR_INTERVENED_NO_REPLAY');
 for(const stage of ['read','install','completion']){let active=true,removed=false;await assert.rejects(finishClosedTipBoundary('committed',intent.after,intent,{fence:async()=>{if(!active)throw Error('LEASE_LOST');},readCursor:async()=>{if(stage==='read')active=false;},installCursor:async()=>{if(stage==='install')active=false;},writeCompletion:async()=>{if(stage==='completion')active=false;},removeMarker:async()=>{removed=true;}}),/LEASE_LOST/);assert.equal(removed,false);}
 let called=false;await assert.rejects(finishClosedTipBoundary('unknown',intent.after,intent,{fence:async()=>{called=true;},readCursor:async()=>{},installCursor:async()=>{},writeCompletion:async()=>{},removeMarker:async()=>{}}),/NO_REPLAY/);assert.equal(called,false);
});
test('Root CLI exposes only explicit protected inspect/issue/apply/reconcile; no implicit retry or financial command',()=>{
 const path='/opt/zeeswap-testnet/state/app-closed-tip-repair/approval.private.json';assert.equal(parseClosedTipArgs(['inspect',path]).step,'inspect');assert.equal(parseClosedTipArgs(['apply',path,hash(88)]).step,'apply');assert.equal(parseClosedTipArgs(['reconcile',hash(88)]).step,'reconcile');
 for(const args of [['activate',path],['apply',path],['inspect','/tmp/any'],['reconcile',hash(88),'retry']])assert.throws(()=>parseClosedTipArgs(args));
});
