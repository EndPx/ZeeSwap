/** Explicit isolated testnet refund steps; private state never goes to stdout.
 * The reverse funding steps also work before the refund migration is applied.
 * No step commits a reverse escrow or permits a Zcash reverse payout.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {getAddress,zeroAddress} from 'viem';
import {connect} from '../src/db.ts';
import {runtime} from './runtime.ts';
import {requireExplicitObserverWallet} from '../src/explicit-observer-wallet.ts';
import {BaseContract,loadBaseRegistry} from '../src/base-contract.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
import {Repository} from '../src/repository.ts';
import {accessHash} from '../src/private-data.ts';
import {LocalReverseBaseSigner,LocalBaseSigner,type PreparedBaseTransaction} from '../src/base-signer.ts';
import {authorizeEscrow,fundingCall,observeEscrowFunding,escrowTerms} from '../src/base-escrow.ts';
import {savePrivate} from './live-forward-state.ts';
import {sourceRefundTerms,sourceRefundCall,refundContext,validateRefundBaseTransaction,assertReverseRefundEligible,observeSourceRefundBase,
 forwardRefundPayoutTerms,storeForwardRefund,observeForwardRefund,verifyBaseRefund} from '../src/source-refunds.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import type {PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import {requireRefundTarget} from '../src/refund-incident.ts';
import {assertIncidentRefund,refreshIncidentRefundHeaders} from './refund-incident-context.ts';

const [step,path]=process.argv.slice(2);
if(!['quote-reverse','quote-forward','funding','observe-reverse','begin','approve-base','prepare-base','broadcast-base','observe-base',
 'approve-wallet','prepare-zcash','recover-zcash','broadcast-zcash','observe-zcash','refresh-headers','status'].includes(step)||!path||process.argv.length!==4)
 throw Error('One explicit refund step and private config required');
const config=JSON.parse(await readFile(path,'utf8'));
process.env.ZEE_WALLET_CONFIG=await requireExplicitObserverWallet(config);
const database=JSON.parse(await readFile(resolve(config.databaseConfig),'utf8'));
const incident=requireRefundTarget(config,database,[],step);
process.env.ZEE_RUNTIME_CONFIG=resolve(config.runtimeConfig);
const r=await runtime(true),worker=connect(r.workerUrl),api=connect(r.apiUrl),admin=connect(database.adminUrl);
const base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl));
requireRefundTarget(config,database,[r.workerUrl,r.apiUrl],step);
const statePath=resolve(config.stateFile);
let state:any,exists=true;
try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if((error as any).code!=='ENOENT')throw error;state={version:1};exists=false;}
const save=()=>savePrivate(statePath,state,!exists).then(()=>{exists=true;});
try{
 if(incident){
  const source=await assertIncidentRefund(config,state,worker,r.keys,base);
  if(step!=='status'){
   await refreshIncidentRefundHeaders(config,worker,base,source.row.deposit_id);
   await assertIncidentRefund(config,state,worker,r.keys,base);
  }
 }
 const health=await base.preflight();let result:unknown;
 if(step==='refresh-headers'){
  if(!incident)throw Error('Incident header refresh requires existing recovery mode');
  result={status:'INCIDENT_CANONICAL_HEADERS_REFRESHED'};
 }else if(step==='quote-reverse'||step==='quote-forward'){
  if(config.inputAmount!=='100000'||config.baseFeeBudget!=='100000000000000')throw Error('Exact approved refund experiment cap required');
  const reverse=step==='quote-reverse';
  const recipient=reverse?await r.wallet.validate(config.recipient):getAddress(config.recipient);
  if(!reverse&&(recipient===zeroAddress||recipient===getAddress(base.registry.contracts.ZeeSwapSettlement.address)
   ||BigInt(health.availableInventory)<100000n||await base.client.getBalance({address:base.registry.operator})<BigInt(config.baseFeeBudget)))
   throw Error('Executable forward refund quote inventory/recipient preflight required');
  const refundRecipient=reverse?config.refundRecipient:await r.wallet.validate(config.refundRecipient);
  if(!state.owner){state.owner=randomBytes(32).toString('base64url');await save();}
  const quotes=(await api.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(state.owner)])).rows;
  if(quotes.length>1||(state.orderId&&quotes[0]?.id!==state.orderId))throw Error('Refund quote recovery conflict');
  let id=quotes[0]?.id;
  if(!id){const depositReceiver=reverse?'pending':await r.wallet.allocate();
   const q=await new Repository(api,r.keys).issueQuote({direction:reverse?'BASE_TO_ZCASH':'ZCASH_TO_BASE',inputAmount:'100000',recipient,
   payer:reverse?config.payer:undefined,refundRecipient,depositReceiver,payoutFee:reverse?'10000':config.baseFeeBudget,refundFee:reverse?config.baseFeeBudget:'10000',
   executionMode:reverse?'base-escrow-v1':'base-settlement-v1',baseContract:base.registry.contracts.ZeeSwapSettlement.address},state.owner);id=q.id;}
  const q=await new Repository(api,r.keys).privateQuote(id,state.owner) as any;
  if(q.inputAmount!=='100000'||q.recipient!==recipient||(reverse&&q.payer!==config.payer)||q.refundRecipient!==refundRecipient
   ||q.payoutFee!==(reverse?'10000':config.baseFeeBudget)||q.refundFee!==(reverse?config.baseFeeBudget:'10000')||q.executionMode!==(reverse?'base-escrow-v1':'base-settlement-v1')
   ||q.baseContract!==base.registry.contracts.ZeeSwapSettlement.address)throw Error('Immutable refund quote conflict');
  state.orderId=id;await save();await new Repository(api,r.keys).accept(id,state.owner);
  const order=(await worker.query('SELECT cancellation_available_at,funding_cutoff_height FROM zee.orders WHERE id=$1',[id])).rows[0];
  if(!reverse){state.funding={network:'zcash-testnet',receiver:q.depositReceiver,memo:JSON.stringify({v:1,ref:q.reference}),cutoffHeight:order.funding_cutoff_height,amount:'100000'};await save();}
  result={status:'AWAITING_FUNDS',cancellationAvailableAt:order.cancellation_available_at};
 }else{
  if(!state.orderId)throw Error('Refund order missing');
  if(step==='funding'){
   const signer=new LocalReverseBaseSigner(config.baseSignerCommand,config.baseSignerArgs);
   const funding=await authorizeEscrow(worker,r.keys,base,state.orderId,q=>signer.authorizeFunding(q));
   state.funding={...funding,to:base.registry.contracts.ZeeSwapSettlement.address,data:fundingCall(base,funding.terms,funding.signature),value:'0'};
   await save();result={status:'FUNDING_CALL_SAVED_FOR_SEPARATE_PAYER',cancellationAvailableAt:funding.terms.cancellationAvailableAt};
  }else if(step==='observe-reverse'){
   if(!config.fundingTransactionHash)throw Error('Canonical funding lookup required');
   result=await observeEscrowFunding(worker,r.keys,base,state.orderId,config.fundingTransactionHash);
  }else if(step==='status'){
   result=(await worker.query('SELECT o.state,a.base_phase,a.base_confirmed,a.confirmed,a.base_fee::text FROM zee.orders o LEFT JOIN zee.source_refunds a ON a.order_id=o.id WHERE o.id=$1',[state.orderId])).rows[0];
  }else if(step==='begin'){
   await worker.query('SELECT zee.begin_source_refund($1)',[state.orderId]);result={status:'SOURCE_REFUND_PLANNED'};
  }else{
   const q=await sourceRefundTerms(worker,r.keys,state.orderId),forward=q.row.direction==='ZCASH_TO_BASE',phase=forward?'CANCEL':'REFUND';
   if(step==='approve-base'){
    await worker.query('SELECT zee.check_source_refund_operator($1)',[state.orderId]);
    const terms=forward?null:await escrowTerms(worker,r.keys,base,state.orderId);
    const approved={version:1,kind:'SOURCE_REFUND_BASE',orderId:state.orderId,id:q.id,phase,token:base.registry.contracts.MockUSDC.address,
     payer:terms?.payer??base.registry.operator,refundRecipient:terms?.refundRecipient??base.registry.operator,amount:q.row.received_amount,cancellationAvailableAt:terms?.cancellationAvailableAt??'0'};
    const digest=approvalDigest(approved);
    if(state.baseApprovedDigest&&state.baseApprovedDigest!==digest)throw Error('Immutable Base refund approval conflict');
    await savePrivate(resolve(config.refundBaseApprovedRequest),approved,!state.baseApprovedDigest);
    state.baseApprovedDigest=digest;await save();
    result={status:'IMMUTABLE_BASE_REFUND_APPROVAL_SAVED',approvedDigest:digest};
   }else if(step==='prepare-base'){
    await worker.query('SELECT zee.check_source_refund_operator($1)',[state.orderId]);
    if(!forward)await assertReverseRefundEligible(base,await escrowTerms(worker,r.keys,base,state.orderId));
    class RefundSigner extends LocalBaseSigner {prepareRefund():Promise<PreparedBaseTransaction>{return this.invoke({command:'prepare'});}}
    const signed=await new RefundSigner(config.refundBaseSignerCommand,config.refundBaseSignerArgs).prepareRefund();
    const signer=forward?base.registry.operator:(await escrowTerms(worker,r.keys,base,state.orderId)).payer;
    await validateRefundBaseTransaction(base,q.id,phase,signed,signer);
    await worker.query('SELECT zee.store_source_refund_base($1,$2,$3,$4)',[state.orderId,r.keys.lookup('base-tx',signed.hash),r.keys.seal(signed,refundContext(state.orderId,phase)),signed.maxCost]);
    result={status:'SOURCE_REFUND_BASE_SIGNED_DURABLY'};
   }else if(step==='broadcast-base'||step==='observe-base'){
    const row=(await worker.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId])).rows[0];
    if(!row?.base_payload)throw Error('Durable Base refund attempt required');
    const signed=r.keys.open(row.base_payload,refundContext(state.orderId,phase)) as PreparedBaseTransaction;
    if(step==='observe-base')result=await observeSourceRefundBase(worker,r.keys,base,state.orderId,phase,signed.hash);
    else{
     if(row.base_confirmed)throw Error('Base refund branch already finalized; observe original');
     await worker.query('SELECT zee.check_source_refund_operator($1)',[state.orderId]);
     const signer=forward?base.registry.operator:(await escrowTerms(worker,r.keys,base,state.orderId)).payer;
     await validateRefundBaseTransaction(base,q.id,phase,signed,signer);
     const known=await base.client.getTransaction({hash:signed.hash}).catch(e=>{if(e.name==='TransactionNotFoundError')return null;throw e;});
     if(known)result={status:'AWAITING_BASE_FINALITY'};
     else{
      if(!forward)await assertReverseRefundEligible(base,await escrowTerms(worker,r.keys,base,state.orderId));
      if(await base.client.getTransactionCount({address:signer,blockTag:'latest'})>signed.nonce)throw Error('BASE_REFUND_NONCE_CONFLICT_RECONCILE');
      state.baseBroadcast={hash:signed.hash,status:'UNKNOWN'};await save();
      const hash=await base.client.sendRawTransaction({serializedTransaction:signed.raw});if(hash!==signed.hash)throw Error('Base refund response identity mismatch');
      state.baseBroadcast.status='ACKNOWLEDGED';await save();result={status:'AWAITING_BASE_FINALITY'};
     }
    }
   }else{
    if(!forward)throw Error('Reverse source refund cannot sign Zcash');
    const row=(await worker.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId])).rows[0];
    if(!row?.base_confirmed)throw Error('Finalized permanent Base cancellation required');
    const signed=r.keys.open(row.base_payload,refundContext(state.orderId,'CANCEL')) as PreparedBaseTransaction;
    // Fresh chain verification on every signing/broadcast step, including a
    // re-read of terminal CANCELLED. Old SQL confirmation is insufficient.
    if(['approve-wallet','prepare-zcash','broadcast-zcash'].includes(step)&&!await verifyBaseRefund(base,q.id,'CANCEL',signed.hash))throw Error('Fresh canonical cancellation required');
    if(step==='approve-wallet'){
     const approved={version:1,kind:'ZCASH_SOURCE_REFUND',orderId:state.orderId,depositId:q.row.deposit_id,settlementId:q.id,recipient:q.recipient,
      amountZatoshi:q.row.received_amount,maxFeeZatoshi:q.row.refund_fee,base:{chainId:84532,contract:base.registry.contracts.ZeeSwapSettlement.address,
       token:base.registry.contracts.MockUSDC.address,cancelTxHash:signed.hash,cancelBlockNumber:String(row.base_height),cancelBlockHash:'0x'+row.base_block}};
     const digest=approvalDigest(approved);if(state.approvedDigest&&state.approvedDigest!==digest)throw Error('Immutable source refund wallet approval conflict');
     await savePrivate(resolve(config.approvedRequest),approved,!state.approvedDigest);state.approvedDigest=digest;await save();
     result={status:'IMMUTABLE_SOURCE_REFUND_WALLET_APPROVAL_SAVED',approvedDigest:digest};
    }else{
     const wallet=new LocalReverseWalletAdapter(config.zcashCommand,config.zcashArgs,state.approvedDigest),terms=await forwardRefundPayoutTerms(worker,r.keys,state.orderId);
     if(step==='prepare-zcash'||step==='recover-zcash'){
      await worker.query('SELECT zee.check_source_refund_signing($1)',[state.orderId]);
      const p=step==='prepare-zcash'?await wallet.prepare():await wallet.recover();
      if(incident){await refreshIncidentRefundHeaders(config,worker,base,q.row.deposit_id);await assertIncidentRefund(config,state,worker,r.keys,base);}
      await storeForwardRefund(worker,r.keys,state.orderId,p,wallet);result={status:'SOURCE_REFUND_ZCASH_SIGNED_DURABLY'};
     }else if(step==='observe-zcash')result=await observeForwardRefund(worker,r.keys,state.orderId,wallet);
     else{
      if(!row.zcash_payload||row.confirmed)throw Error('Durable unresolved source refund required');
      const p=r.keys.open(row.zcash_payload,refundContext(state.orderId,'ZCASH')) as PreparedZcashTransaction;
      await worker.query('SELECT zee.check_source_refund_signing($1)',[state.orderId]);await wallet.broadcast(p,terms);result={status:'AWAITING_ZCASH_FINALITY'};
     }
    }
   }
  }
 }
 console.log(JSON.stringify(result));
}catch{
 // Named refund steps start and finish paused. Keep the fixed operation epoch
 // and durable journal recoverable after an ambiguous response; no retry signs
 // different bytes. Independent reconciliation remains mandatory before send.
 console.error('REFUND_OPERATOR_STEP_FAILED: retain private state and reconcile original operation');process.exitCode=1;
}finally{
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false').catch(()=>{process.exitCode=1;});
 await Promise.all([worker.end(),api.end(),admin.end()]);
}
