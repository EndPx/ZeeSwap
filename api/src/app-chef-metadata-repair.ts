import {lstat} from 'node:fs/promises';
/** Exact single-tip APP metadata repair. No source, customer, signing or control-reset API. */
import type pg from 'pg';
import {authorizedPrefundingSnapshotSql,validateAuthorizedPrefundingSnapshot,type EpochAuthority,type EpochContext,type PrefundingEpochProof} from './prefunding-epoch.ts';
import {digest,parseHeader,requireThat,stable,type Header} from './integrations/observation/types.ts';
import type {ChefLiveCursor} from './integrations/observation/chef-live-cursor.ts';
export type RepairCheckpoint={height:number;hash:string;finalizedHeight:number;finalizedTime:string;observedAt:string};
export type RepairChainRow={height:number;hash:string;time:string};
export interface AppMetadataRepairApproval extends EpochContext{
 version:1;purpose:'APP_CHEF_SINGLE_TIP_METADATA_REPAIR';branchId:'br-broad-pine-ao79wemx';database:'zee_app_20261023';verifiedAt:string;expiresAt:string;epochAuthoritySha256:string;
 sourceResolutionReceipt:{path:string;sha256:string};chefGeneration:string;officialRollbackReplayVerified:true;allOtherStoredHeadersCanonical:true;financialWorkersStopped:true;otherAppWritersStopped:true;latestOperatorNonce:0;pendingOperatorNonce:0;
 oldCheckpoint:RepairCheckpoint;oldTipRow:RepairChainRow;oldCursor:ChefLiveCursor;oldCursorSha256:string;financialDigest:string;unchangedCanonicalRowsDigest:string;
 common:Header;replacement:Header;oldFinalized:Header;targetFinalized:Header;capital:PrefundingEpochProof['capital'];
}
export type RepairState={prefunding:any;checkpoint:RepairCheckpoint;rows:RepairChainRow[];children:Record<string,string>;apiRequestForeignKey:boolean;triggers:{replicationRole:string;enabled:string[]}};
export type RepairIntent={version:1;purpose:'APP_CHEF_SINGLE_TIP_METADATA_REPAIR';approvalSha256:string;approvalDigest:string;transactionId:string;expectedXmin:string;before:RepairState;after:RepairState;oldCursorSha256:string;newCursor:ChefLiveCursor;newCursorSha256:string};
const need=(ok:unknown,code:string)=>requireThat(ok,'APP_METADATA_'+code),hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&!/^0+$/.test(v);
export async function requireNoAppMetadataRepair(marker:string){try{await lstat(marker);need(false,'REPAIR_PENDING');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
export const repairChildTables=['quotes','orders','reservations','deposits','obligations','operations','chain_transactions','outbox_jobs','order_events','base_bindings','base_attempts','escrow_bindings','escrow_commits','reverse_payouts','escrow_settlements','source_refunds'] as const;
export const repairStateSql=`SELECT row_to_json(p) prefunding,
 (SELECT jsonb_build_object('height',scanned_height,'hash',tip_hash,'finalizedHeight',finalized_height,'finalizedTime',to_char(finalized_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM zee.scanner_checkpoints WHERE network='zcash-testnet') checkpoint,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('height',height,'hash',block_hash,'time',to_char(block_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY height) FROM (SELECT * FROM zee.chain_observations WHERE network='zcash-testnet' ORDER BY height LIMIT 10001) h),'[]'::jsonb) rows,
 jsonb_build_object(${repairChildTables.map(t=>`'${t}',(SELECT count(*)::text FROM zee.${t})`).join(',')}) children,
 EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute source_column ON source_column.attrelid=k.conrelid AND source_column.attname='quote_id' AND source_column.attnotnull AND NOT source_column.attisdropped JOIN pg_attribute target_column ON target_column.attrelid=k.confrelid AND target_column.attname='id' AND NOT target_column.attisdropped WHERE k.conrelid='zee.api_quote_requests'::regclass AND k.confrelid='zee.quotes'::regclass AND k.contype='f' AND k.convalidated AND k.conkey=ARRAY[source_column.attnum]::smallint[] AND k.confkey=ARRAY[target_column.attnum]::smallint[]) "apiRequestForeignKey",
 jsonb_build_object('replicationRole',current_setting('session_replication_role'),'enabled',(SELECT jsonb_agg(tgname ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN('O','A') AND ((tgrelid='zee.chain_observations'::regclass AND tgname='canonical_reorg') OR(tgrelid='zee.scanner_checkpoints'::regclass AND tgname='observer_rewind')))) triggers
 FROM (${authorizedPrefundingSnapshotSql}) p`;
export async function readAppMetadataRepairState(c:Pick<pg.PoolClient,'query'>):Promise<RepairState>{const row=(await c.query(repairStateSql)).rows[0];need(row,'STATE_MISSING');return row;}
export function financialRepairDigest(s:RepairState){const p=s.prefunding;return digest({counts:p.counts,children:s.children,apiRequestForeignKey:s.apiRequestForeignKey,assets:[...p.assets].sort((a,b)=>stable(a).localeCompare(stable(b))),accounts:[...p.accounts].sort((a,b)=>stable(a).localeCompare(stable(b))),ledger:[...p.ledger].sort((a,b)=>stable(a).localeCompare(stable(b)))});}
export function otherCanonicalRowsDigest(s:RepairState,height:number){return digest(s.rows.filter(r=>r.height!==height));}
export function validateAppMetadataApproval(a:AppMetadataRepairApproval,context:EpochContext,authority:EpochAuthority,now=Date.now(),allowExpired=false){
 need(a?.version===1&&a.purpose==='APP_CHEF_SINGLE_TIP_METADATA_REPAIR'&&a.branchId==='br-broad-pine-ao79wemx'&&a.database==='zee_app_20261023'&&a.epochAuthoritySha256===authority.sha256,'APPROVAL_SCOPE');
 for(const k of ['profileSha256','handoffSha256','openingProofSha256','openingEventId'] as const)need(a[k]===context[k],'IMMUTABLE_BINDING');
 const at=Date.parse(a.verifiedAt),end=Date.parse(a.expiresAt);need(Number.isFinite(at)&&at<=now+5000&&end>at&&end-at<=3600000&&(allowExpired||end>now&&now-at<=300000),'APPROVAL_FRESHNESS');
 need(a.oldCheckpoint?.height===4536137&&a.oldCheckpoint.finalizedHeight===4536128&&a.oldTipRow?.height===4536137&&a.oldCursor?.version===1&&a.oldCursor.processedThrough===4536137&&a.oldCursor.tipHash===a.oldCheckpoint.hash&&a.oldTipRow.hash===a.oldCheckpoint.hash,'EXACT_SINGLE_TIP_CASE');
 for(const h of [a.common,a.replacement,a.oldFinalized,a.targetFinalized])parseHeader(h,'zcash-testnet');
 need(a.common.height===4536136&&a.replacement.height===4536137&&a.replacement.parentHash===a.common.hash&&a.oldFinalized.height===4536128&&a.targetFinalized.height===a.common.height-9&&a.oldTipRow.hash!==a.replacement.hash&&Date.parse(a.oldCheckpoint.finalizedTime)===Date.parse(a.oldFinalized.time),'CANONICAL_REPLACEMENT_CASE');
 need(a.officialRollbackReplayVerified===true&&a.allOtherStoredHeadersCanonical===true&&a.financialWorkersStopped===true&&a.otherAppWritersStopped===true&&a.latestOperatorNonce===0&&a.pendingOperatorNonce===0&&a.chefGeneration===authority.proof.incident.chefGeneration&&a.sourceResolutionReceipt?.path.startsWith('/opt/zeeswap-testnet/state/')&&hash(a.sourceResolutionReceipt.sha256),'OFFICIAL_SOURCE_RESOLUTION');
 for(const v of [a.oldCursorSha256,a.oldCursor.identityDigest,a.oldCursor.snapshotDigest,a.financialDigest,a.unchangedCanonicalRowsDigest])need(hash(v),'APPROVAL_DIGEST');
 const c=a.capital;need(c?.physicalZatoshi==='12500000'&&c.openingNoteCanonical===true&&hash(c.nativeCaptureSha256)&&hash(c.baseProofSha256)&&c.gasWei==='500000000000000'&&c.inventory==='10100000'&&c.available==='10000000'&&c.reserved==='100000'&&c.liability==='100000'&&at-Date.parse(c.observedAt)>=-5000&&at-Date.parse(c.observedAt)<=60000,'FRESH_PHYSICAL_CAPITAL');
 pgRepairTime(a.oldCheckpoint.observedAt);pgRepairTime(a.oldCheckpoint.finalizedTime);pgRepairTime(a.oldTipRow.time);return a;
}
export function validateAppMetadataBefore(s:RepairState,a:AppMetadataRepairApproval,authority:EpochAuthority,cursor:ChefLiveCursor,cursorSha256:string){
 validateAuthorizedPrefundingSnapshot(s.prefunding,authority);need(s.prefunding.role==='zee_app_worker_20261023','WORKER_ROLE');
 need(stable(s.checkpoint)===stable(a.oldCheckpoint)&&stable(s.rows.find(r=>r.height===4536137))===stable(a.oldTipRow)&&stable(cursor)===stable(a.oldCursor)&&cursorSha256===a.oldCursorSha256,'EXACT_OLD_METADATA');
 need(s.rows.length>0&&s.rows.length<=10000&&s.rows.every(r=>r.height<=4536137)&&s.apiRequestForeignKey===true&&Object.keys(s.children).sort().join(',')===[...repairChildTables].sort().join(',')&&Object.values(s.children).every(v=>v==='0'),'EMPTY_FINANCIAL_TABLES');
 need(financialRepairDigest(s)===a.financialDigest&&otherCanonicalRowsDigest(s,4536137)===a.unchangedCanonicalRowsDigest,'UNCHANGED_FINANCIAL_OR_ANCHOR_DIGEST');
 need(s.triggers.replicationRole==='origin'&&stable(s.triggers.enabled)===stable(['canonical_reorg','observer_rewind']),'ACTIVE_ORIGINAL_TRIGGERS');
}
export function pgRepairTime(iso:string){const m=iso.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/);need(m&&Number.isFinite(Date.parse(iso)),'TIMESTAMP');return m![1]+'.'+(m![2]??'').padEnd(6,'0')+'Z';}
export function expectedAppMetadataAfter(before:RepairState,a:AppMetadataRepairApproval,expectedXmin:string):RepairState{
 const next=structuredClone(before);next.prefunding.control={...next.prefunding.control,epoch:(BigInt(before.prefunding.control.epoch)+2n).toString(),xmin:expectedXmin};
 next.checkpoint={height:a.common.height,hash:a.common.hash,finalizedHeight:a.targetFinalized.height,finalizedTime:pgRepairTime(a.targetFinalized.time),observedAt:before.checkpoint.observedAt};
 next.rows=next.rows.map(r=>r.height===4536137?{height:4536137,hash:a.replacement.hash,time:pgRepairTime(a.replacement.time)}:r);return next;
}
/** Exactly two CAS updates. Caller owns transaction/guard/durable intent. Triggers stay active. */
export async function applyAppMetadataUpdates(c:Pick<pg.PoolClient,'query'>,a:AppMetadataRepairApproval){
 const chain=await c.query(`UPDATE zee.chain_observations SET block_hash=$1,block_time=$2::timestamptz WHERE network='zcash-testnet' AND height=$3 AND block_hash=$4 AND block_time=$5::timestamptz RETURNING height`,[a.replacement.hash,a.replacement.time,4536137,a.oldTipRow.hash,a.oldTipRow.time]);need(chain.rows.length===1,'CHAIN_CAS');
 const cp=await c.query(`UPDATE zee.scanner_checkpoints SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4::timestamptz WHERE network='zcash-testnet' AND scanned_height=$5 AND tip_hash=$6 AND finalized_height=$7 AND finalized_time=$8::timestamptz AND observed_at=$9::timestamptz RETURNING scanned_height`,[a.common.height,a.common.hash,a.targetFinalized.height,a.targetFinalized.time,a.oldCheckpoint.height,a.oldCheckpoint.hash,a.oldCheckpoint.finalizedHeight,a.oldCheckpoint.finalizedTime,a.oldCheckpoint.observedAt]);need(cp.rows.length===1,'CHECKPOINT_CAS');
}
export function classifyAppMetadataCommit(status:string,state:RepairState,intent:RepairIntent){
 if(status==='committed'&&stable(state)===stable(intent.after))return'COMMITTED_EXACT' as const;
 if(status==='aborted'&&stable(state)===stable(intent.before))return'ABORTED_NO_REPLAY' as const;
 return'UNKNOWN_OR_INTERVENED_NO_REPLAY' as const;
}
