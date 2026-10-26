import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {continuationDigest,continuationTables} from '../src/native-circle-continuation.ts';
import {digest,type Header} from '../src/integrations/observation/types.ts';
import type {ClosedTipContext,ClosedTipState} from '../src/app-chef-closed-tip-repair.ts';
import {sparseTipCase,validateSparseTipApproval,validateSparseTipBefore,validateSparseTipDiagnostic,expectedSparseTipAfter,applySparseTipUpdates,validateSparseTipIntent,classifySparseTipCommit,finishSparseTipBoundary,type SparseTipApproval,type SparseTipIntent} from '../src/app-chef-sparse-tip-repair.ts';
import {sparseTipFixture as fixture,sparseTipIntent as intent} from './fixtures/sparse-tip-fixture.ts';
const hash=(n:number)=>n.toString(16).padStart(64,'0');

test('new exact E220 sparse approval binds replay23 and fresh23/24/25 continuity without claiming common ancestry',()=>{
 const f=fixture();validateSparseTipApproval(f.approval,f.context);validateSparseTipBefore(f.state,f.approval,f.oldCursor,f.approval.oldCursorSha256);validateSparseTipDiagnostic(f.report,f.state,f.approval);
 for(const patch of [{purpose:'ROOT_CLOSED_HISTORY_CHEF_SINGLE_TIP_REPAIR_APPROVED'},{noFinance:false},{replayAnchorMeaning:'COMMON_ANCESTOR'},{diagnostic:{...f.approval.diagnostic,sha256:hash(99)}},{missingHeader:{...f.approval.missingHeader,parentHash:hash(99)}},{expiresAt:new Date(Date.parse(f.approval.verifiedAt)+7200001).toISOString()}])assert.throws(()=>validateSparseTipApproval({...f.approval,...patch} as any,f.context));
 assert.throws(()=>validateSparseTipApproval(f.approval,f.context,Date.parse(f.approval.expiresAt)),/APPROVAL_TIME/);
});
test('sparse suffix, closed books, old cursor and trigger fences survive a rebound state digest',()=>{
 const f=fixture();for(const mutate of [(s:ClosedTipState)=>{s.rows.find(r=>r.network==='zcash-testnet')!.height=String(sparseTipCase.missing);},(s:ClosedTipState)=>{s.authorizationRows='1';},(s:ClosedTipState)=>{s.activeLeases='1';},(s:ClosedTipState)=>{s.triggers.bindings[0]!.enabled='D';},(s:ClosedTipState)=>{s.checkpoints[1]!.finalized_height=String(sparseTipCase.replay);},(s:ClosedTipState)=>{s.books.deposits!.push({network:'zcash-testnet',block_height:sparseTipCase.tip,block_hash:f.oldCursor.tipHash});s.books.ledger_entries!.pop();}]){const bad=structuredClone(f.state);mutate(bad);const a={...f.approval,beforeStateDigest:digest(bad),financialDigest:continuationDigest(bad.books)};assert.throws(()=>validateSparseTipBefore(bad,a,f.oldCursor,a.oldCursorSha256));}
 const bad=structuredClone(f.report);bad.financialAnchorConflictCount=1;assert.throws(()=>validateSparseTipDiagnostic(bad,f.state,f.approval));
});
test('only canonical header25 and CP/cursor23 change; all rows including17..23 and finalized/observation times survive with epoch plus2',()=>{
 const f=fixture(),i=intent(f),after=i.after;assert.equal(after.control.epoch,'222');assert.equal(after.rows.length,f.state.rows.length);assert.equal(after.rows.filter((r,n)=>stableRow(r)!==stableRow(f.state.rows[n]!)).length,1);
 assert.equal(after.checkpoints[1]!.scanned_height,'4541823');assert.equal(after.checkpoints[1]!.finalized_height,'4541816');assert.equal(after.checkpoints[1]!.observed_at,f.state.checkpoints[1]!.observed_at);assert.equal(after.checkpoints[1]!.finalized_time,f.state.checkpoints[1]!.finalized_time);assert.deepEqual(after.checkpoints[0],f.state.checkpoints[0]);assert.deepEqual(after.books,f.state.books);
 assert.equal(after.rows.find(r=>r.network==='zcash-testnet'&&r.height==='4541825')!.block_hash,f.approval.canonicalTip.hash);assert.equal(i.newCursor.processedThrough,4541823);assert.equal(after.rows.some(r=>r.network==='zcash-testnet'&&r.height==='4541824'),false);validateSparseTipIntent(i,f.approval,i.approvalSha256);
 for(const mutate of [(v:SparseTipIntent)=>{v.after.control.epoch='221';},(v:SparseTipIntent)=>{v.after.rows.pop();},(v:SparseTipIntent)=>{v.newCursor.processedThrough=4541825;}]){const bad=structuredClone(i);mutate(bad);assert.throws(()=>validateSparseTipIntent(bad,f.approval,i.approvalSha256));}
});
const stableRow=(v:unknown)=>JSON.stringify(v);
test('restricted worker SQL only updates exact orphan header and checkpoint with CAS, never DELETE or financial writes',async()=>{
 const f=fixture(),queries:{sql:string;args:unknown[]}[]=[];await applySparseTipUpdates({query:async(sql:string,args:unknown[])=>{queries.push({sql,args});return{rows:[{}]};}} as any,f.state,f.approval);assert.equal(queries.length,2);assert.ok(queries[0]!.sql.startsWith('UPDATE zee.chain_observations'));assert.equal(queries[0]!.args[0],f.approval.canonicalTip.hash);assert.equal(queries[0]!.args[2],4541825);assert.equal(queries[1]!.args[0],4541823);assert.ok(queries.every(q=>!q.sql.includes('DELETE')));
 let calls=0;await assert.rejects(()=>applySparseTipUpdates({query:async()=>{calls++;return{rows:[]};}} as any,f.state,f.approval),/CAS/);assert.equal(calls,1);
});
test('unknown commit and every file-boundary lease failure retain marker and never replay SQL',async()=>{
 const f=fixture(),i=intent(f);assert.equal(classifySparseTipCommit('committed',i.after,i),'COMMITTED_EXACT');assert.equal(classifySparseTipCommit('aborted',i.before,i),'ABORTED_EXACT_NO_REPLAY');assert.equal(classifySparseTipCommit('unknown',i.after,i),'UNKNOWN_OR_INTERVENED_NO_REPLAY');
 for(const stop of ['cursor','install','completion']){let valid=true,removed=false;await assert.rejects(()=>finishSparseTipBoundary('committed',i.after,i,{fence:async()=>{if(!valid)throw Error('LOST');},readCursor:async()=>{if(stop==='cursor')valid=false;},installCursor:async()=>{if(stop==='install')valid=false;},writeCompletion:async()=>{if(stop==='completion')valid=false;},removeMarker:async()=>{removed=true;}}),/LOST/);assert.equal(removed,false);}
 let touched=false;await assert.rejects(()=>finishSparseTipBoundary('unknown',i.after,i,{fence:async()=>{touched=true;},readCursor:async()=>{},installCursor:async()=>{},writeCompletion:async()=>{},removeMarker:async()=>{}}),/NO_REPLAY/);assert.equal(touched,false);
});
