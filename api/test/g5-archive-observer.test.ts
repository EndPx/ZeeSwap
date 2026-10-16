import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,type Hex} from 'viem';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect,transaction} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {Repository} from '../src/repository.ts';
import {g5AttemptDigest,g5RunDatabasePartition} from '../src/g5-quote-attempts.ts';
import {refreshG5ArchivedSource,refreshG5ReverseArchiveAware} from '../src/g5-archive-observer.ts';
import {dispatchBaseOnce} from '../src/base-settlement.ts';
import {BaseContract,payoutCall,payoutTypedData,type BaseRegistry} from '../src/base-contract.ts';
import type {BaseSigner,PreparedBaseTransaction} from '../src/base-signer.ts';
import type {G5State} from '../src/g5-run.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import type {WalletAdapter} from '../src/wallet-adapter.ts';
const sha=(v:Buffer)=>createHash('sha256').update(v).digest('hex'),address='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',recipient='0x3333333333333333333333333333333333333333',hash='ab'.repeat(32);
async function fixture(){
 const isolated=await disposableSettlement({throughMigration:14}),pool=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,3),directory=await mkdtemp(join(tmpdir(),'g5-archive-observer-')),keys=new PrivateData(randomBytes(32),randomBytes(32)),repo=new Repository(pool,keys);
 const cleanup=async()=>{await pool.end();await isolated.cleanup();await rm(directory,{recursive:true});};
 try{
 await pool.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',2000,$1,2000,clock_timestamp(),clock_timestamp())",[hash]);await pool.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");await pool.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
 const state:G5State={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',binding:'fixture',openingEventId:randomUUID(),batchSize:5,orders:[]};
 async function quote(owner:string){const q=await repo.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',payoutFee:'50000000000000',refundFee:'10000',recipient,refundRecipient:'fixture:refund',depositReceiver:'fixture:'+randomUUID(),executionMode:'base-settlement-v1',baseContract:address},owner);await repo.accept(q.id,owner);return q;}
 // Current predecessors are structural fixtures, not paid-settlement evidence.
 for(let n=1;n<=6;n++){const owner='owner'+n,q=await quote(owner);state.orders.push({sequence:n,direction:n%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner,orderId:q.id});await transaction(pool,async db=>{const reserves=(await db.query('SELECT * FROM zee.reservations WHERE order_id=$1',[q.id])).rows,event=randomUUID();for(const r of reserves){await db.query('UPDATE zee.inventory_accounts SET reserved=reserved-$1 WHERE asset=$2 AND purpose=$3',[r.amount,r.asset,r.purpose]);await db.query('INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES($1,$2,$3,$4,$5),($1,$2,$6,$7,$5)',[event,r.asset,r.purpose+':reserved','-'+r.amount,q.id,r.purpose+':available',r.amount]);}await db.query('UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1',[q.id]);await db.query("UPDATE zee.orders SET state='SETTLED' WHERE id=$1",[q.id]);});}
 const oldOwner='old-owner',old=await quote(oldOwner),oldQuote=await repo.privateQuote(old.id,oldOwner) as any,oldRow=(await pool.query('SELECT * FROM zee.orders WHERE id=$1',[old.id])).rows[0],oldQ=(await pool.query('SELECT * FROM zee.quotes WHERE id=$1',[old.id])).rows[0],stateFile=join(directory,'state.json'),funding={orderId:old.id,receiver:oldQuote.depositReceiver,memo:old.memo,amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:String(oldRow.funding_cutoff_height)},fundingBytes=Buffer.from(JSON.stringify(funding)),audit={version:1,status:'G5_SOURCE7_NO_EFFECT_EXPIRY_AUDIT',runId:state.runId,sequence:7,orderId:old.id,cutoffHeight:funding.cutoffHeight,fundingSha256:sha(fundingBytes),epoch:'8'},auditBytes=Buffer.from(JSON.stringify(audit));await writeFile(stateFile+'.funding-7.json',fundingBytes);await writeFile(stateFile+'.source7-expired-audit.private.json',auditBytes);
 await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=1022,finalized_height=1013,observed_at=clock_timestamp() WHERE network='zcash-testnet'");await pool.query('SELECT zee.expire_unfunded($1)',[old.id]);
 const owner='N'.repeat(43),current=await quote(owner),currentQuote=await repo.privateQuote(current.id,owner) as any;state.orders.push({sequence:7,direction:'ZCASH_TO_BASE',owner,orderId:current.id,receiver:currentQuote.depositReceiver,attempt:2});state.archivedAttempts=[{version:1,sequence:7,attempt:1,direction:'ZCASH_TO_BASE',orderId:old.id,owner:oldOwner,receiver:oldQuote.depositReceiver,fundingFile:stateFile+'.funding-7.json',fundingSha256:sha(fundingBytes),fundingBindingSha256:g5AttemptDigest(funding),quotePayloadSha256:sha(oldQ.private_payload),cutoffHeight:funding.cutoffHeight,auditFile:stateFile+'.source7-expired-audit.private.json',auditSha256:sha(auditBytes),archivedAt:new Date().toISOString(),epoch:'8'}];
 const blockTime=new Date().toISOString(),currentOutput={txid:'cd'.repeat(32),index:0,pool:'ironwood' as const,amount:'100000',receiver:currentQuote.depositReceiver,memo:current.memo,height:1022,blockHash:hash,blockTime,shieldedSource:true},lateOutput={...currentOutput,txid:'ef'.repeat(32),amount:'1',receiver:oldQuote.depositReceiver,memo:old.memo,height:1023};
 const deposit=await repo.observe({...currentOutput,reference:current.reference,network:'zcash-testnet',blockTime:new Date(blockTime),shielded:true});await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=1031,finalized_height=1022 WHERE network='zcash-testnet'");await pool.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',1022,$1,clock_timestamp())",[hash]);await repo.confirm(deposit);
 const operator=privateKeyToAccount(generatePrivateKey()),registry={chainId:84532,operator:operator.address,rpcUrl:'http://127.0.0.1:18799',contracts:{MockUSDC:{address:token},ZeeSwapSettlement:{address}}} as unknown as BaseRegistry;
 const base={registry,localTest:true,preflight:async()=>({}),receipt:async()=>null,assertSignature:async function(q:any,sig:Hex){return BaseContract.prototype.assertSignature.call(this as unknown as BaseContract,q,sig);},heads:async()=>({latest:{number:2000n,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))},finalized:{number:2000n,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))}}),client:{getBlock:async({blockNumber}:any)=>({number:blockNumber,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))})}} as unknown as BaseContract;
 const snapshot=(late:boolean)=>({schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date().toISOString(),scannedHeight:1040,tipHash:hash,blocks:[1022,1023,1031,1040].map(height=>({height,hash,time:blockTime})),outputs:late?[currentOutput,lateOutput]:[currentOutput]});
 return {pool,keys,state,stateFile,current,old,operator,registry,base,snapshot,cleanup};
 }catch(error){await cleanup();throw error;}
}
test('actual post-prepare source ingestion preserves late liability and original raw before refusing SQL store/broadcast and any replay',async()=>{
 const f=await fixture();try{
 let prepares=0,broadcasts=0;const journal=new Map<string,PreparedBaseTransaction>();
 Object.assign(f.base.client,{getTransaction:async()=>{const e=new Error('not found');e.name='TransactionNotFoundError';throw e;},getTransactionCount:async()=>15,sendRawTransaction:async()=>{broadcasts++;throw Error('MUST_NOT_BROADCAST');}});
 const signer:BaseSigner={authorize:q=>f.operator.signTypedData(payoutTypedData(f.registry,q)),async prepare(q,phase){const key=q.id+phase,prior=journal.get(key);if(prior)return prior;const sig=await this.authorize(q),raw=await f.operator.signTransaction({chainId:84532,type:'legacy',to:address,data:payoutCall(f.registry,q,sig,phase),gas:450000n,gasPrice:1000000n,nonce:15,value:0n}),signed={raw,hash:keccak256(raw),nonce:15,maxCost:'10000000000000'};journal.set(key,signed);prepares++;return signed;}};
 const refresh=()=>refreshG5ArchivedSource(f.pool,f.keys,f.base,{snapshot:async()=>f.snapshot(journal.size>0)} as unknown as WalletAdapter,f.state,f.stateFile);
 await assert.rejects(dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id),/ARCHIVED_SOURCE7/);assert.equal(prepares,1);assert.equal(broadcasts,0);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.base_attempts')).rows[0].n,'0');const original=[...journal.values()][0];assert(original.raw);
 const liability=(await f.pool.query('SELECT d.classification,o.state FROM zee.deposits d JOIN zee.obligations o ON o.deposit_id=d.id WHERE d.order_id=$1',[f.old.id])).rows[0];assert.equal(liability.classification,'LATE');assert.equal(liability.state,'REFUND_REQUIRED');
 await assert.rejects(dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id),/ARCHIVED_SOURCE7/);assert.equal(prepares,1);assert.equal(broadcasts,0);assert.equal([...journal.values()][0].raw,original.raw);
 }finally{await f.cleanup();}
});
test('actual reverse archive refresh ingests full source before refusal while the unchanged no-archive path only publishes headers',async()=>{
 const f=await fixture();try{
 const wallet={snapshot:async()=>f.snapshot(true)} as unknown as WalletAdapter,normal={...f.state,archivedAttempts:undefined};await refreshG5ReverseArchiveAware(f.pool,f.keys,f.base,wallet,normal,f.stateFile);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.deposits WHERE order_id=$1',[f.old.id])).rows[0].n,'0');
 let downstreamWrites=0;await assert.rejects((async()=>{await refreshG5ReverseArchiveAware(f.pool,f.keys,f.base,wallet,f.state,f.stateFile);downstreamWrites++;})(),/ARCHIVED_SOURCE7/);assert.equal(downstreamWrites,0);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.obligations WHERE order_id=$1',[f.old.id])).rows[0].n,'1');await assert.rejects(g5RunDatabasePartition(f.pool,f.state,f.keys,f.stateFile),/ARCHIVED_SOURCE7/);
 }finally{await f.cleanup();}
});

