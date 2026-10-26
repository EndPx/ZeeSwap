/** Exact E220 closed-history sparse-tip repair. No financial authority or ingestion. */
import type pg from 'pg';
import {createHash} from 'node:crypto';
import {continuationDigest,continuationTables} from './native-circle-continuation.ts';
import {chefSourceTimestamp} from './integrations/observation/chef.ts';
import {digest,parseHeader,requireThat,stable,type Header} from './integrations/observation/types.ts';
import type {ChefLiveCursor} from './integrations/observation/chef-live-cursor.ts';
import type {ClosedTipContext,ClosedTipPin,ClosedTipState} from './app-chef-closed-tip-repair.ts';
import {closedTipTimestamp} from './app-chef-closed-tip-repair.ts';
export {readClosedTipState} from './app-chef-closed-tip-repair.ts';

export const sparseTipCase={epoch:'220',xmin:'617365',checkpointXmin:'617343',tip:4541825,replay:4541823,missing:4541824,finalized:4541816,nativeRows:2264,baseRows:269,
 replayHash:'000075e7f2097ebed9d9d2b2a9e9dbab195dde89b016b92fb3d171934e778de8',
 financialDigest:'b1079860bfcbcdb6f022d59c1da18671e81cbcf44722e8d426c8922b09b5d57f',
 diagnosticPath:'/opt/zeeswap-testnet/state/continuation-preflight/current-canonical-conflict-e220-market-r1.private.json',
 diagnosticSha256:'5bb80a3ae3f7827e0aff4435de452a2e326b5c4859e0187a9192f59b78ae41fd'} as const;
export type SparseTipApproval={version:1;purpose:'ROOT_CLOSED_HISTORY_CHEF_SPARSE_TIP_REPAIR_APPROVED';metadataOnly:true;noFinance:true;
 verifiedAt:string;expiresAt:string;publicCommit:string;profileSha256:string;handoffSha256:string;openingProofSha256:string;financialDigest:string;
 sourceIdentity:unknown;control:ClosedTipContext['control'];diagnostic:ClosedTipPin;beforeStateDigest:string;oldCursor:ChefLiveCursor;oldCursorSha256:string;
 replayAnchor:Header;missingHeader:Header;canonicalTip:Header;finalized:Header;replayAnchorMeaning:'VERIFIED_CANONICAL_REPLAY_ANCHOR_NOT_COMMON_ANCESTOR';
 historicalReplayPreflight:ClosedTipPin;appWritersStopped:true;financialWorkersStopped:true;runtimePins:ClosedTipPin[]};
export type SparseTipIntent={version:1;purpose:'CLOSED_HISTORY_CHEF_SPARSE_TIP_REPAIR';approvalSha256:string;approvalDigest:string;transactionId:string;expectedXmin:string;
 before:ClosedTipState;after:ClosedTipState;oldCursorSha256:string;newCursor:ChefLiveCursor;newCursorSha256:string;newCursorBase64:string};
