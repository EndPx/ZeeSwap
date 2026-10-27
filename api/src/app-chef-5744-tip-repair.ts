/** Exact E223/5744 metadata-only repair. Historical case validators are unchanged. */
import type pg from 'pg';
import {createHash} from 'node:crypto';
import {readContinuationSnapshot,continuationDigest,continuationTables} from './native-circle-continuation.ts';
import {chefSourceTimestamp} from './integrations/observation/chef.ts';
import {digest,parseHeader,requireThat,stable,type Header} from './integrations/observation/types.ts';
import type {ChefLiveCursor} from './integrations/observation/chef-live-cursor.ts';
import {pgRepairTime} from './app-chef-metadata-repair.ts';
import {chefPersistedCanonical} from './integrations/observation/chef-live.ts';
import type {CanonicalReader} from './integrations/observation/chef.ts';
export const tip5744Case={epoch:'223',xmin:'852987',checkpointXmin:'852923',min:4531977,boundary:4541976,tip:4545744,common:4545743,finalized:4545735,baseRows:269,
 wrong:'0000129225e196dc446ba557d8d2377218e126d735afc66b5c7b5554da0a3c33',replacement:'0000187e639d2771df6a076063016a84ed7b2d7b964ee8a291a9694923234170',
 commonHash:'000029c8c043292fb811994f08a820358b030a76bcfbf84fd2294540241af9dd',finalHash:'00002a484973c7334385cc5f57b04679ab7554532f5dc3c3aac5b5ccecdf8c01',
 financialDigest:'b1079860bfcbcdb6f022d59c1da18671e81cbcf44722e8d426c8922b09b5d57f',
 tailPath:'/opt/zeeswap-testnet/state/continuation-preflight/native-cursor-reorg-5744-r1.private.json',tailSha256:'858e252164ae0611d46fa581a93bfd065ab50439827b12c1df43c5043ecc6e83',
 archivePath:'/opt/zeeswap-testnet/state/continuation/continuation-session-20261025-r3.private.json',archiveSha256:'ca482d09b73b0f574d7f39f2e05ddc0893a9c7c3ebdb3b2a27f92af4395d4521',
 selectorPath:'/opt/zeeswap-testnet/secrets/envio-event-first-selector.private.json',selectorSha256:'62446c50e4b0e9f3c49508a7632191e982ed92f3c96add7ae0d54af63fb29420'} as const;
