import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect} from '../src/db.ts';
import {publishObserverBatch,requireScannedReceipt,requireObserverEpoch,isObserverWait,type ObserverCheckpoint} from '../src/observer-frontiers.ts';
import {transaction} from '../src/db.ts';
import {refreshReverseObserversFromWallet} from '../src/reverse-observer-refresh.ts';
import type {BaseContract} from '../src/base-contract.ts';
import type {WalletAdapter} from '../src/wallet-adapter.ts';

// This suite creates its own empty UUID database. No retained fixture/evidence
// database is reset, and no signer, wallet or network transaction is invoked.
let isolated:Awaited<ReturnType<typeof disposableSettlement>>,pool:pg.Pool,worker:pg.Pool;
const hash='ab'.repeat(32),other='cd'.repeat(32);
const checkpoint=(network:ObserverCheckpoint['network'],height:number,finalizedHeight=height-9):ObserverCheckpoint=>
 ({network,height,hash,finalizedHeight,finalizedTime:new Date(Date.now()-20000),observedAt:new Date()});
before(async()=>{isolated=await disposableSettlement();const config=JSON.parse(await readFile(isolated.configPath,'utf8'));pool=connect(config.adminUrl,5);
 const runtime=JSON.parse(await readFile(isolated.runtimePath,'utf8'));worker=connect(runtime.workerUrl,3);});
