import type pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeFunctionData,getAddress,keccak256,parseTransaction,recoverTransactionAddress,type Hex,type TransactionSerialized } from 'viem';
import { transaction } from './db.ts';
import { BaseContract,settlementAbi } from './base-contract.ts';
import { escrowTerms,escrowState,escrowEvents,finalizedReceipt,type FundingTerms } from './base-escrow.ts';
import type { PreparedBaseTransaction } from './base-signer.ts';
import type { PrivateData } from './private-data.ts';
import { canonicalJson,approvalDigest } from './reverse-authority.ts';
import { reversePayoutTerms,validatePreparedZcash,observeReversePayout,observeEscrowSettlement,requireFreshReverseDelivery,
 type PreparedZcashTransaction,type ReverseZcashVerifier,type VerifiedZcashReceipt,type ReversePayoutTerms } from './reverse-settlement.ts';

export interface ReverseRestoreJournal {
 approved:any;approvedDigest:string;fundingTerms:FundingTerms;fundingSignature:Hex;
 prepared:PreparedZcashTransaction;delivery:VerifiedZcashReceipt;
 commit:PreparedBaseTransaction;settle:PreparedBaseTransaction;
}

/** Read existing restricted Base and prepared-raw journal formats. The expected
 * digest comes from the operator's immutable approved configuration.
 */
export async function readReverseRestoreJournal(zcashJournalPath:string,baseJournalDirectory:string,id:Hex,expectedDigest:string):Promise<ReverseRestoreJournal>{
 if(!/^0x[0-9a-f]{64}$/.test(id)||!/^[0-9a-f]{64}$/.test(expectedDigest))throw Error('REVERSE_RESTORE_JOURNAL_AUTHORITY');
 try{
  const load=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
  const z=await load(zcashJournalPath),identifier=createHash('sha256').update(id).digest('hex');
  const auth=await load(join(baseJournalDirectory,identifier+'.reverse.auth.json'));
  const commit=await load(join(baseJournalDirectory,identifier+'.COMMIT.tx.json'));
  const settle=await load(join(baseJournalDirectory,identifier+'.SETTLE.tx.json'));
  if(z.state!=='DELIVERY_CONFIRMED'||z.approvedDigest!==expectedDigest||approvalDigest(z.request)!==expectedDigest||!z.prepared||!z.receipt
   ||z.receipt.approvedDigest!==expectedDigest||z.receipt.orderId!==z.request.orderId
   ||canonicalJson(auth.terms)!==canonicalJson(commit.terms)||canonicalJson(auth.terms)!==canonicalJson(settle.terms)||auth.terms.id!==id)throw Error('invalid journal');
  const signed=(entry:any):PreparedBaseTransaction=>({raw:entry.raw,hash:entry.hash,nonce:entry.nonce,maxCost:entry.maxCost});
  const proof=z.receipt;
  if(proof.confirmed!==true||proof.shielded!==true||proof.confirmations!==Number(proof.tipHeight)-Number(proof.blockHeight)+1)throw Error('incomplete delivery');
  return {approved:z.request,approvedDigest:z.approvedDigest,fundingTerms:auth.terms,fundingSignature:auth.signature,
   prepared:z.prepared,commit:signed(commit),settle:signed(settle),delivery:{
    txid:proof.txid,blockHeight:Number(proof.blockHeight),blockHash:proof.blockHash,tipHeight:Number(proof.tipHeight),tipHash:proof.tipHash,
    observedAt:proof.observedAt,amountZatoshi:proof.amount,feeZatoshi:proof.fee,recipient:proof.recipient,shielded:true,pool:'ironwood'}};
 }catch{throw Error('REVERSE_RESTORE_JOURNAL_UNAVAILABLE_OR_CORRUPT');}
}

function validateProof(proof:VerifiedZcashReceipt,p:PreparedZcashTransaction,q:ReversePayoutTerms){
 if(proof.txid!==p.txid||proof.recipient!==q.recipient||proof.amountZatoshi!==q.amountZatoshi||proof.feeZatoshi!==p.feeZatoshi
  ||proof.shielded!==true||proof.pool!=='ironwood'||![proof.blockHeight,proof.tipHeight].every(h=>Number.isSafeInteger(h)&&h>0)
  ||proof.tipHeight-proof.blockHeight+1<10||BigInt(proof.blockHeight)>BigInt(p.expiryHeight)
  ||!/^[0-9a-f]{64}$/.test(proof.blockHash)||!/^[0-9a-f]{64}$/.test(proof.tipHash)
  ||!Number.isFinite(Date.parse(proof.observedAt))||Date.now()-Date.parse(proof.observedAt)>60000||Date.parse(proof.observedAt)>Date.now()+5000)throw Error('REVERSE_RESTORE_FRESH_DELIVERY_REQUIRED');
}

