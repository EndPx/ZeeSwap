import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile,open,rename,unlink,mkdir } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { spawn,execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createWalletClient,http,keccak256,parseEther,encodeFunctionData,type Address,type Hex } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { connect } from '../src/db.ts';
import { requireDevelopment } from '../scripts/config.ts';
import { runtime } from '../scripts/runtime.ts';
import { BaseContract,payoutTypedData,payoutCall,type BaseRegistry,type PayoutTerms } from '../src/base-contract.ts';
import type { BaseSigner,PreparedBaseTransaction } from '../src/base-signer.ts';
import { dispatchBaseOnce,reconcileBaseReceipts } from '../src/base-settlement.ts';
import { restoreFinalizedForward,readForwardRestoreJournal } from '../src/base-restore.ts';
import { Repository } from '../src/repository.ts';
import { ingestSnapshot } from '../src/observer.ts';

const settings=requireDevelopment(),database=new URL(settings.adminUrl).pathname.slice(1);
if(settings.branchId!=='br-wispy-dawn-aorsbba5'||!/^zee_test_[0-9a-f]{32}$/.test(database))throw Error('Invocation-owned synthetic settlement database required');
const r=await runtime(true),privateDirectory=dirname(process.env.ZEE_DB_CONFIG!),journalDirectory=join(privateDirectory,'signer-journal');
const snapshotPath=join(privateDirectory,'before-pay.dump');
let admin=connect(settings.adminUrl),worker=connect(r.workerUrl),api=connect(r.apiUrl);
const rpc='http://127.0.0.1:18745',operator=privateKeyToAccount(generatePrivateKey());
const wallet=createWalletClient({chain:baseSepolia,transport:http(rpc)});
const tokenArtifact=JSON.parse(readFileSync(new URL('../../contracts/out/MockUSDC.sol/MockUSDC.json',import.meta.url),'utf8'));
const settlementArtifact=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapSettlement.sol/ZeeSwapSettlement.json',import.meta.url),'utf8'));
let base:BaseContract,registry:BaseRegistry,deployer:Address,recipient:Address,order:any,terms:PayoutTerms;
let staleJob:any,preparations=0,broadcasts=0,baselinePrincipal:bigint,baselineGas:bigint,pay:PreparedBaseTransaction;
const owner=randomBytes(32).toString('base64url');
async function durable(path:string,value:unknown){
 const f=await open(path+'.tmp','w',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}
 await rename(path+'.tmp',path);
}
const journalPath=(id:string,suffix:string)=>join(journalDirectory,createHash('sha256').update(id).digest('hex')+suffix);
const signer:BaseSigner={
 async authorize(q){
  const path=journalPath(q.id,'.auth.json');
  try{return JSON.parse(await readFile(path,'utf8')).signature as Hex;}catch(error:any){if(error.code!=='ENOENT')throw error;}
  const signature=await operator.signTypedData(payoutTypedData(registry,q));await durable(path,{terms:q,signature});return signature;
 },
 async prepare(q,phase){
  const path=journalPath(q.id,`.${phase}.tx.json`);
  try{const previous=JSON.parse(await readFile(path,'utf8'));return {raw:previous.raw,hash:previous.hash,nonce:previous.nonce,maxCost:previous.maxCost};}catch(error:any){if(error.code!=='ENOENT')throw error;}
  const signature=await this.authorize(q),nonce=await base.client.getTransactionCount({address:operator.address,blockTag:'pending'});
  const raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,
   data:payoutCall(registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce,value:0n});
  const signed={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};preparations++;
  await durable(path,{terms:q,...signed});return signed;
 }
};
async function pgSnapshot(action:'dump'|'restore'){
 const wsl=(path:string)=>execFileSync('wsl.exe',['-d','Ubuntu-24.04','--','wslpath','-a',path],{encoding:'utf8',windowsHide:true}).trim();
 const child=spawn('wsl.exe',['-d','Ubuntu-24.04','--','python3',wsl(fileURLToPath(new URL('../scripts/g5-postgres.py',import.meta.url)))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
 child.stdin.end(JSON.stringify({action,url:settings.adminUrl,path:wsl(snapshotPath),directory:wsl(privateDirectory)}));
 const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',c=>resolve(c??1));});
 assert.equal(code,0,errors);assert.equal(JSON.parse(output).action,action);
}
async function fresh(){
 const h=await base.heads();
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1100,$1,1091,clock_timestamp(),clock_timestamp())
 ON CONFLICT(network) DO UPDATE SET observed_at=clock_timestamp()`,['a'.repeat(64)]);
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp())
 ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,
 [Number(h.latest.number),h.latest.hash!.slice(2),Number(h.finalized.number),new Date(Number(h.finalized.timestamp)*1000)]);
}
async function finalized(hash:Hex){
 await base.client.request({method:'anvil_mine' as any,params:['0x40'] as any});
 for(let i=0;i<50;i++){
  const receipt=await base.client.getTransactionReceipt({hash});
  if((await base.heads()).finalized.number>=receipt.blockNumber)return;
  await delay(200);
 }
 throw Error('Anvil finality timed out');
}
async function enable(){await fresh();await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');}
async function pause(){await admin.query('SELECT zee.enter_reconciliation()');}
async function count(table:string){return (await admin.query(`SELECT count(*)::int n FROM zee.${table} WHERE order_id=$1`,[order.id])).rows[0].n;}
async function close(){await Promise.all([admin.end(),worker.end(),api.end()]);}
async function restore(){await close();await pgSnapshot('restore');admin=connect(settings.adminUrl);worker=connect(r.workerUrl);api=connect(r.apiUrl);}
async function controlPaused(){const c=(await admin.query('SELECT * FROM zee.runtime_control')).rows[0];assert.equal(c.accepting_orders,false);assert.equal(c.dispatch_enabled,false);assert.equal(c.reconciliation_required,true);}

before(async()=>{
 await mkdir(journalDirectory,{mode:0o700});
 [deployer,recipient]=await wallet.getAddresses();
 const starter=new BaseContract({chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{} as any},true);
 assert.equal(await starter.client.getChainId(),84532);
 await wallet.sendTransaction({account:deployer,to:operator.address,value:parseEther('1')});
 const th=await wallet.deployContract({account:deployer,abi:tokenArtifact.abi,bytecode:tokenArtifact.bytecode.object,args:[deployer,deployer]});
 const t=await starter.client.waitForTransactionReceipt({hash:th});
 const sh=await wallet.deployContract({account:deployer,abi:settlementArtifact.abi,bytecode:settlementArtifact.bytecode.object,args:[t.contractAddress!,deployer,operator.address,operator.address]});
 const s=await starter.client.waitForTransactionReceipt({hash:sh});
 const deployment=async(receipt:typeof t)=>({address:receipt.contractAddress!,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,runtimeCodeHash:keccak256((await starter.client.getCode({address:receipt.contractAddress!}))!)});
 registry={chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{MockUSDC:await deployment(t),ZeeSwapSettlement:await deployment(s)}};
 base=new BaseContract(registry,true);
 await wallet.sendTransaction({account:deployer,to:t.contractAddress!,data:encodeFunctionData({abi:tokenArtifact.abi,functionName:'mint',args:[deployer,1000000n]})});
 await wallet.sendTransaction({account:deployer,to:t.contractAddress!,data:encodeFunctionData({abi:tokenArtifact.abi,functionName:'approve',args:[s.contractAddress!,1000000n]})});
 await wallet.sendTransaction({account:deployer,to:s.contractAddress!,data:encodeFunctionData({abi:settlementArtifact.abi,functionName:'depositInventory',args:[1000000n]})});
 await finalized(sh);
 await admin.query(`INSERT INTO zee.inventory_accounts SELECT id,p,CASE WHEN id='baseETH' THEN 1000000000000000000 ELSE 1000000000 END,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)`);
 await enable();
 const repository=new Repository(api,r.keys);
 order=await repository.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient,refundRecipient:'fixture:restore-refund',depositReceiver:`fixture:${randomUUID()}`,payoutFee:'100000000000000',refundFee:'10000',executionMode:'base-settlement-v1',baseContract:s.contractAddress!},owner);
 await repository.accept(order.id,owner);const accepted=await repository.privateQuote(order.id,owner) as any,time=new Date().toISOString(),hash='a'.repeat(64);
 await ingestSnapshot(worker,r.keys,{schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,scannedHeight:1110,tipHash:hash,
  blocks:[{height:1101,hash,time},{height:1110,hash,time}],outputs:[{txid:randomBytes(32).toString('hex'),index:0,pool:'ironwood',amount:'100000',receiver:accepted.depositReceiver,memo:order.memo,height:1101,blockHash:hash,blockTime:time,shieldedSource:true}]});
 const send=base.client.sendRawTransaction;base.client.sendRawTransaction=async args=>{broadcasts++;return send(args);};
 assert.equal((await dispatchBaseOnce(worker,r.keys,base,signer)).phase,'RESERVE');
 terms=r.keys.open((await admin.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[order.id])).rows[0].terms_payload,`base-terms:${order.id}:v1`) as PayoutTerms;
 const reserve=await signer.prepare(terms,'RESERVE');await finalized(reserve.hash);await reconcileBaseReceipts(worker,r.keys,base);
 staleJob=(await admin.query('SELECT j.* FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=$1',[order.id])).rows[0];
 baselinePrincipal=BigInt((await admin.query("SELECT balance FROM zee.inventory_accounts WHERE asset='mockUSDC' AND purpose='principal'")).rows[0].balance);
 baselineGas=BigInt((await admin.query("SELECT balance FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows[0].balance);
 // Deliberately dump ACTIVE controls and a stale lease; the restore wrapper must
 // atomically force pause/fence invalidation before a worker can see old state.
 await pgSnapshot('dump');
 await pause();await enable();
 const result=await dispatchBaseOnce(worker,r.keys,base,signer);assert.equal(result.phase,'PAY');
 pay=await signer.prepare(terms,'PAY');await finalized(pay.hash);await reconcileBaseReceipts(worker,r.keys,base);
 assert.equal((await admin.query('SELECT state FROM zee.orders WHERE id=$1',[order.id])).rows[0].state,'SETTLED');
 await restore();
});

after(async()=>{await pause().catch(()=>{});await close();await unlink(snapshotPath).catch(()=>{});});

test('real pg_dump/pg_restore rolls back a settled DB while chain/journal retain original PAY; first visible state is paused',async()=>{
 assert.equal((await admin.query('SELECT state FROM zee.orders WHERE id=$1',[order.id])).rows[0].state,'READY');
 assert.equal(await count('base_attempts'),1);assert.equal((await admin.query('SELECT confirmed FROM zee.base_attempts WHERE order_id=$1',[order.id])).rows[0].confirmed,true);
 await controlPaused();
 assert.equal(await base.client.readContract({address:registry.contracts.MockUSDC.address,abi:tokenArtifact.abi,functionName:'balanceOf',args:[recipient]}),100000n);
 assert.equal((await readForwardRestoreJournal(journalDirectory,terms.id)).attempts.PAY.hash,pay.hash);
 await assert.rejects(()=>worker.query('SELECT zee.renew_base_lease($1,$2,$3)',[staleJob.id,staleJob.lease_owner,staleJob.fence]),/dispatch paused/);
 const noSigner:BaseSigner={authorize:async()=>{throw Error('unexpected signing');},prepare:async()=>{throw Error('unexpected signing');}};
 assert.deepEqual(await Promise.all([dispatchBaseOnce(worker,r.keys,base,noSigner),dispatchBaseOnce(worker,r.keys,base,noSigner)]),[{status:'NO_ELIGIBLE_JOB'},{status:'NO_ELIGIBLE_JOB'}]);
 assert.equal(preparations,2);assert.equal(broadcasts,2);
});

test('missing/corrupt journals, modified signed bytes, wrong terms and unprivileged import fail closed',async()=>{
 const path=journalPath(terms.id,'.PAY.tx.json'),original=await readFile(path,'utf8');
 await rename(path,path+'.missing');
 await assert.rejects(()=>readForwardRestoreJournal(journalDirectory,terms.id),/JOURNAL_UNAVAILABLE_OR_CORRUPT/);
 await rename(path+'.missing',path);await durable(path,{broken:true});
 await assert.rejects(()=>readForwardRestoreJournal(journalDirectory,terms.id),/JOURNAL_UNAVAILABLE_OR_CORRUPT/);
 const f=await open(path,'w');try{await f.writeFile(original);await f.sync();}finally{await f.close();}
 const journal=await readForwardRestoreJournal(journalDirectory,terms.id);
 await assert.rejects(()=>restoreFinalizedForward(admin,r.keys,base,order.id,{...journal,attempts:{...journal.attempts,PAY:{...pay,raw:'0x00'}}}));
 await assert.rejects(()=>restoreFinalizedForward(admin,r.keys,base,order.id,{...journal,terms:{...terms,amount:'200000'}}),/IMMUTABLE_TERMS/);
 await assert.rejects(()=>restoreFinalizedForward(worker,r.keys,base,order.id,journal),/permission denied/);
 await controlPaused();assert.equal(await count('base_attempts'),1);assert.equal(preparations,2);assert.equal(broadcasts,2);
});

test('unavailable database cannot sign/broadcast or discard the independent journal',async()=>{
 const url=new URL(settings.adminUrl);url.port='1';const unavailable=connect(url.toString(),1);
 try{const journal=await readForwardRestoreJournal(journalDirectory,terms.id);await assert.rejects(()=>restoreFinalizedForward(unavailable,r.keys,base,order.id,journal));}finally{await unavailable.end();}
 assert.equal((await readForwardRestoreJournal(journalDirectory,terms.id)).attempts.PAY.raw,pay.raw);
 assert.equal(preparations,2);assert.equal(broadcasts,2);await controlPaused();
});

test('journal reconstruction refuses active controls and a real unavailable RPC without importing an attempt',async()=>{
 const journal=await readForwardRestoreJournal(journalDirectory,terms.id);
 await enable();await assert.rejects(()=>restoreFinalizedForward(admin,r.keys,base,order.id,journal),/RESTORE_REQUIRES_PAUSE/);await pause();
 const unavailable=new BaseContract({...registry,rpcUrl:'http://127.0.0.1:1'},true);
 await assert.rejects(()=>restoreFinalizedForward(admin,r.keys,unavailable,order.id,journal));
 await controlPaused();assert.equal(await count('base_attempts'),1);assert.equal(preparations,2);assert.equal(broadcasts,2);
});

test('concurrent paused recovery reconstructs original PAY once using canonical receipts and existing accounting',async()=>{
 const journal=await readForwardRestoreJournal(journalDirectory,terms.id);
 await Promise.all([restoreFinalizedForward(admin,r.keys,base,order.id,journal),restoreFinalizedForward(admin,r.keys,base,order.id,journal)]);
 assert.equal((await admin.query('SELECT state FROM zee.orders WHERE id=$1',[order.id])).rows[0].state,'SETTLED');
 assert.equal(await count('base_attempts'),2);
 assert.equal((await admin.query("SELECT count(*)::int n FROM zee.order_events WHERE order_id=$1 AND event_type='BASE_PAY_RESTORED_FROM_JOURNAL'",[order.id])).rows[0].n,1);
 assert.equal((await admin.query("SELECT state FROM zee.obligations WHERE order_id=$1",[order.id])).rows[0].state,'DISCHARGED');
 assert.equal((await admin.query('SELECT asset,sum(amount)::text balance FROM zee.ledger_entries WHERE order_id=$1 GROUP BY asset',[order.id])).rows.every(x=>x.balance==='0'),true);
 const fees=BigInt((await admin.query('SELECT sum(actual_fee)::text fee FROM zee.base_attempts WHERE order_id=$1',[order.id])).rows[0].fee);
 assert.equal(BigInt((await admin.query("SELECT balance FROM zee.inventory_accounts WHERE asset='mockUSDC' AND purpose='principal'")).rows[0].balance),baselinePrincipal-100000n);
 assert.equal(BigInt((await admin.query("SELECT balance FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows[0].balance),baselineGas-fees);
 assert.equal((await admin.query('SELECT count(*)::int n FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL',[order.id])).rows[0].n,0);
 const entries=await count('ledger_entries');await restoreFinalizedForward(admin,r.keys,base,order.id,journal);assert.equal(await count('ledger_entries'),entries);
 await controlPaused();assert.equal(preparations,2);assert.equal(broadcasts,2);
 assert.equal(await base.client.readContract({address:registry.contracts.MockUSDC.address,abi:tokenArtifact.abi,functionName:'balanceOf',args:[recipient]}),100000n);
 // Paused-state check alone rejects old fences; after deliberate enable, old
 // lease identity must still fail independently of the pause.
 await enable();await assert.rejects(()=>worker.query('SELECT zee.renew_base_lease($1,$2,$3)',[staleJob.id,staleJob.lease_owner,staleJob.fence]),/stale lease/);await pause();
});
