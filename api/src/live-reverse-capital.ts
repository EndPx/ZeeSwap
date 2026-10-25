import {runRefundQuery,type PolicyWorkerOrderContext} from './testnet-policy-refund.ts';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validatePreparedZcash,type PreparedZcashTransaction,type VerifiedZcashReceipt} from './reverse-settlement.ts';
import {isDeepStrictEqual} from 'node:util';
import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
export type CapitalSource={kind:'opening'|'settled-source'|'confirmed-own-change'|'refund-source'|'confirmed-refund-own-change'|'discharged-refund-residual';path:string;sha256:string;orderId?:string};
/** Operator-reviewed immutable provenance only. Admission never credits books. */
export async function approvedLiveReverseCapital(pool:pg.Pool,keys:PrivateData,sources:CapitalSource[],refundOrderId?:string,policy?:PolicyWorkerOrderContext){
 if(!Array.isArray(sources)||sources.length<1||sources.length>100)throw Error('LIVE_CAPITAL_APPROVAL_SOURCES_REQUIRED');
 const notes=new Map<string,{pool:'ironwood';txid:string;index:number;value:string}>();
 for(const source of sources){
  const bytes=await readFile(source.path);if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('LIVE_CAPITAL_APPROVAL_BYTES_CHANGED');
  const proof=JSON.parse(bytes.toString('utf8'));
  let additions:any[]=[];
  if(source.kind==='opening'){
   if(proof.capitalBalanceZatoshi!=='12500000'||proof.capitalNotes?.length!==1||proof.capitalNotes[0].height!==4532057)throw Error('WRONG_LIVE_OPENING_CAPITAL');
   additions=proof.capitalNotes;
  }else if(source.kind==='settled-source'||source.kind==='refund-source'){
   const refund=source.kind==='refund-source';
   if(refund){if(!refundOrderId||source.orderId!==refundOrderId)throw Error('REFUND_CAPITAL_ONLY_FOR_OWN_ORDER');await runRefundQuery(pool,'signing',refundOrderId,[],policy);}
   const outputs=proof.snapshot?.outputs;if(!Array.isArray(outputs)||outputs.length!==1)throw Error('EXACT_SETTLED_SOURCE_PROOF_REQUIRED');
   const output=outputs[0],identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
   const row=(await pool.query(`SELECT d.*,o.state,q.direction FROM zee.deposits d JOIN zee.orders o ON o.id=d.order_id JOIN zee.quotes q ON q.id=o.id
    WHERE o.id=$1 AND o.primary_deposit=d.id AND d.identity_hash=$2`,[source.orderId,keys.lookup('deposit',identity)])).rows[0];
   if(!row||row.state!==(refund?'REFUND_REQUIRED':'SETTLED')||row.direction!=='ZCASH_TO_BASE'||!(refund?['EXACT','UNDER','OVER','LATE']:['EXACT']).includes(row.classification)||!row.confirmed_at||row.shielded!==true
    ||row.amount!==output.amount||Number(row.block_height)!==output.height||row.block_hash!==output.blockHash||output.shieldedSource!==true||output.pool!=='ironwood')throw Error('LIVE_SOURCE_CAPITAL_NOT_SETTLED');
   const privateDeposit=keys.open(row.private_payload,`deposit:${identity}:v1`) as DepositInput;
   if(privateDeposit.receiver!==output.receiver||privateDeposit.txid!==output.txid||privateDeposit.index!==output.index||privateDeposit.amount!==output.amount)throw Error('LIVE_SOURCE_CAPITAL_NATIVE_SQL_MISMATCH');
   additions=[{pool:'ironwood',txid:output.txid,index:output.index,value:output.amount}];
  }else if(source.kind==='confirmed-own-change'){
   const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1 AND confirmed',[source.orderId])).rows[0];
   if(!row||proof.state!=='DELIVERY_CONFIRMED'||proof.receipt?.confirmed!==true||proof.receipt?.attestationMode!=='operator-outgoing-recovery')throw Error('UNCONFIRMED_LIVE_CHANGE_CAPITAL');
   const signed=keys.open(row.signed_payload,`reverse-payout:${source.orderId}:v1`) as any;
   if(!isDeepStrictEqual(signed,proof.prepared)||proof.receipt.txid!==signed.txid||!keys.lookup('zcash-tx',signed.txid).equals(row.tx_hash))throw Error('LIVE_CHANGE_JOURNAL_SQL_MISMATCH');
   additions=signed.outputs.filter((out:any)=>out.ownChange&&BigInt(out.amount)>0n).map((out:any)=>({pool:'ironwood',txid:signed.txid,index:out.index,value:out.amount}));
  }else if(source.kind==='confirmed-refund-own-change'||source.kind==='discharged-refund-residual'){
   additions=await dischargedRefundCapital(pool,keys,source,proof);
  }else throw Error('UNKNOWN_LIVE_CAPITAL_PROVENANCE');
  for(const note of additions){
   if(note.pool!=='ironwood'||!/^[0-9a-f]{64}$/.test(note.txid)||!Number.isSafeInteger(note.index)||note.index<0||!/^[1-9][0-9]*$/.test(note.value))throw Error('INVALID_LIVE_CAPITAL_NOTE');
   const id=`${note.txid}:${note.index}`,old=notes.get(id);if(old&&old.value!==note.value)throw Error('CONFLICTING_LIVE_CAPITAL_APPROVAL');
   notes.set(id,{pool:'ironwood',txid:note.txid,index:note.index,value:note.value});
  }
 }
 return [...notes.values()];
}

