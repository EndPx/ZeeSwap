import type pg from "pg";
import type { PrivateData } from "../../private-data.ts";
import { ingestSnapshot, observerCheckHeights,validateSnapshot,type Snapshot } from "../../observer.ts";
import { ChefAdapter, type ChefConfig } from "./chef.ts";
import { ChefWalletBridge } from "./chef-wallet-bridge.ts";
import { height, requireThat,parseHeader,stable,type ReplaceRange } from "./types.ts";

/** Retained financial anchors are canonical header checks, never a claim that
 * the new Chef account scanned notes before its explicit birthday. */
export async function appendChefAnchorHeaders(snapshot:Snapshot,batch:ReplaceRange,checks:number[],canonical:ChefConfig["canonical"],signal:AbortSignal):Promise<Snapshot> {
 requireThat(checks.length<=502,"RECONCILIATION_WINDOW_LIMIT");
 requireThat(checks.every(check=>check<=snapshot.scannedHeight),"CHEF_RANGE_BEHIND_PERSISTED_ANCHOR");
 // The bridge has already validated the entire coherent range and every native
 // output. Publish only required anchors: each SQL header is checked while the
 // shared runtime row is locked, so publishing heartbeat history stalls Base.
 validateSnapshot(snapshot);
 const verified=new Map(snapshot.blocks.map(block=>[block.height,block]));
 const required=new Set([snapshot.scannedHeight,Math.max(0,snapshot.scannedHeight-9),...checks,
  ...snapshot.outputs.map(output=>output.height),...batch.observations.map(observation=>observation.block.height)]);
 requireThat(required.size<=1000,"CHEF_ANCHOR_CAPACITY_REACHED");
 const blocks=new Map<number,Snapshot["blocks"][number]>();
 for(const check of [...required].sort((a,b)=>a-b)) {
  const existing=verified.get(check);
  if(existing){blocks.set(check,existing);continue;}
  const header=parseHeader(await canonical.header(check,signal),"zcash-testnet");
  requireThat(header.height===check,"CANONICAL_ANCHOR_HEIGHT_MISMATCH");
  blocks.set(check,{height:header.height,hash:header.hash,time:header.time});
 }
 requireThat(blocks.size<=1000,"CHEF_ANCHOR_CAPACITY_REACHED");
 requireThat(stable(await canonical.header(batch.coverage.sourceHead.height,signal))===stable(batch.coverage.sourceHead),"CANONICAL_HEAD_CHANGED");
 return validateSnapshot({...snapshot,blocks:[...blocks.values()].sort((a,b)=>a.height-b.height)});
}

/** Include receipts that no longer appear in the incoming-note range. No
 * lifecycle/state filter may discard an already persisted financial anchor. */
export async function chefFinancialCheckHeights(pool:pg.Pool):Promise<number[]> {
 const rows=(await pool.query(`SELECT anchor_height::text FROM (
  SELECT block_height AS anchor_height FROM zee.deposits WHERE network='zcash-testnet'
  UNION SELECT block_height FROM zee.reverse_payouts WHERE block_height IS NOT NULL
  UNION SELECT height FROM zee.source_refunds WHERE zcash_hash IS NOT NULL AND height IS NOT NULL
 ) anchors ORDER BY anchors.anchor_height LIMIT 501`)).rows;
 requireThat(rows.length<=500,"RECONCILIATION_WINDOW_LIMIT");
 const checks=await observerCheckHeights(pool,rows.map(row=>height(Number(row.anchor_height))));
 requireThat(checks.length<=502,"RECONCILIATION_WINDOW_LIMIT");
 return checks;
}

/** Explicit opt-in bridge for a fresh isolated testnet application. This has no
 * signer/dispatch imports; SQL still owns order matching, liability and finality. */
export async function observeChefOnce(pool: pg.Pool, keys: PrivateData, config: ChefConfig,
 bridge: ChefWalletBridge, fromHeight: number) {
 height(fromHeight);const started=Date.now();
 const checks=await chefFinancialCheckHeights(pool);
 const result = await new ChefAdapter({...config, classify: bridge.classify}).traverse(fromHeight);
 if (result.status !== "READY_SHADOW") return {status: result.status, retryAfterMs: result.retryAfterMs};
 const remaining=30_000-(Date.now()-started);requireThat(remaining>0,"READ_BUDGET");
 const snapshot = await appendChefAnchorHeaders(bridge.snapshot(result.batch, config.policy),result.batch,checks,config.canonical,AbortSignal.timeout(remaining));
 return {status: "CHEF_TESTNET_OBSERVED", ...await ingestSnapshot(pool, keys, snapshot),excludedOpeningCapital:bridge.excludedOpeningCapitalCount,
  verifiedRangeHeaders:result.batch.headers.length,publishedHeaders:snapshot.blocks.length};
}
