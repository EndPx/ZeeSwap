/** Explicit one-order operator steps. No mint, seed inventory, policy enabling,
 * automatic funding, private stdout, or public HTTP route. Each invocation does
 * only its named step, with approved private configs supplied by the operator.
 */
import { readFile,open,rename } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { connect } from '../src/db.ts';
import { requireDevelopment } from './config.ts';
import { runtime } from './runtime.ts';
import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
import { Repository } from '../src/repository.ts';
import { LocalReverseBaseSigner } from '../src/base-signer.ts';
import { authorizeEscrow,fundingCall,escrowTerms,observeEscrowFunding,storeEscrowCommit,observeEscrowCommit } from '../src/base-escrow.ts';
import { reversePayoutTerms,storeReversePayout,observeReversePayout,storeEscrowSettlement,observeEscrowSettlement,type PreparedZcashTransaction } from '../src/reverse-settlement.ts';
import { LocalReverseWalletAdapter } from '../src/reverse-wallet-adapter.ts';
import { withLeaseHeartbeat } from '../src/lease-heartbeat.ts';
import { accessHash } from '../src/private-data.ts';
import {approvalDigest} from '../src/reverse-authority.ts';

const [step,path]=process.argv.slice(2);
const steps=['quote','funding','observe-funding','prepare-commit','broadcast-commit','observe-commit','approve-wallet','prepare-zcash','recover-zcash','broadcast-zcash','observe-zcash','prepare-settle','broadcast-settle','observe-settle'];
if(!steps.includes(step)||!path||process.argv.length!==4)throw Error('One explicit reverse step and private config file required');
const config=JSON.parse(await readFile(path,'utf8'));
process.env.ZEE_DB_CONFIG=resolve(config.databaseConfig);process.env.ZEE_RUNTIME_CONFIG=resolve(config.runtimeConfig);
const target=requireDevelopment();
if(target.branchId!=='br-small-sound-aozx7xa6')throw Error('Exact isolated live reverse operator branch required');
const r=await runtime(true),worker=connect(r.workerUrl),api=connect(r.apiUrl),admin=connect(target.adminUrl),base=new BaseContract(loadBaseRegistry());
const baseSigner=new LocalReverseBaseSigner(config.baseSignerCommand,config.baseSignerArgs);
const zcash=new LocalReverseWalletAdapter(config.zcashCommand,config.zcashArgs,config.approvedDigest);
const statePath=resolve(config.stateFile);
let state:any;
try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if((error as any).code!=='ENOENT')throw error;state={version:1};}
async function durable(path:string,value:unknown){
 const temporary=path+'.'+randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}
 await rename(temporary,path);
 if(process.platform!=='win32'){const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}
}
const save=()=>durable(statePath,state);
async function leased(run:(job:any,owner:string,check:()=>Promise<void>)=>Promise<unknown>){
 let owner=state.currentLease?.owner,job:any;
 if(owner){
  job=(await worker.query('SELECT * FROM zee.outbox_jobs WHERE id=$1 AND lease_owner=$2 AND fence=$3 AND status=\'LEASED\' AND lease_until>clock_timestamp()',
   [state.currentLease.jobId,owner,state.currentLease.fence])).rows[0];
 }
 if(!job){owner=randomUUID();job=(await worker.query('SELECT * FROM zee.claim_escrow_job($1)',[owner])).rows[0];}
 if(!job)throw Error('NO_ELIGIBLE_REVERSE_JOB_RECONCILE');
 const op=(await worker.query('SELECT order_id FROM zee.operations WHERE id=$1',[job.operation_id])).rows[0];
 if(op?.order_id!==state.orderId)throw Error('UNEXPECTED_REVERSE_JOB');
 state.currentLease={jobId:job.id,owner,fence:String(job.fence)};await save();
 return withLeaseHeartbeat(()=>worker.query('SELECT zee.renew_base_lease($1,$2,$3)',[job.id,owner,job.fence]),async check=>{
  return run(job,owner,check);
 });
}
async function baseBroadcast(phase:'COMMIT'|'SETTLE'){
 const table=phase==='COMMIT'?'escrow_commits':'escrow_settlements';
 const row=(await worker.query(`SELECT * FROM zee.${table} WHERE order_id=$1`,[state.orderId])).rows[0];
 if(!row)throw Error('DURABLE_SIGNED_ATTEMPT_MISSING');
 const signed=r.keys.open(row.signed_payload,phase==='COMMIT'?`escrow-commit:${state.orderId}:v1`:`escrow-settle:${state.orderId}:v1`) as any;
 if(row.confirmed)return {status:'ALREADY_FINALIZED'};
 return leased(async(job,owner,check)=>{
  const gate=phase==='COMMIT'?'check_escrow_dispatch':'check_reverse_signing';
  await check();await worker.query(`SELECT zee.${gate}($1,$2,$3,$4)`,[state.orderId,job.id,owner,job.fence]);
  if(phase==='SETTLE'){
   await observeReversePayout(worker,r.keys,state.orderId,zcash);
   await worker.query('SELECT zee.check_reverse_delivery($1)',[state.orderId]);
  }
  const known=await base.client.getTransaction({hash:signed.hash}).catch(e=>{if(e.name==='TransactionNotFoundError')return null;throw e;});
  if(known)return {status:'AWAITING_BASE_FINALITY'};
  if(await base.client.getTransactionCount({address:base.registry.operator,blockTag:'latest'})>signed.nonce)throw Error('BASE_NONCE_CONFLICT_RECONCILE');
  await check();await worker.query(`SELECT zee.${gate}($1,$2,$3,$4)`,[state.orderId,job.id,owner,job.fence]);
  try{const hash=await base.client.sendRawTransaction({serializedTransaction:signed.raw});if(hash!==signed.hash)throw Error('identity');}
  catch{throw Error('BASE_BROADCAST_UNCERTAIN_RECONCILE_OR_SAME_BYTES');}
  return {status:'AWAITING_BASE_FINALITY'};
 });
}
try{
 await base.preflight();
 let result:unknown;
 if(step==='quote'){
  if(config.inputAmount!=='100000')throw Error('EXACT_APPROVED_REVERSE_INPUT_REQUIRED');
  const recipient=await r.wallet.validate(config.recipient);
  if(!state.owner){state.owner=randomBytes(32).toString('base64url');await save();}
  const quotes=(await api.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(state.owner)])).rows;
  if(quotes.length>1||(state.orderId&&quotes[0]?.id!==state.orderId))throw Error('PRIVATE_QUOTE_RECOVERY_CONFLICT');
  let id=quotes[0]?.id;
  if(!id){const quote=await new Repository(api,r.keys).issueQuote({direction:'BASE_TO_ZCASH',inputAmount:config.inputAmount,recipient,
    payer:config.payer,refundRecipient:config.refundRecipient,depositReceiver:'pending',payoutFee:'10000',refundFee:config.baseFeeBudget,
    executionMode:'base-escrow-v1',baseContract:base.registry.contracts.ZeeSwapSettlement.address},state.owner);id=quote.id;}
  const q=await new Repository(api,r.keys).privateQuote(id,state.owner) as any;
  if(q.inputAmount!=='100000'||q.recipient!==recipient||q.payer!==config.payer||q.refundRecipient!==config.refundRecipient
   ||q.payoutFee!=='10000'||q.refundFee!==config.baseFeeBudget||q.executionMode!=='base-escrow-v1'
   ||q.baseContract!==base.registry.contracts.ZeeSwapSettlement.address)throw Error('IMMUTABLE_QUOTE_RECOVERY_MISMATCH');
  state.orderId=id;await save();await new Repository(api,r.keys).accept(id,state.owner);result={status:'AWAITING_FUNDS'};
 }else{
  if(!state.orderId)throw Error('PRIVATE_ORDER_MISSING');
  if(step==='funding'){
   const funding=await authorizeEscrow(worker,r.keys,base,state.orderId,q=>baseSigner.authorizeFunding(q));
   state.funding={...funding,to:base.registry.contracts.ZeeSwapSettlement.address,data:fundingCall(base,funding.terms,funding.signature),value:'0'};await save();
   result={status:'FUNDING_CALL_SAVED_FOR_SEPARATE_PAYER'};
  }else if(step==='observe-funding'){
   if(!config.fundingTransactionHash)throw Error('CANONICAL_FUNDING_LOOKUP_REQUIRED');
   result=await observeEscrowFunding(worker,r.keys,base,state.orderId,config.fundingTransactionHash);
  }else if(step==='prepare-commit'||step==='prepare-settle'){
   const phase=step==='prepare-commit'?'COMMIT':'SETTLE';
   result=await leased(async(job,owner,check)=>{
    if(phase==='SETTLE'){await observeReversePayout(worker,r.keys,state.orderId,zcash);await worker.query('SELECT zee.check_reverse_delivery($1)',[state.orderId]);}
    const terms=await escrowTerms(worker,r.keys,base,state.orderId),signed=await baseSigner.prepareEscrow(terms,phase);await check();
    if(phase==='COMMIT')await storeEscrowCommit(worker,r.keys,base,state.orderId,job.id,owner,job.fence,signed);
    else await storeEscrowSettlement(worker,r.keys,base,state.orderId,job.id,owner,job.fence,signed);
    return {status:`${phase}_SIGNED_DURABLY`};
   });
  }else if(step==='broadcast-commit')result=await baseBroadcast('COMMIT');
  else if(step==='broadcast-settle')result=await baseBroadcast('SETTLE');
  else if(step==='observe-commit')result=await observeEscrowCommit(worker,r.keys,base,state.orderId);
  else if(step==='approve-wallet'){
   if((await observeEscrowCommit(worker,r.keys,base,state.orderId)).status!=='COMMIT_FINALIZED')throw Error('FINALIZED_COMMIT_REQUIRED');
   const terms=await escrowTerms(worker,r.keys,base,state.orderId),q=await reversePayoutTerms(worker,r.keys,state.orderId);
   const row=(await worker.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1',[state.orderId])).rows[0];
   const proof=r.keys.open(row.receipt_payload,`escrow-proof:${state.orderId}:v1`) as any;
   const approved={version:1,orderId:state.orderId,settlementId:terms.id,recipient:q.recipient,amountZatoshi:q.amountZatoshi,maxFeeZatoshi:q.maxFeeZatoshi,
    base:{chainId:84532,contract:base.registry.contracts.ZeeSwapSettlement.address,token:terms.token,payer:terms.payer,refundRecipient:terms.refundRecipient,
     amountAtomic:terms.amount,cancellationAvailableAt:terms.cancellationAvailableAt,commitTxHash:proof.transactionHash,commitBlockNumber:String(proof.blockHeight),commitBlockHash:proof.blockHash}};
   const digest=approvalDigest(approved);
   if(state.approvedDigest&&state.approvedDigest!==digest)throw Error('IMMUTABLE_WALLET_APPROVAL_CONFLICT');
   state.approvedRequest=approved;state.approvedDigest=digest;await save();
   await durable(resolve(config.approvedRequest),approved);
   if(config.baseSignerApprovedRequestFile)await durable(resolve(config.baseSignerApprovedRequestFile),approved);
   // Optional fixed local/UNC config paths let the operator provision the same
   // immutable approval in the narrow SDK and Base signer services.
   if(config.zcashPrivateConfig){
    const p=JSON.parse(await readFile(config.zcashPrivateConfig,'utf8'));
    const index=p.preflightCommand.indexOf('--approved-digest');if(index<0||index+1>=p.preflightCommand.length)throw Error('PRIVATE_PREFLIGHT_DIGEST_ARG_MISSING');
    if(p.approvedDigest!==digest&&!/^0{64}$/.test(p.approvedDigest))throw Error('PRIVATE_WALLET_APPROVAL_ALREADY_BOUND');
    p.approvedDigest=digest;p.preflightCommand[index+1]=digest;await durable(config.zcashPrivateConfig,p);
   }
   if(config.baseSignerPrivateConfig){
    const p=JSON.parse(await readFile(config.baseSignerPrivateConfig,'utf8'));
    if(p.reverseApprovedDigest&&p.reverseApprovedDigest!==digest&&!/^0{64}$/.test(p.reverseApprovedDigest))throw Error('PRIVATE_BASE_APPROVAL_ALREADY_BOUND');
    p.reverseApprovedDigest=digest;await durable(config.baseSignerPrivateConfig,p);
   }
   config.approvedDigest=digest;await durable(resolve(path),config);result={status:'IMMUTABLE_PRIVATE_WALLET_APPROVAL_SAVED'};
  }
  else if(step==='observe-settle')result=await observeEscrowSettlement(worker,r.keys,base,state.orderId);
  else if(step==='prepare-zcash'||step==='recover-zcash')result=await leased(async(job,owner,check)=>{
   await worker.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,job.id,owner,job.fence]);
   const prepared=step==='recover-zcash'?await zcash.recover():await zcash.prepare();await check();
   await storeReversePayout(worker,r.keys,state.orderId,job.id,owner,job.fence,prepared,zcash);return {status:'ZCASH_SIGNED_DURABLY'};
  });
  else if(step==='broadcast-zcash')result=await leased(async(job,owner,check)=>{
   const row=(await worker.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[state.orderId])).rows[0];if(!row)throw Error('DURABLE_ZCASH_PAYOUT_MISSING');
   if(row.confirmed)return {status:'ZCASH_ALREADY_FINALIZED'};
   const prepared=r.keys.open(row.signed_payload,`reverse-payout:${state.orderId}:v1`) as PreparedZcashTransaction;
   const terms=await reversePayoutTerms(worker,r.keys,state.orderId);await zcash.verifyPrepared(prepared,terms);await check();
   await worker.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,job.id,owner,job.fence]);
   await zcash.broadcast(prepared,terms);return {status:'AWAITING_ZCASH_FINALITY'};
  });
  else if(step==='observe-zcash')result=await observeReversePayout(worker,r.keys,state.orderId,zcash);
 }
 console.log(JSON.stringify(result));
}catch(error){
 state.lastFailure={step,time:new Date().toISOString(),name:(error as any)?.name??'Error',message:String((error as any)?.message??'unknown').slice(0,4000)};
 await save().catch(()=>{});
 await admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});
 console.error('REVERSE_OPERATOR_STEP_FAILED: reconcile the private state, original transaction and signer journal');process.exitCode=1;
}finally{
 // Every named operator step ends paused. The operator explicitly re-enables
 // only the next approved step after refreshing observers and reconciliation.
 try{await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');}
 catch{console.error('REVERSE_OPERATOR_PAUSE_FAILED');process.exitCode=1;}
 await Promise.all([worker.end(),api.end(),admin.end()]);
}
