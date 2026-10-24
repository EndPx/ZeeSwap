import {appendChefAnchorHeaders} from './chef-live.ts';
import {digest,height,parseHeader,requireThat,validateRange,type ReplaceRange} from './types.ts';
import type {Snapshot} from '../../observer.ts';
import type {CanonicalReader} from './chef.ts';
import type {ChefRecoveryIdentity} from './chef-recovery.ts';
export type ChefLiveCursor={version:1;identityDigest:string;processedThrough:number;tipHash:string;snapshotDigest:string};
export function chefLiveFrom(cursor:ChefLiveCursor,identity:ChefRecoveryIdentity,checkpointHeight:number){
 requireThat(cursor.version===1&&cursor.identityDigest===digest(identity),'CHEF_LIVE_CURSOR_IDENTITY');
 height(cursor.processedThrough);height(checkpointHeight);
 requireThat(cursor.processedThrough<=checkpointHeight,'CHEF_LIVE_SOURCE_REGRESSION');
 const fromHeight=Math.max(identity.policy.birthday,cursor.processedThrough-9);
 requireThat(checkpointHeight-fromHeight+1<=1000,'CHEF_LIVE_REQUIRES_BOUNDED_RECOVERY');
 return fromHeight;
}
/** The processed cursor commits AFTER all output ingestion. SQL checkpoint
 * publication alone cannot advance it: a crash must requery the whole old gap. */
export async function commitChefLiveCycle(cursor:ChefLiveCursor,identity:ChefRecoveryIdentity,batch:ReplaceRange,full:Snapshot,
 checks:number[],canonical:CanonicalReader,ingest:(snapshot:Snapshot)=>Promise<unknown>,save:(cursor:ChefLiveCursor)=>Promise<void>,signal:AbortSignal){
 validateRange(batch,identity.policy,Date.now());
 requireThat(batch.coverage.generation===identity.generation,'CHEF_LIVE_GENERATION_CHANGED');
 requireThat(batch.coverage.fromHeight===chefLiveFrom(cursor,identity,batch.coverage.through.height),'CHEF_LIVE_CURSOR_RANGE');
 requireThat(batch.coverage.sourceHead.height-batch.coverage.through.height<=6,'CHEF_LIVE_SOURCE_LAG');
 requireThat(batch.coverage.through.height>=cursor.processedThrough,'CHEF_LIVE_SOURCE_REGRESSION');
 requireThat(full.scannedHeight===batch.coverage.through.height&&full.tipHash===batch.coverage.through.hash&&full.observedAt===batch.coverage.readCompletedAt,'CHEF_LIVE_SNAPSHOT_RANGE');
 const anchor=parseHeader(await canonical.header(cursor.processedThrough,signal),'zcash-testnet');requireThat(anchor.height===cursor.processedThrough&&anchor.hash===cursor.tipHash,'CHEF_LIVE_CURSOR_REORG');
 const snapshot=await appendChefAnchorHeaders(full,batch,checks,canonical,signal);
 const result=await ingest(snapshot);
 const next:ChefLiveCursor={version:1,identityDigest:cursor.identityDigest,processedThrough:snapshot.scannedHeight,tipHash:snapshot.tipHash,snapshotDigest:digest(snapshot)};
 await save(next);
 return {result,cursor:next,publishedHeaders:snapshot.blocks.length,verifiedRangeHeaders:batch.headers.length};
}
