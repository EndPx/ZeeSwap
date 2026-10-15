import type pg from 'pg';
import { transaction } from './db.ts';

export interface ObserverCheckpoint {
 network:'zcash-testnet'|'base-sepolia';height:number;hash:string;
 finalizedHeight:number;finalizedTime:Date;observedAt:Date;
}
export interface CanonicalBlock {network:ObserverCheckpoint['network'];height:number;hash:string;time:Date}
type Header={height:number;hash:string;finalizedHeight:number;observedAt:string};
export class ObserverWaitError extends Error {
 readonly code='OBSERVER_WAIT';
 constructor(readonly diagnostic:Record<string,unknown>){super('OBSERVER_WAIT');this.name='ObserverWaitError';}
}
export const isObserverWait=(error:unknown):error is ObserverWaitError=>error instanceof ObserverWaitError;
const header=(p:ObserverCheckpoint):Header=>({height:p.height,hash:p.hash,finalizedHeight:p.finalizedHeight,observedAt:p.observedAt.toISOString()});
function diagnostic(source:string,status:string,reason:string,network:string,previous:unknown,incoming:unknown){
 const value={event:'observer-frontier',source,status,reason,network,previous,incoming};
 // Deliberately restricted to public headers and source names; no wallet,
 // receipt, order, RPC URL, memo, credential or transaction mapping is logged.
 console.error(JSON.stringify(value));return value;
}

/** Serialize every production observer writer against the runtime row. A stale
 * observation cannot renew readiness. A contradictory header commits the same
 * reconciliation primitive as the existing triggers BEFORE an error escapes.
 */
export async function publishObserverBatch(pool:pg.Pool,source:string,checkpoints:ObserverCheckpoint[],blocks:CanonicalBlock[]=[],receiptHeight?:number){
 const result=await transaction(pool,async c=>{
  await c.query('SELECT zee.lock_observer_cycle()');
  const prior=new Map<string,ObserverCheckpoint>();
  for(const p of checkpoints){
   const row=(await c.query('SELECT * FROM zee.scanner_checkpoints WHERE network=$1 FOR UPDATE',[p.network])).rows[0];
   if(row)prior.set(p.network,{network:p.network,height:Number(row.scanned_height),hash:row.tip_hash,finalizedHeight:Number(row.finalized_height),finalizedTime:new Date(row.finalized_time),observedAt:new Date(row.observed_at)});
  }
  let contradiction:Record<string,unknown>|undefined;
  // Detect contradictions before lag: lag must never hide a known hash change.
  for(const p of checkpoints){const old=prior.get(p.network);
   if(old&&p.height===old.height&&p.hash!==old.hash)
    contradiction=diagnostic(source,'CONFLICT','TIP_HASH_CHANGED',p.network,header(old),header(p));
  }
  for(const b of blocks){
   const old=(await c.query('SELECT block_hash FROM zee.chain_observations WHERE network=$1 AND height=$2',[b.network,b.height])).rows[0];
   if(old&&old.block_hash!==b.hash)
    contradiction=diagnostic(source,'CONFLICT','CANONICAL_HASH_CHANGED',b.network,{height:b.height,hash:old.block_hash},{height:b.height,hash:b.hash});
  }
  if(contradiction){
   await c.query('SELECT zee.enter_reconciliation()');
   return {conflict:contradiction,epoch:''};
  }
  for(const p of checkpoints){const old=prior.get(p.network);if(!old)continue;
   const reason=p.height<old.height?'HEAD_BEHIND':p.finalizedHeight<old.finalizedHeight?'FINALITY_BEHIND':p.observedAt<old.observedAt?'OLDER_OBSERVATION':undefined;
   if(reason)throw new ObserverWaitError(diagnostic(source,'WAIT',reason,p.network,header(old),header(p)));
  }
  if(receiptHeight!==undefined)await requireScannedReceipt(c,source,receiptHeight);
  for(const p of checkpoints)await c.query(`INSERT INTO zee.scanner_checkpoints VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(network) DO UPDATE SET scanned_height=$2,tip_hash=$3,finalized_height=$4,finalized_time=$5,observed_at=$6`,
   [p.network,p.height,p.hash,p.finalizedHeight,p.finalizedTime,p.observedAt]);
  for(const b of blocks)await c.query(`INSERT INTO zee.chain_observations VALUES($1,$2,$3,$4)
   ON CONFLICT(network,height) DO UPDATE SET block_hash=$3,block_time=$4`,[b.network,b.height,b.hash,b.time]);
  const epoch=(await c.query('SELECT epoch::text FROM zee.runtime_control WHERE singleton')).rows[0]?.epoch;
  if(typeof epoch!=='string')throw Error('OBSERVER_RUNTIME_MISSING');
  return {epoch,conflict:undefined};
 });
 if(result.conflict){const error=new Error('OBSERVER_CANONICAL_CONFLICT');Object.assign(error,{diagnostic:result.conflict});throw error;}
 return result.epoch;
}

/** Fence the confirmation transaction against any conflict committed after its
 * publication transaction. Existing paused reconciliation remains possible,
 * but an intervening incident invalidates this exact observation cycle.
 */
export async function requireObserverEpoch(c:pg.PoolClient,epoch:string){
 // The worker deliberately has no UPDATE privilege on runtime_control, so a
 // direct SELECT FOR UPDATE is forbidden. The existing restricted definer
 // function takes the same runtime row lock without broadening worker grants.
 await c.query('SELECT zee.lock_observer_cycle()');
 const row=(await c.query('SELECT epoch::text FROM zee.runtime_control WHERE singleton')).rows[0];
 if(!row||row.epoch!==epoch)throw Error('OBSERVER_EPOCH_CHANGED');
}

/** Receipt/network tips never claim SDK scanning progress. The existing SQL
 * finality checks remain authoritative and are repeated during confirmation.
 */
export async function requireScannedReceipt(pool:pg.Pool|pg.PoolClient,source:string,height:number){
 const row=(await pool.query(`SELECT *,observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds' AS fresh
  FROM zee.scanner_checkpoints WHERE network='zcash-testnet'`)).rows[0];
 if(!row||!row.fresh||Number(row.scanned_height)-height+1<10)
  throw new ObserverWaitError(diagnostic(source,'WAIT','SCANNER_FINALITY_PENDING','zcash-testnet',row?{height:Number(row.scanned_height),hash:row.tip_hash,finalizedHeight:Number(row.finalized_height),observedAt:new Date(row.observed_at).toISOString()}:null,{receiptHeight:height,requiredScannedHeight:height+9}));
}
