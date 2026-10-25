/** Closed-history metadata-only repair. No admission, wallet, payout or financial mutation API. */
import type pg from 'pg';
import {createHash} from 'node:crypto';
import {readContinuationSnapshot,continuationDigest,continuationTables} from './native-circle-continuation.ts';
import {chefSourceTimestamp} from './integrations/observation/chef.ts';
import {digest,parseHeader,requireThat,stable,type Header} from './integrations/observation/types.ts';
import type {ChefLiveCursor} from './integrations/observation/chef-live-cursor.ts';
import {pgRepairTime} from './app-chef-metadata-repair.ts';
export const closedTipCase={epoch:'217',xmin:'538330',tip:4540629,common:4540628,finalized:4540620,
 wrong:'0000407ce84f8804fb0baa33ee07355ebd39407b0c1bbe96edf9061bfe7d743f',replacement:'00000d32ec4e937712c62f2e670d90252b79edaa679eb6868215b390a983205e',
 financialDigest:'b1079860bfcbcdb6f022d59c1da18671e81cbcf44722e8d426c8922b09b5d57f',diagnosticSha256:'5dadb98fafb1b847be0bb9ab92070c5becfed87b36c3c40555e64e30ed69b36e'} as const;
export type ClosedTipPin={path:string;sha256:string};
export type ClosedTipControl={epoch:string;xmin:string;accepting_orders:false;dispatch_enabled:false;reconciliation_required:true};
export type ClosedTipRow={network:string;height:string;block_hash:string;block_time:string;xmin:string};
export type ClosedTipCheckpoint={network:string;scanned_height:string;finalized_height:string;tip_hash:string;finalized_time:string;observed_at:string;xmin:string};
export type ClosedTipState={control:ClosedTipControl;checkpoints:ClosedTipCheckpoint[];rows:ClosedTipRow[];books:Record<string,any[]>;authorizationRows:string;activeLeases:string;triggers:{replicationRole:string;bindings:{name:string;enabled:string;correctFunction:boolean;afterRowUpdate:boolean}[]}};
export type ClosedTipContext={profileSha256:string;handoffSha256:string;openingProofSha256:string;financialDigest:string;sourceIdentity:unknown;control:ClosedTipControl};
export type ClosedTipApproval={version:1;purpose:'ROOT_CLOSED_HISTORY_CHEF_SINGLE_TIP_REPAIR_APPROVED';metadataOnly:true;noFinance:true;verifiedAt:string;expiresAt:string;publicCommit:string;profileSha256:string;handoffSha256:string;openingProofSha256:string;financialDigest:string;sourceIdentity:unknown;control:ClosedTipControl;diagnostic:ClosedTipPin;beforeStateDigest:string;oldCursor:ChefLiveCursor;oldCursorSha256:string;common:Header;replacement:Header;finalized:Header;appWritersStopped:true;financialWorkersStopped:true;runtimePins:ClosedTipPin[]};
export type ClosedTipIntent={version:1;purpose:'CLOSED_HISTORY_CHEF_SINGLE_TIP_REPAIR';approvalSha256:string;approvalDigest:string;transactionId:string;expectedXmin:string;before:ClosedTipState;after:ClosedTipState;oldCursorSha256:string;newCursor:ChefLiveCursor;newCursorSha256:string;newCursorBase64:string};
const need=(v:unknown,c:string)=>requireThat(v,'CLOSED_TIP_'+c),sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const decimal=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
export function closedTipTimestamp(v:string){chefSourceTimestamp(v);return pgRepairTime(v);}
export function validateClosedTipApproval(a:ClosedTipApproval,context:ClosedTipContext,now=Date.now()){
 need(a?.version===1&&a.purpose==='ROOT_CLOSED_HISTORY_CHEF_SINGLE_TIP_REPAIR_APPROVED'&&a.metadataOnly===true&&a.noFinance===true&&a.appWritersStopped===true&&a.financialWorkersStopped===true,'ROOT_SCOPE');
 const at=Date.parse(chefSourceTimestamp(a.verifiedAt)),end=Date.parse(chefSourceTimestamp(a.expiresAt));need(at<=now+5000&&end>now&&end>at&&end-at<=7200000,'APPROVAL_TIME');
 for(const key of ['profileSha256','handoffSha256','openingProofSha256','financialDigest'] as const)need(sha(a[key])&&a[key]===context[key],'IMMUTABLE_'+key);
 need(stable(a.sourceIdentity)===stable(context.sourceIdentity)&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&a.publicCommit!=='0'.repeat(40),'SOURCE_OR_CODE_IDENTITY');
 need(stable(a.control)===stable(context.control)&&a.control.epoch===closedTipCase.epoch&&decimal(a.control.xmin)&&BigInt(a.control.xmin)>0n&&!a.control.accepting_orders&&!a.control.dispatch_enabled&&a.control.reconciliation_required===true,'APPROVAL_CONTROL');
 need(a.diagnostic?.sha256===closedTipCase.diagnosticSha256&&a.diagnostic.path==='/opt/zeeswap-testnet/state/continuation-preflight/current-canonical-conflict-e217-r1.private.json','DIAGNOSTIC_PIN');
 for(const h of [a.common,a.replacement,a.finalized])parseHeader(h,'zcash-testnet');
 need(a.common.height===closedTipCase.common&&a.replacement.height===closedTipCase.tip&&a.replacement.hash===closedTipCase.replacement&&a.replacement.parentHash===a.common.hash&&a.finalized.height===closedTipCase.finalized,'EXACT_TIP_CASE');
 need(sha(a.beforeStateDigest)&&sha(a.oldCursorSha256)&&a.oldCursor?.version===1&&a.oldCursor.processedThrough===closedTipCase.tip&&a.oldCursor.tipHash===closedTipCase.wrong&&sha(a.oldCursor.identityDigest)&&sha(a.oldCursor.snapshotDigest),'CURSOR_BINDING');
 need(Array.isArray(a.runtimePins)&&a.runtimePins.length>=2&&a.runtimePins.length<=64&&new Set(a.runtimePins.map(p=>p.path)).size===a.runtimePins.length&&a.runtimePins.every(p=>typeof p.path==='string'&&p.path.startsWith('/opt/zeeswap-testnet/releases/')&&!p.path.includes('/../')&&!p.path.includes('/./')&&sha(p.sha256)),'RUNTIME_PINS');
 return a;
}
export async function readClosedTipState(client:Pick<pg.PoolClient,'query'>):Promise<ClosedTipState>{
 const books=await readContinuationSnapshot(client),state=(await client.query(`SELECT jsonb_build_object(
 'control',(SELECT jsonb_build_object('epoch',epoch::text,'xmin',xmin::text,'accepting_orders',accepting_orders,'dispatch_enabled',dispatch_enabled,'reconciliation_required',reconciliation_required) FROM zee.runtime_control WHERE singleton),
 'checkpoints',(SELECT jsonb_agg(jsonb_build_object('network',network,'scanned_height',scanned_height::text,'finalized_height',finalized_height::text,'tip_hash',tip_hash,'finalized_time',to_char(finalized_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observed_at',to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'xmin',xmin::text) ORDER BY network) FROM zee.scanner_checkpoints),
 'rows',(SELECT COALESCE(jsonb_agg(row ORDER BY row->>'network',(row->>'height')::bigint),'[]'::jsonb) FROM (SELECT jsonb_build_object('network',network,'height',height::text,'block_hash',block_hash,'block_time',to_char(block_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'xmin',xmin::text) row FROM zee.chain_observations ORDER BY network,height LIMIT 20009) h),
 'authorizationRows',(SELECT count(*)::text FROM zee.root_native_circle_authorizations),
 'activeLeases',(SELECT count(*)::text FROM zee.outbox_jobs WHERE lease_owner IS NOT NULL OR lease_until>clock_timestamp()),
 'triggers',jsonb_build_object('replicationRole',current_setting('session_replication_role'),'bindings',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled::text,'correctFunction',tgfoid='zee.guard_observer_rewind()'::regprocedure,'afterRowUpdate',tgtype=17) ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal AND ((tgrelid='zee.chain_observations'::regclass AND tgname='canonical_reorg') OR (tgrelid='zee.scanner_checkpoints'::regclass AND tgname='observer_rewind'))))) state`)).rows[0]?.state;
 need(state,'STATE_REQUIRED');return{...state,books};
}
export function validateClosedTipBefore(s:ClosedTipState,a:ClosedTipApproval,cursor:ChefLiveCursor,cursorSha256:string){
 need(digest(s)===a.beforeStateDigest&&stable(cursor)===stable(a.oldCursor)&&cursorSha256===a.oldCursorSha256,'EXACT_BEFORE_STATE');
 need(stable(s.control)===stable(a.control)&&a.control.epoch===closedTipCase.epoch&&a.control.accepting_orders===false&&a.control.dispatch_enabled===false&&a.control.reconciliation_required===true,'EXACT_PAUSED_CONTROL');
 need(Object.keys(s.books).sort().join(',')===[...continuationTables].sort().join(',')&&Object.values(s.books).reduce((n,rows)=>n+rows.length,0)===70&&continuationDigest(s.books)===a.financialDigest&&s.authorizationRows==='0'&&s.activeLeases==='0'&&s.books.outbox_jobs!.every(row=>row.status!=='LEASED'),'CLOSED_FINANCIAL_HISTORY');
 need(s.rows.length>0&&s.rows.length<=20008&&s.rows.every(r=>['zcash-testnet','base-sepolia'].includes(r.network)&&decimal(r.height)&&sha(r.block_hash)&&decimal(r.xmin))&&new Set(s.rows.map(r=>r.network+':'+r.height)).size===s.rows.length,'ROWS_BOUND');
 const native=s.rows.filter(r=>r.network==='zcash-testnet');need(native.length===1671&&native.every(r=>Number(r.height)<=closedTipCase.tip),'EXACT_NATIVE_PREFIX');
 need(s.checkpoints.length===2&&new Set(s.checkpoints.map(c=>c.network)).size===2,'BOTH_CHECKPOINTS');const cp=s.checkpoints.find(c=>c.network==='zcash-testnet'),tip=native.find(r=>Number(r.height)===closedTipCase.tip),common=native.find(r=>Number(r.height)===closedTipCase.common),final=native.find(r=>Number(r.height)===closedTipCase.finalized);
 need(cp?.scanned_height===String(closedTipCase.tip)&&cp.tip_hash===closedTipCase.wrong&&cp.finalized_height===String(closedTipCase.finalized)&&tip?.block_hash===closedTipCase.wrong&&common?.block_hash===a.common.hash&&final?.block_hash===a.finalized.hash&&Date.parse(cp.finalized_time)===Date.parse(a.finalized.time),'TIP_CHECKPOINT_AND_FINALIZED');
 need(s.triggers.replicationRole==='origin'&&s.triggers.bindings.length===2&&s.triggers.bindings.every(b=>['O','A'].includes(b.enabled)&&b.correctFunction===true&&b.afterRowUpdate===true)&&stable(s.triggers.bindings.map(b=>b.name).sort())===stable(['canonical_reorg','observer_rewind']),'ORIGINAL_ACTIVE_TRIGGERS');
 closedTipFinancialAnchors(s);
}
export function closedTipFinancialAnchors(s:ClosedTipState){
 const anchors:{network:string;height:number;hash:string}[]=[];
 const add=(network:string,h:unknown,hash:unknown)=>{if(h==null&&hash==null)return;need(['zcash-testnet','base-sepolia'].includes(network)&&Number.isSafeInteger(Number(h))&&Number(h)>=0&&sha(hash),'FINANCIAL_ANCHOR_SHAPE');need(!(network==='zcash-testnet'&&Number(h)===closedTipCase.tip),'FINANCIAL_ANCHOR_AT_REPLACED_TIP');need(s.rows.some(r=>r.network===network&&r.height===String(h)&&r.block_hash===hash),'FINANCIAL_ANCHOR_NOT_STORED');anchors.push({network,height:Number(h),hash:String(hash)});};
 for(const row of s.books.deposits??[])add(row.network,row.block_height,row.block_hash);
 for(const row of s.books.reverse_payouts??[])add('zcash-testnet',row.block_height,row.block_hash);
 for(const row of s.books.source_refunds??[]){add('zcash-testnet',row.height,row.block_hash);add('base-sepolia',row.base_height,row.base_block);}
 for(const table of ['base_attempts','escrow_commits','escrow_settlements'])for(const row of s.books[table]??[])add('base-sepolia',row.block_height,row.block_hash);
 for(const row of s.books.chain_transactions??[]){if(row.block_height==null&&row.block_hash==null)continue;const matches=s.rows.filter(r=>r.height===String(row.block_height)&&r.block_hash===row.block_hash);need(matches.length===1,'FINANCIAL_TRANSACTION_NETWORK');add(matches[0]!.network,row.block_height,row.block_hash);}
 return anchors;
}
/** Diagnostic is a pinned observation, never an authorization or no-repair attestation. */
export function validateClosedTipDiagnostic(report:any,s:ClosedTipState,a:ClosedTipApproval){
 need(report?.version===1&&report.status==='DIAGNOSTIC_CONFLICTS'&&report.complete===true&&report.noRepairAttestation===false&&report.financialAuthority===false&&report.profileSha256===a.profileSha256&&report.financialSnapshotSha256===a.financialDigest&&report.financialTables===19&&report.financialRows===70&&stable(report.control)===stable(s.control)&&stable(report.sourceIdentity)===stable(a.sourceIdentity),'DIAGNOSTIC_SCOPE');
 need(report.sqlMutation===false&&report.cursorMutation===false&&report.sourceMutation===false&&report.persistentStateBeforeDigest===report.persistentStateAfterDigest&&report.cursor?.sha256===a.oldCursorSha256&&report.cursor.height===closedTipCase.tip&&report.cursor.hash===closedTipCase.wrong,'DIAGNOSTIC_STATE');
 need(report.conflicts?.length===1&&report.conflictRowCount===1&&report.persistedConflictRowCount===1&&report.financialAnchorConflictCount===0&&report.coreOnlyConflictRowCount===0,'EXACT_SINGLE_CONFLICT');
 const conflict=report.conflicts[0];need(conflict.network==='zcash-testnet'&&conflict.height===closedTipCase.tip&&conflict.expected===closedTipCase.wrong&&conflict.actual===closedTipCase.replacement&&['SQL_NATIVE','CHECKPOINT','CURSOR'].every(role=>conflict.roles?.includes(role))&&!conflict.roles.some((r:string)=>r==='FINALIZED'||r.startsWith('FINANCIAL_')),'DIAGNOSTIC_CONFLICT');
 need(report.firstCommonAncestorRecentSuffix?.status==='FOUND_CONTIGUOUS_STORED_SUFFIX'&&report.firstCommonAncestorRecentSuffix.height===closedTipCase.common&&report.firstCommonAncestorRecentSuffix.conflictingSuffixRows===1,'DIAGNOSTIC_COMMON_ANCESTOR');
 const rows=s.rows.map(({xmin,...r})=>({...r,block_time:new Date(r.block_time).toISOString()})),checkpoints=s.checkpoints.map(cp=>({...cp,finalized_time:new Date(cp.finalized_time).toISOString(),observed_at:new Date(cp.observed_at).toISOString()}));
 need(stable(report.rows)===stable(rows)&&stable(report.checkpoints)===stable(checkpoints)&&continuationDigest({books:s.books,control:s.control,checkpoints,rows})===report.persistentStateBeforeDigest,'DIAGNOSTIC_FULL_METADATA');
}
export function expectedClosedTipAfter(before:ClosedTipState,a:ClosedTipApproval,xmin:string){
 need(decimal(xmin)&&BigInt(xmin)>0n&&BigInt(xmin)<=4294967295n,'EXPECTED_XMIN');const after=structuredClone(before);after.control={...after.control,epoch:(BigInt(before.control.epoch)+2n).toString(),xmin};
 after.rows=after.rows.map(r=>r.network==='zcash-testnet'&&r.height===String(closedTipCase.tip)?{...r,block_hash:a.replacement.hash,block_time:closedTipTimestamp(a.replacement.time),xmin}:r);
 after.checkpoints=after.checkpoints.map(cp=>cp.network==='zcash-testnet'?{...cp,scanned_height:String(a.common.height),tip_hash:a.common.hash,xmin}:cp);return after;
}
/** Only the canonical tip row and native checkpoint change; original triggers run normally. */
export async function applyClosedTipUpdates(client:Pick<pg.PoolClient,'query'>,before:ClosedTipState,a:ClosedTipApproval){
 const row=before.rows.find(r=>r.network==='zcash-testnet'&&r.height===String(closedTipCase.tip))!,cp=before.checkpoints.find(c=>c.network==='zcash-testnet')!;
 const changed=await client.query(`UPDATE zee.chain_observations SET block_hash=$1,block_time=$2::timestamptz WHERE network='zcash-testnet' AND height=$3::bigint AND block_hash=$4 AND block_time=$5::timestamptz AND xmin::text=$6 RETURNING height`,[a.replacement.hash,a.replacement.time,closedTipCase.tip,row.block_hash,row.block_time,row.xmin]);need(changed.rows.length===1,'TIP_ROW_CAS');
 const checkpoint=await client.query(`UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,tip_hash=$2 WHERE network='zcash-testnet' AND scanned_height=$3::bigint AND tip_hash=$4 AND finalized_height=$5::bigint AND finalized_time=$6::timestamptz AND observed_at=$7::timestamptz AND xmin::text=$8 RETURNING scanned_height`,[a.common.height,a.common.hash,cp.scanned_height,cp.tip_hash,cp.finalized_height,cp.finalized_time,cp.observed_at,cp.xmin]);need(checkpoint.rows.length===1,'CHECKPOINT_CAS');
}
export function classifyClosedTipCommit(status:unknown,current:ClosedTipState,intent:ClosedTipIntent){if(status==='committed'&&stable(current)===stable(intent.after))return'COMMITTED_EXACT';if(status==='aborted'&&stable(current)===stable(intent.before))return'ABORTED_EXACT_NO_REPLAY';return'UNKNOWN_OR_INTERVENED_NO_REPLAY';}
export function validateClosedTipIntent(intent:ClosedTipIntent,a:ClosedTipApproval,approvalSha256:string){
 need(intent?.version===1&&intent.purpose==='CLOSED_HISTORY_CHEF_SINGLE_TIP_REPAIR'&&intent.approvalSha256===approvalSha256&&intent.approvalDigest===digest(a)&&/^[1-9][0-9]*$/.test(intent.transactionId)&&intent.expectedXmin===(BigInt(intent.transactionId)%4294967296n).toString()&&intent.oldCursorSha256===a.oldCursorSha256,'INTENT_BINDING');
 validateClosedTipBefore(intent.before,a,a.oldCursor,a.oldCursorSha256);need(stable(intent.after)===stable(expectedClosedTipAfter(intent.before,a,intent.expectedXmin)),'INTENT_AFTER');
 const cursor={...a.oldCursor,processedThrough:a.common.height,tipHash:a.common.hash,snapshotDigest:digest({purpose:intent.purpose,approvalSha256,transactionId:intent.transactionId,before:digest(intent.before),after:digest(intent.after)})},raw=Buffer.from(intent.newCursorBase64,'base64');
 need(raw.length>0&&raw.length<16384&&raw.toString('base64')===intent.newCursorBase64&&createHash('sha256').update(raw).digest('hex')===intent.newCursorSha256&&stable(JSON.parse(raw.toString()))===stable(cursor)&&stable(intent.newCursor)===stable(cursor),'INTENT_CURSOR');return raw;
}
export async function finishClosedTipBoundary(status:unknown,current:ClosedTipState,intent:ClosedTipIntent,io:{fence():Promise<void>;readCursor():Promise<void>;installCursor():Promise<void>;writeCompletion():Promise<void>;removeMarker():Promise<void>}){
 need(classifyClosedTipCommit(status,current,intent)==='COMMITTED_EXACT','COMMIT_NOT_EXACT_NO_REPLAY');await io.fence();await io.readCursor();await io.fence();await io.installCursor();await io.fence();await io.writeCompletion();await io.fence();await io.removeMarker();
}