/** Closed refund evidence admits exact remaining notes only; it never credits inventory. */
async function dischargedRefundCapital(pool:pg.Pool,keys:PrivateData,source:CapitalSource,proof:any){
 const residual=source.kind==='discharged-refund-residual',journal=residual?proof.refundJournal:proof;
 if(!source.orderId||residual&&(proof.version!==1||proof.purpose!=='DISCHARGED_REFUND_RESIDUAL'||proof.sourceOrderId!==source.orderId||proof.unspent!==true))throw Error('EXPLICIT_DISCHARGED_REFUND_PROOF_REQUIRED');
 const row=(await pool.query(`SELECT r.*,o.state order_state,q.direction,q.refund_fee,q.private_payload quote_payload,d.amount source_amount,d.private_payload source_payload,d.identity_hash source_identity_hash,d.block_height source_height,d.block_hash source_block_hash,d.confirmed_at source_confirmed_at,d.shielded source_shielded,d.classification source_classification,
  EXISTS(SELECT 1 FROM zee.obligations l WHERE l.deposit_id=r.deposit_id AND l.order_id=r.order_id AND l.state='DISCHARGED' AND l.source_amount=d.amount) liability_discharged,
  NOT EXISTS(SELECT 1 FROM zee.obligations l WHERE l.order_id=r.order_id AND l.state<>'DISCHARGED') no_open_liability,
  ((SELECT count(*) FROM zee.operations op WHERE op.order_id=r.order_id)=1 AND EXISTS(SELECT 1 FROM zee.operations op WHERE op.order_id=r.order_id AND op.deposit_id=r.deposit_id AND op.kind='REFUND' AND op.state='CONFIRMED' AND NOT op.chain_authorization_verified)) terminal_refund_operation,
  ((SELECT count(*) FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=r.order_id)=1 AND EXISTS(SELECT 1 FROM zee.outbox_jobs j JOIN zee.operations op ON op.id=j.operation_id WHERE op.order_id=r.order_id AND op.deposit_id=r.deposit_id AND op.kind='REFUND' AND op.state='CONFIRMED' AND j.status='DONE' AND j.lease_owner IS NULL AND j.lease_until IS NULL AND j.fence>=1)) terminal_refund_job
  FROM zee.source_refunds r JOIN zee.orders o ON o.id=r.order_id AND o.primary_deposit=r.deposit_id JOIN zee.quotes q ON q.id=o.id JOIN zee.deposits d ON d.id=r.deposit_id WHERE r.order_id=$1`,[source.orderId])).rows[0];
 if(!row||row.order_state!=='REFUNDED'||row.direction!=='ZCASH_TO_BASE'||row.base_phase!=='CANCEL'||row.base_confirmed!==true||row.confirmed!==true||row.liability_discharged!==true||row.no_open_liability!==true||row.terminal_refund_operation!==true||row.terminal_refund_job!==true||row.source_classification!=='LATE'||!row.source_confirmed_at||row.source_shielded!==true||row.source_amount!=='100000'||!row.zcash_payload||!row.receipt_payload)throw Error('REFUND_CAPITAL_NOT_FULLY_DISCHARGED');
 const signed=keys.open(row.zcash_payload,`source-refund:${source.orderId}:ZCASH:v1`) as PreparedZcashTransaction,receipt=keys.open(row.receipt_payload,`source-refund:${source.orderId}:ZCASH-proof:v1`) as VerifiedZcashReceipt,q=keys.open(row.quote_payload,`quote:${source.orderId}:v1`) as any;
 validatePreparedZcash(signed,{orderId:source.orderId,operationId:source.orderId,recipient:q.refundRecipient,amountZatoshi:row.source_amount,maxFeeZatoshi:row.refund_fee});
 if(signed.feeZatoshi!=='10000'||signed.feeZatoshi!==row.zcash_fee||signed.expiryHeight!==String(row.expiry_height)||!keys.lookup('zcash-tx',signed.txid).equals(row.zcash_hash)||journal?.state!=='DELIVERY_CONFIRMED'||!isDeepStrictEqual(journal.prepared,signed)||journal.receipt?.confirmed!==true||journal.receipt?.attestationMode!=='operator-outgoing-recovery'||journal.receipt?.orderId!==source.orderId)throw Error('REFUND_CHANGE_JOURNAL_SQL_MISMATCH');
 const native=journal.receipt;
 if(![receipt.blockHeight,receipt.tipHeight,Number(native.blockHeight),Number(native.tipHeight)].every(n=>Number.isSafeInteger(n)&&n>0)||receipt.txid!==signed.txid||receipt.amountZatoshi!==row.source_amount||receipt.recipient!==q.refundRecipient||receipt.feeZatoshi!==signed.feeZatoshi||receipt.shielded!==true||receipt.pool!=='ironwood'||receipt.blockHeight!==Number(row.height)||receipt.blockHeight>Number(signed.expiryHeight)||receipt.blockHash!==row.block_hash||receipt.tipHeight-receipt.blockHeight+1<10||native.txid!==receipt.txid||Number(native.blockHeight)!==receipt.blockHeight||native.blockHash!==receipt.blockHash||native.amount!==receipt.amountZatoshi||native.fee!==receipt.feeZatoshi||native.recipient!==receipt.recipient||native.shielded!==true||Number(native.tipHeight)-Number(native.blockHeight)+1<10)throw Error('REFUND_CHANGE_CONFIRMED_RECEIPT_MISMATCH');
 if(!residual)return signed.outputs.filter(out=>out.ownChange&&BigInt(out.amount)>0n).map(out=>({pool:'ironwood',txid:signed.txid,index:out.index,value:out.amount}));
 const outputs=proof.snapshot?.outputs;if(!Array.isArray(outputs)||outputs.length!==1)throw Error('EXACT_REFUND_RESIDUAL_OUTPUT_REQUIRED');const output=outputs[0],identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
 if(!keys.lookup('deposit',identity).equals(row.source_identity_hash)||output.pool!=='ironwood'||output.shieldedSource!==true||output.amount!==row.source_amount||output.height!==Number(row.source_height)||output.blockHash!==row.source_block_hash||signed.selectedNotes.some(n=>n.txid===output.txid&&n.index===output.index&&n.pool===output.pool))throw Error('REFUND_RESIDUAL_SPENT_OR_IDENTITY_MISMATCH');
 const deposit=keys.open(row.source_payload,`deposit:${identity}:v1`) as DepositInput;
 if(deposit.txid!==output.txid||deposit.index!==output.index||deposit.amount!==output.amount||deposit.receiver!==output.receiver)throw Error('REFUND_RESIDUAL_NATIVE_SQL_MISMATCH');
 return[{pool:'ironwood',txid:output.txid,index:output.index,value:output.amount}];
}

