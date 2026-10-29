import { createHash, randomBytes, randomUUID } from 'node:crypto';

export type Direction = 'TAZ_TO_ZEETAZ' | 'ZEETAZ_TO_TAZ';
export type Anchor = {height:number;hash:string;observedAt:string};
export type Pair = {zcash:Anchor;base:Anchor};
export type Receipt = {network:'zcash-testnet'|'base-sepolia';transactionHash:string;blockHeight:number;blockHash:string};
export type Funding = {kind:'shielded-deposit';network:'zcash-testnet';address:string;memo:string;cutoffHeight:number;cutoffTime:string} |
 {kind:'authenticated-burn';network:'base-sepolia';chainId:84532;contract:string;token:string;calldata:string;
 terms:{id:string;payer:string;amount:string;payoutCommitment:string;nonce:string;deadline:string};signature:string};
export type State = 'QUOTED'|'AWAITING_DEPOSIT'|'AWAITING_BURN'|'DEPOSIT_FINALIZED'|'MINTED'|'CANCELLED'|'REFUND_PENDING'|'REDEMPTION_PENDING'|'PAYOUT_PENDING'|'IN_TRANSIT'|'NATIVE_DELIVERED_AWAITING_ACK'|'COMPLETED'|'FROZEN';
export type Order = {id:string;capabilityHash:string;idempotencyKey:string;requestHash:string;direction:Direction;amountAtomic:string;
 pilotPermitSha256?:string;acceptedPair?:Pair;baseScanCursor?:Anchor;nativeProfile?:import('./adapters/native.ts').NativeCommandProfile;baseEffects?:Partial<Record<'MINT'|'ACK',import('./adapters/cast.ts').SignedBridgeBase>>;baseBroadcastAttempted?:Partial<Record<'MINT'|'ACK',true>>;
 recipient:string;refundRecipient?:string;payer?:string;commitment:string;salt:string;createdAt:string;expiresAt:string;status:State;funding:Funding|null;
 source:Receipt|null;destination:Receipt|null;acknowledgment?:Receipt;sourceIdentity?:string;burnPayer?:string;attempt?:{intentId:string;txid?:string;raw?:string;feeAtomic?:string;expiryHeight?:number};
 deliveryKind?:'REDEMPTION'|'REFUND';included?:Receipt;accepted?:boolean;frozenFrom?:State;reorgTarget?:'SOURCE'|'DELIVERY'|'ACK';feeReservation?:{maximum:string;charged?:string};broadcastAttempted?:boolean};
export type Books = {version:1;paused:boolean;incident:boolean;controlled:string;inTransit:string;supply:string;feeCapital:string;
 qualification?:{permitId:string;permitSha256:string;createdAt:string;expiresAt:string};
 publicPilot?:{permitId:string;permitSha256:string;createdAt:string;expiresAt:string;qualificationPermitId:string;qualificationPermitSha256:string};
 principalAccount:string;feeAccount:string;swapAccount:string;pair:Pair|null;orders:Record<string,Order>;seen:Record<string,string>};
export function integer(value:unknown):bigint {
 if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)||value.length>78)throw Error('BRIDGE_INVALID_AMOUNT');return BigInt(value);
}
export function principal(value:unknown):string {const n=integer(value);if(n<10000n||n>100000000n)throw Error('BRIDGE_AMOUNT_BOUNDS');return n.toString();}
export function emptyBooks():Books{return {version:1,paused:true,incident:false,controlled:'0',inTransit:'0',supply:'0',feeCapital:'0',principalAccount:'',feeAccount:'',swapAccount:'',pair:null,orders:{},seen:{}};}
export function validateAnchor(a:Anchor,now:number,fresh:boolean){
 if(!Number.isSafeInteger(a.height)||a.height<1||! /^(0x)?[0-9a-f]{64}$/.test(a.hash)||/^((0x)?0+)$/.test(a.hash)||!Number.isFinite(Date.parse(a.observedAt)))throw Error('BRIDGE_INVALID_CHECKPOINT');
 const age=now-Date.parse(a.observedAt);if(fresh&&(age>60000||age< -5000))throw Error('BRIDGE_STALE_CHECKPOINT');
}
export function coverage(b:Books){
 let redemptions=0n,pendingAcknowledgments=0n,unminted=0n,refunds=0n;
 for(const o of Object.values(b.orders)){
  if(o.direction==='TAZ_TO_ZEETAZ'&&o.source&&!['MINTED','COMPLETED'].includes(o.frozenFrom??o.status)){
   if(o.deliveryKind==='REFUND'||o.status==='CANCELLED')refunds+=integer(o.amountAtomic);else unminted+=integer(o.amountAtomic);
  }
  if(o.direction==='ZEETAZ_TO_TAZ'&&o.source){
   if(o.status==='NATIVE_DELIVERED_AWAITING_ACK'||o.status==='FROZEN'&&o.reorgTarget==='ACK'&&['NATIVE_DELIVERED_AWAITING_ACK','COMPLETED'].includes(o.frozenFrom??''))pendingAcknowledgments+=integer(o.amountAtomic);
   else if(o.status!=='COMPLETED')redemptions+=integer(o.amountAtomic);
  }
 }
 const liabilities=integer(b.supply)+redemptions+unminted+refunds;
 return {controlledZatoshi:b.controlled,inTransitZatoshi:b.inTransit,circulatingZatoshi:b.supply,unpaidRedemptionsZatoshi:redemptions.toString(),pendingAcknowledgmentsZatoshi:pendingAcknowledgments.toString(),acceptedUnmintedZatoshi:unminted.toString(),otherRefundsZatoshi:refunds.toString(),covered:integer(b.controlled)+integer(b.inTransit)>=liabilities};
}
export function guard(b:Books,now:number,newExposure:boolean){
 if(!b.pair)throw Error('BRIDGE_RECONCILIATION_REQUIRED');validateAnchor(b.pair.zcash,now,true);validateAnchor(b.pair.base,now,true);
 if(!b.principalAccount||!b.feeAccount||!b.swapAccount||new Set([b.principalAccount,b.feeAccount,b.swapAccount]).size!==3)throw Error('BRIDGE_ACCOUNT_ISOLATION_REQUIRED');
 if(b.incident)throw Error('BRIDGE_INCIDENT');if(newExposure&&(b.paused||!coverage(b).covered))throw Error('BRIDGE_ADMISSION_PAUSED');
 if(newExposure&&integer(b.feeCapital)<10000n)throw Error('BRIDGE_FEE_CAPITAL_REQUIRED');
}
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function bridgeRequestDigest(input:{direction:Direction;amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string}){
 return digest(['bridge-private-input-v1',input.direction,input.amountAtomic,input.recipient,input.refundRecipient??null,input.payer??null]);
}
/** Explicit versioned positional preimage shared with the independent native
 * verifier. HTTP object property order cannot alter the financial commitment. */
