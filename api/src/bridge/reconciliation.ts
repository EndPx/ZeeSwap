import {coverage,digest,integer,validateAnchor,type Books,type Pair} from './model.ts';

/** Operator-attested SDK/independent canonical-reader observation, not trustless proof. */
export type BridgeReconciliation={pair:Pair;network:'testnet';baseChainId:84532;tokenAddress:string;contractAddress:string;runtimeCodeHash:string;decimals:8;
 principalAccount:string;feeAccount:string;swapAccount:string;controlledZatoshi:string;inTransitZatoshi:string;circulatingZatoshi:string;unpaidRedemptionsZatoshi:string;pendingAcknowledgmentsZatoshi:string};
export function requireReconciled(b:Books,r:BridgeReconciliation,identity:{tokenAddress:string;contractAddress:string;runtimeCodeHash:string},now:number){
 validateAnchor(r.pair.zcash,now,true);validateAnchor(r.pair.base,now,true);
 if(r.network!=='testnet'||r.baseChainId!==84532||r.decimals!==8||r.tokenAddress.toLowerCase()!==identity.tokenAddress.toLowerCase()||r.contractAddress.toLowerCase()!==identity.contractAddress.toLowerCase()||r.runtimeCodeHash!==identity.runtimeCodeHash)throw Error('BRIDGE_RECONCILIATION_IDENTITY');
 if(!b.pair||digest(r.pair)!==digest(b.pair)||r.principalAccount!==b.principalAccount||r.feeAccount!==b.feeAccount||r.swapAccount!==b.swapAccount)throw Error('BRIDGE_RECONCILIATION_CHECKPOINT');
 const expected=coverage(b);
 for(const key of ['controlledZatoshi','inTransitZatoshi','circulatingZatoshi','unpaidRedemptionsZatoshi','pendingAcknowledgmentsZatoshi'] as const){integer(r[key]);if(r[key]!==expected[key])throw Error('BRIDGE_RECONCILIATION_BOOKS');}
}
