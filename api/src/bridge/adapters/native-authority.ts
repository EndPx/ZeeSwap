import {createHash} from 'node:crypto';
import {bridgeCommitment,digest,integer,validateAnchor,type Books,type Order,type Pair} from '../model.ts';
import {CanonicalBridgeBase} from './base.ts';

/** Python bridge_protocol.digest uses sorted object keys; arrays retain order. */
export function nativeDigest(value:unknown):string {
 const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
}
export function verifyNativeBroadcastGuard(q:NativeBridgeRequest,approvedDigest:string,journal:any,guard:any){
 nativeAuthorityOrder(q,approvedDigest);
 const p=journal?.prepared;
 if(!guard||Object.keys(guard).sort().join()!=='approvedDigest,operationId,rawSha256,txid'||guard.operationId!==q.orderId||guard.approvedDigest!==approvedDigest||journal.state!=='PREPARED'||journal.approvedDigest!==approvedDigest||nativeDigest(journal.request)!==nativeDigest(q)||!p||p.txid!==guard.txid||!/^[a-f0-9]{64}$/.test(p.txid)||!/^(?:[a-f0-9]{2})+$/.test(p.rawTransaction)||createHash('sha256').update(Buffer.from(p.rawTransaction,'hex')).digest('hex')!==guard.rawSha256)throw Error('BRIDGE_GUARD_ORIGINAL_REQUIRED');
 return {authorized:true,txid:guard.txid,rawSha256:guard.rawSha256};
}
export type NativeBridgeRequest={version:1;purpose:'bridge-redemption'|'bridge-refund';intentId:string;orderId:string;bridgeId:string;recipient:string;amountZatoshi:string;maxFeeZatoshi:'10000';payoutCommitment:string;salt:string;commitmentInput:{direction:Order['direction'];amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string};base:{chainId:84532;contract:string;runtimeCodeHash:string;payer:string|null;amountAtomic:string;transactionHash:`0x${string}`;blockNumber:string;blockHash:string;operator:string;authorizer:string;admin:string};paired:Pair};
export function nativeAuthorityOrder(q:NativeBridgeRequest,approvedDigest:string):Order {
 if(!q||nativeDigest(q)!==approvedDigest||q.version!==1||!['bridge-redemption','bridge-refund'].includes(q.purpose)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(q.orderId)||!/^[a-f0-9]{64}$/.test(q.salt))throw Error('BRIDGE_NATIVE_REQUEST_BINDING');
 const i=q.commitmentInput,reverse=q.purpose==='bridge-redemption';
 if(!i||i.direction!==(reverse?'ZEETAZ_TO_TAZ':'TAZ_TO_ZEETAZ')||i.amountAtomic!==q.amountZatoshi||i[reverse?'recipient':'refundRecipient']!==q.recipient||q.maxFeeZatoshi!=='10000'||integer(q.amountZatoshi)<10000n||integer(q.amountZatoshi)>100000000n)throw Error('BRIDGE_NATIVE_TERMS');
 const commitment=bridgeCommitment({...i,salt:q.salt,id:q.orderId});
 if(commitment!==q.bridgeId||commitment!==q.payoutCommitment||q.intentId!==digest(['bridge-delivery-v1',q.orderId,commitment])||q.base.amountAtomic!==q.amountZatoshi||q.base.payer!==(reverse?i.payer?.toLowerCase():null))throw Error('BRIDGE_NATIVE_COMMITMENT');
 validateAnchor(q.paired.base,Date.now(),false);validateAnchor(q.paired.zcash,Date.now(),false);
 if(!/^0x[a-f0-9]{64}$/.test(q.base.transactionHash)||!/^0x[a-f0-9]{64}$/.test(q.base.blockHash)||integer(q.base.blockNumber)>BigInt(q.paired.base.height))throw Error('BRIDGE_NATIVE_SOURCE');
 const receipt={network:'base-sepolia' as const,transactionHash:q.base.transactionHash,blockHeight:Number(integer(q.base.blockNumber)),blockHash:q.base.blockHash};
 return {id:q.orderId,capabilityHash:'',idempotencyKey:'',requestHash:'',...i,commitment,salt:q.salt,createdAt:'',expiresAt:'',status:reverse?'REDEMPTION_PENDING':'CANCELLED',funding:null,source:reverse?receipt:null,destination:reverse?null:receipt,deliveryKind:reverse?'REDEMPTION':'REFUND'};
}
/** Real dual-RPC Base authority. Native scanner must independently recheck Zcash. */
export async function verifyNativeAuthority(base:CanonicalBridgeBase,q:NativeBridgeRequest,approvedDigest:string){
 const o=nativeAuthorityOrder(q,approvedDigest),p=base.profile;
 for(const key of ['contract','runtimeCodeHash','admin','operator','authorizer'] as const)if(q.base[key].toLowerCase()!==(key==='contract'?p.contractAddress:p[key]).toLowerCase())throw Error('BRIDGE_NATIVE_BASE_PROFILE_BINDING');
 if(q.base.chainId!==84532)throw Error('BRIDGE_NATIVE_BASE_CHAIN');
 const anchor=await base.finalized();if(anchor.height<q.paired.base.height)throw Error('BRIDGE_NATIVE_BASE_REGRESSION');
 // Check the admitted original checkpoint, not just the source transaction.
 for(const c of base.clients)if((await c.getBlock({blockNumber:BigInt(q.paired.base.height)})).hash!==q.paired.base.hash)throw Error('BRIDGE_NATIVE_BASE_CHECKPOINT_REORG');
 const b={pair:{base:anchor,zcash:q.paired.zcash}} as Books;
 if(q.purpose==='bridge-redemption'){
  const tx=await base.clients[0].getTransaction({hash:q.base.transactionHash});
  // verify() compares this calldata and all authenticated event fields through
  // both independent providers; contract execution establishes signature validity.
  o.funding={kind:'authenticated-burn',network:'base-sepolia',chainId:84532,contract:p.contractAddress,token:p.contractAddress,calldata:tx.input,terms:{} as any,signature:''};
  const fact=await base.verify({kind:'BURN',transactionHash:q.base.transactionHash},o,b);
  if(fact.receipt.blockHeight!==Number(q.base.blockNumber)||fact.receipt.blockHash!==q.base.blockHash)throw Error('BRIDGE_NATIVE_SOURCE_RECEIPT_BINDING');
  await base.assertCanonicalOrder(o,b);
 }else{
  const fact=await base.verify({kind:'CANCEL',transactionHash:q.base.transactionHash},o,b);
  if(fact.receipt.blockHeight!==Number(q.base.blockNumber)||fact.receipt.blockHash!==q.base.blockHash)throw Error('BRIDGE_NATIVE_SOURCE_RECEIPT_BINDING');
 }
 const current=await base.finalized();await base.readAt(current);
 return {version:1,status:'BRIDGE_AUTHORITY_VERIFIED',bridgeProofVerified:true,orderId:q.orderId,purpose:q.purpose,bridgeId:q.bridgeId,approvedDigest,principalAccount:p.principalAccount,feeAccount:p.feeAccount,paired:{base:current,zcash:q.paired.zcash},zcashRequiresNativeRecheck:true};
}
