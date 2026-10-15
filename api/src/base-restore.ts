import type pg from 'pg';
import { getAddress, type Hex } from 'viem';
import { transaction } from './db.ts';
import { BaseContract, publicSettlementId, authNonce, type PayoutTerms, type BasePhase } from './base-contract.ts';
import { validatePrepared, type PreparedBaseTransaction } from './base-signer.ts';
import { reconcileBaseReceipts } from './base-settlement.ts';
import type { PrivateData } from './private-data.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export interface ForwardRestoreJournal {
 terms:PayoutTerms; signature:Hex;
 attempts:Record<BasePhase,PreparedBaseTransaction>;
}

/** Read the independent restricted signer's existing on-disk journal format. */
export async function readForwardRestoreJournal(directory:string,id:Hex):Promise<ForwardRestoreJournal>{
 if(!/^0x[0-9a-f]{64}$/.test(id))throw Error('RESTORE_JOURNAL_ID');
 const identifier=createHash('sha256').update(id).digest('hex');
 try{
  const load=async(suffix:string)=>JSON.parse(await readFile(join(directory,identifier+suffix),'utf8'));
  const auth=await load('.auth.json'),reserve=await load('.RESERVE.tx.json'),pay=await load('.PAY.tx.json');
  if(JSON.stringify(reserve.terms)!==JSON.stringify(auth.terms)||JSON.stringify(pay.terms)!==JSON.stringify(auth.terms))throw Error('conflicting terms');
  const signed=(entry:any):PreparedBaseTransaction=>({raw:entry.raw,hash:entry.hash,nonce:entry.nonce,maxCost:entry.maxCost});
  return {terms:auth.terms,signature:auth.signature,attempts:{RESERVE:signed(reserve),PAY:signed(pay)}};
 }catch{throw Error('RESTORE_JOURNAL_UNAVAILABLE_OR_CORRUPT');}
}

/** Operator-only reconstruction after an old snapshot. Never signs or broadcasts.
 * Requires the database owner connection; ordinary workers cannot insert attempts.
 * Both finalized phases must be independently verifiable before any import.
 * This deliberately does not clear reconciliation or reopen dispatch.
 */
export async function restoreFinalizedForward(admin:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,journal:ForwardRestoreJournal){
 const context=`base-terms:${orderId}:v1`;
 const row=(await admin.query(`SELECT q.*,b.terms_payload FROM zee.quotes q JOIN zee.base_bindings b ON b.order_id=q.id WHERE q.id=$1`,[orderId])).rows[0];
 if(!row||row.execution_mode!=='base-settlement-v1'||row.direction!=='ZCASH_TO_BASE'||row.base_contract.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase())throw Error('RESTORE_BINDING_MISSING');
 const terms=keys.open(row.terms_payload,context) as PayoutTerms;
 const quote=keys.open(row.private_payload,`quote:${orderId}:v1`) as any;
 if(!journal?.terms||!journal.signature||!journal.attempts?.RESERVE||!journal.attempts.PAY)throw Error('RESTORE_JOURNAL_INCOMPLETE');
 if(Object.keys(terms).some(k=>terms[k as keyof PayoutTerms]!==journal.terms[k as keyof PayoutTerms])
  ||Object.keys(journal.terms).length!==Object.keys(terms).length||terms.id!==publicSettlementId(row.settlement_id)
  ||quote.executionMode!==row.execution_mode||quote.baseContract?.toLowerCase()!==row.base_contract.toLowerCase()
  ||terms.amount!==row.output_amount||quote.outputAmount!==terms.amount||terms.nonce!==authNonce(terms.id,'Payout')
  ||getAddress(terms.recipient)!==getAddress(quote.recipient)||getAddress(terms.token)!==getAddress(base.registry.contracts.MockUSDC.address))throw Error('RESTORE_IMMUTABLE_TERMS_MISMATCH');
 // Control is checked again under lock immediately before mutation, preventing
 // an administrator reopening dispatch during the external receipt checks.
 const control=(await admin.query('SELECT * FROM zee.runtime_control WHERE singleton')).rows[0];
 if(!control?.reconciliation_required||control.dispatch_enabled||control.accepting_orders)throw Error('RESTORE_REQUIRES_PAUSE');
 await base.preflight();
 for(const phase of ['RESERVE','PAY'] as const){
  const signed=journal.attempts[phase];
  await validatePrepared(base.registry,terms,journal.signature,phase,signed);
  if(!await base.receipt(signed.hash,phase,terms))throw Error('RESTORE_RECEIPT_NOT_FINALIZED');
 }
 if(journal.attempts.PAY.nonce<=journal.attempts.RESERVE.nonce)throw Error('RESTORE_NONCE_ORDER');
 await transaction(admin,async c=>{
  const paused=(await c.query('SELECT * FROM zee.runtime_control WHERE singleton FOR UPDATE')).rows[0];
  if(!paused.reconciliation_required||paused.dispatch_enabled||paused.accepting_orders||paused.epoch!==control.epoch)throw Error('RESTORE_CONTROL_CHANGED');
  await c.query('SELECT order_id FROM zee.base_bindings WHERE order_id=$1 FOR UPDATE',[orderId]);
  const attempts=(await c.query('SELECT * FROM zee.base_attempts WHERE order_id=$1',[orderId])).rows;
  const total=(['RESERVE','PAY'] as const).reduce((n,phase)=>n+BigInt(attempts.find(a=>a.phase===phase)?.actual_fee??journal.attempts[phase].maxCost),0n);
  if(total>BigInt(row.payout_fee))throw Error('RESTORE_GAS_RESERVATION_EXCEEDED');
  for(const phase of ['RESERVE','PAY'] as const){
   const signed=journal.attempts[phase],previous=attempts.find(a=>a.phase===phase);
   if(previous){
    const stored=keys.open(previous.signed_payload,`base-signed:${orderId}:${phase}:v1`) as PreparedBaseTransaction;
    if(!previous.tx_hash.equals(keys.lookup('base-tx',signed.hash))||stored.raw!==signed.raw||previous.max_cost!==signed.maxCost)throw Error('RESTORE_ATTEMPT_CONFLICT');
    continue;
   }
   await c.query(`INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES($1,$2,$3,$4,$5)`,
    [orderId,phase,keys.lookup('base-tx',signed.hash),keys.seal(signed,`base-signed:${orderId}:${phase}:v1`),signed.maxCost]);
   await c.query('INSERT INTO zee.order_events(order_id,event_type) VALUES($1,$2)',[orderId,`BASE_${phase}_RESTORED_FROM_JOURNAL`]);
  }
 });
 // The established observer matches canonical finalized receipts, discharges
 // obligations and books exact principal/gas once. Pause stays in place.
 return reconcileBaseReceipts(admin,keys,base);
}