test('actual schema14 post-PAY-prepare source expiry WAIT preserves original journal; fresh retry ingests then stores and broadcasts identical raw once',async()=>{
 const f=await fixture(),realNow=Date.now;try{
  const journal=new Map<string,PreparedBaseTransaction>();let prepares=0,broadcasts=0,expire=false,latestKnown:Hex|undefined,expiredCheckpoint:any;
  const signer:BaseSigner={authorize:q=>f.operator.signTypedData(payoutTypedData(f.registry,q)),async prepare(q,phase){const key=q.id+phase,prior=journal.get(key);if(prior)return prior;
   const sig=await this.authorize(q),nonce=phase==='RESERVE'?15:16,raw=await f.operator.signTransaction({chainId:84532,type:'legacy',to:address,data:payoutCall(f.registry,q,sig,phase),gas:450000n,gasPrice:1000000n,nonce,value:0n}),signed={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};journal.set(key,signed);prepares++;return signed;}};
  const regularHeads=f.base.heads.bind(f.base);
  Object.assign(f.base,{state:async()=>1,heads:async()=>{
   const heads=await regularHeads();if(expire&&[...journal.keys()].some(k=>k.endsWith('PAY'))){expiredCheckpoint=(await f.pool.query("SELECT * FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];Date.now=()=>realNow()+61001;}
   return heads;
  },receipt:async(hash:Hex,phase:string,q:any)=>phase==='RESERVE'?{hash,phase,id:q.id,recipient:q.recipient,amount:q.amount,blockNumber:1990,blockHash:'0x'+hashValue(),fee:'500'}:null});
  function hashValue(){return 'ab'.repeat(32);}
  Object.assign(f.base.client,{getTransaction:async({hash}:any)=>{if(hash===latestKnown)return {hash};const e=new Error('not found');e.name='TransactionNotFoundError';throw e;},getTransactionCount:async()=>16,sendRawTransaction:async({serializedTransaction}:any)=>{broadcasts++;latestKnown=keccak256(serializedTransaction);return latestKnown;}});
  let refreshes=0;const refresh=async()=>{refreshes++;return refreshG5ArchivedSource(f.pool,f.keys,f.base,{snapshot:async()=>f.snapshot(false)} as unknown as WalletAdapter,f.state,f.stateFile);};
  assert.equal((await dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id)).status,'RESERVATION_FINALIZED');assert.equal(prepares,1);assert.equal(broadcasts,0);
  // Only this disposable fixture retires its prior RESERVE lease so PAY is actually claimed.
  await f.pool.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");
  const ledgerBefore=(await f.pool.query('SELECT * FROM zee.ledger_entries ORDER BY id')).rows;
  expire=true;await assert.rejects(dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id),e=>isObserverWait(e)&&e.diagnostic.reason==='SOURCE_CAPTURE_EXPIRED');
  Date.now=realNow;expire=false;assert.equal(prepares,2);assert.equal(broadcasts,0);const original=[...journal.entries()].find(([key])=>key.endsWith('PAY'))![1];assert(original.raw);
  assert.equal((await f.pool.query("SELECT count(*)::text n FROM zee.base_attempts WHERE phase='PAY'")).rows[0].n,'0');assert.deepEqual((await f.pool.query('SELECT * FROM zee.ledger_entries ORDER BY id')).rows,ledgerBefore);
  assert.deepEqual((await f.pool.query("SELECT * FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0],expiredCheckpoint);
  await f.pool.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");
  const refreshBefore=refreshes;assert.equal((await dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id)).status,'AWAITING_BASE_FINALITY');assert(refreshes>refreshBefore);assert.equal(prepares,2);assert.equal(broadcasts,1);
  const rows=(await f.pool.query("SELECT * FROM zee.base_attempts WHERE order_id=$1 AND phase='PAY'",[f.current.id])).rows;assert.equal(rows.length,1);assert.deepEqual(f.keys.open(rows[0].signed_payload,`base-signed:${f.current.id}:PAY:v1`),original);
  await f.pool.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");assert.equal((await dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id)).status,'AWAITING_BASE_FINALITY');assert.equal(prepares,2);assert.equal(broadcasts,1);assert.equal((await f.pool.query("SELECT count(*)::text n FROM zee.base_attempts WHERE order_id=$1 AND phase='PAY'",[f.current.id])).rows[0].n,'1');
 }finally{Date.now=realNow;await f.cleanup();}
});