after(async()=>{await worker?.end();await pool?.end();await isolated?.cleanup();});
async function reset(){
 await pool.query('DELETE FROM zee.chain_observations');await pool.query('DELETE FROM zee.scanner_checkpoints');
 await pool.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=false,dispatch_enabled=false');
}
async function row(network='zcash-testnet'){return (await pool.query('SELECT * FROM zee.scanner_checkpoints WHERE network=$1',[network])).rows[0];}
async function paused(){return (await pool.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required;}

test('receipt network tip cannot advance wallet scan; later lagging snapshot does not rewind it',async()=>{
 await reset();const initial=checkpoint('zcash-testnet',1000);await publishObserverBatch(pool,'synthetic-source',[initial]);
 await publishObserverBatch(pool,'synthetic-reverse-receipt',[],[{network:'zcash-testnet',height:995,hash,time:new Date()}]);
 assert.equal(Number((await row()).scanned_height),1000);
 await assert.rejects(()=>requireScannedReceipt(pool,'synthetic-reverse-receipt',995),isObserverWait);
 assert.equal(await paused(),false);
 await publishObserverBatch(pool,'synthetic-source',[checkpoint('zcash-testnet',1004)]);
 await requireScannedReceipt(pool,'synthetic-reverse-receipt',995);
 assert.equal(Number((await row()).scanned_height),1004);assert.equal(await paused(),false);
});

test('stale Base latest/finality and out-of-order observations WAIT without freshness changes',async()=>{
 await reset();await publishObserverBatch(pool,'synthetic-base',[checkpoint('base-sepolia',2000,1900)]);
 const original=await row('base-sepolia');
 for(const incoming of [checkpoint('base-sepolia',1999,1900),checkpoint('base-sepolia',2001,1899),{...checkpoint('base-sepolia',2000,1900),observedAt:new Date(original.observed_at.getTime()-1)}]){
  await assert.rejects(()=>publishObserverBatch(pool,'synthetic-lagged-base',[incoming]),isObserverWait);
  assert.deepEqual(await row('base-sepolia'),original);assert.equal(await paused(),false);
 }
});

test('duplicate and concurrent observer writers serialize; delayed writer waits without regressing accepted proof',async()=>{
 await reset();const p=checkpoint('zcash-testnet',3000);
 await Promise.all([publishObserverBatch(pool,'synthetic-source',[p]),publishObserverBatch(pool,'synthetic-refresh',[p])]);
 assert.equal(Number((await row()).scanned_height),3000);assert.equal(await paused(),false);
 const results=await Promise.allSettled([publishObserverBatch(pool,'synthetic-source',[checkpoint('zcash-testnet',3002)]),publishObserverBatch(pool,'synthetic-refresh',[checkpoint('zcash-testnet',3001)])]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length>=1,true);
 for(const r of results)if(r.status==='rejected')assert.equal(isObserverWait(r.reason),true);
 assert.equal(Number((await row()).scanned_height),3002);assert.equal(await paused(),false);
});

test('lagged incoming snapshot with changed canonical hash freezes before WAIT; rollback cannot erase pause',async()=>{
 await reset();await publishObserverBatch(pool,'synthetic-source',[checkpoint('zcash-testnet',4000)], [{network:'zcash-testnet',height:3990,hash,time:new Date()}]);
 const original=await row();
 await assert.rejects(()=>publishObserverBatch(pool,'synthetic-reorg',[checkpoint('zcash-testnet',3999)],[{network:'zcash-testnet',height:3990,hash:other,time:new Date()}]),/OBSERVER_CANONICAL_CONFLICT/);
 assert.equal(await paused(),true);assert.deepEqual(await row(),original);
 // Original canonical record remains available for operator investigation.
 assert.equal((await pool.query("SELECT block_hash FROM zee.chain_observations WHERE network='zcash-testnet' AND height=3990")).rows[0].block_hash,hash);
});

test('same-height tip conflict freezes and untouched SQL rewind trigger still freezes direct regression',async()=>{
 await reset();await publishObserverBatch(pool,'synthetic-base',[checkpoint('base-sepolia',5000)]);
 await assert.rejects(()=>publishObserverBatch(pool,'synthetic-base',[{...checkpoint('base-sepolia',5000),hash:other}]),/OBSERVER_CANONICAL_CONFLICT/);
 assert.equal(await paused(),true);
 await reset();await publishObserverBatch(pool,'synthetic-source',[checkpoint('zcash-testnet',5000)]);
 await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=4999 WHERE network='zcash-testnet'");
 assert.equal(await paused(),true);
});

test('stale scanner proof prevents receipt readiness even when receipt itself was freshly verified',async()=>{
 await reset();await publishObserverBatch(pool,'synthetic-source',[checkpoint('zcash-testnet',6000)]);
 await pool.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'");
 await assert.rejects(()=>requireScannedReceipt(pool,'synthetic-reverse-receipt',5990),isObserverWait);
 assert.equal(await paused(),false);
});

test('intervening canonical conflict fences an already accepted observation before any confirmation mutation',async()=>{
 await reset();const p=checkpoint('zcash-testnet',7000);
 const epoch=await publishObserverBatch(pool,'synthetic-source',[p]);
 await assert.rejects(()=>publishObserverBatch(pool,'synthetic-conflict',[{...p,hash:other}]),/OBSERVER_CANONICAL_CONFLICT/);
 let confirmations=0;
 await assert.rejects(()=>transaction(pool,async c=>{await requireObserverEpoch(c,epoch);confirmations++;}),/OBSERVER_EPOCH_CHANGED/);
 assert.equal(confirmations,0);assert.equal(await paused(),true);
});

test('actual worker role can fence its observation while runtime UPDATE remains forbidden, and conflict invalidates its epoch',async()=>{
 await reset();
 const privileges=(await worker.query("SELECT has_table_privilege(current_user,'zee.runtime_control','UPDATE') AS update_allowed")).rows[0];
 assert.equal(privileges.update_allowed,false);
 const p=checkpoint('zcash-testnet',8000);
 const epoch=await publishObserverBatch(worker,'synthetic-worker',[p]);
 await transaction(worker,async c=>{await requireObserverEpoch(c,epoch);});
 await assert.rejects(()=>publishObserverBatch(worker,'synthetic-worker-conflict',[{...p,hash:other}]),/OBSERVER_CANONICAL_CONFLICT/);
 let confirmations=0;
 await assert.rejects(()=>transaction(worker,async c=>{await requireObserverEpoch(c,epoch);confirmations++;}),/OBSERVER_EPOCH_CHANGED/);
 assert.equal(confirmations,0);assert.equal(await paused(),true);
});

test('reverse operator bridge publishes actual source SDK scan and waits behind an earlier network-only checkpoint',async()=>{
 await reset();
 const actualSnapshot=(height:number)=>({schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date().toISOString(),
  scannedHeight:height,tipHash:hash,blocks:[{height,hash,time:new Date().toISOString()},{height:height-9,hash,time:new Date().toISOString()}],outputs:[]});
 let requested:number[]=[];
 let scanned=9000;
 const wallet={snapshot:async(heights:number[])=>{requested=heights;return actualSnapshot(scanned);}} as unknown as WalletAdapter;
 const heads={latest:{number:100n,hash:'0x'+hash},finalized:{number:90n,hash:'0x'+hash,timestamp:1n}};
 const base={heads:async()=>heads,client:{getBlock:async()=>({hash:'0x'+hash,timestamp:1n})}} as unknown as BaseContract;
 // The bridge receives the wallet capability, not the old capital-header file.
 await refreshReverseObserversFromWallet(worker,base,wallet);
 assert.equal(Number((await row()).scanned_height),9000);
 assert.equal(Number((await row()).finalized_height),8991);
 // Model an old writer's network-tip checkpoint, six blocks ahead of the SDK.
 await publishObserverBatch(worker,'synthetic-legacy-header',[checkpoint('zcash-testnet',9006)]);
 const prior=await row();scanned=9002;
 await assert.rejects(()=>refreshReverseObserversFromWallet(worker,base,wallet),isObserverWait);
 assert.equal(requested.includes(9006),true);assert.equal(requested.includes(8997),true);
 assert.deepEqual(await row(),prior);assert.equal(await paused(),false);
 scanned=9006;await refreshReverseObserversFromWallet(worker,base,wallet);
 assert.equal(Number((await row()).scanned_height),9006);assert.equal(await paused(),false);
});
