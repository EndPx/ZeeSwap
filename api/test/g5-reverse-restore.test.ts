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
import { BaseContract,type BaseRegistry } from '../src/base-contract.ts';
import type { PreparedBaseTransaction } from '../src/base-signer.ts';
import { Repository } from '../src/repository.ts';
import { authorizeEscrow,fundingCall,fundingTypedData,observeEscrowFunding,storeEscrowCommit,observeEscrowCommit } from '../src/base-escrow.ts';
import { storeReversePayout,observeReversePayout,storeEscrowSettlement,observeEscrowSettlement,type PreparedZcashTransaction,type ReverseZcashVerifier,type VerifiedZcashReceipt } from '../src/reverse-settlement.ts';
import { restoreFinalizedReverse,readReverseRestoreJournal,type ReverseRestoreJournal } from '../src/reverse-restore.ts';
import { approvalDigest } from '../src/reverse-authority.ts';

const settings=requireDevelopment(),database=new URL(settings.adminUrl).pathname.slice(1);
if(settings.branchId!=='br-wispy-dawn-aorsbba5'||!/^zee_test_[0-9a-f]{32}$/.test(database))throw Error('Invocation-owned synthetic settlement database required');
const r=await runtime(true),directory=dirname(process.env.ZEE_DB_CONFIG!),journalDirectory=join(directory,'base-journal'),zcashJournalPath=join(directory,'zcash-journal.private.json'),snapshotPath=join(directory,'before-zcash.dump');
let admin=connect(settings.adminUrl),worker=connect(r.workerUrl),api=connect(r.apiUrl);
const rpc='http://127.0.0.1:18745',operator=privateKeyToAccount(generatePrivateKey()),wallet=createWalletClient({chain:baseSepolia,transport:http(rpc)});
const token=JSON.parse(readFileSync(new URL('../../contracts/out/MockUSDC.sol/MockUSDC.json',import.meta.url),'utf8'));
const contract=JSON.parse(readFileSync(new URL('../../contracts/out/ZeeSwapSettlement.sol/ZeeSwapSettlement.json',import.meta.url),'utf8'));
const owner=randomBytes(32).toString('base64url');
let base:BaseContract,registry:BaseRegistry,deployer:Address,payer:Address,order:any,funding:any,commit:PreparedBaseTransaction,settle:PreparedBaseTransaction,prepared:PreparedZcashTransaction,delivery:VerifiedZcashReceipt,approved:any,digest:string,staleJob:any,leaseOwner:string,nonceAfter:number;
let beforeBalances:any[],broadcasts=0,preparations=0,journal:ReverseRestoreJournal;
const verifier:ReverseZcashVerifier={async verifyPrepared(p,t){assert.deepEqual(p,prepared);assert.equal(t.orderId,order.id);assert.equal(t.recipient,'fixture:reverse-snapshot-recipient');},async receipt(){return {...delivery,observedAt:new Date().toISOString()};}};
async function durable(path:string,value:unknown){const file=await open(path+'.tmp','w',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(path+'.tmp',path);}
async function pgSnapshot(action:'dump'|'restore'){
 const wsl=(path:string)=>execFileSync('wsl.exe',['-d','Ubuntu-24.04','--','wslpath','-a',path],{encoding:'utf8',windowsHide:true}).trim();
 const child=spawn('wsl.exe',['-d','Ubuntu-24.04','--','python3',wsl(fileURLToPath(new URL('../scripts/g5-postgres.py',import.meta.url)))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
 child.stdin.end(JSON.stringify({action,url:settings.adminUrl,path:wsl(snapshotPath),directory:wsl(directory)}));
 const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',c=>resolve(c??1));});assert.equal(code,0,errors);assert.equal(JSON.parse(output).action,action);
}
async function fresh(){const h=await base.heads();
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1100,$1,1091,clock_timestamp(),clock_timestamp()) ON CONFLICT(network) DO UPDATE SET observed_at=clock_timestamp()`,['a'.repeat(64)]);
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp()) ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,[Number(h.latest.number),h.latest.hash!.slice(2),Number(h.finalized.number),new Date(Number(h.finalized.timestamp)*1000)]);
}
async function enable(){await fresh();await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');}
async function pause(){await admin.query('SELECT zee.enter_reconciliation()');}
async function finalized(hash:Hex){await base.client.request({method:'anvil_mine' as any,params:['0x40'] as any});for(let i=0;i<50;i++){const receipt=await base.client.getTransactionReceipt({hash});if((await base.heads()).finalized.number>=receipt.blockNumber)return;await delay(200);}throw Error('Anvil finality timed out');}
async function close(){await Promise.all([admin.end(),worker.end(),api.end()]);}
async function count(table:string){return (await admin.query(`SELECT count(*)::int n FROM zee.${table} WHERE order_id=$1`,[order.id])).rows[0].n;}
async function paused(){const c=(await admin.query('SELECT * FROM zee.runtime_control')).rows[0];assert.equal(c.accepting_orders,false);assert.equal(c.dispatch_enabled,false);assert.equal(c.reconciliation_required,true);}
async function sign(phase:'COMMIT'|'SETTLE'){
 const nonce=await base.client.getTransactionCount({address:operator.address,blockTag:'pending'});
 const raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,data:encodeFunctionData({abi:contract.abi,functionName:phase==='COMMIT'?'commitPayout':'settleEscrow',args:[funding.terms.id]}),gas:450000n,gasPrice:1000000n,nonce,value:0n});
 preparations++;const result={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'};
 await durable(join(journalDirectory,createHash('sha256').update(funding.terms.id).digest('hex')+`.${phase}.tx.json`),{terms:funding.terms,...result});return result;
}

before(async()=>{
 await mkdir(journalDirectory,{mode:0o700});[deployer,payer]=await wallet.getAddresses();
 const starter=new BaseContract({chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{} as any},true);assert.equal(await starter.client.getChainId(),84532);
 await wallet.sendTransaction({account:deployer,to:operator.address,value:parseEther('1')});
 const th=await wallet.deployContract({account:deployer,abi:token.abi,bytecode:token.bytecode.object,args:[deployer,deployer]}),t=await starter.client.waitForTransactionReceipt({hash:th});
 const sh=await wallet.deployContract({account:deployer,abi:contract.abi,bytecode:contract.bytecode.object,args:[t.contractAddress!,deployer,operator.address,operator.address]}),s=await starter.client.waitForTransactionReceipt({hash:sh});
 const deployment=async(receipt:typeof t)=>({address:receipt.contractAddress!,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,runtimeCodeHash:keccak256((await starter.client.getCode({address:receipt.contractAddress!}))!)});
 registry={chainId:84532,rpcUrl:rpc,deployer,operator:operator.address,contracts:{MockUSDC:await deployment(t),ZeeSwapSettlement:await deployment(s)}};base=new BaseContract(registry,true);await finalized(sh);
 await admin.query(`INSERT INTO zee.inventory_accounts SELECT id,p,CASE WHEN id='baseETH' THEN 1000000000000000000 ELSE 1000000000 END,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)`);await enable();
 const repo=new Repository(api,r.keys);order=await repo.issueQuote({direction:'BASE_TO_ZCASH',inputAmount:'100000',recipient:'fixture:reverse-snapshot-recipient',refundRecipient:payer,payer,depositReceiver:'pending',payoutFee:'10000',refundFee:'100000000000000',executionMode:'base-escrow-v1',baseContract:s.contractAddress!},owner);await repo.accept(order.id,owner);
 funding=await authorizeEscrow(worker,r.keys,base,order.id,q=>operator.signTypedData(fundingTypedData(base,q)));
 await durable(join(journalDirectory,createHash('sha256').update(funding.terms.id).digest('hex')+'.reverse.auth.json'),funding);
 await wallet.sendTransaction({account:deployer,to:t.contractAddress!,data:encodeFunctionData({abi:token.abi,functionName:'mint',args:[payer,100000n]})});
 await wallet.sendTransaction({account:payer,to:t.contractAddress!,data:encodeFunctionData({abi:token.abi,functionName:'approve',args:[s.contractAddress!,100000n]})});
 const fund=await wallet.sendTransaction({account:payer,to:s.contractAddress!,data:fundingCall(base,funding.terms,funding.signature)});await finalized(fund);await fresh();assert.equal((await observeEscrowFunding(worker,r.keys,base,order.id,fund)).status,'READY');
 leaseOwner=randomUUID();staleJob=(await worker.query('SELECT * FROM zee.claim_escrow_job($1)',[leaseOwner])).rows[0];assert.ok(staleJob);
 commit=await sign('COMMIT');await storeEscrowCommit(worker,r.keys,base,order.id,staleJob.id,leaseOwner,staleJob.fence,commit);broadcasts++;await base.client.sendRawTransaction({serializedTransaction:commit.raw});await finalized(commit.hash);assert.equal((await observeEscrowCommit(worker,r.keys,base,order.id)).status,'COMMIT_FINALIZED');await fresh();
 beforeBalances=(await admin.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
 await pgSnapshot('dump');
 // Continue beyond the backup with synthetic shielded receipt evidence and a
 // real finalized Anvil SETTLE. No public Zcash or Base transaction occurs.
 await pause();await enable();leaseOwner=randomUUID();staleJob={...staleJob};const job=(await worker.query('SELECT * FROM zee.claim_escrow_job($1)',[leaseOwner])).rows[0];assert.ok(job);
 prepared={operationId:order.id,amount:'100000',fee:'10000',recipient:'fixture:reverse-snapshot-recipient',txid:'c'.repeat(64),rawTransaction:'aa',feeZatoshi:'10000',expiryHeight:'1000000',selectedNotes:[{pool:'ironwood',txid:'d'.repeat(64),index:1,value:'110000'}],outputs:[{recipient:'fixture:reverse-snapshot-recipient',amount:'100000',ownChange:false,index:0}]};
 delivery={txid:prepared.txid,blockHeight:1101,blockHash:'e'.repeat(64),tipHeight:1110,tipHash:'a'.repeat(64),observedAt:new Date().toISOString(),amountZatoshi:'100000',feeZatoshi:'10000',recipient:prepared.recipient,shielded:true,pool:'ironwood'};
 const receipt=await base.client.getTransactionReceipt({hash:commit.hash});approved={version:1,orderId:order.id,settlementId:funding.terms.id,recipient:prepared.recipient,amountZatoshi:'100000',maxFeeZatoshi:'10000',base:{chainId:84532,contract:s.contractAddress!,token:t.contractAddress!,payer,refundRecipient:payer,amountAtomic:'100000',cancellationAvailableAt:funding.terms.cancellationAvailableAt,commitTxHash:commit.hash,commitBlockNumber:String(receipt.blockNumber),commitBlockHash:receipt.blockHash}};digest=approvalDigest(approved);
 await storeReversePayout(worker,r.keys,order.id,job.id,leaseOwner,job.fence,prepared,verifier);await observeReversePayout(worker,r.keys,order.id,verifier);
 await durable(zcashJournalPath,{state:'DELIVERY_CONFIRMED',approvedDigest:digest,request:approved,prepared,receipt:{orderId:order.id,approvedDigest:digest,txid:prepared.txid,blockHeight:String(delivery.blockHeight),blockHash:delivery.blockHash,tipHeight:String(delivery.tipHeight),tipHash:delivery.tipHash,observedAt:delivery.observedAt,amount:'100000',fee:'10000',recipient:prepared.recipient,shielded:true,confirmed:true,confirmations:10}});
 settle=await sign('SETTLE');await storeEscrowSettlement(worker,r.keys,base,order.id,job.id,leaseOwner,job.fence,settle);broadcasts++;await base.client.sendRawTransaction({serializedTransaction:settle.raw});await finalized(settle.hash);await observeReversePayout(worker,r.keys,order.id,verifier);assert.equal((await observeEscrowSettlement(worker,r.keys,base,order.id)).status,'SETTLED');
 nonceAfter=await base.client.getTransactionCount({address:operator.address});journal=await readReverseRestoreJournal(zcashJournalPath,journalDirectory,funding.terms.id,digest);
 await close();await pgSnapshot('restore');admin=connect(settings.adminUrl);worker=connect(r.workerUrl);api=connect(r.apiUrl);
});
after(async()=>{await pause().catch(()=>{});await close();await unlink(snapshotPath).catch(()=>{});});

test('real reverse snapshot restore starts paused with finalized COMMIT and missing payout/SETTLE despite advanced journals and chain',async()=>{
 await paused();assert.equal((await admin.query('SELECT state FROM zee.orders WHERE id=$1',[order.id])).rows[0].state,'READY');assert.equal(await count('reverse_payouts'),0);assert.equal(await count('escrow_settlements'),0);
 assert.equal((await admin.query('SELECT confirmed FROM zee.escrow_commits WHERE order_id=$1',[order.id])).rows[0].confirmed,true);
 assert.equal((await admin.query('SELECT state FROM zee.obligations WHERE order_id=$1',[order.id])).rows[0].state,'HELD');
 assert.equal((await worker.query('SELECT * FROM zee.claim_escrow_job($1)',[randomUUID()])).rowCount,0);
 await assert.rejects(()=>worker.query('SELECT zee.renew_base_lease($1,$2,$3)',[staleJob.id,staleJob.lease_owner,staleJob.fence]),/dispatch paused/);
 assert.equal(await base.state(funding.terms.id),6);assert.equal(journal.prepared.rawTransaction,prepared.rawTransaction);
});

test('missing/corrupt reverse journals and modified authority/bytes cannot reconstruct missing records',async()=>{
 const original=await readFile(zcashJournalPath,'utf8');await rename(zcashJournalPath,zcashJournalPath+'.missing');await assert.rejects(()=>readReverseRestoreJournal(zcashJournalPath,journalDirectory,funding.terms.id,digest),/UNAVAILABLE_OR_CORRUPT/);await rename(zcashJournalPath+'.missing',zcashJournalPath);
 await durable(zcashJournalPath,{state:'SIGNING_INTENT'});await assert.rejects(()=>readReverseRestoreJournal(zcashJournalPath,journalDirectory,funding.terms.id,digest),/UNAVAILABLE_OR_CORRUPT/);const file=await open(zcashJournalPath,'w');try{await file.writeFile(original);await file.sync();}finally{await file.close();}
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,{...journal,prepared:{...prepared,rawTransaction:'bb'}},verifier));
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,{...journal,settle:{...settle,raw:'0x00'}},verifier));
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,{...journal,approved:{...approved,amountZatoshi:'99999'}},verifier),/IMMUTABLE_AUTHORITY/);
 assert.equal(await count('reverse_payouts'),0);assert.equal(await count('escrow_settlements'),0);await paused();
});

test('unknown committed delivery, changed canonical inclusion and stale fresh receipt fail closed with obligations held',async()=>{
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,journal,{...verifier,receipt:async()=>null}),/COMMITTED_DELIVERY_UNKNOWN/);
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,journal,{...verifier,receipt:async()=>({...delivery,blockHash:'f'.repeat(64),observedAt:new Date().toISOString()})}),/DELIVERY_CHANGED/);
 await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,journal,{...verifier,receipt:async()=>({...delivery,observedAt:new Date(Date.now()-61000).toISOString()})}),/FRESH_DELIVERY_REQUIRED/);
 assert.equal(await count('reverse_payouts'),0);assert.equal(await count('escrow_settlements'),0);assert.equal((await admin.query('SELECT state FROM zee.obligations WHERE order_id=$1',[order.id])).rows[0].state,'HELD');await paused();
});

test('active controls and unprivileged worker import are rejected without new economic action',async()=>{
 await enable();await assert.rejects(()=>restoreFinalizedReverse(admin,r.keys,base,order.id,journal,verifier),/REQUIRES_PAUSE/);await pause();
 await assert.rejects(()=>restoreFinalizedReverse(worker,r.keys,base,order.id,journal,verifier),/permission denied/);
 assert.equal(await count('reverse_payouts'),0);assert.equal(await count('escrow_settlements'),0);await paused();
});

test('concurrent journal recovery reconstructs original reverse payout/SETTLE and discharges exact accounting once while paused',async()=>{
 await Promise.all([restoreFinalizedReverse(admin,r.keys,base,order.id,journal,verifier),restoreFinalizedReverse(admin,r.keys,base,order.id,journal,verifier)]);
 assert.equal((await admin.query('SELECT state FROM zee.orders WHERE id=$1',[order.id])).rows[0].state,'SETTLED');assert.equal((await admin.query('SELECT state FROM zee.obligations WHERE order_id=$1',[order.id])).rows[0].state,'DISCHARGED');
 assert.equal(await count('reverse_payouts'),1);assert.equal(await count('escrow_settlements'),1);
 const events=(await admin.query("SELECT event_type,count(*)::int n FROM zee.order_events WHERE order_id=$1 AND event_type LIKE '%RESTORED_FROM_JOURNAL' GROUP BY event_type",[order.id])).rows;assert.equal(events.length,2);assert.equal(events.every(e=>e.n===1),true);
 const fees=BigInt((await admin.query('SELECT actual_fee FROM zee.escrow_commits WHERE order_id=$1',[order.id])).rows[0].actual_fee)+BigInt((await admin.query('SELECT actual_fee FROM zee.escrow_settlements WHERE order_id=$1',[order.id])).rows[0].actual_fee);
 const afterBalances=(await admin.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
 for(const account of afterBalances){const before=beforeBalances.find(a=>a.asset===account.asset&&a.purpose===account.purpose),expected=account.asset==='TAZ'?(account.purpose==='principal'?100000n:10000n):account.asset==='baseETH'&&account.purpose==='fee'?fees:0n;assert.equal(BigInt(before.balance)-BigInt(account.balance),expected);assert.equal(account.reserved,'0');}
 assert.equal((await admin.query('SELECT event_id,asset FROM zee.ledger_entries WHERE order_id=$1 GROUP BY event_id,asset HAVING sum(amount)<>0',[order.id])).rowCount,0);
 const entries=await count('ledger_entries');await restoreFinalizedReverse(admin,r.keys,base,order.id,journal,verifier);assert.equal(await count('ledger_entries'),entries);await paused();
 assert.equal(await base.client.getTransactionCount({address:operator.address}),nonceAfter);assert.equal(preparations,2);assert.equal(broadcasts,2);
});
