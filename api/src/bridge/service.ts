import { timingSafeEqual } from 'node:crypto';
import { encodeFunctionData, isAddress, verifyTypedData, zeroAddress } from 'viem';
import { accessHash } from '../private-data.ts';
import { coverage, bridgeRequestDigest, guard, makeOrder, principal, type Books, type Funding, type Order, type Direction } from './model.ts';
import type { BridgeStore } from './repository.ts';
import {requireReconciled,type BridgeReconciliation} from './reconciliation.ts';

export const redemptionAbi=[{type:'function',name:'requestRedemption',stateMutability:'nonpayable',inputs:[{name:'terms',type:'tuple',components:[{name:'id',type:'bytes32'},{name:'payer',type:'address'},{name:'amount',type:'uint256'},{name:'payoutCommitment',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]},{name:'signature',type:'bytes'}],outputs:[]}] as const;
export type QuoteInput={direction:Direction;amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string};
export interface BridgeRuntime {
 tokenAddress:string;contractAddress:string;runtimeCodeHash:string;authorizerAddress:string;
 /** Must verify pinned testnet network, token decimals, runtime/role identities,
  * canonical checkpoint ancestry and current scanner readiness; fail closed. */
 recheck(books:Readonly<Books>):Promise<BridgeReconciliation>;
 validateShieldedRecipient(address:string):Promise<void>;
 /** Durable idempotent provisioning keyed by commitment. Forward address is a
  * dedicated bridge principal receiver; reverse terms use contract-authorized
  * signatures whose nonce/commitment must remain stable after process recovery. */
 funding(order:Readonly<Order>,books?:Readonly<Books>):Promise<Funding>;
 /** Optional narrower operator admission scope, checked under the same book lock. */
 assertAcceptance?(order:Readonly<Order>,books:Readonly<Books>):Promise<void>|void;
 bindQuote?(order:Order,books:Readonly<Books>):Promise<void>|void;
 availability?(books:Readonly<Books>):{forwardEnabled:boolean;reverseEnabled:boolean;reason?:string};
 publicPolicy?:{amountAtomic:'100000';maxAcceptedPerDirection:1;maxConcurrent:1};
}
export const unavailableBridgeStatus=()=>({schemaVersion:1 as const,network:'testnet' as const,asset:{symbol:'zeeTAZ',decimals:8,baseChainId:84532,tokenAddress:null as string|null,bridgeContractAddress:null as string|null,runtimeCodeHash:null as string|null},state:'unavailable' as const,reason:'BRIDGE_NOT_CONFIGURED',forwardEnabled:false,reverseEnabled:false,maxObservationAgeSeconds:60,reserveReport:null});
export function orderView(o:Order){return {id:o.id,direction:o.direction,amountAtomic:o.amountAtomic,outputAmountAtomic:o.amountAtomic,recipient:o.recipient,refundRecipient:o.refundRecipient,payer:o.payer,status:o.status,createdAt:o.createdAt,expiresAt:o.expiresAt,funding:o.funding,source:o.source,destination:o.destination,acknowledgment:o.acknowledgment??null};}
function auth(o:Order,token:string){const got=accessHash(token),expected=Buffer.from(o.capabilityHash,'hex');if(got.length!==expected.length||!timingSafeEqual(got,expected))throw Error('BRIDGE_ORDER_NOT_FOUND');}
function evm(s:unknown){if(typeof s!=='string'||!isAddress(s,{strict:true})||s.toLowerCase()===zeroAddress)throw Error('BRIDGE_INVALID_BASE_ADDRESS');return s;}
/** Format only an independently reconciled book; keeps the proof's original
 * clocks. Used by the supervised worker's already-verified aggregate cache. */
export function reconciledBridgeStatus(b:Books,runtime:BridgeRuntime,proof:BridgeReconciliation,now=Date.now()){
 requireReconciled(b,proof,runtime,now);const report=coverage(b);let reason='BRIDGE_READY';try{guard(b,now,true);}catch(e){reason=(e as Error).message;}
 const availability=runtime.availability?.(structuredClone(b));if(['BRIDGE_READY','BRIDGE_ADMISSION_PAUSED'].includes(reason)&&availability?.reason)reason=availability.reason;
 return {...unavailableBridgeStatus(),...(runtime.publicPolicy?{pilot:runtime.publicPolicy}:{}),asset:{symbol:'zeeTAZ',decimals:8,baseChainId:84532,tokenAddress:runtime.tokenAddress,bridgeContractAddress:runtime.contractAddress,runtimeCodeHash:runtime.runtimeCodeHash},state:reason==='BRIDGE_READY'?'available' as const:'paused' as const,reason,forwardEnabled:reason==='BRIDGE_READY'&&(availability?.forwardEnabled??true),reverseEnabled:reason==='BRIDGE_READY'&&(availability?.reverseEnabled??true),reserveReport:b.pair?{operatorAttested:true,...report,...b.pair}:null};
}
export class BridgeService {
 constructor(readonly store:BridgeStore,private runtime:BridgeRuntime) {evm(runtime.tokenAddress);evm(runtime.contractAddress);evm(runtime.authorizerAddress);if(runtime.tokenAddress.toLowerCase()!==runtime.contractAddress.toLowerCase())throw Error('BRIDGE_TOKEN_CONTRACT_IDENTITY');if(!/^0x[0-9a-f]{64}$/.test(runtime.runtimeCodeHash))throw Error('BRIDGE_INVALID_CODE_HASH');}
 async status(now=Date.now()){
  try{const b=await this.store.read();return reconciledBridgeStatus(b,this.runtime,await this.runtime.recheck(structuredClone(b)),now);
  }catch{return {...unavailableBridgeStatus(),reason:'BRIDGE_RECONCILIATION_UNAVAILABLE'};}
 }
 async quote(input:QuoteInput,token:string,key:string,now=Date.now()){
  const started=Date.now(),current=()=>now+Date.now()-started;
  principal(input.amountAtomic);if(!['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'].includes(input.direction))throw Error('BRIDGE_INVALID_DIRECTION');
  if(typeof input.recipient!=='string'||input.recipient.length>512||typeof key!=='string'||! /^[A-Za-z0-9_-]{8,128}$/.test(key))throw Error('BRIDGE_INVALID_INPUT');
  if(input.direction==='TAZ_TO_ZEETAZ'){evm(input.recipient);if(!input.refundRecipient)throw Error('BRIDGE_REFUND_RECIPIENT_REQUIRED');await this.runtime.validateShieldedRecipient(input.refundRecipient);}
  else {evm(input.payer);await this.runtime.validateShieldedRecipient(input.recipient);if(input.refundRecipient)throw Error('BRIDGE_INVALID_FIELDS');}
  return this.store.update(async b=>{requireReconciled(b,await this.runtime.recheck(structuredClone(b)),this.runtime,current());guard(b,current(),true);const hash=accessHash(token).toString('hex');
   const old=Object.values(b.orders).find(o=>o.capabilityHash===hash&&o.idempotencyKey===key);
   if(old){if(old.requestHash!==bridgeRequestDigest(input))throw Error('BRIDGE_IDEMPOTENCY_CONFLICT');return orderView(old);}
   const o=makeOrder(input,hash,key,current());await this.runtime.bindQuote?.(o,structuredClone(b));b.orders[o.id]=o;return orderView(o);
  });
 }
 async accept(id:string,token:string,key:string,now=Date.now()){
  const started=Date.now(),current=()=>now+Date.now()-started;
  if(! /^[A-Za-z0-9_-]{8,128}$/.test(key))throw Error('BRIDGE_INVALID_INPUT');
  return this.store.update(async b=>{const o=b.orders[id];if(!o)throw Error('BRIDGE_ORDER_NOT_FOUND');auth(o,token);
   // Accepted-order retrieval must work during a pause without renewing authority.
   if(o.accepted)return orderView(o);
   requireReconciled(b,await this.runtime.recheck(structuredClone(b)),this.runtime,current());guard(b,current(),true);if(o.status!=='QUOTED'||current()>=Date.parse(o.expiresAt))throw Error('BRIDGE_QUOTE_EXPIRED');
   await this.runtime.assertAcceptance?.(structuredClone(o),structuredClone(b));const f=await this.runtime.funding(structuredClone(o),structuredClone(b));
   if(o.direction==='TAZ_TO_ZEETAZ'){
    if(f.kind!=='shielded-deposit'||f.network!=='zcash-testnet'||!f.memo||Buffer.byteLength(f.memo)>512||!Number.isSafeInteger(f.cutoffHeight)||f.cutoffHeight<=b.pair!.zcash.height||!Number.isFinite(Date.parse(f.cutoffTime))||new Date(f.cutoffTime).toISOString()!==f.cutoffTime||Date.parse(f.cutoffTime)<=current()||Date.parse(f.cutoffTime)>Date.parse(o.expiresAt))throw Error('BRIDGE_FUNDING_BINDING');
    await this.runtime.validateShieldedRecipient(f.address);
   }else {
    if(f.kind!=='authenticated-burn'||f.network!=='base-sepolia'||f.chainId!==84532||f.contract.toLowerCase()!==this.runtime.contractAddress.toLowerCase()||f.token.toLowerCase()!==this.runtime.tokenAddress.toLowerCase()||f.terms.payer.toLowerCase()!==o.payer!.toLowerCase()||f.terms.amount!==o.amountAtomic||f.terms.payoutCommitment!==o.commitment||f.terms.id!==o.commitment||! /^(0|[1-9][0-9]*)$/.test(f.terms.nonce)||! /^(0|[1-9][0-9]*)$/.test(f.terms.deadline)||BigInt(f.terms.deadline)*1000n<=BigInt(now)||BigInt(f.terms.deadline)*1000n>BigInt(Date.parse(o.expiresAt))||! /^0x[0-9a-f]+$/i.test(f.signature))throw Error('BRIDGE_FUNDING_BINDING');
    const calldata=encodeFunctionData({abi:redemptionAbi,functionName:'requestRedemption',args:[{id:f.terms.id as `0x${string}`,payer:f.terms.payer as `0x${string}`,amount:BigInt(f.terms.amount),payoutCommitment:f.terms.payoutCommitment as `0x${string}`,nonce:BigInt(f.terms.nonce),deadline:BigInt(f.terms.deadline)},f.signature as `0x${string}`]});if(calldata.toLowerCase()!==f.calldata.toLowerCase())throw Error('BRIDGE_CALLDATA_BINDING');
    const valid=await verifyTypedData({address:this.runtime.authorizerAddress as `0x${string}`,domain:{name:'ZeeSwapBridge',version:'1',chainId:84532,verifyingContract:this.runtime.contractAddress as `0x${string}`},types:{Redemption:redemptionAbi[0].inputs[0].components},primaryType:'Redemption',message:{id:f.terms.id as `0x${string}`,payer:f.terms.payer as `0x${string}`,amount:BigInt(f.terms.amount),payoutCommitment:f.terms.payoutCommitment as `0x${string}`,nonce:BigInt(f.terms.nonce),deadline:BigInt(f.terms.deadline)},signature:f.signature as `0x${string}`});if(!valid)throw Error('BRIDGE_AUTHORIZER_BINDING');
   }
   // Funding provisioning may await a wallet/indexer/signature journal. Recheck
   // time and the independent paired books immediately before acceptance.
   requireReconciled(b,await this.runtime.recheck(structuredClone(b)),this.runtime,current());guard(b,current(),true);
   if(current()>=Date.parse(o.expiresAt)||(f.kind==='shielded-deposit'?Date.parse(f.cutoffTime)<=current():BigInt(f.terms.deadline)*1000n<=BigInt(current())))throw Error('BRIDGE_QUOTE_EXPIRED');
   await this.runtime.assertAcceptance?.(structuredClone(o),structuredClone(b));
   // Reserve a full dedicated external shielded-delivery/refund fee before
   // returning instructions that can create an irrevocable principal obligation.
   b.feeCapital=(BigInt(b.feeCapital)-10000n).toString();o.feeReservation={maximum:'10000'};
   o.funding=f;o.accepted=true;o.acceptedPair=structuredClone(b.pair!);o.status=o.direction==='TAZ_TO_ZEETAZ'?'AWAITING_DEPOSIT':'AWAITING_BURN';return orderView(o);
  });
 }
 async order(id:string,token:string){const b=await this.store.read(),o=b.orders[id];if(!o)throw Error('BRIDGE_ORDER_NOT_FOUND');auth(o,token);return orderView(o);}
}
