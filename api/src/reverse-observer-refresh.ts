import type pg from 'pg';
import { BaseContract } from './base-contract.ts';
import { validateSnapshot,observerCheckHeights } from './observer.ts';
import { publishObserverBatch } from './observer-frontiers.ts';
import type {WalletAdapter} from './wallet-adapter.ts';

/** This bridge takes a source viewing-wallet capability, never a capital
 * header-capture file: network tip observations cannot advertise SDK scanning.
 * Include reverse payout anchors as well as source deposits so both directions
 * retain canonical-conflict detection through the actual source scan frontier.
 */
export async function refreshReverseObserversFromWallet(pool:pg.Pool,base:BaseContract,wallet:WalletAdapter){
 const anchors=(await pool.query(`SELECT block_height AS height FROM zee.deposits WHERE network='zcash-testnet'
  UNION SELECT block_height AS height FROM zee.reverse_payouts WHERE block_height IS NOT NULL
  UNION SELECT height FROM zee.source_refunds WHERE confirmed AND height IS NOT NULL
  ORDER BY height LIMIT 501`)).rows;
 if(anchors.length>500)throw Error('RECONCILIATION_WINDOW_LIMIT');
 const heights=await observerCheckHeights(pool,anchors.map(a=>Number(a.height)));
 const snapshot=await wallet.snapshot(heights);
 return refreshReverseObservers(pool,base,snapshot);
}

/** Only canonical checkpoints/blocks. No inventory, deposits or runtime policy
 * changes; existing reorg triggers may pause on a genuine contradictory view.
 */
export async function refreshReverseObservers(pool:pg.Pool,base:BaseContract,value:unknown){
 const snapshot=validateSnapshot(value),heads=await base.heads();
 const references=(await pool.query("SELECT height::text FROM zee.chain_observations WHERE network='base-sepolia' ORDER BY height LIMIT 501")).rows;
 if(references.length>500)throw Error('REVERSE_RECONCILIATION_WINDOW_LIMIT');
 const blocks:{height:string;hash:string;time:Date}[]=[];
 for(const {height} of references){
  // A lagging provider cannot serve an anchor above its own latest head.
  // The locked publisher will return WAIT without refreshing either frontier.
  if(BigInt(height)>heads.latest.number)continue;
  const block=await base.client.getBlock({blockNumber:BigInt(height)});blocks.push({height,hash:block.hash!.slice(2),time:new Date(Number(block.timestamp)*1000)});
 }
 if((await base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('BASE_REORG');
 const finalized=snapshot.blocks.find(b=>b.height===Math.max(0,snapshot.scannedHeight-9))!;
 await publishObserverBatch(pool,'reverse-observer-refresh',[
  {network:'zcash-testnet',height:snapshot.scannedHeight,hash:snapshot.tipHash,finalizedHeight:finalized.height,finalizedTime:new Date(finalized.time),observedAt:new Date(snapshot.observedAt)},
  {network:'base-sepolia',height:Number(heads.latest.number),hash:heads.latest.hash!.slice(2),finalizedHeight:Number(heads.finalized.number),finalizedTime:new Date(Number(heads.finalized.timestamp)*1000),observedAt:new Date()}
 ],[
  ...snapshot.blocks.map(b=>({network:'zcash-testnet' as const,height:b.height,hash:b.hash,time:new Date(b.time)})),
  ...blocks.map(b=>({network:'base-sepolia' as const,height:Number(b.height),hash:b.hash,time:b.time})),
  {network:'base-sepolia',height:Number(heads.finalized.number),hash:heads.finalized.hash!.slice(2),time:new Date(Number(heads.finalized.timestamp)*1000)}
 ]);
}