export type Tip5744Pin={path:string;sha256:string};
export type Tip5744Control={epoch:string;xmin:string;accepting_orders:false;dispatch_enabled:false;reconciliation_required:true};
export type Tip5744Row={network:string;height:string;block_hash:string;block_time:string;xmin:string};
export type Tip5744Checkpoint={network:string;scanned_height:string;finalized_height:string;tip_hash:string;finalized_time:string;observed_at:string;xmin:string};
export type Tip5744State={control:Tip5744Control;checkpoints:Tip5744Checkpoint[];rows:Tip5744Row[];books:Record<string,any[]>;authorizationRows:string;activeLeases:string;triggers:{replicationRole:string;bindings:{name:string;enabled:string;correctFunction:boolean;afterRowUpdate:boolean}[]}};
export type Tip5744Context={profileSha256:string;handoffSha256:string;openingProofSha256:string;financialDigest:string;sourceIdentity:unknown;control:Tip5744Control};
export type Tip5744Approval={version:1;purpose:'ROOT_CLOSED_HISTORY_CHEF_5744_TIP_REPAIR_APPROVED';metadataOnly:true;noFinance:true;verifiedAt:string;expiresAt:string;publicCommit:string;profileSha256:string;handoffSha256:string;openingProofSha256:string;financialDigest:string;sourceIdentity:unknown;control:Tip5744Control;diagnostic:Tip5744Pin;tailProbe:Tip5744Pin;replayPreflight:Tip5744Pin;sourceSelector:Tip5744Pin;financialArchive:Tip5744Pin;protectedConfigPins:Tip5744Pin[];baseAdmission:Tip5744Pin;nativeRows:number;beforeStateDigest:string;oldCursor:ChefLiveCursor;oldCursorSha256:string;common:Header;replacement:Header;finalized:Header;appWritersStopped:true;financialWorkersStopped:true;runtimePins:Tip5744Pin[]};
export type Tip5744Intent={version:1;purpose:'CLOSED_HISTORY_CHEF_5744_TIP_REPAIR';approvalSha256:string;approvalDigest:string;transactionId:string;expectedXmin:string;before:Tip5744State;after:Tip5744State;oldCursorSha256:string;newCursor:ChefLiveCursor;newCursorSha256:string;newCursorBase64:string};
const need=(v:unknown,c:string)=>requireThat(v,'TIP5744_'+c),sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
const decimal=(v:unknown)=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
export function tip5744Timestamp(v:string){chefSourceTimestamp(v);return pgRepairTime(v);}
export function validateTip5744Approval(a:Tip5744Approval,context:Tip5744Context,now=Date.now()){
 need(a?.version===1&&a.purpose==='ROOT_CLOSED_HISTORY_CHEF_5744_TIP_REPAIR_APPROVED'&&a.metadataOnly===true&&a.noFinance===true&&a.appWritersStopped===true&&a.financialWorkersStopped===true,'ROOT_SCOPE');
 const at=Date.parse(chefSourceTimestamp(a.verifiedAt)),end=Date.parse(chefSourceTimestamp(a.expiresAt));need(at<=now+5000&&end>now&&end>at&&end-at<=7200000,'APPROVAL_TIME');
 for(const key of ['profileSha256','handoffSha256','openingProofSha256','financialDigest'] as const)need(sha(a[key])&&a[key]===context[key],'IMMUTABLE_'+key);
 need(stable(a.sourceIdentity)===stable(context.sourceIdentity)&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&a.publicCommit!=='0'.repeat(40),'SOURCE_OR_CODE_IDENTITY');
 need(stable(a.control)===stable(context.control)&&a.control.epoch===tip5744Case.epoch&&a.control.xmin===tip5744Case.xmin&&decimal(a.control.xmin)&&BigInt(a.control.xmin)>0n&&!a.control.accepting_orders&&!a.control.dispatch_enabled&&a.control.reconciliation_required===true,'APPROVAL_CONTROL');
 need(a.diagnostic?.path.startsWith('/opt/zeeswap-testnet/state/app-chef-5744-tip-repair/')&&sha(a.diagnostic.sha256)&&a.tailProbe?.path===tip5744Case.tailPath&&a.tailProbe.sha256===tip5744Case.tailSha256,'DIAGNOSTIC_PIN');
 need(a.replayPreflight?.path.startsWith('/opt/zeeswap-testnet/state/app-chef-5744-tip-repair/')&&sha(a.replayPreflight.sha256)&&a.sourceSelector?.path===tip5744Case.selectorPath&&a.sourceSelector.sha256===tip5744Case.selectorSha256&&Number.isSafeInteger(a.nativeRows)&&a.nativeRows>2&&a.nativeRows<=10004,'CURRENT_REPLAY_LINEAGE');need(a.baseAdmission?.path==='/opt/zeeswap-testnet/state/envio/admission.live.bin'&&sha(a.baseAdmission.sha256),'BASE_ADMISSION_PIN');need(a.financialArchive?.path===tip5744Case.archivePath&&a.financialArchive.sha256===tip5744Case.archiveSha256&&Array.isArray(a.protectedConfigPins)&&a.protectedConfigPins.length>=4&&a.protectedConfigPins.length<=32&&a.protectedConfigPins.every(p=>p.path.startsWith('/opt/zeeswap-testnet/secrets/')&&!p.path.includes('..')&&sha(p.sha256)),'ARCHIVAL_FINANCE_AND_CONFIG_PINS');
 for(const h of [a.common,a.replacement,a.finalized])parseHeader(h,'zcash-testnet');
 need(a.common.height===tip5744Case.common&&a.common.hash===tip5744Case.commonHash&&a.replacement.height===tip5744Case.tip&&a.replacement.hash===tip5744Case.replacement&&a.replacement.parentHash===a.common.hash&&a.finalized.height===tip5744Case.finalized&&a.finalized.hash===tip5744Case.finalHash,'EXACT_TIP_CASE');
 need(sha(a.beforeStateDigest)&&sha(a.oldCursorSha256)&&a.oldCursor?.version===1&&a.oldCursor.processedThrough===tip5744Case.tip&&a.oldCursor.tipHash===tip5744Case.wrong&&sha(a.oldCursor.identityDigest)&&sha(a.oldCursor.snapshotDigest),'CURSOR_BINDING');
 need(Array.isArray(a.runtimePins)&&a.runtimePins.length>=2&&a.runtimePins.length<=96&&new Set(a.runtimePins.map(p=>p.path)).size===a.runtimePins.length&&a.runtimePins.every(p=>typeof p.path==='string'&&p.path.startsWith('/opt/zeeswap-testnet/releases/')&&!p.path.includes('/../')&&!p.path.includes('/./')&&sha(p.sha256)),'RUNTIME_PINS');
 return a;
}
export {readClosedTipState as readTip5744State} from './app-chef-closed-tip-repair.ts';
export function validateTip5744Before(s:Tip5744State,a:Tip5744Approval,cursor:ChefLiveCursor,cursorSha256:string){
 need(digest(s)===a.beforeStateDigest&&stable(cursor)===stable(a.oldCursor)&&cursorSha256===a.oldCursorSha256,'EXACT_BEFORE_STATE');
 need(stable(s.control)===stable(a.control)&&a.control.epoch===tip5744Case.epoch&&a.control.accepting_orders===false&&a.control.dispatch_enabled===false&&a.control.reconciliation_required===true,'EXACT_PAUSED_CONTROL');
 need(Object.keys(s.books).sort().join(',')===[...continuationTables].sort().join(',')&&Object.values(s.books).reduce((n,rows)=>n+rows.length,0)===70&&continuationDigest(s.books)===a.financialDigest&&s.authorizationRows==='0'&&s.activeLeases==='0'&&s.books.outbox_jobs!.every(row=>row.status==='DONE'&&row.lease_owner===null&&row.lease_until===null),'CLOSED_FINANCIAL_HISTORY');
 need(s.rows.length>0&&s.rows.length<=20008&&s.rows.every(r=>['zcash-testnet','base-sepolia'].includes(r.network)&&decimal(r.height)&&sha(r.block_hash)&&decimal(r.xmin))&&new Set(s.rows.map(r=>r.network+':'+r.height)).size===s.rows.length,'ROWS_BOUND');
 need(s.books.orders!.every(r=>['SETTLED','REFUNDED','EXPIRED_UNFUNDED'].includes(r.state))&&s.books.obligations!.every(r=>r.state==='DISCHARGED')&&s.books.operations!.every(r=>r.state==='CONFIRMED')&&s.books.reservations!.every(r=>r.released_at)&&s.books.inventory_accounts!.every(r=>String(r.reserved)==='0')&&['base_attempts','escrow_commits','reverse_payouts','escrow_settlements'].every(t=>s.books[t]!.every(r=>r.confirmed===true))&&s.books.source_refunds!.every(r=>r.confirmed===true&&r.base_confirmed===true),'NO_OPEN_FINANCIAL_WORK');
 const native=s.rows.filter(r=>r.network==='zcash-testnet');need(native.length===a.nativeRows&&s.rows.length===a.nativeRows+tip5744Case.baseRows&&native[0]?.height===String(tip5744Case.min)&&native.every(r=>Number(r.height)<=tip5744Case.tip),'EXACT_NATIVE_PREFIX');
 need(s.checkpoints.length===2&&new Set(s.checkpoints.map(c=>c.network)).size===2,'BOTH_CHECKPOINTS');const cp=s.checkpoints.find(c=>c.network==='zcash-testnet'),tip=native.find(r=>Number(r.height)===tip5744Case.tip),common=native.find(r=>Number(r.height)===tip5744Case.common),final=native.find(r=>Number(r.height)===tip5744Case.finalized);
 need(cp?.scanned_height===String(tip5744Case.tip)&&cp.xmin===tip5744Case.checkpointXmin&&cp.tip_hash===tip5744Case.wrong&&cp.finalized_height===String(tip5744Case.finalized)&&tip?.block_hash===tip5744Case.wrong&&common?.block_hash===a.common.hash&&final?.block_hash===a.finalized.hash&&Date.parse(cp.finalized_time)===Date.parse(a.finalized.time),'TIP_CHECKPOINT_AND_FINALIZED');
 const base=s.checkpoints.find(c=>c.network==='base-sepolia'),baseTip=s.rows.find(r=>r.network==='base-sepolia'&&r.height===base?.scanned_height),baseFinal=s.rows.find(r=>r.network==='base-sepolia'&&r.height===base?.finalized_height);need(base&&baseTip?.block_hash===base.tip_hash&&baseFinal&&Date.parse(baseFinal.block_time)===Date.parse(base.finalized_time),'BASE_CHECKPOINT_OR_FINALIZED_BINDING');
 need(s.triggers.replicationRole==='origin'&&s.triggers.bindings.length===2&&s.triggers.bindings.every(b=>['O','A'].includes(b.enabled)&&b.correctFunction===true&&b.afterRowUpdate===true)&&stable(s.triggers.bindings.map(b=>b.name).sort())===stable(['canonical_reorg','observer_rewind']),'ORIGINAL_ACTIVE_TRIGGERS');
 tip5744FinancialAnchors(s);
}
export function tip5744FinancialAnchors(s:Tip5744State){
 const anchors:{network:string;height:number;hash:string}[]=[];
 const add=(network:string,h:unknown,hash:unknown)=>{if(h==null&&hash==null)return;need(['zcash-testnet','base-sepolia'].includes(network)&&Number.isSafeInteger(Number(h))&&Number(h)>=0&&sha(hash),'FINANCIAL_ANCHOR_SHAPE');need(!(network==='zcash-testnet'&&Number(h)>tip5744Case.common),'FINANCIAL_ANCHOR_AT_REPLACED_TIP');need(s.rows.some(r=>r.network===network&&r.height===String(h)&&r.block_hash===hash),'FINANCIAL_ANCHOR_NOT_STORED');anchors.push({network,height:Number(h),hash:String(hash)});};
 for(const row of s.books.deposits??[])add(row.network,row.block_height,row.block_hash);
 for(const row of s.books.reverse_payouts??[])add('zcash-testnet',row.block_height,row.block_hash);
 for(const row of s.books.source_refunds??[]){add('zcash-testnet',row.height,row.block_hash);add('base-sepolia',row.base_height,row.base_block);}
 for(const table of ['base_attempts','escrow_commits','escrow_settlements'])for(const row of s.books[table]??[])add('base-sepolia',row.block_height,row.block_hash);
 for(const row of s.books.chain_transactions??[]){if(row.block_height==null&&row.block_hash==null)continue;const matches=s.rows.filter(r=>r.height===String(row.block_height)&&r.block_hash===row.block_hash);need(matches.length===1,'FINANCIAL_TRANSACTION_NETWORK');add(matches[0]!.network,row.block_height,row.block_hash);}
 return anchors;
}
/** Diagnostic is a pinned observation, never an authorization or no-repair attestation. */
export function validateTip5744Diagnostic(report:any,s:Tip5744State,a:Tip5744Approval){
 const start=Date.parse(report?.startedAt),end=Date.parse(report?.completedAt),issued=Date.parse(a.verifiedAt);need(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=1200000&&issued>=end&&issued-end<=1200000,'FRESH_FULL_AUDIT_TIME');
 need(report?.beforeStateDigest===a.beforeStateDigest&&stable(report.nativePhases?.phases)===stable([{fromHeight:tip5744Case.min,throughHeight:tip5744Case.boundary},{fromHeight:tip5744Case.boundary,throughHeight:tip5744Case.tip}])&&report.nativePhases?.verifiedDenseHeaders===tip5744Case.tip-tip5744Case.min+2&&report.nativePhases?.overlap?.height===tip5744Case.boundary,'FULL_DENSE_PHASE_PROOF');
 need(report?.version===1&&report.status==='DIAGNOSTIC_CONFLICTS'&&report.complete===true&&report.noRepairAttestation===false&&report.financialAuthority===false&&report.profileSha256===a.profileSha256&&report.financialSnapshotSha256===a.financialDigest&&report.financialTables===19&&report.financialRows===70&&stable(report.control)===stable(s.control)&&stable(report.sourceIdentity)===stable(a.sourceIdentity),'DIAGNOSTIC_SCOPE');
 need(report.sqlMutation===false&&report.cursorMutation===false&&report.sourceMutation===false&&report.persistentStateBeforeDigest===report.persistentStateAfterDigest&&report.cursor?.sha256===a.oldCursorSha256&&report.cursor.height===tip5744Case.tip&&report.cursor.hash===tip5744Case.wrong,'DIAGNOSTIC_STATE');
 need(report.conflicts?.length===1&&report.conflictRowCount===1&&report.persistedConflictRowCount===1&&report.financialAnchorConflictCount===0&&report.coreOnlyConflictRowCount===0,'EXACT_SINGLE_CONFLICT');
 const conflict=report.conflicts[0];need(conflict.network==='zcash-testnet'&&conflict.height===tip5744Case.tip&&conflict.expected===tip5744Case.wrong&&conflict.actual===tip5744Case.replacement&&['SQL_NATIVE','CHECKPOINT','CURSOR'].every(role=>conflict.roles?.includes(role))&&!conflict.roles.some((r:string)=>r==='FINALIZED'||r.startsWith('FINANCIAL_')),'DIAGNOSTIC_CONFLICT');
 need(report.firstCommonAncestorRecentSuffix?.status==='FOUND_CONTIGUOUS_STORED_SUFFIX'&&report.firstCommonAncestorRecentSuffix.height===tip5744Case.common&&report.firstCommonAncestorRecentSuffix.conflictingSuffixRows===1,'DIAGNOSTIC_COMMON_ANCESTOR');
 const rows=s.rows.map(({xmin,...r})=>({...r,block_time:new Date(r.block_time).toISOString()})),checkpoints=s.checkpoints.map(cp=>({...cp,finalized_time:new Date(cp.finalized_time).toISOString(),observed_at:new Date(cp.observed_at).toISOString()}));
 need(stable(report.rows)===stable(rows)&&stable(report.checkpoints)===stable(checkpoints)&&continuationDigest({books:s.books,control:s.control,checkpoints,rows})===report.persistentStateBeforeDigest,'DIAGNOSTIC_FULL_METADATA');
}
export function expectedTip5744After(before:Tip5744State,a:Tip5744Approval,xmin:string){
 need(decimal(xmin)&&BigInt(xmin)>0n&&BigInt(xmin)<=4294967295n,'EXPECTED_XMIN');const after=structuredClone(before);after.control={...after.control,epoch:(BigInt(before.control.epoch)+2n).toString(),xmin};
 after.rows=after.rows.map(r=>r.network==='zcash-testnet'&&r.height===String(tip5744Case.tip)?{...r,block_hash:a.replacement.hash,block_time:tip5744Timestamp(a.replacement.time),xmin}:r);
 after.checkpoints=after.checkpoints.map(cp=>cp.network==='zcash-testnet'?{...cp,scanned_height:String(a.common.height),tip_hash:a.common.hash,xmin}:cp);return after;
}
/** Only the canonical tip row and native checkpoint change; original triggers run normally. */
export async function applyTip5744Updates(client:Pick<pg.PoolClient,'query'>,before:Tip5744State,a:Tip5744Approval){
 const row=before.rows.find(r=>r.network==='zcash-testnet'&&r.height===String(tip5744Case.tip))!,cp=before.checkpoints.find(c=>c.network==='zcash-testnet')!;
 const changed=await client.query(`UPDATE zee.chain_observations SET block_hash=$1,block_time=$2::timestamptz WHERE network='zcash-testnet' AND height=$3::bigint AND block_hash=$4 AND block_time=$5::timestamptz AND xmin::text=$6 RETURNING height`,[a.replacement.hash,a.replacement.time,tip5744Case.tip,row.block_hash,row.block_time,row.xmin]);need(changed.rows.length===1,'TIP_ROW_CAS');
 const checkpoint=await client.query(`UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,tip_hash=$2 WHERE network='zcash-testnet' AND scanned_height=$3::bigint AND tip_hash=$4 AND finalized_height=$5::bigint AND finalized_time=$6::timestamptz AND observed_at=$7::timestamptz AND xmin::text=$8 RETURNING scanned_height`,[a.common.height,a.common.hash,cp.scanned_height,cp.tip_hash,cp.finalized_height,cp.finalized_time,cp.observed_at,cp.xmin]);need(checkpoint.rows.length===1,'CHECKPOINT_CAS');
}
export function classifyTip5744Commit(status:unknown,current:Tip5744State,intent:Tip5744Intent){if(status==='committed'&&stable(current)===stable(intent.after))return'COMMITTED_EXACT';if(status==='aborted'&&stable(current)===stable(intent.before))return'ABORTED_EXACT_NO_REPLAY';return'UNKNOWN_OR_INTERVENED_NO_REPLAY';}
export function validateTip5744Intent(intent:Tip5744Intent,a:Tip5744Approval,approvalSha256:string){
 need(intent?.version===1&&intent.purpose==='CLOSED_HISTORY_CHEF_5744_TIP_REPAIR'&&intent.approvalSha256===approvalSha256&&intent.approvalDigest===digest(a)&&/^[1-9][0-9]*$/.test(intent.transactionId)&&intent.expectedXmin===(BigInt(intent.transactionId)%4294967296n).toString()&&intent.oldCursorSha256===a.oldCursorSha256,'INTENT_BINDING');
 validateTip5744Before(intent.before,a,a.oldCursor,a.oldCursorSha256);need(stable(intent.after)===stable(expectedTip5744After(intent.before,a,intent.expectedXmin)),'INTENT_AFTER');
 const cursor={...a.oldCursor,processedThrough:a.common.height,tipHash:a.common.hash,snapshotDigest:digest({purpose:intent.purpose,approvalSha256,transactionId:intent.transactionId,before:digest(intent.before),after:digest(intent.after)})},raw=Buffer.from(intent.newCursorBase64,'base64');
 need(raw.length>0&&raw.length<16384&&raw.toString('base64')===intent.newCursorBase64&&createHash('sha256').update(raw).digest('hex')===intent.newCursorSha256&&stable(JSON.parse(raw.toString()))===stable(cursor)&&stable(intent.newCursor)===stable(cursor),'INTENT_CURSOR');return raw;
}
export async function finishTip5744Boundary(status:unknown,current:Tip5744State,intent:Tip5744Intent,io:{fence():Promise<void>;readCursor():Promise<void>;installCursor():Promise<void>;writeCompletion():Promise<void>;removeMarker():Promise<void>}){
 need(classifyTip5744Commit(status,current,intent)==='COMMITTED_EXACT','COMMIT_NOT_EXACT_NO_REPLAY');await io.fence();await io.readCursor();await io.fence();await io.installCursor();await io.fence();await io.writeCompletion();await io.fence();await io.removeMarker();
}

