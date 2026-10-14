import { validateSnapshot,type Snapshot } from './observer.ts';

export interface ReverseCapitalProof {
 version:1;fundingTxid:string;capitalBalanceZatoshi:string;
 capitalNotes:{pool:'ironwood';txid:string;index:number;value:string;height:number;blockHash:string}[];
 snapshot:Snapshot;
}
/** An operator captures this private artifact from the actual SDK notes and
 * canonical provider, including independent decrypted funding evidence. It is
 * not accepted over HTTP or inferred from a caller-supplied balance/txid.
 */
export function validateReverseCapital(value:unknown,approvedFundingTxid:string):ReverseCapitalProof {
 const p=value as ReverseCapitalProof,s=validateSnapshot(p?.snapshot);
 if(p.version!==1||!/^[0-9a-f]{64}$/.test(approvedFundingTxid)||p.fundingTxid!==approvedFundingTxid
  ||p.capitalBalanceZatoshi!=='200000'||p.capitalNotes.length!==1)throw Error('INVALID_REVERSE_CAPITAL_PROOF');
 const note=p.capitalNotes[0];
 if(note.txid!==approvedFundingTxid||note.pool!=='ironwood'||note.value!=='200000'||!Number.isSafeInteger(note.index)||note.index<0
  ||!Number.isSafeInteger(note.height)||note.height<=0||s.scannedHeight-note.height+1<10
  ||s.blocks.find(b=>b.height===note.height)?.hash!==note.blockHash)throw Error('UNCONFIRMED_OR_UNAPPROVED_REVERSE_CAPITAL');
 const output=s.outputs.filter(o=>o.txid===note.txid&&o.pool===note.pool&&o.index===note.index);
 if(output.length!==1||output[0].amount!=='200000'||output[0].height!==note.height||output[0].blockHash!==note.blockHash||output[0].shieldedSource!==true)
  throw Error('INDEPENDENT_SHIELDED_CAPITAL_RECEIPT_MISSING');
 return p;
}

export interface CapitalOpening {version:1;eventId:string;fundingTxid:string;tazPrincipal:string;tazFee:string;baseFee:string;proofDigest:string}
export function validateCapitalOpening(o:CapitalOpening,fundingTxid:string,currentBaseFee:string,
 ledger:{asset:string;bucket:string;amount:string}[],accounts:{asset:string;purpose:string;balance:string;reserved:string}[]){
 if(o.version!==1||!o.eventId||o.fundingTxid!==fundingTxid||o.tazPrincipal!=='190000'||o.tazFee!=='10000'
  ||!/^[1-9][0-9]*$/.test(o.baseFee)||BigInt(o.baseFee)<100000000000000n)throw Error('OPENING_CAPITAL_INTENT_CONFLICT');
 if(o.baseFee!==currentBaseFee)throw Error('OPENING_BASE_CAPITAL_CHANGED');
 if(!ledger.length)return;
 const expected=[['TAZ','principal','190000'],['TAZ','fee','10000'],['baseETH','fee',o.baseFee]];
 if(ledger.length!==6||accounts.length!==3)throw Error('CAPITAL_OPENING_RETRY_INCONSISTENT');
 for(const [asset,purpose,amount] of expected){
  if(ledger.filter(e=>e.asset===asset&&e.bucket===purpose+':available'&&e.amount===amount).length!==1
   ||ledger.filter(e=>e.asset===asset&&e.bucket===purpose+':operator-capital'&&e.amount==='-'+amount).length!==1
   ||accounts.filter(a=>a.asset===asset&&a.purpose===purpose&&a.balance===amount&&a.reserved==='0').length!==1)
   throw Error('CAPITAL_OPENING_RETRY_INCONSISTENT');
 }
}