const need=(v:unknown,c:string)=>requireThat(v,'SPARSE_TIP_'+c),sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64),decimal=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
export function validateSparseTipApproval(a:SparseTipApproval,c:ClosedTipContext,now=Date.now()){
 need(a?.version===1&&a.purpose==='ROOT_CLOSED_HISTORY_CHEF_SPARSE_TIP_REPAIR_APPROVED'&&a.metadataOnly===true&&a.noFinance===true&&a.appWritersStopped===true&&a.financialWorkersStopped===true,'ROOT_SCOPE');
 const start=Date.parse(chefSourceTimestamp(a.verifiedAt)),end=Date.parse(chefSourceTimestamp(a.expiresAt));need(start<=now+5000&&end>now&&end>start&&end-start<=7200000,'APPROVAL_TIME');
 for(const k of ['profileSha256','handoffSha256','openingProofSha256','financialDigest'] as const)need(sha(a[k])&&a[k]===c[k],'IMMUTABLE_'+k);
 need(stable(a.sourceIdentity)===stable(c.sourceIdentity)&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&a.publicCommit!=='0'.repeat(40),'SOURCE_OR_CODE_IDENTITY');
 need(stable(a.control)===stable(c.control)&&a.control.epoch===sparseTipCase.epoch&&decimal(a.control.xmin)&&BigInt(a.control.xmin)>0n&&!a.control.accepting_orders&&!a.control.dispatch_enabled&&a.control.reconciliation_required===true,'PAUSED_CONTROL');
 need(a.diagnostic?.path===sparseTipCase.diagnosticPath&&a.diagnostic.sha256===sparseTipCase.diagnosticSha256,'DIAGNOSTIC_PIN');
 for(const h of [a.replayAnchor,a.missingHeader,a.canonicalTip,a.finalized])parseHeader(h,'zcash-testnet');
 need(a.replayAnchor.height===sparseTipCase.replay&&a.replayAnchor.hash===sparseTipCase.replayHash&&a.missingHeader.height===sparseTipCase.missing&&a.missingHeader.parentHash===a.replayAnchor.hash&&a.canonicalTip.height===sparseTipCase.tip&&a.canonicalTip.parentHash===a.missingHeader.hash&&a.finalized.height===sparseTipCase.finalized,'EXACT_CANONICAL_REPLAY_HEADERS');
 need(a.replayAnchorMeaning==='VERIFIED_CANONICAL_REPLAY_ANCHOR_NOT_COMMON_ANCESTOR','NO_INVENTED_COMMON_ANCESTOR');
 need(sha(a.beforeStateDigest)&&sha(a.oldCursorSha256)&&a.oldCursor?.version===1&&a.oldCursor.processedThrough===sparseTipCase.tip&&sha(a.oldCursor.tipHash)&&a.oldCursor.tipHash!==a.canonicalTip.hash&&sha(a.oldCursor.identityDigest)&&sha(a.oldCursor.snapshotDigest),'OLD_CURSOR');
 need(a.historicalReplayPreflight?.path.startsWith('/opt/zeeswap-testnet/state/app-sparse-tip-repair/')&&sha(a.historicalReplayPreflight.sha256),'HISTORICAL_REPLAY_PREFLIGHT');
 need(Array.isArray(a.runtimePins)&&a.runtimePins.length>=2&&a.runtimePins.length<=64&&new Set(a.runtimePins.map(p=>p.path)).size===a.runtimePins.length&&a.runtimePins.every(p=>p.path.startsWith('/opt/zeeswap-testnet/releases/')&&!p.path.includes('/../')&&!p.path.includes('/./')&&sha(p.sha256)),'RUNTIME_PINS');return a;
}
export function sparseTipFinancialAnchors(s:ClosedTipState){
 const anchors:{network:string;height:number;hash:string}[]=[];
 const add=(network:string,h:unknown,value:unknown)=>{if(h==null&&value==null)return;need(['zcash-testnet','base-sepolia'].includes(network)&&Number.isSafeInteger(Number(h))&&Number(h)>=0&&sha(value),'FINANCIAL_ANCHOR_SHAPE');
  need(network!=='zcash-testnet'||Number(h)<=sparseTipCase.replay,'FINANCIAL_ANCHOR_ABOVE_REPLAY');need(s.rows.some(r=>r.network===network&&r.height===String(h)&&r.block_hash===value),'FINANCIAL_ANCHOR_NOT_STORED');anchors.push({network,height:Number(h),hash:String(value)});};
 for(const r of s.books.deposits??[])add(r.network,r.block_height,r.block_hash);
 for(const r of s.books.reverse_payouts??[])add('zcash-testnet',r.block_height,r.block_hash);
 for(const r of s.books.source_refunds??[]){add('zcash-testnet',r.height,r.block_hash);add('base-sepolia',r.base_height,r.base_block);}
 for(const t of ['base_attempts','escrow_commits','escrow_settlements'])for(const r of s.books[t]??[])add('base-sepolia',r.block_height,r.block_hash);
 for(const r of s.books.chain_transactions??[]){if(r.block_height==null&&r.block_hash==null)continue;const matches=s.rows.filter(h=>h.height===String(r.block_height)&&h.block_hash===r.block_hash);need(matches.length===1,'FINANCIAL_TRANSACTION_NETWORK');add(matches[0]!.network,r.block_height,r.block_hash);}return anchors;
}
export function validateSparseTipBefore(s:ClosedTipState,a:SparseTipApproval,cursor:ChefLiveCursor,cursorSha:string){
 need(digest(s)===a.beforeStateDigest&&stable(cursor)===stable(a.oldCursor)&&cursorSha===a.oldCursorSha256,'EXACT_BEFORE_STATE');
 need(stable(s.control)===stable(a.control)&&s.control.epoch===sparseTipCase.epoch&&decimal(s.control.xmin)&&BigInt(s.control.xmin)>0n&&!s.control.accepting_orders&&!s.control.dispatch_enabled&&s.control.reconciliation_required,'CLOSED_CONTROL');
 need(Object.keys(s.books).sort().join() === [...continuationTables].sort().join()&&Object.values(s.books).reduce((n,r)=>n+r.length,0)===70&&continuationDigest(s.books)===a.financialDigest&&s.authorizationRows==='0'&&s.activeLeases==='0'&&s.books.outbox_jobs!.every(r=>r.status!=='LEASED'),'CLOSED_FINANCIAL_HISTORY');
 need(s.rows.length===sparseTipCase.nativeRows+sparseTipCase.baseRows&&s.rows.every(r=>['zcash-testnet','base-sepolia'].includes(r.network)&&decimal(r.height)&&sha(r.block_hash)&&decimal(r.xmin))&&new Set(s.rows.map(r=>r.network+':'+r.height)).size===s.rows.length,'EXACT_ROWSET');
 const native=s.rows.filter(r=>r.network==='zcash-testnet');need(native.length===sparseTipCase.nativeRows&&native.every(r=>Number(r.height)<=sparseTipCase.tip)&&!native.some(r=>Number(r.height)>sparseTipCase.replay&&Number(r.height)<sparseTipCase.tip),'EXACT_SPARSE_SUFFIX');
 need(s.checkpoints.length===2&&new Set(s.checkpoints.map(c=>c.network)).size===2,'BOTH_CHECKPOINTS');const cp=s.checkpoints.find(c=>c.network==='zcash-testnet'),tip=native.find(r=>r.height===String(sparseTipCase.tip)),replay=native.find(r=>r.height===String(sparseTipCase.replay)),final=native.find(r=>r.height===String(sparseTipCase.finalized));
 need(cp?.scanned_height===String(sparseTipCase.tip)&&decimal(cp.xmin)&&BigInt(cp.xmin)>0n&&cp.tip_hash===a.oldCursor.tipHash&&cp.finalized_height===String(sparseTipCase.finalized)&&tip?.block_hash===a.oldCursor.tipHash&&replay?.block_hash===a.replayAnchor.hash&&final?.block_hash===a.finalized.hash&&Date.parse(cp.finalized_time)===Date.parse(a.finalized.time)&&Date.parse(replay.block_time)===Date.parse(a.replayAnchor.time)&&Date.parse(final.block_time)===Date.parse(a.finalized.time),'TIP_REPLAY_AND_FINALIZED');
 need(s.triggers.replicationRole==='origin'&&s.triggers.bindings.length===2&&s.triggers.bindings.every(b=>['O','A'].includes(b.enabled)&&b.correctFunction&&b.afterRowUpdate)&&stable(s.triggers.bindings.map(b=>b.name).sort())===stable(['canonical_reorg','observer_rewind']),'ACTIVE_ORIGINAL_TRIGGERS');sparseTipFinancialAnchors(s);
}
/** The diagnostic remains historical evidence; it cannot authorize this repair. */
export function validateSparseTipDiagnostic(r:any,s:ClosedTipState,a:SparseTipApproval){
 need(r?.version===1&&r.status==='DIAGNOSTIC_CONFLICTS'&&r.complete===true&&r.noRepairAttestation===false&&r.financialAuthority===false&&r.profileSha256===a.profileSha256&&r.financialSnapshotSha256===a.financialDigest&&r.financialTables===19&&r.financialRows===70&&stable(r.control)===stable(s.control)&&stable(r.sourceIdentity)===stable(a.sourceIdentity),'DIAGNOSTIC_SCOPE');
 need(r.sqlMutation===false&&r.cursorMutation===false&&r.sourceMutation===false&&r.persistentStateBeforeDigest===r.persistentStateAfterDigest&&r.cursor?.sha256===a.oldCursorSha256&&r.cursor.height===sparseTipCase.tip&&r.cursor.hash===a.oldCursor.tipHash,'DIAGNOSTIC_STATE');
 need(r.conflicts?.length===1&&r.conflictRowCount===1&&r.persistedConflictRowCount===1&&r.financialAnchorConflictCount===0&&r.coreOnlyConflictRowCount===0,'SOLE_ORPHAN');const conflict=r.conflicts[0];
 need(conflict.network==='zcash-testnet'&&conflict.height===sparseTipCase.tip&&conflict.expected===a.oldCursor.tipHash&&conflict.actual===a.canonicalTip.hash&&['SQL_NATIVE','CHECKPOINT','CURSOR'].every(role=>conflict.roles?.includes(role))&&!conflict.roles.some((v:string)=>v==='FINALIZED'||v.startsWith('FINANCIAL_')),'DIAGNOSTIC_ORPHAN');
 const rows=s.rows.map(({xmin,...row})=>({...row,block_time:new Date(row.block_time).toISOString()})),checkpoints=s.checkpoints.map(c=>({...c,finalized_time:new Date(c.finalized_time).toISOString(),observed_at:new Date(c.observed_at).toISOString()}));
 need(stable(r.rows)===stable(rows)&&stable(r.checkpoints)===stable(checkpoints)&&continuationDigest({books:s.books,control:s.control,checkpoints,rows})===r.persistentStateBeforeDigest,'DIAGNOSTIC_FULL_METADATA');
}
export function expectedSparseTipAfter(before:ClosedTipState,a:SparseTipApproval,xmin:string){
 need(decimal(xmin)&&BigInt(xmin)>0n&&BigInt(xmin)<=4294967295n,'EXPECTED_XMIN');const after=structuredClone(before);after.control={...after.control,epoch:(BigInt(before.control.epoch)+2n).toString(),xmin};
 // This canonical header above the rewound cursor is not receipt coverage.
 after.rows=after.rows.map(r=>r.network==='zcash-testnet'&&r.height===String(sparseTipCase.tip)?{...r,block_hash:a.canonicalTip.hash,block_time:closedTipTimestamp(a.canonicalTip.time),xmin}:r);
 after.checkpoints=after.checkpoints.map(c=>c.network==='zcash-testnet'?{...c,scanned_height:String(a.replayAnchor.height),tip_hash:a.replayAnchor.hash,xmin}:c);return after;
}
/** Only independently verified header metadata changes; receipts replay from23. */
export async function applySparseTipUpdates(c:Pick<pg.PoolClient,'query'>,before:ClosedTipState,a:SparseTipApproval){
 const row=before.rows.find(r=>r.network==='zcash-testnet'&&r.height===String(sparseTipCase.tip))!,cp=before.checkpoints.find(c=>c.network==='zcash-testnet')!;
 const updated=await c.query(`UPDATE zee.chain_observations SET block_hash=$1,block_time=$2::timestamptz WHERE network='zcash-testnet' AND height=$3::bigint AND block_hash=$4 AND block_time=$5::timestamptz AND xmin::text=$6 AND NOT EXISTS(SELECT 1 FROM zee.chain_observations WHERE network='zcash-testnet' AND height>$7::bigint AND height<$3::bigint) RETURNING height`,[a.canonicalTip.hash,a.canonicalTip.time,sparseTipCase.tip,row.block_hash,row.block_time,row.xmin,sparseTipCase.replay]);need(updated.rows.length===1,'ORPHAN_HEADER_UPDATE_CAS');
 const changed=await c.query(`UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,tip_hash=$2 WHERE network='zcash-testnet' AND scanned_height=$3::bigint AND tip_hash=$4 AND finalized_height=$5::bigint AND finalized_time=$6::timestamptz AND observed_at=$7::timestamptz AND xmin::text=$8 RETURNING scanned_height`,[a.replayAnchor.height,a.replayAnchor.hash,cp.scanned_height,cp.tip_hash,cp.finalized_height,cp.finalized_time,cp.observed_at,cp.xmin]);need(changed.rows.length===1,'CHECKPOINT_CAS');
}
export function classifySparseTipCommit(status:unknown,current:ClosedTipState,i:SparseTipIntent){return status==='committed'&&stable(current)===stable(i.after)?'COMMITTED_EXACT':status==='aborted'&&stable(current)===stable(i.before)?'ABORTED_EXACT_NO_REPLAY':'UNKNOWN_OR_INTERVENED_NO_REPLAY';}
export function validateSparseTipIntent(i:SparseTipIntent,a:SparseTipApproval,approvalSha:string){
 need(i?.version===1&&i.purpose==='CLOSED_HISTORY_CHEF_SPARSE_TIP_REPAIR'&&i.approvalSha256===approvalSha&&i.approvalDigest===digest(a)&&/^[1-9][0-9]*$/.test(i.transactionId)&&i.expectedXmin===(BigInt(i.transactionId)%4294967296n).toString()&&i.oldCursorSha256===a.oldCursorSha256,'INTENT_BINDING');validateSparseTipBefore(i.before,a,a.oldCursor,a.oldCursorSha256);need(stable(i.after)===stable(expectedSparseTipAfter(i.before,a,i.expectedXmin)),'INTENT_AFTER');
 const cursor={...a.oldCursor,processedThrough:a.replayAnchor.height,tipHash:a.replayAnchor.hash,snapshotDigest:digest({purpose:i.purpose,approvalSha256:approvalSha,transactionId:i.transactionId,before:digest(i.before),after:digest(i.after)})},raw=Buffer.from(i.newCursorBase64,'base64');
 need(raw.length>0&&raw.length<16384&&raw.toString('base64')===i.newCursorBase64&&createHash('sha256').update(raw).digest('hex')===i.newCursorSha256&&stable(JSON.parse(raw.toString()))===stable(cursor)&&stable(i.newCursor)===stable(cursor),'INTENT_CURSOR');return raw;
}
export async function finishSparseTipBoundary(status:unknown,current:ClosedTipState,i:SparseTipIntent,io:{fence():Promise<void>;readCursor():Promise<void>;installCursor():Promise<void>;writeCompletion():Promise<void>;removeMarker():Promise<void>}){
 need(classifySparseTipCommit(status,current,i)==='COMMITTED_EXACT','COMMIT_NOT_EXACT_NO_REPLAY');await io.fence();await io.readCursor();await io.fence();await io.installCursor();await io.fence();await io.writeCompletion();await io.fence();await io.removeMarker();
}
