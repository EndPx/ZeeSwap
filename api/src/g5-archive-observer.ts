import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import type {BaseContract} from './base-contract.ts';
import type {WalletAdapter} from './wallet-adapter.ts';
import type {G5State} from './g5-run.ts';
import {observerCheckHeights,validateSnapshot,ingestSnapshot} from './observer.ts';
import {refreshReverseObservers,refreshReverseObserversFromWallet} from './reverse-observer-refresh.ts';
import {g5RunDatabasePartition} from './g5-quote-attempts.ts';

/** With an archived receiver, every actual source output must be ingested
 * before classifying the archive. The late liability commits before refusal;
 * a post-signing caller retains its original raw and never reaches SQL store
 * or broadcast. No filtering of the archived receiver/reference is allowed. */
export async function refreshG5ArchivedSource(pool:pg.Pool,keys:PrivateData,base:BaseContract,wallet:WalletAdapter,state:G5State,stateFile:string){
 if(!state.archivedAttempts)throw Error('G5_ARCHIVED_SOURCE_REFRESH_REQUIRES_ARCHIVE');
 const anchors=(await pool.query(`SELECT block_height AS height FROM zee.deposits WHERE network='zcash-testnet'
  UNION SELECT block_height AS height FROM zee.reverse_payouts WHERE block_height IS NOT NULL
  UNION SELECT height FROM zee.source_refunds WHERE confirmed AND height IS NOT NULL ORDER BY height LIMIT 501`)).rows;
 if(anchors.length>500)throw Error('RECONCILIATION_WINDOW_LIMIT');
 const snapshot=validateSnapshot(await wallet.snapshot(await observerCheckHeights(pool,anchors.map(a=>Number(a.height)))));
 await refreshReverseObservers(pool,base,snapshot);
 const result=await ingestSnapshot(pool,keys,snapshot);
 await g5RunDatabasePartition(pool,state,keys,stateFile);
 return result;
}
/** Preserve the existing publication-only reverse path when no archive exists. */
export function refreshG5ReverseArchiveAware(pool:pg.Pool,keys:PrivateData,base:BaseContract,wallet:WalletAdapter,state:G5State,stateFile:string){
 return state.archivedAttempts?refreshG5ArchivedSource(pool,keys,base,wallet,state,stateFile):refreshReverseObserversFromWallet(pool,base,wallet);
}
