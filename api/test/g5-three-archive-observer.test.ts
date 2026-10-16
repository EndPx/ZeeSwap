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
import type {WalletAdapter} from '../src/wallet-adapter.ts';
const sha=(v:Buffer)=>createHash('sha256').update(v).digest('hex'),sequences=[7,13,15],address='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',recipient='0x3333333333333333333333333333333333333333',hash='ab'.repeat(32);
async function fixture(){
 const isolated=await disposableSettlement({throughMigration:14}),pool=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,3),directory=await mkdtemp(join(tmpdir(),'g5-three-archive-')),keys=new PrivateData(randomBytes(32),randomBytes(32)),repo=new Repository(pool,keys);
 const cleanup=async()=>{await pool.end();await isolated.cleanup();await rm(directory,{recursive:true});};try{
  const state:G5State={version:1,runId:'1f34e059-4de1-49f6-bbaa-323008577994',binding:'synthetic',openingEventId:randomUUID(),batchSize:5,orders:[],archivedAttempts:[]},stateFile=join(directory,'state.json'),oldRows:any[]=[];
  await pool.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',2000,$1,2000,clock_timestamp(),clock_timestamp())",[hash]);await pool.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");await pool.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
  async function quote(sequence:number,owner:string){await pool.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');const forward=sequence%2===1,q=await repo.issueQuote({direction:forward?'ZCASH_TO_BASE':'BASE_TO_ZCASH',inputAmount:'100000',payoutFee:forward?'50000000000000':'10000',refundFee:forward?'10000':'50000000000000',recipient:forward?recipient:'synthetic:recipient',refundRecipient:'synthetic:refund',depositReceiver:'synthetic:'+randomUUID(),...(forward?{executionMode:'base-settlement-v1',baseContract:address}:{})},owner);await repo.accept(q.id,owner);return q;}
  // SETTLED predecessors here are structural scaffolding only. Current15's
  // source observe/confirm and the late-observer SQL transitions are real fixture calls.
  async function scaffold(id:string){await transaction(pool,async db=>{const reserves=(await db.query('SELECT * FROM zee.reservations WHERE order_id=$1',[id])).rows,event=randomUUID();for(const r of reserves){await db.query('UPDATE zee.inventory_accounts SET reserved=reserved-$1 WHERE asset=$2 AND purpose=$3',[r.amount,r.asset,r.purpose]);await db.query('INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES($1,$2,$3,$4,$5),($1,$2,$6,$7,$5)',[event,r.asset,r.purpose+':reserved','-'+r.amount,id,r.purpose+':available',r.amount]);}await db.query('UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1',[id]);await db.query("UPDATE zee.orders SET state='SETTLED' WHERE id=$1",[id]);});}
  let current:any,currentQ:any;
  for(let sequence=1;sequence<=15;sequence++){
   if(sequences.includes(sequence)){
    const owner='old-'+sequence,old=await quote(sequence,owner),privateQ=await repo.privateQuote(old.id,owner) as any,q=(await pool.query('SELECT * FROM zee.quotes WHERE id=$1',[old.id])).rows[0],order=(await pool.query('SELECT * FROM zee.orders WHERE id=$1',[old.id])).rows[0],funding={orderId:old.id,receiver:privateQ.depositReceiver,memo:old.memo,amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:String(order.funding_cutoff_height)},fb=Buffer.from(JSON.stringify(funding)),audit={version:1,status:'G5_SOURCE'+sequence+'_NO_EFFECT_EXPIRY_AUDIT',runId:state.runId,sequence,orderId:old.id,cutoffHeight:funding.cutoffHeight,fundingSha256:sha(fb),epoch:'9'},ab=Buffer.from(JSON.stringify(audit)),fundingFile=stateFile+'.funding-'+sequence+'.json',auditFile=stateFile+'.source'+sequence+'-expired-audit.private.json';
    await writeFile(fundingFile,fb);await writeFile(auditFile,ab);await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,finalized_height=$1::bigint-9,observed_at=clock_timestamp() WHERE network='zcash-testnet'",[Number(funding.cutoffHeight)+10]);await pool.query('SELECT zee.expire_unfunded($1)',[old.id]);
    state.archivedAttempts!.push({version:1,sequence,attempt:1,direction:'ZCASH_TO_BASE',orderId:old.id,owner,receiver:funding.receiver,fundingFile,fundingSha256:sha(fb),fundingBindingSha256:g5AttemptDigest(funding),quotePayloadSha256:sha(q.private_payload),cutoffHeight:funding.cutoffHeight,auditFile,auditSha256:sha(ab),archivedAt:new Date().toISOString(),epoch:'9'});oldRows.push({sequence,old,privateQ,funding});
   }
   const owner='current-'+sequence,q=await quote(sequence,owner),privateQ=await repo.privateQuote(q.id,owner) as any;state.orders.push({sequence,direction:sequence%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner,orderId:q.id,...(sequences.includes(sequence)?{attempt:2,receiver:privateQ.depositReceiver}:{})});
   if(sequence===15){current=q;currentQ=privateQ;}else await scaffold(q.id);
  }
  const currentHeight=Number((await pool.query("SELECT scanned_height::text n FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0].n),blockTime=new Date().toISOString(),currentOutput={txid:'cd'.repeat(32),index:0,pool:'ironwood' as const,amount:'100000',receiver:currentQ.depositReceiver,memo:current.memo,height:currentHeight,blockHash:hash,blockTime,shieldedSource:true};
  const deposit=await repo.observe({...currentOutput,reference:current.reference,network:'zcash-testnet',blockTime:new Date(blockTime),shielded:true});await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,finalized_height=$1::bigint-9,observed_at=clock_timestamp() WHERE network='zcash-testnet'",[currentHeight+9]);await pool.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',$1,$2,$3)",[currentHeight,hash,blockTime]);await repo.confirm(deposit);
  const operator=privateKeyToAccount(generatePrivateKey()),registry={chainId:84532,operator:operator.address,rpcUrl:'http://127.0.0.1:18799',contracts:{MockUSDC:{address:token},ZeeSwapSettlement:{address}}} as unknown as BaseRegistry;
  const base={registry,localTest:true,preflight:async()=>({}),receipt:async()=>null,assertSignature:async function(q:any,sig:Hex){return BaseContract.prototype.assertSignature.call(this as unknown as BaseContract,q,sig);},heads:async()=>({latest:{number:2000n,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))},finalized:{number:2000n,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))}}),client:{getBlock:async({blockNumber}:any)=>({number:blockNumber,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))})}} as unknown as BaseContract;
  const snapshot=(late:number[])=>({schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date().toISOString(),scannedHeight:currentHeight+18,tipHash:hash,blocks:[...new Set([...oldRows.map(r=>Number(r.funding.cutoffHeight)+1),currentHeight,currentHeight+9,currentHeight+18])].map(height=>({height,hash,time:blockTime})),outputs:[currentOutput,...oldRows.filter(r=>late.includes(r.sequence)).map(r=>({...currentOutput,txid:r.sequence.toString(16).padStart(2,'0').repeat(32),amount:'1',receiver:r.privateQ.depositReceiver,memo:r.old.memo,height:Number(r.funding.cutoffHeight)+1}))]});
  return {pool,keys,state,stateFile,current,oldRows,operator,registry,base,snapshot,cleanup};
 }catch(error){await cleanup();throw error;}
}

