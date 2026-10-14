import { createHash } from 'node:crypto';
import type { FundingTerms } from './base-escrow.ts';
import type { PreparedZcashTransaction,ReversePayoutTerms } from './reverse-settlement.ts';

export function canonicalJson(v:any):string {
 const sorted=(value:any):any=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
 return JSON.stringify(sorted(v));
}
export const approvalDigest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Pure part of the final guard. Identity comes from decrypted durable DB state;
 * fresh lease/source/commit checks are performed by SQL immediately afterward.
 */
export function assertReverseAuthority(request:any,approved:any,digest:string,orderId:string,prepared:PreparedZcashTransaction,
 terms:ReversePayoutTerms,funding:FundingTerms,contract:string,scannedHeight:string){
 if(Object.keys(request).sort().join(',')!=='approvedDigest,operationId,rawSha256,txid'
  ||request.operationId!==orderId||approved.orderId!==orderId||terms.orderId!==orderId||request.approvedDigest!==digest||approvalDigest(approved)!==digest
  ||!/^[0-9a-f]{64}$/.test(request.txid)||!/^[0-9a-f]{64}$/.test(request.rawSha256))throw Error('REVERSE_GUARD_AUTHORITY_MISMATCH');
 if(approved.recipient!==terms.recipient||approved.amountZatoshi!==terms.amountZatoshi||approved.maxFeeZatoshi!==terms.maxFeeZatoshi
  ||prepared.operationId!==orderId||prepared.recipient!==terms.recipient||prepared.amount!==terms.amountZatoshi||prepared.fee!==prepared.feeZatoshi
  ||BigInt(prepared.feeZatoshi)>BigInt(terms.maxFeeZatoshi)||approved.settlementId!==funding.id
  ||approved.base.contract.toLowerCase()!==contract.toLowerCase()||approved.base.token.toLowerCase()!==funding.token.toLowerCase()
  ||approved.base.payer.toLowerCase()!==funding.payer.toLowerCase()||approved.base.refundRecipient.toLowerCase()!==funding.refundRecipient.toLowerCase()
  ||approved.base.amountAtomic!==funding.amount||approved.base.cancellationAvailableAt!==funding.cancellationAvailableAt)throw Error('REVERSE_GUARD_IMMUTABLE_QUOTE_MISMATCH');
 if(prepared.txid!==request.txid||createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex')!==request.rawSha256
  ||BigInt(prepared.expiryHeight)<BigInt(scannedHeight)+20n)throw Error('REVERSE_GUARD_BYTES_OR_EXPIRY_MISMATCH');
}
