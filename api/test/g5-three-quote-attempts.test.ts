import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrivateData,accessHash} from '../src/private-data.ts';
import type {G5State} from '../src/g5-run.ts';
import {g5AttemptDigest,g5FundingArtifact,requireG5ArchivedAttempts,validateG5ArchivedAttemptBooks,requireG5ArchivedAttemptArtifacts,g5RunDatabasePartition} from '../src/g5-quote-attempts.ts';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect,transaction} from '../src/db.ts';
import {Repository} from '../src/repository.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),sequences=[7,13,15],runId='1f34e059-4de1-49f6-bbaa-323008577994';
function fixture(){
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),stateFile='/synthetic/run-state.json',files=new Map<string,Buffer>();
 const state:G5State={version:1,runId,binding:'synthetic',openingEventId:randomUUID(),batchSize:5,orders:Array.from({length:15},(_,i)=>({sequence:i+1,direction:i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE',owner:'current-'+i,orderId:randomUUID(),...(sequences.includes(i+1)?{attempt:2,receiver:'current-receiver-'+i}:{})})),archivedAttempts:[]};
 const books:any={};for(const key of ['quotes','orders','reservations','ledger','events','deposits','obligations','operations','jobs','forwards','commits','settles','shielded','refunds','bindings','escrowBindings'])books[key]=[];
 for(const sequence of sequences){
  const old=randomUUID(),reference=randomUUID(),owner='old-owner-'+sequence,receiver='old-receiver-'+sequence,cutoffHeight=String(1000+sequence),funding={orderId:old,receiver,memo:JSON.stringify({v:1,ref:reference}),amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight},fb=Buffer.from(JSON.stringify(funding));
  const quote={id:old,direction:'ZCASH_TO_BASE',input_amount:'100000',output_amount:'100000',payout_fee:'50000000000000',refund_fee:'10000',access_hash:accessHash(owner),private_payload:keys.seal({reference,depositReceiver:receiver},`quote:${old}:v1`),deposit_reference_hash:keys.lookup('reference',reference),receiver_hash:keys.lookup('receiver',receiver)};
  const audit={version:1,status:'G5_SOURCE'+sequence+'_NO_EFFECT_EXPIRY_AUDIT',runId,sequence,orderId:old,cutoffHeight,fundingSha256:sha(fb),epoch:'9'},ab=Buffer.from(JSON.stringify(audit));
  const archive={version:1,sequence,attempt:1,direction:'ZCASH_TO_BASE',orderId:old,owner,receiver,fundingFile:stateFile+'.funding-'+sequence+'.json',fundingSha256:sha(fb),fundingBindingSha256:g5AttemptDigest(funding),quotePayloadSha256:sha(quote.private_payload),cutoffHeight,auditFile:stateFile+'.source'+sequence+'-expired-audit.private.json',auditSha256:sha(ab),archivedAt:new Date().toISOString(),epoch:'9'};
  state.archivedAttempts!.push(archive);files.set(archive.fundingFile,fb);files.set(archive.auditFile,ab);books.quotes.push(quote);books.orders.push({id:old,state:'EXPIRED_UNFUNDED',primary_deposit:null,funding_cutoff_height:cutoffHeight});
  const expiry=randomUUID();for(const [asset,purpose,amount] of [['mockUSDC','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']]){
   books.reservations.push({order_id:old,asset,purpose,amount,released_at:'synthetic'});
   for(const [event_id,bucket,value] of [[old,purpose+':available','-'+amount],[old,purpose+':reserved',amount],[expiry,purpose+':reserved','-'+amount],[expiry,purpose+':available',amount]])books.ledger.push({order_id:old,event_id,asset,bucket,amount:value});
  }
  for(const event_type of ['ACCEPTED','EXPIRED_UNFUNDED'])books.events.push({order_id:old,event_type});
 }
 const read=async(path:string)=>{const bytes=files.get(path);if(!bytes)throw Error('ENOENT');return bytes;};return {keys,state,stateFile,books,files,read};
}

test('exact ordered three archives independently bind original artifacts and distinct attempt-two funding paths',async()=>{
 const f=fixture();validateG5ArchivedAttemptBooks(f.state,f.books,f.keys);await requireG5ArchivedAttemptArtifacts(f.state,f.stateFile,f.read);assert.deepEqual(requireG5ArchivedAttempts(f.state).map(a=>a.sequence),sequences);
 for(const sequence of sequences)assert.equal(g5FundingArtifact(f.stateFile,f.state,sequence),f.stateFile+'.funding-'+sequence+'-attempt-2.json');assert.equal(g5FundingArtifact(f.stateFile,f.state,17),f.stateFile+'.funding-17.json');
 const [a,b,c]=f.state.archivedAttempts!;
 for(const archives of [[b,a,c],[a,c,b],[a,c],[a,b,c,c]])assert.throws(()=>requireG5ArchivedAttempts({...f.state,archivedAttempts:archives}));
 for(const entry of f.state.archivedAttempts!)for(const path of [entry.fundingFile,entry.auditFile]){const original=f.files.get(path)!;f.files.set(path,Buffer.from('{}'));await assert.rejects(requireG5ArchivedAttemptArtifacts(f.state,f.stateFile,f.read));f.files.delete(path);await assert.rejects(requireG5ArchivedAttemptArtifacts(f.state,f.stateFile,f.read));f.files.set(path,original);}
});

test('each old7/13/15 identity or receiver/reference remains excluded from the healthy archive partition',()=>{
 const f=fixture();for(const a of f.state.archivedAttempts!){const q=f.books.quotes.find((q:any)=>q.id===a.orderId);
  for(const delta of [{order_id:a.orderId,receiver_hash:q.receiver_hash,reference_hash:q.deposit_reference_hash},{order_id:null,receiver_hash:q.receiver_hash,reference_hash:randomBytes(32)},{order_id:null,receiver_hash:randomBytes(32),reference_hash:q.deposit_reference_hash}])assert.throws(()=>validateG5ArchivedAttemptBooks(f.state,{...f.books,deposits:[delta]},f.keys),/LATE_OR_FINANCIAL_EFFECT/);
  for(const table of ['operations','obligations','forwards','shielded','refunds'])assert.throws(()=>validateG5ArchivedAttemptBooks(f.state,{...f.books,[table]:[{order_id:a.orderId}]},f.keys),/LATE_OR_FINANCIAL_EFFECT/);
 }
});

test('schema14 three ordinary expiry/replays retain structural20current plus23accepted and69released reservations',async()=>{
 const isolated=await disposableSettlement({throughMigration:14}),pool=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,3),directory=await mkdtemp(join(tmpdir(),'g5-three-attempts-'));try{
  const keys=new PrivateData(randomBytes(32),randomBytes(32)),repo=new Repository(pool,keys),hash='ab'.repeat(32),stateFile=join(directory,'state.json'),state:G5State={version:1,runId,binding:'synthetic',openingEventId:randomUUID(),batchSize:5,orders:[],archivedAttempts:[]},oldRows:any[]=[];
  await pool.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',2000,$1,1991,clock_timestamp(),clock_timestamp())",[hash]);await pool.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");await pool.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=false,reconciliation_required=false');
  async function accept(sequence:number,owner:string){await pool.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');const q=await repo.issueQuote({direction:sequence%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',inputAmount:'100000',payoutFee:sequence%2?'50000000000000':'10000',refundFee:sequence%2?'10000':'50000000000000',recipient:'synthetic:recipient',refundRecipient:'synthetic:refund',depositReceiver:'synthetic:'+randomUUID()},owner);await repo.accept(q.id,owner);return q;}
  // Direct SETTLED/current reserve release is structural scaffolding only.
  // There are no real source funds, receipts or20settlement claims in this test.
  async function scaffold(id:string){await transaction(pool,async db=>{const reserves=(await db.query('SELECT * FROM zee.reservations WHERE order_id=$1',[id])).rows,event=randomUUID();for(const r of reserves){await db.query('UPDATE zee.inventory_accounts SET reserved=reserved-$1 WHERE asset=$2 AND purpose=$3',[r.amount,r.asset,r.purpose]);await db.query('INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount,order_id) VALUES($1,$2,$3,$4,$5),($1,$2,$6,$7,$5)',[event,r.asset,r.purpose+':reserved','-'+r.amount,id,r.purpose+':available',r.amount]);}await db.query('UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1',[id]);await db.query("UPDATE zee.orders SET state='SETTLED' WHERE id=$1",[id]);});}
  for(let sequence=1;sequence<=20;sequence++){
   if(sequences.includes(sequence)){
    const owner='old-'+sequence,old=await accept(sequence,owner),privateQ=await repo.privateQuote(old.id,owner) as any,q=(await pool.query('SELECT * FROM zee.quotes WHERE id=$1',[old.id])).rows[0],order=(await pool.query('SELECT * FROM zee.orders WHERE id=$1',[old.id])).rows[0],funding={orderId:old.id,receiver:privateQ.depositReceiver,memo:old.memo,amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:String(order.funding_cutoff_height)},fb=Buffer.from(JSON.stringify(funding)),audit={version:1,status:'G5_SOURCE'+sequence+'_NO_EFFECT_EXPIRY_AUDIT',runId,sequence,orderId:old.id,cutoffHeight:funding.cutoffHeight,fundingSha256:sha(fb),epoch:'9'},ab=Buffer.from(JSON.stringify(audit)),fundingFile=stateFile+'.funding-'+sequence+'.json',auditFile=stateFile+'.source'+sequence+'-expired-audit.private.json';
    await writeFile(fundingFile,fb);await writeFile(auditFile,ab);await pool.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1::bigint,finalized_height=$1::bigint-9,observed_at=clock_timestamp() WHERE network='zcash-testnet'",[Number(funding.cutoffHeight)+10]);await pool.query('SELECT zee.expire_unfunded($1)',[old.id]);await pool.query('SELECT zee.expire_unfunded($1)',[old.id]);
    state.archivedAttempts!.push({version:1,sequence,attempt:1,direction:'ZCASH_TO_BASE',orderId:old.id,owner,receiver:funding.receiver,fundingFile,fundingSha256:sha(fb),fundingBindingSha256:g5AttemptDigest(funding),quotePayloadSha256:sha(q.private_payload),cutoffHeight:funding.cutoffHeight,auditFile,auditSha256:sha(ab),archivedAt:new Date().toISOString(),epoch:'9'});oldRows.push({old,privateQ,funding,fb,fundingFile});
   }
   const owner='current-'+sequence,current=await accept(sequence,owner),currentQ=await repo.privateQuote(current.id,owner) as any;state.orders.push({sequence,direction:sequence%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',owner,orderId:current.id,...(sequences.includes(sequence)?{attempt:2,receiver:currentQ.depositReceiver}:{})});await scaffold(current.id);
  }
  const partition=await g5RunDatabasePartition(pool,state,keys,stateFile);assert.equal(partition.orders.length,20);assert.equal(partition.acceptedQuoteCount,23);assert.equal(partition.expiredUnfundedAttempts,3);assert.equal((await pool.query('SELECT count(*)::text n FROM zee.reservations')).rows[0].n,'69');assert.equal((await pool.query('SELECT count(*)::text n FROM zee.reservations WHERE released_at IS NULL')).rows[0].n,'0');assert.equal((await pool.query("SELECT count(*)::text n FROM zee.orders WHERE state='EXPIRED_UNFUNDED'")).rows[0].n,'3');
  for(const {old,privateQ,funding,fb,fundingFile} of oldRows){assert.deepEqual(await readFile(fundingFile),fb);assert.equal((await pool.query('SELECT funding_cutoff_height::text n FROM zee.orders WHERE id=$1',[old.id])).rows[0].n,funding.cutoffHeight);
   await assert.rejects(transaction(pool,async db=>{await new Repository(db,keys).observe({network:'zcash-testnet',txid:randomBytes(32).toString('hex'),pool:'ironwood',index:0,reference:old.reference,receiver:privateQ.depositReceiver,amount:'1',height:Number(funding.cutoffHeight)+1,blockHash:hash,blockTime:new Date(),shielded:true});await assert.rejects(g5RunDatabasePartition(db,state,keys,stateFile),/ARCHIVED_SOURCE7/);throw Error('ROLLBACK_SYNTHETIC_LATE');}),/ROLLBACK_SYNTHETIC_LATE/);
  }
  assert.equal((await g5RunDatabasePartition(pool,state,keys,stateFile)).acceptedQuoteCount,23);
 }finally{await pool.end();await isolated.cleanup();await rm(directory,{recursive:true});}
});