export function bridgeCommitment(input:{salt:string;id:string;direction:Direction;amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string}){
 return '0x'+digest(['bridge-private-order-v1',input.salt,input.id,input.direction,input.amountAtomic,input.recipient,input.refundRecipient??null,input.payer??null]);
}
export function makeOrder(input:{direction:Direction;amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string},capabilityHash:string,key:string,now:number):Order{
 principal(input.amountAtomic);if(!['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'].includes(input.direction))throw Error('BRIDGE_INVALID_DIRECTION');
 const id=randomUUID(),salt=randomBytes(32).toString('hex');return {id,capabilityHash,idempotencyKey:key,requestHash:bridgeRequestDigest(input),...input,commitment:bridgeCommitment({...input,id,salt}),salt,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),status:'QUOTED',funding:null,source:null,destination:null};
}
export type VerifiedEvent =
 | {kind:'DEPOSIT';id:string;amount:string;identity:string;receipt:Receipt}
 | {kind:'MINT';id:string;amount:string;recipient:string;receipt:Receipt}
 | {kind:'CANCEL';id:string;receipt:Receipt}
 | {kind:'BURN';id:string;amount:string;payer:string;commitment:string;identity:string;receipt:Receipt}
 | {kind:'INCLUDE';id:string;receipt:Receipt}
 | {kind:'CONFIRM';id:string;receipt:Receipt}
 | {kind:'ACK';id:string;amount:string;evidenceCommitment:string;receipt:Receipt}
 | {kind:'REORG';id:string;target:'SOURCE'|'DELIVERY'|'ACK';receipt:Receipt};
