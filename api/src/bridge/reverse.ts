import {encodeFunctionData,type Hex} from 'viem';
import {applyEvent,coverage,digest,integer,validateAnchor,type Anchor,type Books,type Funding,type Order,type Receipt,type VerifiedEvent} from './model.ts';
import {PausedBridgeRuntime,validateNativeSnapshot} from './runtime.ts';
import {bridgeAbi,CanonicalBridgeBase} from './adapters/base.ts';
import {CastBridgeBaseSigner} from './adapters/cast.ts';
import {NativeBridgeCommand,type NativeCommandProfile} from './adapters/native.ts';
import {BridgeJournal} from './journal.ts';
import type {BridgeDurableSigner,PreparedDelivery} from './worker.ts';
import type {BridgeStore} from './repository.ts';

type Capital={version:1;status:'BRIDGE_NATIVE_CAPITAL_VERIFIED';controlledZatoshi:string;feeCapitalZatoshi:string;inTransitZatoshi:string;notes:Array<{pool:string;txid:string;index:number;value:string;role:'principal'|'fee'}>;included:null|{txid:string;height:number;blockHash:string;principalZatoshi:string;confirmations:number};principalAccount:string;feeAccount:string;zcash:Anchor};
type NativeReceipt={orderId:string;approvedDigest:string;txid:string;blockHeight:string;blockHash:string;amount:string;fee:string;recipient:string;confirmations:number;confirmed:boolean;shielded:boolean};
type FinancialBinding={sha256:string;permit:{permitId:string;expiresAt:string;reverse?:{payer:string;recipient:string}}};
/** Bounded first-circle reverse authority. No HTTP authority or financial state
 * derives from a readiness flag; every effect rechecks canonical native/Base facts. */