test('three archives: postprepare late15 is durably ingested before SQLstore/broadcast, preserving one original synthetic raw on replay',async()=>{
 const f=await fixture();try{
  let prepares=0,broadcasts=0;const journal=new Map<string,PreparedBaseTransaction>();
  Object.assign(f.base.client,{getTransaction:async()=>{const e=new Error('not found');e.name='TransactionNotFoundError';throw e;},getTransactionCount:async()=>15,sendRawTransaction:async()=>{broadcasts++;throw Error('MUST_NOT_BROADCAST');}});
  const signer:BaseSigner={authorize:q=>f.operator.signTypedData(payoutTypedData(f.registry,q)),async prepare(q,phase){const key=q.id+phase,prior=journal.get(key);if(prior)return prior;const signature=await this.authorize(q),raw=await f.operator.signTransaction({chainId:84532,type:'legacy',to:address,data:payoutCall(f.registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce:15,value:0n}),signed={raw,hash:keccak256(raw),nonce:15,maxCost:'10000000000000'};journal.set(key,signed);prepares++;return signed;}};
  const refresh=()=>refreshG5ArchivedSource(f.pool,f.keys,f.base,{snapshot:async()=>f.snapshot(journal.size?[15]:[])} as unknown as WalletAdapter,f.state,f.stateFile);
  await assert.rejects(dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id),/ARCHIVED_SOURCE7/);assert.equal(prepares,1);assert.equal(broadcasts,0);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.base_attempts')).rows[0].n,'0');const original=structuredClone([...journal.values()][0]);assert(original.raw);
  const late=f.oldRows.find(r=>r.sequence===15),liability=(await f.pool.query('SELECT d.classification,o.state FROM zee.deposits d JOIN zee.obligations o ON o.deposit_id=d.id WHERE d.order_id=$1',[late.old.id])).rows[0];assert.deepEqual(liability,{classification:'LATE',state:'REFUND_REQUIRED'});
  await assert.rejects(dispatchBaseOnce(f.pool,f.keys,f.base,signer,refresh,f.current.id),/ARCHIVED_SOURCE7/);assert.equal(prepares,1);assert.equal(broadcasts,0);assert.deepEqual([...journal.values()][0],original);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.obligations WHERE order_id=$1',[late.old.id])).rows[0].n,'1');
 }finally{await f.cleanup();}
});

test('three archives: reverse watcher ingests all old7/13/15 liabilities before refusing dependent continuation',async()=>{
 const f=await fixture();try{
  const wallet={snapshot:async()=>f.snapshot(sequences)} as unknown as WalletAdapter;
  await refreshG5ReverseArchiveAware(f.pool,f.keys,f.base,wallet,{...f.state,archivedAttempts:undefined},f.stateFile);assert.equal((await f.pool.query('SELECT count(*)::text n FROM zee.deposits WHERE order_id=ANY($1::uuid[])',[f.oldRows.map(r=>r.old.id)])).rows[0].n,'0');
  let downstream=0;await assert.rejects((async()=>{await refreshG5ReverseArchiveAware(f.pool,f.keys,f.base,wallet,f.state,f.stateFile);downstream++;})(),/ARCHIVED_SOURCE7/);assert.equal(downstream,0);
  for(const old of f.oldRows){const rows=(await f.pool.query('SELECT d.classification,o.state FROM zee.deposits d JOIN zee.obligations o ON o.deposit_id=d.id WHERE d.order_id=$1',[old.old.id])).rows;assert.deepEqual(rows,[{classification:'LATE',state:'REFUND_REQUIRED'}]);}
  await assert.rejects(g5RunDatabasePartition(f.pool,f.state,f.keys,f.stateFile),/ARCHIVED_SOURCE7/);
 }finally{await f.cleanup();}
});
