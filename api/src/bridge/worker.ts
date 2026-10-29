import { applyEvent, digest, guard, integer, validateAnchor,type Pair,type Books, type Order, type VerifiedEvent } from './model.ts';
import type { BridgeStore } from './repository.ts';

/** Canonical verification must compare both independent chain readers, exact network,
 * contract runtime hash/operator/token/8 decimals, authenticated event and immutable
 * order binding, checkpoint ancestry and required finality. HTTP cannot supply this.
 */
export interface BridgeEvidenceVerifier { verify(request:unknown,order:Readonly<Order>,books:Readonly<Books>):Promise<VerifiedEvent> }
export type PreparedDelivery = {intentId:string;txid:string;raw:string;feeAtomic:string;expiryHeight:number};
/** The operator's signer MUST fsync intent and signed bytes before returning, recover
 * the same original bytes for intentId after process/DB restore, and independently
 * validate dedicated principal/fee notes and exact private output. A callback that
 * signs anew on retry violates this interface; there is no runtime default signer.
 */
export interface BridgeDurableSigner {
 assertFreshCanonical(order:Readonly<Order>,books:Readonly<Books>):Promise<void>;
 recoverOrPrepare(intent:{intentId:string;orderId:string;recipient:string;amountAtomic:string;maxFeeAtomic:string;principalAccount:string;feeAccount:string}):Promise<PreparedDelivery>;
 /** MUST use an independent durable broadcastOnce journal (BridgeJournal) before
  * RPC, and reject a prior UNKNOWN submission even after application DB restore. */
 broadcastOriginal(prepared:PreparedDelivery):Promise<void>;
 /** Optional concrete post-proving canonical reread; implementations must verify
  * admitted ancestry and original source, never merely stamp the old heights. */
 refreshCanonicalPair?(order:Readonly<Order>,books:Readonly<Books>):Promise<Pair>;
}
export class BridgeWorker {
 constructor(private store:BridgeStore,private verifier:BridgeEvidenceVerifier,private signer:BridgeDurableSigner){}
 async observe(id:string,request:unknown,now=Date.now()){
  // Verification occurs under the bridge row lock so the paired checkpoint cannot
  // change between verification and liability/accounting publication.
  await this.store.update(async b=>{const o=b.orders[id];if(!o)throw Error('BRIDGE_ORDER_NOT_FOUND');
   const event=await this.verifier.verify(request,structuredClone(o),structuredClone(b));if(event.id!==id)throw Error('BRIDGE_EVENT_ORDER_BINDING');applyEvent(b,event,now);
  });
 }
 async prepare(id:string,maxFeeAtomic:string,now=Date.now()):Promise<PreparedDelivery>{
  const started=Date.now(),current=()=>now+Date.now()-started;
  integer(maxFeeAtomic);if(integer(maxFeeAtomic)>10000n||integer(maxFeeAtomic)===0n)throw Error('BRIDGE_FEE_CAP');
  const intent=await this.store.update(b=>{
   guard(b,current(),false);const o=b.orders[id];if(!o||!['REDEMPTION_PENDING','CANCELLED','PAYOUT_PENDING'].includes(o.status))throw Error('BRIDGE_DELIVERY_NOT_AUTHORIZED');
   // Existing liabilities may be repaid while new admission is paused/deficient,
   // but physical spendability and externally funded fees must still hold.
   if(o.feeReservation&&o.feeReservation.maximum!==maxFeeAtomic)throw Error('BRIDGE_IMMUTABLE_FEE_RESERVATION');
   if(!o.feeReservation&&integer(b.feeCapital)<integer(maxFeeAtomic))throw Error('BRIDGE_FEE_CAPITAL_REQUIRED');
   const reserved=Object.values(b.orders).filter(x=>x.attempt&&x.status==='PAYOUT_PENDING').reduce((sum,x)=>sum+integer(x.amountAtomic),0n);
   if(!o.attempt&&integer(b.controlled)<reserved+integer(o.amountAtomic))throw Error('BRIDGE_PRINCIPAL_RESERVED');
   if(!o.attempt){o.attempt={intentId:digest(['bridge-delivery-v1',o.id,o.commitment])};if(!o.feeReservation){o.feeReservation={maximum:maxFeeAtomic};b.feeCapital=(integer(b.feeCapital)-integer(maxFeeAtomic)).toString();}}
   o.status='PAYOUT_PENDING';return {intentId:o.attempt.intentId,orderId:id,recipient:o.deliveryKind==='REFUND'?o.refundRecipient!:o.recipient,amountAtomic:o.amountAtomic,maxFeeAtomic,principalAccount:b.principalAccount,feeAccount:b.feeAccount};
  });
  if(!intent.recipient)throw Error('BRIDGE_DELIVERY_RECIPIENT_REQUIRED');
  return this.store.update(async b=>{guard(b,current(),false);const o=b.orders[id];if(o.status!=='PAYOUT_PENDING'||o.attempt?.intentId!==intent.intentId)throw Error('BRIDGE_SIGNER_FENCED');
   await this.signer.assertFreshCanonical(structuredClone(o),structuredClone(b));
   guard(b,current(),false);
   const signed=await this.signer.recoverOrPrepare(intent);
   if(this.signer.refreshCanonicalPair){const pair=await this.signer.refreshCanonicalPair(structuredClone(o),structuredClone(b));validateAnchor(pair.zcash,current(),true);validateAnchor(pair.base,current(),true);b.pair=pair;}
   guard(b,current(),false);
   if(signed.intentId!==intent.intentId||! /^(0x)?[a-f0-9]{64}$/.test(signed.txid)||! /^[a-f0-9]+$/.test(signed.raw)||signed.raw.length%2||integer(signed.feeAtomic)>integer(maxFeeAtomic)||!Number.isSafeInteger(signed.expiryHeight)||signed.expiryHeight<=b.pair!.zcash.height)throw Error('BRIDGE_SIGNED_BINDING');
   if(o.attempt.txid){if(digest(o.attempt)!==digest(signed))throw Error('BRIDGE_ORIGINAL_TRANSACTION_REQUIRED');return signed;}
   b.feeCapital=(integer(b.feeCapital)+integer(maxFeeAtomic)-integer(signed.feeAtomic)).toString();o.feeReservation!.charged=signed.feeAtomic;o.attempt={...signed};return signed;
  });
 }
 async broadcast(id:string,now=Date.now()){
  const started=Date.now(),current=()=>now+Date.now()-started;
  // Persist uncertainty BEFORE touching the network. A lost ACK or process crash
  // requires explicit canonical reconciliation, never an automatic re-broadcast.
  await this.store.update(b=>{guard(b,current(),false);const o=b.orders[id];if(o?.status!=='PAYOUT_PENDING'||!o.attempt?.raw)throw Error('BRIDGE_PREPARED_REQUIRED');if(o.broadcastAttempted)throw Error('BRIDGE_BROADCAST_RECONCILIATION_REQUIRED');o.broadcastAttempted=true;});
  // Hold the book lock through the bounded external broadcast. Unknown outcome
  // preserves original signed bytes and liability; callers reconcile before retry.
  await this.store.update(async b=>{guard(b,current(),false);const o=b.orders[id];if(o?.status!=='PAYOUT_PENDING'||!o.attempt?.raw||!o.attempt.txid||!o.attempt.feeAtomic||!o.attempt.expiryHeight)throw Error('BRIDGE_PREPARED_REQUIRED');
   if(o.attempt.expiryHeight<=b.pair!.zcash.height)throw Error('BRIDGE_ORIGINAL_TRANSACTION_EXPIRED');
   await this.signer.assertFreshCanonical(structuredClone(o),structuredClone(b));guard(b,current(),false);await this.signer.broadcastOriginal(o.attempt as PreparedDelivery);
  });
 }
}
