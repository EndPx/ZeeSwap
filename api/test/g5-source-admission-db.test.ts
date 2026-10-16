import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {g5Binding,G5_RETRY_TARGET,type G5Order,type G5State} from '../src/g5-run.ts';
import {prepareSourceAdmission,admitPreparedSource,requireSourceFundingAuthority} from '../src/g5-source-admission.ts';
// Injected scanner/sync captures and exact schema14 SQL. No SDK, network or
// financial broadcast. This suite owns and cleans one disposable UUID DB.
let isolated:Awaited<ReturnType<typeof disposableSettlement>>,db:pg.Pool;const keys=new PrivateData(randomBytes(32),randomBytes(32)),hash='ab'.repeat(32),contract='0x2222222222222222222222222222222222222222';
before(async()=>{isolated=await disposableSettlement({throughMigration:14});db=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,2);
 await db.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',2000,$1,1900,clock_timestamp(),clock_timestamp())",[hash]);
 await db.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',1000,$1,clock_timestamp())",[hash]);
 await db.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");
 await db.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false,reconciliation_required=false');
});
after(async()=>{await db?.end();await isolated?.cleanup();});
async function fixture(tip=1002){
 const config={version:1,runId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',branchId:G5_RETRY_TARGET.branchId,batchSize:5,extraFeeWalletConfig:'/synthetic/fee.json',baseFeeBudget:'50000000000000',forward:{recipient:'0x1111111111111111111111111111111111111111'},forwardOrders:Array.from({length:10},(_,i)=>({sequence:i*2+1,refundRecipient:'utest1source'+(i*2+1)})),reverseOrders:Array.from({length:10},(_,i)=>({sequence:(i+1)*2,configFile:'/synthetic/reverse-'+i+'.json'}))};
 const slot:G5Order={sequence:13,direction:'ZCASH_TO_BASE',owner:randomBytes(32).toString('base64url'),receiver:'fixture:receiver:'+randomUUID()},state:G5State={version:1,runId:config.runId,binding:g5Binding(config),openingEventId:'synthetic',orders:[slot],batchSize:5};
 const actor={sequence:13,branchId:config.branchId,runId:config.runId,runConfig:'/synthetic/run.json',walletPath:'/home/albary/zeeswap-g5-retry/source-13/user-wallet',preQuoteSyncFile:'/home/albary/zeeswap-g5-retry/source-13/source-prequote-sync.private.json',refundRecipient:'utest1source13',ufvkSha256:'a'.repeat(64),approvedNote:{pool:'ironwood',txid:'b'.repeat(64),index:0,value:'110000'}};
 await db.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');const epoch=(await db.query('SELECT epoch::text FROM zee.runtime_control')).rows[0].epoch;
 const prepared=prepareSourceAdmission(config,state,slot,actor,'/synthetic/run.json',contract,epoch,new Date().toISOString()),sync={state:'SYNCED',binding:actor,tip,scannedHeight:tip,observedAt:new Date().toISOString()};
 return {config,slot,state,actor,epoch,prepared,sync,admit:()=>admitPreparedSource(db,keys,config,state,slot,actor,'/synthetic/run.json',contract,prepared,sync)};
}
async function rows(){return (await db.query(`SELECT (SELECT count(*)::text FROM zee.quotes) AS quotes,(SELECT count(*)::text FROM zee.orders) AS orders,(SELECT count(*)::text FROM zee.reservations) AS reservations,(SELECT count(*)::text FROM zee.ledger_entries) AS ledger`)).rows[0];}
test('nine-block pre-admission refusal creates zero quote order reservation or ledger rows',async()=>{
 const f=await fixture(1003),before=await rows(),r=await f.admit();assert.equal(r.status,'SOURCE_ADMISSION_WAIT');assert.deepEqual(await rows(),before);assert.deepEqual(before,{quotes:'0',orders:'0',reservations:'0',ledger:'0'});
});
test('failed SQL acceptance rolls quote issuance and all reservation changes back atomically',async()=>{
 const f=await fixture(),before=await rows();await db.query("UPDATE zee.inventory_accounts SET balance=0 WHERE asset='baseETH' AND purpose='fee'");
 try{await assert.rejects(()=>f.admit());assert.deepEqual(await rows(),before);assert.equal((await db.query('SELECT accepting_orders FROM zee.runtime_control')).rows[0].accepting_orders,false);}
 finally{await db.query("UPDATE zee.inventory_accounts SET balance=1000000000000000 WHERE asset='baseETH' AND purpose='fee'");}
});
test('actual source-wallet lag2 refuses before quote despite valid ten-block deposit window; missing or negative scan proof stays hard',async()=>{
 const f=await fixture(),before=await rows();f.sync.scannedHeight=1000;
 const r=await f.admit();assert.equal(r.status,'SOURCE_ADMISSION_WAIT');assert.equal('reason' in r?r.reason:undefined,'SOURCE_WALLET_SCAN_BEHIND');assert.deepEqual(await rows(),before);
 (f.sync as any).scannedHeight=undefined;await assert.rejects(()=>f.admit(),/SYNC_SCAN_REQUIRED/);assert.deepEqual(await rows(),before);
 f.sync.scannedHeight=1003;await assert.rejects(()=>f.admit(),/SYNC_SCAN_REQUIRED/);assert.deepEqual(await rows(),before);
});

test('ten-block admission retains cutoff scan+12; replay exports the identical original and never issues another quote',async()=>{
 const f=await fixture(),first=await f.admit();assert.equal(first.status,'SOURCE_ADMITTED');if(!('funding' in first))throw Error('test funding missing');
 assert.equal(first.funding.cutoffHeight,'1012');f.slot.orderId=first.funding.orderId;const before=await rows();assert.equal(before.quotes,'1');assert.equal(before.orders,'1');assert.equal(before.reservations,'3');
 assert.deepEqual(await requireSourceFundingAuthority(db,keys,f.slot,f.epoch,first.funding),{status:'SOURCE_FUNDING_AUTHORIZED',sequence:13,epoch:f.epoch});
 await db.query("UPDATE zee.scanner_checkpoints SET scanned_height=1005,observed_at=clock_timestamp() WHERE network='zcash-testnet'");
 const replay=await f.admit();assert.equal(replay.status,'SOURCE_ORIGINAL_ADMISSION_REEXPORTED');if(!('funding' in replay))throw Error('test funding missing');assert.deepEqual(replay.funding,first.funding);assert.deepEqual(await rows(),before);
 await db.query('SELECT zee.enter_reconciliation()');await assert.rejects(()=>requireSourceFundingAuthority(db,keys,f.slot,f.epoch,first.funding),/AUTHORITY_CHANGED/);
});