async function validateBaseBytes(base:BaseContract,id:Hex,phase:'COMMIT'|'SETTLE',signed:PreparedBaseTransaction){
 const tx=parseTransaction(signed.raw);
 if(tx.type!=='legacy'||tx.chainId!==84532||keccak256(signed.raw)!==signed.hash||!Number.isSafeInteger(signed.nonce)||signed.nonce<0||tx.nonce!==signed.nonce
  ||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(base.registry.operator)
  ||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
  ||tx.data!==encodeFunctionData({abi:settlementAbi,functionName:phase==='COMMIT'?'commitPayout':'settleEscrow',args:[id]})
  ||!tx.gas||tx.gas>450000n||!tx.gasPrice||tx.gasPrice>20000000n||!/^[1-9][0-9]*$/.test(signed.maxCost)
  ||BigInt(signed.maxCost)>10000000000000n||tx.gas*tx.gasPrice>BigInt(signed.maxCost))throw Error('REVERSE_RESTORE_BASE_BYTES_MISMATCH');
}

/** Owner-only old-snapshot recovery for already finalized two-chain delivery.
 * Never signs/broadcasts, never enables dispatch and never resolves an unknown
 * committed delivery by refunding or constructing a replacement transaction.
 */
export async function restoreFinalizedReverse(admin:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,journal:ReverseRestoreJournal,verifier:ReverseZcashVerifier){
 const control=(await admin.query('SELECT * FROM zee.runtime_control WHERE singleton')).rows[0];
 if(!control?.reconciliation_required||control.dispatch_enabled||control.accepting_orders)throw Error('REVERSE_RESTORE_REQUIRES_PAUSE');
 const commitRow=(await admin.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1',[orderId])).rows[0];
 if(!commitRow?.confirmed)throw Error('REVERSE_RESTORE_COMMIT_UNKNOWN');
 if(!journal?.prepared||!journal.delivery||!journal.commit||!journal.settle||!journal.approved)throw Error('REVERSE_RESTORE_JOURNAL_INCOMPLETE');
 const funding=await escrowTerms(admin,keys,base,orderId),terms=await reversePayoutTerms(admin,keys,orderId);
 const binding=(await admin.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[orderId])).rows[0];
 const pinned=keys.open(binding.terms_payload,`escrow-terms:${orderId}:v1`) as {terms:FundingTerms;signature:Hex};
 const approved=journal.approved;
 if(canonicalJson(pinned.terms)!==canonicalJson(funding)||canonicalJson(journal.fundingTerms)!==canonicalJson(funding)||pinned.signature!==journal.fundingSignature
  ||approvalDigest(approved)!==journal.approvedDigest||approved.version!==1||approved.base?.chainId!==84532||approved.orderId!==orderId||approved.settlementId!==funding.id
  ||approved.recipient!==terms.recipient||approved.amountZatoshi!==terms.amountZatoshi||approved.maxFeeZatoshi!==terms.maxFeeZatoshi
  ||approved.base?.contract?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()
  ||approved.base?.token?.toLowerCase()!==funding.token.toLowerCase()||approved.base?.payer?.toLowerCase()!==funding.payer.toLowerCase()
  ||approved.base?.refundRecipient?.toLowerCase()!==funding.refundRecipient.toLowerCase()||approved.base?.amountAtomic!==funding.amount
  ||approved.base?.cancellationAvailableAt!==funding.cancellationAvailableAt||approved.base?.commitTxHash!==journal.commit.hash
  ||approved.base?.commitBlockNumber!==String(commitRow.block_height)||approved.base?.commitBlockHash!==`0x${commitRow.block_hash}`)throw Error('REVERSE_RESTORE_IMMUTABLE_AUTHORITY_MISMATCH');
 validatePreparedZcash(journal.prepared,terms);
 await verifier.verifyPrepared(journal.prepared,terms);
 const delivery=await verifier.receipt(journal.prepared,terms);
 if(!delivery)throw Error('REVERSE_RESTORE_COMMITTED_DELIVERY_UNKNOWN');
 validateProof(delivery,journal.prepared,terms);
 const identity=(p:VerifiedZcashReceipt)=>canonicalJson({txid:p.txid,blockHeight:p.blockHeight,blockHash:p.blockHash,amount:p.amountZatoshi,fee:p.feeZatoshi,recipient:p.recipient,shielded:p.shielded,pool:p.pool});
 if(identity(delivery)!==identity(journal.delivery))throw Error('REVERSE_RESTORE_DELIVERY_CHANGED');
 await base.preflight();
 await validateBaseBytes(base,funding.id,'COMMIT',journal.commit);await validateBaseBytes(base,funding.id,'SETTLE',journal.settle);
 const storedCommit=keys.open(commitRow.signed_payload,`escrow-commit:${orderId}:v1`) as PreparedBaseTransaction;
 if(storedCommit.raw!==journal.commit.raw||!commitRow.tx_hash.equals(keys.lookup('base-tx',journal.commit.hash))||commitRow.max_cost!==journal.commit.maxCost)throw Error('REVERSE_RESTORE_COMMIT_CONFLICT');
 const commit=await finalizedReceipt(base,journal.commit.hash),settle=await finalizedReceipt(base,journal.settle.hash);
 if(!commit||!settle)throw Error('REVERSE_RESTORE_BASE_RECEIPT_UNKNOWN');
 const commitEvents=escrowEvents(base,commit.receipt,'PayoutCommitted'),settleEvents=escrowEvents(base,settle.receipt,'EscrowSettled');
 if(commitEvents.length!==1||commitEvents[0].args.id!==funding.id||Number(commit.receipt.blockNumber)!==Number(commitRow.block_height)
  ||commit.receipt.blockHash.slice(2)!==commitRow.block_hash||settleEvents.length!==1||settleEvents[0].args.id!==funding.id
  ||settleEvents[0].args.amount!==BigInt(funding.amount)||settle.receipt.blockNumber<=commit.receipt.blockNumber||journal.settle.nonce<=journal.commit.nonce
  ||await escrowState(base,funding,commit.receipt.blockNumber)!==5||await escrowState(base,funding,settle.heads.finalized.number)!==6)throw Error('REVERSE_RESTORE_BASE_RECEIPT_MISMATCH');
 const quote=(await admin.query('SELECT refund_fee FROM zee.quotes WHERE id=$1',[orderId])).rows[0];
 if(BigInt(commitRow.actual_fee)+BigInt(journal.settle.maxCost)>BigInt(quote.refund_fee))throw Error('REVERSE_RESTORE_BASE_FEE_CAP');
 await transaction(admin,async c=>{
  const paused=(await c.query('SELECT * FROM zee.runtime_control WHERE singleton FOR UPDATE')).rows[0];
  if(!paused.reconciliation_required||paused.dispatch_enabled||paused.accepting_orders||paused.epoch!==control.epoch)throw Error('REVERSE_RESTORE_CONTROL_CHANGED');
  await c.query('SELECT id FROM zee.orders WHERE id=$1 FOR UPDATE',[orderId]);
  const previous=(await c.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[orderId])).rows[0];
  if(previous){
   const stored=keys.open(previous.signed_payload,`reverse-payout:${orderId}:v1`);
   if(canonicalJson(stored)!==canonicalJson(journal.prepared)||!previous.tx_hash.equals(keys.lookup('zcash-tx',journal.prepared.txid)))throw Error('REVERSE_RESTORE_PAYOUT_CONFLICT');
  }else{
   await c.query('INSERT INTO zee.reverse_payouts(order_id,tx_hash,signed_payload,fee,max_cost,expiry_height) VALUES($1,$2,$3,$4,$4,$5)',[orderId,keys.lookup('zcash-tx',journal.prepared.txid),keys.seal(journal.prepared,`reverse-payout:${orderId}:v1`),journal.prepared.feeZatoshi,journal.prepared.expiryHeight]);
   await c.query('INSERT INTO zee.order_events(order_id,event_type) VALUES($1,$2)',[orderId,'ZCASH_PAYOUT_RESTORED_FROM_JOURNAL']);
  }
  const priorSettle=(await c.query('SELECT * FROM zee.escrow_settlements WHERE order_id=$1',[orderId])).rows[0];
  if(priorSettle){
   const stored=keys.open(priorSettle.signed_payload,`escrow-settle:${orderId}:v1`) as PreparedBaseTransaction;
   if(stored.raw!==journal.settle.raw||priorSettle.max_cost!==journal.settle.maxCost||!priorSettle.tx_hash.equals(keys.lookup('base-tx',journal.settle.hash)))throw Error('REVERSE_RESTORE_SETTLE_CONFLICT');
  }else{
   await c.query('INSERT INTO zee.escrow_settlements(order_id,tx_hash,signed_payload,max_cost) VALUES($1,$2,$3,$4)',[orderId,keys.lookup('base-tx',journal.settle.hash),keys.seal(journal.settle,`escrow-settle:${orderId}:v1`),journal.settle.maxCost]);
   await c.query('INSERT INTO zee.order_events(order_id,event_type) VALUES($1,$2)',[orderId,'BASE_SETTLE_RESTORED_FROM_JOURNAL']);
  }
 });
 // Re-read canonical delivery through the same production verifier immediately
 // before the existing SETTLE accounting. Historic confirmed flags cannot pass.
 return requireFreshReverseDelivery(()=>observeReversePayout(admin,keys,orderId,verifier),()=>observeEscrowSettlement(admin,keys,base,orderId));
}