export class BridgeReverseCoordinator {
 private signer?:CastBridgeBaseSigner;
 private native?:{command:NativeBridgeCommand;profile:any};
 constructor(readonly runtime:PausedBridgeRuntime,readonly binding:FinancialBinding){if(!(runtime instanceof PausedBridgeRuntime))throw Error('BRIDGE_CONCRETE_REVERSE_COORDINATOR_REQUIRED');}
 bindSigner(signer:CastBridgeBaseSigner){if(!(signer instanceof CastBridgeBaseSigner)||signer.base!==this.runtime.base)throw Error('BRIDGE_REVERSE_SIGNER_BINDING');this.signer=signer;}
 bindNative(pins:NativeCommandProfile,profile:any){
  if(profile.principalAccount!==this.runtime.native.principalAccount||profile.feeAccount!==this.runtime.native.feeAccount||profile.swapAccount!==this.runtime.native.swapAccount||profile.root!=='/opt/zeeswap-bridge-testnet'||profile.signingWallet!==profile.root+'/signing'||profile.viewingWallet!==profile.root+'/viewing')throw Error('BRIDGE_REVERSE_NATIVE_PROFILE_BINDING');
  const notes=[...(profile.capitalNotes??[]),...(profile.extraFeeNotes??[])],principal=notes.filter(n=>n.role==='principal'),fees=notes.filter(n=>n.role==='fee'),ids=new Set(notes.map(n=>[n.pool,n.txid,n.index].join(':')));
  if(principal.length!==1||principal[0].value!=='100000'||fees.length<1||fees.length>10||fees.some(n=>n.value!=='10000')||notes.length!==ids.size||notes.some(n=>n.pool!=='ironwood'||!/^[a-f0-9]{64}$/.test(n.txid)||!Number.isSafeInteger(n.index)||n.index<0))throw Error('BRIDGE_REVERSE_EXACT_INVENTORY_PROFILE');
  this.native={command:new NativeBridgeCommand(pins),profile};
 }
 protected scope(o:Readonly<Order>,b:Readonly<Books>){const p=this.binding.permit;
  if(!p.reverse||!b.qualification||b.qualification.permitSha256!==this.binding.sha256||b.qualification.permitId!==p.permitId||b.incident||o.direction!=='ZEETAZ_TO_TAZ'||o.amountAtomic!=='100000'||o.payer!==p.reverse.payer||o.recipient!==p.reverse.recipient||digest(b.orders[o.id])!==digest(o)||Object.values(b.orders).filter(x=>x.accepted&&x.direction==='ZEETAZ_TO_TAZ').length>1)throw Error('BRIDGE_REVERSE_ORIGINAL_SCOPE');
 }
 protected async inventory(o:Readonly<Order>,b:Readonly<Books>){
  const native=this.runtime.native,orders=Object.values(b.orders).filter(x=>x.accepted&&x.direction==='TAZ_TO_ZEETAZ'&&x.funding?.kind==='shielded-deposit');await native.assertNoOutgoing();
  const s=validateNativeSnapshot(await native.snapshot(orders,b.pair?.zcash),native,orders,Date.now(),b.pair?.zcash),base=this.runtime.base,c=await base.readAt(await base.settlementAnchor());
  let reserved=0n;for(const x of Object.values(b.orders))if(x.feeReservation){if(x.feeReservation.charged!==undefined)throw Error('BRIDGE_REVERSE_PRIOR_SPEND_RECONCILIATION_REQUIRED');reserved+=integer(x.feeReservation.maximum);}
  const report=coverage(b);if(s.controlledZatoshi!==b.controlled||c.supply!==b.supply||integer(c.unpaid)!==integer(report.unpaidRedemptionsZatoshi)+integer(report.pendingAcknowledgmentsZatoshi)||integer(s.feeCapitalZatoshi)!==integer(b.feeCapital)+reserved||!report.covered||integer(s.controlledZatoshi)<100000n)throw Error('BRIDGE_REVERSE_INVENTORY_MISMATCH');
  if(c.paused)throw Error('BRIDGE_CONTRACT_PAUSED');return {s,c};
 }
 async assertAuthorization(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){
  this.scope(o,b);if(base!==this.runtime.base||o.status!=='QUOTED'||o.accepted||b.paused||Date.now()>=Date.parse(this.binding.permit.expiresAt)||Object.values(b.orders).some(x=>x.accepted&&x.direction==='ZEETAZ_TO_TAZ'))throw Error('BRIDGE_REVERSE_NEW_AUTHORIZATION_SCOPE');
  const {c}=await this.inventory(o,b);if(integer(b.feeCapital)<10000n)throw Error('BRIDGE_FEE_CAPITAL_REQUIRED');
  const balances=await Promise.all(base.clients.map(x=>x.readContract({address:base.profile.contractAddress,abi:bridgeAbi,functionName:'balanceOf',args:[o.payer as Hex],blockNumber:BigInt(c.anchor.height)})));if(balances.some(x=>x<100000n)||balances[0]!==balances[1])throw Error('BRIDGE_REVERSE_PAYER_BALANCE');
 }
 async funding(o:Readonly<Order>,b:Readonly<Books>):Promise<Funding>{
  if(!this.signer)throw Error('BRIDGE_REVERSE_SIGNER_REQUIRED');await this.assertAuthorization(this.runtime.base,o,b);const a=await this.signer.authorize('Redemption',o,b),q=a.terms;
  return {kind:'authenticated-burn',network:'base-sepolia',chainId:84532,contract:this.runtime.contractAddress,token:this.runtime.tokenAddress,terms:q as any,signature:a.signature,calldata:encodeFunctionData({abi:bridgeAbi,functionName:'requestRedemption',args:[{id:q.id,payer:q.payer,amount:BigInt(q.amount),payoutCommitment:q.payoutCommitment,nonce:BigInt(q.nonce),deadline:BigInt(q.deadline)},a.signature]})};
 }
 async assertBurn(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){this.scope(o,b);if(base!==this.runtime.base||!b.paused||!o.accepted||o.status!=='AWAITING_BURN'||o.funding?.kind!=='authenticated-burn'||o.payer?.toLowerCase()!==base.profile.operator.toLowerCase())throw Error('BRIDGE_OPERATOR_BURN_SCOPE');await this.inventory(o,b);}
 async observeBurn(store:BridgeStore,id:string,transactionHash:Hex){return store.update(async b=>{
  const o=b.orders[id];this.scope(o,b);if(!b.paused)throw Error('BRIDGE_OPERATOR_PAUSED_BURN_REQUIRED');const {s,c}=await this.runtime.observe(b);b.pair={zcash:s.zcash,base:c.anchor};const event=await this.runtime.base.verify({kind:'BURN',transactionHash},o,b);applyEvent(b,event,Date.now());await this.runtime.recheck(b);
 });}
 protected async checkOutgoing(o:Readonly<Order>,_b?:Readonly<Books>){if(!this.runtime.native.assertOutgoingScope)throw Error('BRIDGE_REVERSE_NATIVE_PROFILE_REQUIRED');await this.runtime.native.assertOutgoingScope(o.id);}
 protected async capital(o:Readonly<Order>,b?:Readonly<Books>):Promise<Capital>{
  if(!this.native)throw Error('BRIDGE_REVERSE_NATIVE_PROFILE_REQUIRED');await this.checkOutgoing(o,b);const c=await this.native.command.run('capital',o) as Capital;
  if(c?.version!==1||c.status!=='BRIDGE_NATIVE_CAPITAL_VERIFIED'||c.principalAccount!==this.runtime.native.principalAccount||c.feeAccount!==this.runtime.native.feeAccount||!Array.isArray(c.notes)||c.notes.length>11)throw Error('BRIDGE_REVERSE_CAPITAL_BINDING');validateAnchor(c.zcash,Date.now(),true);
  const approved=[...this.native.profile.capitalNotes,...(this.native.profile.extraFeeNotes??[])];
  let principal=0n,fees=0n;const seen=new Set<string>();for(const n of c.notes){const key=[n.pool,n.txid,n.index].join(':');if(n.pool!=='ironwood'||!/^[a-f0-9]{64}$/.test(n.txid)||!Number.isSafeInteger(n.index)||n.index<0||seen.has(key)||!approved.some(a=>a.pool===n.pool&&a.txid===n.txid&&a.index===n.index&&a.value===n.value&&a.role===n.role))throw Error('BRIDGE_REVERSE_CAPITAL_NOTE');seen.add(key);if(n.role==='fee')fees+=integer(n.value);else principal+=integer(n.value);}
  if(c.controlledZatoshi!==principal.toString()||c.feeCapitalZatoshi!==fees.toString())throw Error('BRIDGE_REVERSE_CAPITAL_SUM');
  integer(c.inTransitZatoshi);return c;
 }
 private assertCapitalBook(c:Capital,b:Readonly<Books>,o:Readonly<Order>,baseUnpaid:string,baseSupply:string){
  const report=coverage(b),reserved=c.included?0n:integer(o.feeReservation?.maximum??'0');
  if(c.controlledZatoshi!==b.controlled||c.inTransitZatoshi!==b.inTransit||integer(c.feeCapitalZatoshi)!==integer(b.feeCapital)+reserved||baseSupply!==b.supply||integer(baseUnpaid)!==integer(report.unpaidRedemptionsZatoshi)+integer(report.pendingAcknowledgmentsZatoshi))throw Error('BRIDGE_REVERSE_BOOK_RECONCILIATION');
 }
 async assertPayout(o:Readonly<Order>,b:Readonly<Books>){
  this.scope(o,b);if(!b.paused||!o.accepted||!['REDEMPTION_PENDING','PAYOUT_PENDING'].includes(o.status)||!o.source)throw Error('BRIDGE_REVERSE_PAYOUT_SCOPE');
  const c=await this.capital(o,b);if(c.included||c.controlledZatoshi!=='100000')throw Error('BRIDGE_REVERSE_ORIGINAL_ALREADY_INCLUDED');await this.runtime.base.assertCanonicalOrder(o,b);
  const base=await this.runtime.base.readAt(await this.runtime.base.settlementAnchor());this.assertCapitalBook(c,b,o,base.unpaid,base.supply);
 }
 async refreshPayout(store:BridgeStore,id:string){return store.update(async b=>{const o=b.orders[id];await this.assertPayout(o,b);const c=await this.capital(o,b),base=await this.runtime.base.readAt(await this.runtime.base.settlementAnchor());b.pair={zcash:c.zcash,base:base.anchor};return b.pair;});}
 async reconcileNative(store:BridgeStore,id:string){return store.update(async b=>{
  const o=b.orders[id];this.scope(o,b);if(!b.paused||!o.attempt?.txid||!this.native)throw Error('BRIDGE_REVERSE_ORIGINAL_REQUIRED');const c=await this.capital(o,b),base=await this.runtime.base.readAt(await this.runtime.base.settlementAnchor());
  await this.runtime.base.assertCanonicalOrder(o,{...b,pair:{zcash:c.zcash,base:base.anchor}});b.pair={zcash:c.zcash,base:base.anchor};
  if(c.included){const i=c.included;if(i.txid!==o.attempt.txid||i.principalZatoshi!==o.amountAtomic||!Number.isSafeInteger(i.height)||i.height<1||!Number.isSafeInteger(i.confirmations)||i.confirmations<1||!/^[a-f0-9]{64}$/.test(i.blockHash))throw Error('BRIDGE_REVERSE_INCLUDED_BINDING');const receipt:Receipt={network:'zcash-testnet',transactionHash:i.txid,blockHeight:i.height,blockHash:i.blockHash};
   if(o.status==='PAYOUT_PENDING')applyEvent(b,{kind:'INCLUDE',id,receipt},Date.now());
   else if(digest(o.included)!==digest(receipt))throw Error('BRIDGE_REVERSE_DELIVERY_REORG');
   if(i.confirmations>=10){const r=await this.native.command.run('receipt',o) as NativeReceipt;this.verifyReceipt(r,o,receipt);if(o.status==='IN_TRANSIT')applyEvent(b,{kind:'CONFIRM',id,receipt},Date.now());}
  }else if(o.included||o.destination)throw Error('BRIDGE_REVERSE_DELIVERY_REORG');
  this.assertCapitalBook(c,b,o,base.unpaid,base.supply);return {status:o.status,pair:b.pair};
 });}
 private verifyReceipt(r:NativeReceipt,o:Readonly<Order>,receipt:Receipt){if(!this.native||r?.orderId!==o.id||r.approvedDigest!==this.native.profile.approvedDigest||r.txid!==o.attempt?.txid||r.txid!==receipt.transactionHash||r.blockHeight!==String(receipt.blockHeight)||r.blockHash!==receipt.blockHash||r.amount!==o.amountAtomic||r.recipient!==o.recipient||r.fee!=='10000'||!Number.isSafeInteger(r.confirmations)||r.confirmations<10||r.confirmed!==true||r.shielded!==true)throw Error('BRIDGE_REVERSE_CONFIRMED_RECEIPT_BINDING');}
 private verifyIncluded(c:Capital,o:Readonly<Order>,receipt:Receipt){const i=c.included;if(!i||!Number.isSafeInteger(i.confirmations)||i.confirmations<10||i.txid!==receipt.transactionHash||i.height!==receipt.blockHeight||i.blockHash!==receipt.blockHash||i.principalZatoshi!==o.amountAtomic||c.zcash.height-i.height+1<10)throw Error('BRIDGE_REVERSE_ACK_DELIVERY_REORG');}
 async assertAck(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){
  this.scope(o,b);if(base!==this.runtime.base||!b.paused||o.status!=='NATIVE_DELIVERED_AWAITING_ACK'||!o.destination||!this.native)throw Error('BRIDGE_REVERSE_ACK_SCOPE');
  const c=await this.capital(o,b),r=await this.native.command.run('receipt',o) as NativeReceipt;this.verifyReceipt(r,o,o.destination);this.verifyIncluded(c,o,o.destination);
  await base.assertCanonicalOrder(o,b);const counters=await base.readAt(await base.settlementAnchor());this.assertCapitalBook(c,b,o,counters.unpaid,counters.supply);
 }
 async observeAck(store:BridgeStore,id:string,transactionHash:Hex){return store.update(async b=>{
  const o=b.orders[id];this.scope(o,b);if(!b.paused||!o.destination||!this.native)throw Error('BRIDGE_REVERSE_ACK_SCOPE');const c=await this.capital(o,b),r=await this.native.command.run('receipt',o) as NativeReceipt;this.verifyReceipt(r,o,o.destination);this.verifyIncluded(c,o,o.destination);const base=await this.runtime.base.readAt(await this.runtime.base.settlementAnchor());b.pair={zcash:c.zcash,base:base.anchor};applyEvent(b,await this.runtime.base.verify({kind:'ACK',transactionHash},o,b),Date.now());this.assertCapitalBook(c,b,o,base.unpaid,base.supply);
 });}
 signerAdapter(journal:BridgeJournal,mode:'prepare'|'recover'='prepare'):BridgeDurableSigner{
  let original:Readonly<Order>|undefined;
  const coordinator=this;
  return {assertFreshCanonical:async(o,b)=>{await coordinator.assertPayout(o,b);original=structuredClone(o);},refreshCanonicalPair:async(o,b)=>{await coordinator.assertPayout(o,b);const c=await coordinator.capital(o,b),base=await coordinator.runtime.base.readAt(await coordinator.runtime.base.settlementAnchor());return {zcash:c.zcash,base:base.anchor};},recoverOrPrepare:async intent=>{
   const o=original,n=coordinator.native;if(!o||!n||intent.orderId!==o.id||intent.intentId!==digest(['bridge-delivery-v1',o.id,o.commitment])||intent.amountAtomic!==o.amountAtomic||intent.recipient!==o.recipient||intent.maxFeeAtomic!=='10000'||intent.principalAccount!==coordinator.runtime.native.principalAccount||intent.feeAccount!==coordinator.runtime.native.feeAccount)throw Error('BRIDGE_REVERSE_NATIVE_INTENT_BINDING');
   const binding={orderId:o.id,commitment:o.commitment,source:o.source,permitSha256:coordinator.binding.sha256,profileSha256:n.command.pins.profile.sha256};
   const recover=async()=>{const p=await n.command.run(mode==='recover'?'recover':'prepare',o) as any;return {intentId:p.intentId,txid:p.txid,raw:p.rawTransaction,feeAtomic:p.feeZatoshi,expiryHeight:Number(p.expiryHeight)} as PreparedDelivery;};
   return mode==='recover'?journal.recoverPreparedOnce(intent.intentId,binding,recover):journal.prepareOnce(intent.intentId,binding,recover);
  },broadcastOriginal:async prepared=>{const o=original,n=coordinator.native;if(!o||!n||o.attempt?.txid!==prepared.txid||o.attempt.raw!==prepared.raw)throw Error('BRIDGE_REVERSE_NATIVE_ORIGINAL_BINDING');await journal.broadcastOnce(prepared.intentId,prepared,async()=>{const result=await n.command.run('broadcast',o) as any;if(result.txid!==prepared.txid)throw Error('BRIDGE_REVERSE_BROADCAST_UNKNOWN');});}};
 }
}