/** This exact case stitches TWO independently bounded dense passes. No old
 * dense/cache/RPC limit is raised and no gap header is omitted. */
export async function tip5744DenseCanonical(heights:number[],factory:(range?:{fromHeight:number;throughHeight:number})=>CanonicalReader,sourceId:string,signal:AbortSignal){
 const c=tip5744Case;need(heights.length>0&&heights.length<=10004&&heights.every(h=>Number.isSafeInteger(h)&&h>=c.min&&h<=c.tip)&&heights.includes(c.min)&&heights.includes(c.tip),'CANONICAL_CASE_BOUND');
 const wanted=new Set([...heights,c.boundary]),result=new Map<number,Header>(),phases=[{fromHeight:c.min,throughHeight:c.boundary},{fromHeight:c.boundary,throughHeight:c.tip}],samples:Header[]=[];let overlap:Header|undefined;
 for(const phase of phases){signal.throwIfAborted();const sample=await factory().sample(signal);need(sample.sourceId===sourceId,'CANONICAL_SOURCE');samples.push(parseHeader(sample.head,'zcash-testnet'));
  const reader=chefPersistedCanonical(range=>factory(range)),part=[...wanted].filter(h=>h>=phase.fromHeight&&h<=phase.throughHeight);await reader.prefetchPersisted([...part,phase.fromHeight,phase.throughHeight],signal);
  for(const h of part){const actual=parseHeader(await reader.header(h,signal),'zcash-testnet'),prior=result.get(h);need(actual.height===h&&(!prior||stable(prior)===stable(actual)),'PHASE_OVERLAP_FORK');result.set(h,actual);if(h===c.boundary){if(overlap)need(stable(overlap)===stable(actual),'PHASE_OVERLAP_FORK');overlap=actual;}}
  need(stable(await factory().header(sample.head.height,signal))===stable(sample.head),'CANONICAL_HEAD_CHANGED');
 }
 need(overlap&&stable(await factory().header(c.boundary,signal))===stable(overlap),'FRESH_BOUNDARY_FORK');for(const sample of samples)need(stable(await factory().header(sample.height,signal))===stable(sample),'CANONICAL_HEAD_CHANGED');signal.throwIfAborted();
 need(heights.every(h=>result.has(h)),'MISSING_CANONICAL_ROW');return{headers:result,phases,overlap:overlap!,verifiedDenseHeaders:phases.reduce((n,p)=>n+p.throughHeight-p.fromHeight+1,0)};
}