export function validateReceipt(r:Receipt,b:Books,chain:Receipt['network']){
 if(r.network!==chain||! /^(0x)?[0-9a-f]{64}$/.test(r.transactionHash)||!b.pair)throw Error('BRIDGE_RECEIPT_IDENTITY');
 const anchor=chain==='base-sepolia'?b.pair.base:b.pair.zcash;
 if(!Number.isSafeInteger(r.blockHeight)||r.blockHeight<1||r.blockHeight>anchor.height||! /^(0x)?[0-9a-f]{64}$/.test(r.blockHash))throw Error('BRIDGE_RECEIPT_CHECKPOINT');
}
/** Called only with independently verified canonical evidence, never public HTTP input. */
export function applyEvent(b:Books,e:VerifiedEvent,now:number):void{
 const o=b.orders[e.id];if(!o)throw Error('BRIDGE_ORDER_NOT_FOUND');const fingerprint=digest(e),eventKey=`${e.kind}:${e.id}:${e.receipt.transactionHash}:${e.receipt.blockHash}`;
 if(b.seen[eventKey]){if(b.seen[eventKey]!==fingerprint)throw Error('BRIDGE_EVENT_CONFLICT');
  if(!(e.kind==='REORG'&&e.target==='DELIVERY'&&['IN_TRANSIT','NATIVE_DELIVERED_AWAITING_ACK','COMPLETED'].includes(o.status)))return;
 }
 // Facts already accepted onchain must be reconciled even when intake/signing is
 // paused or freshness has elapsed. The worker verifier, not these format checks,
 // establishes independent canonicality and finality of the selected evidence.
 if(!b.pair)throw Error('BRIDGE_RECONCILIATION_REQUIRED');validateAnchor(b.pair.zcash,now,false);validateAnchor(b.pair.base,now,false);
 const chain=e.kind==='REORG'?(e.target==='ACK'?'base-sepolia':e.target==='SOURCE'?(o.direction==='TAZ_TO_ZEETAZ'?'zcash-testnet':'base-sepolia'):o.included?.network??o.destination?.network):['MINT','CANCEL','BURN','ACK'].includes(e.kind)?'base-sepolia':'zcash-testnet';
 if(!chain)throw Error('BRIDGE_REORG_BINDING');validateReceipt(e.receipt,b,chain);
 const n=integer(o.amountAtomic);
 switch(e.kind){
 case 'DEPOSIT':
  if(o.status!=='AWAITING_DEPOSIT'||e.amount!==o.amountAtomic||!e.identity||b.seen[`source:${e.identity}`])throw Error('BRIDGE_DEPOSIT_BINDING');
  o.source=e.receipt;o.sourceIdentity=e.identity;o.status='DEPOSIT_FINALIZED';b.controlled=(integer(b.controlled)+n).toString();b.seen[`source:${e.identity}`]=o.id;break;
 case 'MINT':
  if(o.status!=='DEPOSIT_FINALIZED'||o.direction!=='TAZ_TO_ZEETAZ'||e.amount!==o.amountAtomic||e.recipient.toLowerCase()!==o.recipient.toLowerCase())throw Error('BRIDGE_MINT_BINDING');
  o.destination=e.receipt;o.status='MINTED';b.supply=(integer(b.supply)+n).toString();
  if(o.feeReservation&&!o.attempt){b.feeCapital=(integer(b.feeCapital)+integer(o.feeReservation.maximum)).toString();delete o.feeReservation;}break;
 case 'CANCEL':
  if(o.status!=='DEPOSIT_FINALIZED'||o.direction!=='TAZ_TO_ZEETAZ')throw Error('BRIDGE_CANCELLATION_BINDING');o.status='CANCELLED';o.deliveryKind='REFUND';o.destination=e.receipt;break;
 case 'BURN':
  if(o.status!=='AWAITING_BURN'||o.direction!=='ZEETAZ_TO_TAZ'||e.amount!==o.amountAtomic||e.commitment!==o.commitment||!e.payer||e.payer.toLowerCase()!==o.payer?.toLowerCase()||!e.identity||b.seen[`source:${e.identity}`]||integer(b.supply)<n)throw Error('BRIDGE_BURN_BINDING');
  o.source=e.receipt;o.sourceIdentity=e.identity;o.burnPayer=e.payer;o.status='REDEMPTION_PENDING';o.deliveryKind='REDEMPTION';b.supply=(integer(b.supply)-n).toString();b.seen[`source:${e.identity}`]=o.id;break;
 case 'INCLUDE':
  if(o.status!=='PAYOUT_PENDING'||!o.attempt?.txid||o.attempt.txid!==e.receipt.transactionHash||integer(b.controlled)<n)throw Error('BRIDGE_INCLUSION_BINDING');
  o.included=e.receipt;o.status='IN_TRANSIT';b.controlled=(integer(b.controlled)-n).toString();b.inTransit=(integer(b.inTransit)+n).toString();break;
 case 'CONFIRM':
  if(o.status!=='IN_TRANSIT'||digest(o.included)!==digest(e.receipt)||integer(b.inTransit)<n)throw Error('BRIDGE_CONFIRMATION_BINDING');
  o.destination=e.receipt;o.status=o.direction==='ZEETAZ_TO_TAZ'?'NATIVE_DELIVERED_AWAITING_ACK':'COMPLETED';b.inTransit=(integer(b.inTransit)-n).toString();break;
 case 'ACK':
  if(o.status!=='NATIVE_DELIVERED_AWAITING_ACK'||o.direction!=='ZEETAZ_TO_TAZ'||!o.destination||e.amount!==o.amountAtomic||e.evidenceCommitment!=='0x'+digest([o.salt,o.destination]))throw Error('BRIDGE_ACK_BINDING');
  o.acknowledgment=e.receipt;o.status='COMPLETED';break;
 case 'REORG':
  if(e.target==='DELIVERY'&&o.status==='IN_TRANSIT'&&digest(o.included)===digest(e.receipt)){
   b.controlled=(integer(b.controlled)+n).toString();b.inTransit=(integer(b.inTransit)-n).toString();o.status='PAYOUT_PENDING';delete o.included;
   delete b.seen[`INCLUDE:${o.id}:${e.receipt.transactionHash}:${e.receipt.blockHash}`];
  }else {
   const affected=e.target==='ACK'?o.acknowledgment:e.target==='SOURCE'?o.source:o.destination;
   if(digest(affected)!==digest(e.receipt))throw Error('BRIDGE_REORG_BINDING');
   b.incident=true;o.frozenFrom??=o.status;if(o.reorgTarget!=='DELIVERY')o.reorgTarget=e.target;o.status='FROZEN';
  }
  b.paused=true;break;
 }
 b.seen[eventKey]=fingerprint;
}
