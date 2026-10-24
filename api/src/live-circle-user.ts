import {parseTransaction,recoverTransactionAddress,keccak256,type Hex,type TransactionSerialized} from 'viem';
import type {OrderView} from '../../apps/web/src/protocol.ts';
export function assertCircleOrder(view:OrderView,direction:'ZCASH_TO_BASE'|'BASE_TO_ZCASH'){
 if(view.direction!==direction||view.inputAmount!=='100000'||view.outputAmount!=='100000'||view.integrationOnly||view.executionMode!==(direction==='ZCASH_TO_BASE'?'base-settlement-v1':'base-escrow-v1'))throw Error('CIRCLE_ORDER_SCOPE_MISMATCH');
}
export function circleObservationTimes(previous:Record<string,string>,view:OrderView,at:string){
 const times={...previous};
 if(view.source.received&&!times.sourceDiscoveredAt)times.sourceDiscoveredAt=at;
 if(view.source.confirmed&&!times.sourceSqlConfirmedAt)times.sourceSqlConfirmedAt=at;
 if(view.destination?.transactionHash&&!times.destinationDiscoveredAt)times.destinationDiscoveredAt=at;
 if(view.destination?.status==='FINALIZED'&&!times.destinationSqlConfirmedAt)times.destinationSqlConfirmedAt=at;
 if(view.status==='SETTLED'&&!times.settlementSqlConfirmedAt)times.settlementSqlConfirmedAt=at;
 return times;
}
export async function assertCircleUserTransaction(raw:Hex,expected:{payer:string;to:string;data:Hex;nonce:0|1}){
 const tx=parseTransaction(raw);if(tx.type!=='legacy'||tx.chainId!==84532||tx.nonce!==expected.nonce||tx.to?.toLowerCase()!==expected.to.toLowerCase()||(tx.data??'0x')!==expected.data||(tx.value??0n)!==0n||tx.gas!==450000n||tx.gasPrice!==20000000n||(raw.length-2)/2>(expected.nonce===1?768:512)||(await recoverTransactionAddress({serializedTransaction:raw as TransactionSerialized})).toLowerCase()!==expected.payer.toLowerCase())throw Error('CIRCLE_SIGNED_TRANSACTION_MISMATCH');
 return{hash:keccak256(raw),nonce:expected.nonce,upperBoundBytes:expected.nonce===1?768:512,gas:'450000',gasPrice:'20000000',maxFeeWei:'10000000000000'};
}

export function circleOwnedCleanupAcknowledged(stderr:string,signal:string|null){
 const acks=stderr.split(/\r?\n/).flatMap(line=>{try{const value=JSON.parse(line);return value?.status==='OWNED_PROCESS_CLEANED'?[value]:[];}catch{return [];}});
 return signal===null&&acks.length===1&&Object.keys(acks[0]).sort().join(',')==='groupReaped,kind,status'&&acks[0].kind==='native'&&acks[0].groupReaped===true;
}

export function assertCircleNativeResult(result:any){
 const allowed=['PAYER_PREPARED','PAYER_ORIGINAL_PREPARED_RECOVERED','PAYER_BROADCAST_ACKNOWLEDGED','PAYER_AWAITING_CANONICAL_RECEIPT','PAYER_AWAITING_TEN_CONFIRMATIONS','PAYER_SOURCE_FINALIZED'];
 if(!result||!allowed.includes(result.status)||typeof result.txid!=='string'||!/^[0-9a-f]{64}$/.test(result.txid))throw Error('CIRCLE_NATIVE_RESULT_PROTOCOL');
 if(result.status.startsWith('PAYER_AWAITING')){if(result.confirmed!==false)throw Error('CIRCLE_NATIVE_PENDING_PROTOCOL');}
 else if(result.amountZatoshi!=='100000'||typeof result.feeZatoshi!=='string'||!/^[1-9][0-9]*$/.test(result.feeZatoshi)||BigInt(result.feeZatoshi)>10000n)throw Error('CIRCLE_NATIVE_RESULT_EXACT_AMOUNT_FEE');
 if(result.status==='PAYER_SOURCE_FINALIZED'&&(result.confirmed!==true||!Number.isSafeInteger(result.confirmations)||result.confirmations<10))throw Error('CIRCLE_NATIVE_FINALITY_RESULT');
}
