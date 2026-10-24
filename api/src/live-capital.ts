import {validateSnapshot} from './observer.ts';
import type {ReverseCapitalProof} from './reverse-capital.ts';

export interface LiveCapitalApproval {
 fundingTxid:string;expectedAmountZatoshi:string;birthday:number;
 principalZatoshi:string;feeZatoshi:string;
}
/** New testnet inventory gate. Existing fixed historical reverse proofs remain
 * unchanged. An independently captured physical note may exceed the explicitly
 * allocated ledger capital; its remainder is reported, never silently credited. */
export function validateLiveCapital(value:unknown,a:LiveCapitalApproval) {
 const p=value as ReverseCapitalProof,s=validateSnapshot(p?.snapshot);
 const positive=(n:unknown):n is string=>typeof n==='string' && /^[1-9][0-9]*$/.test(n);
 if(!/^[0-9a-f]{64}$/.test(a.fundingTxid) || !positive(a.expectedAmountZatoshi) || !positive(a.principalZatoshi) || !positive(a.feeZatoshi)
  ||!Number.isSafeInteger(a.birthday)||a.birthday<4532047||BigInt(a.expectedAmountZatoshi)>12500000n
  ||BigInt(a.principalZatoshi)+BigInt(a.feeZatoshi)>BigInt(a.expectedAmountZatoshi))throw Error('INVALID_LIVE_CAPITAL_APPROVAL');
 if(p.version!==1||p.fundingTxid!==a.fundingTxid||p.capitalBalanceZatoshi!==a.expectedAmountZatoshi||p.capitalNotes?.length!==1)
  throw Error('LIVE_CAPITAL_PHYSICAL_AMOUNT_MISMATCH');
 const note=p.capitalNotes[0]!;
 if(note.txid!==a.fundingTxid||note.pool!=='ironwood'||note.value!==a.expectedAmountZatoshi||!Number.isSafeInteger(note.index)||note.index<0
  ||!Number.isSafeInteger(note.height)||note.height<a.birthday||s.scannedHeight-note.height+1<10
  ||s.blocks.find(b=>b.height===note.height)?.hash!==note.blockHash)throw Error('LIVE_CAPITAL_UNCONFIRMED_OR_UNAPPROVED');
 const outputs=s.outputs.filter(o=>o.txid===note.txid&&o.pool===note.pool&&o.index===note.index);
 if(outputs.length!==1||outputs[0]!.amount!==a.expectedAmountZatoshi||outputs[0]!.height!==note.height||outputs[0]!.blockHash!==note.blockHash||outputs[0]!.shieldedSource!==true)
  throw Error('LIVE_CAPITAL_INDEPENDENT_RECEIPT_MISSING');
 return {proof:p,principalZatoshi:a.principalZatoshi,feeZatoshi:a.feeZatoshi,
  unallocatedZatoshi:(BigInt(a.expectedAmountZatoshi)-BigInt(a.principalZatoshi)-BigInt(a.feeZatoshi)).toString()};
}
