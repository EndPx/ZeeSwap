import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
export type CapitalSource={kind:'opening'|'settled-source'|'confirmed-own-change'|'refund-source';path:string;sha256:string;orderId?:string};
/** Operator-reviewed immutable provenance only. Admission never credits books. */
export async function approvedLiveReverseCapital(pool:pg.Pool,keys:PrivateData,sources:CapitalSource[],refundOrderId?:string){
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
   if(refund){if(!refundOrderId||source.orderId!==refundOrderId)throw Error('REFUND_CAPITAL_ONLY_FOR_OWN_ORDER');await pool.query('SELECT zee.check_source_refund_signing($1)',[refundOrderId]);}
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
  }else throw Error('UNKNOWN_LIVE_CAPITAL_PROVENANCE');
  for(const note of additions){
   if(note.pool!=='ironwood'||!/^[0-9a-f]{64}$/.test(note.txid)||!Number.isSafeInteger(note.index)||note.index<0||!/^[1-9][0-9]*$/.test(note.value))throw Error('INVALID_LIVE_CAPITAL_NOTE');
   const id=`${note.txid}:${note.index}`,old=notes.get(id);if(old&&old.value!==note.value)throw Error('CONFLICTING_LIVE_CAPITAL_APPROVAL');
   notes.set(id,{pool:'ironwood',txid:note.txid,index:note.index,value:note.value});
  }
 }
 return [...notes.values()];
}
