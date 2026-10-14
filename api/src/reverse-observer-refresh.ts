import type pg from 'pg';
import { BaseContract } from './base-contract.ts';
import { validateSnapshot } from './observer.ts';
import { transaction } from './db.ts';

/** Only canonical checkpoints/blocks. No inventory, deposits or runtime policy
 * changes; existing reorg triggers may pause on a genuine contradictory view.
 */
export async function refreshReverseObservers(pool:pg.Pool,base:BaseContract,value:unknown){
 const snapshot=validateSnapshot(value),heads=await base.heads();
 const references=(await pool.query("SELECT height::text FROM zee.chain_observations WHERE network='base-sepolia' ORDER BY height LIMIT 501")).rows;
 if(references.length>500)throw Error('REVERSE_RECONCILIATION_WINDOW_LIMIT');
 const blocks:{height:string;hash:string;time:Date}[]=[];
 for(const {height} of references){const block=await base.client.getBlock({blockNumber:BigInt(height)});blocks.push({height,hash:block.hash!.slice(2),time:new Date(Number(block.timestamp)*1000)});}
 if((await base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('BASE_REORG');
 await transaction(pool,async c=>{
  await c.query('SELECT zee.lock_observer_cycle()');
  const finalized=snapshot.blocks.find(b=>b.height===snapshot.scannedHeight-9)!;
  await c.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',$1,$2,$3,$4,$5)
   ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=$5`,
   [snapshot.scannedHeight,snapshot.tipHash,finalized.height,finalized.time,snapshot.observedAt]);
  for(const block of snapshot.blocks)await c.query(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',$1,$2,$3)
   ON CONFLICT(network,height) DO UPDATE SET block_hash=$2,block_time=$3`,[block.height,block.hash,new Date(block.time)]);
  await c.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp())
   ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,
   [String(heads.latest.number),heads.latest.hash!.slice(2),String(heads.finalized.number),new Date(Number(heads.finalized.timestamp)*1000)]);
  for(const block of blocks)await c.query("UPDATE zee.chain_observations SET block_hash=$1,block_time=$2 WHERE network='base-sepolia' AND height=$3",[block.hash,block.time,block.height]);
 });
}
