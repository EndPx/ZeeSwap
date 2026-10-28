import type {PrivateData} from './private-data.ts';
import {refundContext} from './source-refunds.ts';
import {decodePgJsonbBytea} from './pg-jsonb-bytea.ts';

export interface OpeningRefundReceipt {hash:string;phase:'CANCEL';fee:string;blockHeight:number;blockHash:string;}
/** The SQL digest is a privacy lookup, never the public transaction hash.
 * Authenticate the encrypted proof in its original order/phase context, then bind
 * every stored receipt field. No payload or lookup value enters an error. */
export function readOpeningRefundReceipt(keys:PrivateData,orderId:string,hash:string,row:Record<string,unknown>):OpeningRefundReceipt {
 try {
  if(!/^0x[0-9a-f]{64}$/.test(hash)||row.order_id!==orderId||row.base_phase!=='CANCEL'||row.base_confirmed!==true||row.confirmed!==true||!decodePgJsonbBytea(row.base_hash,32).equals(keys.lookup('base-tx',hash)))throw Error();
  const p=keys.open(decodePgJsonbBytea(row.base_receipt),refundContext(orderId,'CANCEL-proof')) as OpeningRefundReceipt;
  if(!p||Object.keys(p).sort().join(',')!==['hash','phase','fee','blockHeight','blockHash'].sort().join(',')||p.hash!==hash||p.phase!=='CANCEL'||typeof p.fee!=='string'||!/^(0|[1-9][0-9]*)$/.test(p.fee)||p.fee!==String(row.base_fee)||!Number.isSafeInteger(p.blockHeight)||p.blockHeight<=0||String(p.blockHeight)!==String(row.base_height)||typeof row.base_block!=='string'||!/^[0-9a-f]{64}$/.test(row.base_block)||p.blockHash!=='0x'+row.base_block)throw Error();
  return p;
 } catch {throw Error('OPENING_ROOT_ORIGINAL_MAIN_REFUND_BINDING');}
}

export function requireOpeningRefundChainReceipt(proof:OpeningRefundReceipt,receipt:{transactionHash:string;blockNumber:bigint;blockHash:string;gasUsed:bigint;effectiveGasPrice:bigint;l1Fee?:unknown}) {
 if(typeof receipt.l1Fee!=='bigint'||receipt.l1Fee<0n||proof.hash!==receipt.transactionHash||BigInt(proof.blockHeight)!==receipt.blockNumber||proof.blockHash!==receipt.blockHash||BigInt(proof.fee)!==receipt.gasUsed*receipt.effectiveGasPrice+receipt.l1Fee)throw Error('OPENING_ROOT_ORIGINAL_MAIN_REFUND_CHAIN_BINDING');
}