/** Root capture of physical state only. Ownership provenance is approved separately per order. */
export function validateContinuationCapitalCapture(p:any,expected:{profileSha256:string;loaderSha256:string;captureScriptSha256:string},now=Date.now()){
 const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),s=p?.snapshot;
 if(p?.version!==1||p.status!=='ROOT_NATIVE_CONTINUATION_CAPITAL_CAPTURED'||p.profileSha256!==expected.profileSha256||p.loaderSha256!==expected.loaderSha256||p.captureScriptSha256!==expected.captureScriptSha256||!hash(expected.profileSha256)||!hash(expected.loaderSha256)||!hash(expected.captureScriptSha256)||p.pythonProfileLoaderVerified!==true||p.walletProcessUid!==986||p.walletProcessGid!==978||p.supplementaryGroupsDropped!==true||p.groupReaped!==true||p.capitalBalanceZatoshi!=='12490000'||s?.schemaVersion!==1||s.network!=='zcash-testnet'||s.consensusBranch!=='77190ad9'||!Number.isSafeInteger(s.scannedHeight)||s.scannedHeight<10||!hash(s.tipHash)||!Number.isFinite(Date.parse(s.observedAt))||now-Date.parse(s.observedAt)<-5000||now-Date.parse(s.observedAt)>60000)throw Error('CONTINUATION_NATIVE_CAPTURE_SCOPE_OR_FRESHNESS');
 if(p.pendingCalculatedCount!==0||!Array.isArray(p.pendingCalculatedTransactions)||p.pendingCalculatedTransactions.length!==0)throw Error('CONTINUATION_NATIVE_PENDING_CALCULATED_CACHE');
 const notes=p.capitalNotes;if(!Array.isArray(notes)||notes.length<1||notes.length>2||!Array.isArray(s.outputs)||s.outputs.length!==notes.length||!Array.isArray(s.blocks)||s.blocks.length>4||s.blocks.length<2)throw Error('CONTINUATION_NATIVE_CAPTURE_NOTES');
 const identities=new Set<string>();let total=0n;
 for(const n of notes){const id=n.txid+':'+n.index;if(n.pool!=='ironwood'||!hash(n.txid)||!Number.isSafeInteger(n.index)||n.index<0||!/^[1-9][0-9]*$/.test(n.value)||!Number.isSafeInteger(n.height)||n.height<1||s.scannedHeight-n.height+1<10||!hash(n.blockHash)||identities.has(id))throw Error('CONTINUATION_NATIVE_CAPTURE_NOTE_IDENTITY');identities.add(id);total+=BigInt(n.value);const matching=s.outputs.filter((o:any)=>o.txid===n.txid&&o.pool===n.pool&&o.index===n.index&&o.amount===n.value&&o.height===n.height&&o.blockHash===n.blockHash&&o.shieldedSource===true&&typeof o.ownChange==='boolean');if(matching.length!==1||!s.blocks.some((b:any)=>b.height===n.height&&b.hash===n.blockHash))throw Error('CONTINUATION_NATIVE_CAPTURE_NOTE_RECEIPT');}
 if(total!==12490000n||!s.blocks.some((b:any)=>b.height===s.scannedHeight&&b.hash===s.tipHash)||!s.blocks.some((b:any)=>b.height===s.scannedHeight-9))throw Error('CONTINUATION_NATIVE_CAPTURE_TOTAL_OR_ANCHORS');return p;
}
