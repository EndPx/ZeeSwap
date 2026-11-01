/** Root closed-book metadata repair only; no cursor reset, finality or money changes. */
import type pg from 'pg';
import type {Header} from './integrations/observation/types.ts';
import {parseHeader,stable} from './integrations/observation/types.ts';
import type {ChefLiveCursor} from './integrations/observation/chef-live-cursor.ts';
export type NativeTipCheckpoint={scanned_height:string;finalized_height:string;tip_hash:string;finalized_time:string;observed_at:string;xmin:string};
export type NativeTipRow={height:string;block_hash:string;block_time:string;xmin:string};
export type NativeTipRepair={checkpoint:NativeTipCheckpoint;row:NativeTipRow;cursor:ChefLiveCursor;replacement:Header;parent:Header;finalized:Header;anchors:{height:number;hash:string}[]};
function need(v:unknown,c:string):asserts v{if(!v)throw Error('NATIVE_CLOSED_TIP_'+c);}
export function qualifyNativeClosedTip(v:NativeTipRepair,actualAnchors:Header[]){
 const {checkpoint:c,row,cursor,replacement:r,parent:p,finalized:f}=v;
 for(const h of[r,p,f,...actualAnchors])parseHeader(h,'zcash-testnet');
 need(c.scanned_height===row.height&&Number(c.scanned_height)===cursor.processedThrough&&c.tip_hash===row.block_hash&&cursor.tipHash===c.tip_hash,'SQL_CURSOR_BINDING');
 need(Number.isSafeInteger(cursor.processedThrough)&&cursor.processedThrough>Number(c.finalized_height)&&cursor.processedThrough-Number(c.finalized_height)<=9,'UNFINAL_TAIL_ONLY');
 need(r.height===cursor.processedThrough&&r.hash!==c.tip_hash&&p.height===r.height-1&&r.parentHash===p.hash,'SIBLING_PARENT');
 need(f.height===Number(c.finalized_height)&&Date.parse(f.time)===Date.parse(c.finalized_time),'FINALIZED_BOUNDARY');
 need(v.anchors.length<=502&&v.anchors.every(a=>a.height<r.height&&actualAnchors.some(h=>h.height===a.height&&h.hash===a.hash)),'FINANCIAL_ANCHOR_CHANGED');
 need(v.anchors.some(a=>a.height===f.height&&a.hash===f.hash)&&v.anchors.some(a=>a.height===p.height&&a.hash===p.hash),'STORED_FINAL_AND_PARENT');
 for(const value of[c.xmin,row.xmin])need(/^[1-9][0-9]*$/.test(value),'CAS_XMIN');
 return v;
}
/** Both existing reorg triggers stay enabled and advance the paused control normally. */
export async function applyNativeClosedTip(db:Pick<pg.PoolClient,'query'>,v:NativeTipRepair){
 const c=v.checkpoint,row=v.row;
 const changed=await db.query("UPDATE zee.chain_observations SET block_hash=$1,block_time=$2::timestamptz WHERE network='zcash-testnet' AND height=$3::bigint AND block_hash=$4 AND block_time=$5::timestamptz AND xmin::text=$6 RETURNING height",[v.replacement.hash,v.replacement.time,row.height,row.block_hash,row.block_time,row.xmin]);
 need(changed.rows.length===1,'HEADER_CAS');
 const cp=await db.query("UPDATE zee.scanner_checkpoints SET tip_hash=$1 WHERE network='zcash-testnet' AND scanned_height=$2::bigint AND tip_hash=$3 AND finalized_height=$4::bigint AND finalized_time=$5::timestamptz AND observed_at=$6::timestamptz AND xmin::text=$7 RETURNING scanned_height",[v.replacement.hash,c.scanned_height,c.tip_hash,c.finalized_height,c.finalized_time,c.observed_at,c.xmin]);
 need(cp.rows.length===1,'CHECKPOINT_CAS');
}
export function classifyNativeTipOriginal(status:unknown,current:unknown,before:unknown,after:unknown){
 if(status==='committed'&&stable(current)===stable(after))return'COMMITTED_EXACT';
 if(status==='aborted'&&stable(current)===stable(before))return'ABORTED_EXACT';
 return'UNKNOWN_NO_REPLAY';
}
