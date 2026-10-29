import {coverage,digest,integer,validateAnchor,type Books,type Order,type VerifiedEvent} from './model.ts';
import {createHash} from 'node:crypto';
import {PausedBridgeRuntime,BridgeMintCoordinator,validateNativeSnapshot,type BridgeNativeRead} from './runtime.ts';
import {NativeBridgeCommand,nativeJsonProcess,type NativeCommandProfile} from './adapters/native.ts';
import {pinnedFile,pinnedExecutable,type FilePin} from './adapters/profile.ts';
import {CanonicalBridgeBase,bridgeAbi} from './adapters/base.ts';
import {readRootPermit,type QualificationContext} from './operator-qualification.ts';
import type {BridgeStore} from './repository.ts';
import type {BridgeReconciliation} from './reconciliation.ts';
import {BridgeReverseCoordinator} from './reverse.ts';
import {reconciledBridgeStatus} from './service.ts';
import {requireRetiredLineage} from './unfunded-retirement.ts';

export type PublicPilotPermit={version:1;purpose:'ROOT_PUBLIC_BRIDGE_PILOT';permitId:string;createdAt:string;expiresAt:string;databaseName:string;databaseRole:string;nativeReadProfileSha256:string;contractAddress:string;runtimeCodeHash:string;principalAccount:string;feeAccount:string;swapAccount:string;amountAtomic:'100000';maxAcceptedPerDirection:1;maxConcurrent:1;qualificationPermitId:string;qualificationPermitSha256:string;qualificationForwardOrderId:string;qualificationReverseOrderId:string;qualificationNativeProfileSha256:string;qualificationRecipientUfvkSha256:string};
export type PublicPilotBinding={permit:PublicPilotPermit;sha256:string};
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export function validatePublicPilotPermit(p:PublicPilotPermit){
 const keys='version purpose permitId createdAt expiresAt databaseName databaseRole nativeReadProfileSha256 contractAddress runtimeCodeHash principalAccount feeAccount swapAccount amountAtomic maxAcceptedPerDirection maxConcurrent qualificationPermitId qualificationPermitSha256 qualificationForwardOrderId qualificationReverseOrderId qualificationNativeProfileSha256 qualificationRecipientUfvkSha256';
 if(!p||Object.keys(p).sort().join()!==keys.split(' ').sort().join()||p.version!==1||p.purpose!=='ROOT_PUBLIC_BRIDGE_PILOT'||![p.permitId,p.qualificationPermitId,p.qualificationForwardOrderId,p.qualificationReverseOrderId].every(uuid)||p.amountAtomic!=='100000'||p.maxAcceptedPerDirection!==1||p.maxConcurrent!==1||!/^zee_bridge_[a-z0-9_]+$/.test(p.databaseName)||!/^zee_bridge_runtime_[a-z0-9_]+$/.test(p.databaseRole)||![p.nativeReadProfileSha256,p.qualificationPermitSha256,p.qualificationNativeProfileSha256,p.qualificationRecipientUfvkSha256].every(x=>/^[a-f0-9]{64}$/.test(x))||!/^0x[a-fA-F0-9]{40}$/.test(p.contractAddress)||!/^0x[a-f0-9]{64}$/.test(p.runtimeCodeHash)||new Set([p.principalAccount,p.feeAccount,p.swapAccount]).size!==3)throw Error('BRIDGE_PUBLIC_PERMIT_SCOPE');
 for(const stamp of [p.createdAt,p.expiresAt])if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(stamp)||new Date(stamp).toISOString()!==stamp)throw Error('BRIDGE_PUBLIC_PERMIT_TIME');
 if(Date.parse(p.createdAt)>Date.now()+5000||Date.parse(p.expiresAt)<=Date.parse(p.createdAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)>86400000)throw Error('BRIDGE_PUBLIC_PERMIT_TIME');return p;
}
export async function loadRootPublicPilotPermit(path:string,sha256:string):Promise<PublicPilotBinding>{return {permit:validatePublicPilotPermit(await readRootPermit(path,sha256) as PublicPilotPermit),sha256};}
export function validateQualifiedNativeTemplate(template:any,qualified:any,spend:{python:unknown;worker:unknown;ownedSupervisor:FilePin},circle:NativeCommandProfile){
 if(template?.version!==1||template.mode!=='BRIDGE_NATIVE_TESTNET'||template.enabled!==true||!spend.ownedSupervisor||!circle.ownedSupervisor||digest(spend.ownedSupervisor)!==digest(circle.ownedSupervisor)||digest(spend.python)!==digest(circle.python)||digest(spend.worker)!==digest(circle.worker))throw Error('BRIDGE_PUBLIC_NATIVE_STACK_NOT_QUALIFIED');
 for(const key of ['serviceUid','root','signingWallet','viewingWallet','ufvkFile','walletUfvkSha256','principalAccount','feeAccount','swapAccount','journalRoot','cli','reader','verifier','node','tsxLoader','preflight','baseProfile','protoDir','modules'])if(digest(template[key])!==digest(qualified[key]))throw Error('BRIDGE_PUBLIC_NATIVE_STACK_NOT_QUALIFIED');
}
export const publicOrders=(b:Readonly<Books>,binding:PublicPilotBinding)=>Object.values(b.orders).filter(o=>o.pilotPermitSha256===binding.sha256);
export type QualificationRecipientProof={ufvkFile:FilePin;ufvkSha256:string;reader:FilePin};
const active=(o:Readonly<Order>)=>o.accepted&&!['MINTED','COMPLETED'].includes(o.status);
/** The completed funded circle is reread, never substituted by a proof-status
 * flag or successful deployment. A native original receipt can be rechecked
 * without requiring its historical spent inventory to equal today's wallet. */
export class FundedBridgeCircle {
 private cached?:{key:string;verifiedAt:number;ids:string[]};
 constructor(readonly base:CanonicalBridgeBase,readonly native:BridgeNativeRead,readonly binding:PublicPilotBinding,readonly circleNative:NativeCommandProfile,readonly recipient?:QualificationRecipientProof){if(circleNative.profile.sha256!==binding.permit.qualificationNativeProfileSha256)throw Error('BRIDGE_CIRCLE_PROFILE_PIN');}
 private async nativeReceipt(o:Readonly<Order>,pins:NativeCommandProfile){
  if(!o.destination||!o.attempt?.txid||!o.acknowledgment)throw Error('BRIDGE_CIRCLE_NATIVE_RECEIPT_REQUIRED');const profile=JSON.parse((await pinnedFile(pins.profile,true)).toString()),r=await new NativeBridgeCommand(pins).run('receipt',o) as any;
  if(profile.approvedDigest!==pins.approvedDigest||r?.orderId!==o.id||r.approvedDigest!==pins.approvedDigest||r.txid!==o.attempt.txid||r.txid!==o.destination.transactionHash||r.blockHeight!==String(o.destination.blockHeight)||r.blockHash!==o.destination.blockHash||r.amount!==o.amountAtomic||r.recipient!==o.recipient||r.fee!=='10000'||r.confirmed!==true||r.shielded!==true||!Number.isSafeInteger(r.confirmations)||r.confirmations<10)throw Error('BRIDGE_CIRCLE_NATIVE_RECEIPT_BINDING');
 }
 private async independentRecipient(o:Readonly<Order>){
  const p=this.recipient;if(!p||p.ufvkSha256!==this.binding.permit.qualificationRecipientUfvkSha256||!o.attempt?.raw||!o.attempt.txid||!o.destination)throw Error('BRIDGE_CIRCLE_INDEPENDENT_RECIPIENT_REQUIRED');
  const profile=JSON.parse((await pinnedFile(this.circleNative.profile,true)).toString());if(p.ufvkSha256===profile.walletUfvkSha256||digest(p.reader)!==digest(profile.reader))throw Error('BRIDGE_CIRCLE_RECIPIENT_ISOLATION');
  const key=(await pinnedFile(p.ufvkFile,true)).toString().trim();if(createHash('sha256').update(key).digest('hex')!==p.ufvkSha256)throw Error('BRIDGE_CIRCLE_RECIPIENT_KEY_PIN');await pinnedExecutable(p.reader);
  const approved=await nativeJsonProcess(p.reader.path,[],{command:'validate',address:o.recipient}) as any,result=await nativeJsonProcess(p.reader.path,[],{command:'decrypt',ufvk:key,raw_hex:o.attempt.raw,txid:o.attempt.txid,height:o.destination.blockHeight}) as any;
  const matches=result.notes?.filter((n:any)=>n.txid===o.attempt!.txid&&n.pool==='ironwood'&&n.amount==='100000'&&n.receiver===approved.receiver&&n.shieldedSource===true&&(n.memo===null||n.memo===''));
  if(approved.network!=='zcash-testnet'||approved.shielded!==true||!Array.isArray(matches)||matches.length!==1)throw Error('BRIDGE_CIRCLE_INDEPENDENT_RECIPIENT_MISMATCH');
 }
 async verify(b:Readonly<Books>){const p=this.binding.permit,f=b.orders[p.qualificationForwardOrderId],r=b.orders[p.qualificationReverseOrderId];
  const started=Date.now();
  if(b.incident||b.qualification?.permitId!==p.qualificationPermitId||b.qualification.permitSha256!==p.qualificationPermitSha256||!f?.accepted||f.status!=='MINTED'||f.direction!=='TAZ_TO_ZEETAZ'||f.amountAtomic!=='100000'||!f.source||!f.destination||!r?.accepted||r.status!=='COMPLETED'||r.direction!=='ZEETAZ_TO_TAZ'||r.amountAtomic!=='100000'||!r.source||!r.destination||!r.acknowledgment)throw Error('BRIDGE_FUNDED_CIRCLE_REQUIRED');
  if(b.unfundedReplacement||f.replacementCertificateSha256)requireRetiredLineage(b,f);
  const completed=publicOrders(b,this.binding).filter(o=>o.direction==='ZEETAZ_TO_TAZ'&&o.status==='COMPLETED'),knownProfiles=publicOrders(b,this.binding).filter(o=>o.nativeProfile).map(o=>[o.id,o.nativeProfile]),key=digest([this.binding.sha256,b.qualification,f,r,completed,knownProfiles]);
  // Actual completed proof only, with a short observation lifetime. Live order
  // source/capital reads below are never replaced by this historical proof cache.
  if(this.cached?.key===key&&Date.now()-this.cached.verifiedAt>=0&&Date.now()-this.cached.verifiedAt<45000)return [...this.cached.ids];
  await this.nativeReceipt(r,this.circleNative);await this.independentRecipient(r);const anchor=await this.base.finalized(),pair={base:anchor,zcash:b.pair!.zcash};
  const minted=await this.base.verify({kind:'MINT',transactionHash:f.destination.transactionHash},f,{...b,pair});if(digest(minted.receipt)!==digest(f.destination))throw Error('BRIDGE_CIRCLE_MINT_REORG');
  for(const o of [r,...completed]){
   const pins=o.id===r.id?this.circleNative:o.nativeProfile;if(!pins||!o.acknowledgment||!o.source)throw Error('BRIDGE_CIRCLE_NATIVE_PROFILE_REQUIRED');if(o.id!==r.id)await this.nativeReceipt(o,pins);
   const burn=await this.base.verify({kind:'BURN',transactionHash:o.source.transactionHash},o,{...b,pair}),ack=await this.base.verify({kind:'ACK',transactionHash:o.acknowledgment.transactionHash},o,{...b,pair});if(digest(burn.receipt)!==digest(o.source)||digest(ack.receipt)!==digest(o.acknowledgment))throw Error('BRIDGE_CIRCLE_ACK_REORG');
  }
  const ids=[r.id,...publicOrders(b,this.binding).filter(o=>o.direction==='ZEETAZ_TO_TAZ'&&o.nativeProfile).map(o=>o.id)];this.cached={key,verifiedAt:started,ids};return ids;
 }
 assertFresh(){if(!this.cached||Date.now()-this.cached.verifiedAt<0||Date.now()-this.cached.verifiedAt>60000)throw Error('BRIDGE_CIRCLE_OBSERVATION_EXPIRED');}
}
/** Fixed finite public admission after the real circle, with separate counters. */
export class PublicBridgePilotRuntime extends PausedBridgeRuntime {
 readonly publicPolicy={amountAtomic:'100000' as const,maxAcceptedPerDirection:1 as const,maxConcurrent:1 as const};
 reverse?:PublicBridgeReverseCoordinator;
 constructor(base:CanonicalBridgeBase,native:BridgeNativeRead,readonly binding:PublicPilotBinding,context:QualificationContext,readonly circle:FundedBridgeCircle){super(base,native);const p=validatePublicPilotPermit(binding.permit);if(!(circle instanceof FundedBridgeCircle)||circle.base!==base||circle.native!==native||circle.binding.sha256!==binding.sha256||p.databaseName!==context.databaseName||p.databaseRole!==context.databaseRole||p.nativeReadProfileSha256!==context.nativeReadProfileSha256||p.contractAddress.toLowerCase()!==base.profile.contractAddress.toLowerCase()||p.runtimeCodeHash!==base.profile.runtimeCodeHash||(['principalAccount','feeAccount','swapAccount'] as const).some(k=>p[k]!==native[k]))throw Error('BRIDGE_PUBLIC_PERMIT_BINDING');}
 assertBinding(b:Readonly<Books>){const p=this.binding.permit,m=b.publicPilot;if(!m||m.permitId!==p.permitId||m.permitSha256!==this.binding.sha256||m.createdAt!==p.createdAt||m.expiresAt!==p.expiresAt||m.qualificationPermitId!==p.qualificationPermitId||m.qualificationPermitSha256!==p.qualificationPermitSha256)throw Error('BRIDGE_PUBLIC_ORIGINAL_PERMIT_REQUIRED');}
 assertAdmission(){if(Date.now()>=Date.parse(this.binding.permit.expiresAt))throw Error('BRIDGE_PUBLIC_PERMIT_EXPIRED');}
 assertOrder(o:Readonly<Order>,b:Readonly<Books>){this.assertBinding(b);this.limits(b);if(o.pilotPermitSha256!==this.binding.sha256||o.amountAtomic!=='100000'||digest(b.orders[o.id])!==digest(o))throw Error('BRIDGE_PUBLIC_ORDER_SCOPE');}
 private limits(b:Readonly<Books>){const orders=publicOrders(b,this.binding);if(orders.some(o=>o.amountAtomic!=='100000')||['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'].some(d=>orders.filter(o=>o.accepted&&o.direction===d).length>1)||orders.filter(active).length>1)throw Error('BRIDGE_PUBLIC_EXPOSURE_LIMIT');}
 bindQuote(o:Order,b:Readonly<Books>){this.assertAdmission();this.assertBinding(b);this.limits(b);if(o.amountAtomic!=='100000'||publicOrders(b,this.binding).some(active)||publicOrders(b,this.binding).some(x=>x.accepted&&x.direction===o.direction))throw Error('BRIDGE_PUBLIC_EXPOSURE_LIMIT');if(o.direction==='TAZ_TO_ZEETAZ'&&o.recipient.toLowerCase()===this.contractAddress.toLowerCase())throw Error('BRIDGE_INVALID_BASE_RECIPIENT');o.pilotPermitSha256=this.binding.sha256;}
 assertAcceptance(o:Readonly<Order>,b:Readonly<Books>){this.assertAdmission();this.assertOrder(o,b);this.limits(b);if(publicOrders(b,this.binding).some(x=>x.id!==o.id&&x.accepted&&(x.direction===o.direction||active(x))))throw Error('BRIDGE_PUBLIC_EXPOSURE_LIMIT');}
 async funding(o:Readonly<Order>,b?:Readonly<Books>){if(!b)throw Error('BRIDGE_PUBLIC_BOOK_REQUIRED');this.assertAcceptance(o,b);if(o.direction==='ZEETAZ_TO_TAZ'){if(!this.reverse)throw Error('BRIDGE_NATIVE_AUTHORITY_NOT_QUALIFIED');return this.reverse.funding(o,b);}return super.funding(o);}
 availability(b:Readonly<Books>){const orders=publicOrders(b,this.binding),busy=orders.some(active),expired=Date.now()>=Date.parse(this.binding.permit.expiresAt),f=!orders.some(o=>o.accepted&&o.direction==='TAZ_TO_ZEETAZ'),r=!orders.some(o=>o.accepted&&o.direction==='ZEETAZ_TO_TAZ'),reverseInventory=integer(b.supply)>=100000n&&integer(b.controlled)>=100000n;return {forwardEnabled:!busy&&!expired&&f,reverseEnabled:!busy&&!expired&&r&&reverseInventory,reason:expired?'BRIDGE_PUBLIC_PERMIT_EXPIRED':busy?'BRIDGE_PUBLIC_ORDER_ACTIVE':!f&&!r?'BRIDGE_PUBLIC_BUDGET_EXHAUSTED':!f&&!reverseInventory?'BRIDGE_PUBLIC_INVENTORY_REQUIRED':undefined};}
 async observe(b:Readonly<Books>){this.limits(b);const ids=await this.circle.verify(b);if(!this.native.assertOutgoingAllowlist)throw Error('BRIDGE_PUBLIC_OUTGOING_VERIFIER_REQUIRED');await this.native.assertOutgoingAllowlist(ids);const orders=Object.values(b.orders).filter(o=>o.accepted&&o.direction==='TAZ_TO_ZEETAZ'&&o.funding?.kind==='shielded-deposit'),s=validateNativeSnapshot(await this.native.snapshot(orders,b.pair?.zcash),this.native,orders,Date.now(),b.pair?.zcash),anchor=await this.base.finalized();if(b.pair&&anchor.height<b.pair.base.height)throw Error('BRIDGE_BASE_CHECKPOINT_REGRESSION');const c=await this.base.readAt(anchor);if(b.pair)await this.base.readAt({...b.pair.base,observedAt:new Date().toISOString()});this.circle.assertFresh();return {s,c};}
 protected assertBooks(b:Readonly<Books>,s:Awaited<ReturnType<PublicBridgePilotRuntime['observe']>>['s'],c:{supply:string;unpaid:string}){
  let reserved=0n;for(const o of Object.values(b.orders))if(o.feeReservation&&!o.included)reserved+=integer(o.feeReservation.maximum);const report=coverage(b);
  if(s.controlledZatoshi!==b.controlled||c.supply!==b.supply||integer(c.unpaid)!==integer(report.unpaidRedemptionsZatoshi)+integer(report.pendingAcknowledgmentsZatoshi)||integer(s.feeCapitalZatoshi)!==integer(b.feeCapital)+reserved)throw Error('BRIDGE_PUBLIC_BOOKS_MISMATCH');
  for(const o of Object.values(b.orders).filter(o=>o.accepted&&o.direction==='TAZ_TO_ZEETAZ'&&o.source)){const e=s.deposits.find(e=>e.id===o.id);if(!e||e.identity!==o.sourceIdentity||digest(e.receipt)!==digest(o.source))throw Error('BRIDGE_NATIVE_ACCEPTED_SOURCE_CONFLICT');}
 }
 async verifiedObservation(b:Readonly<Books>){this.assertBinding(b);this.limits(b);if(!b.pair||b.incident)throw Error('BRIDGE_PUBLIC_CHECKPOINT_REQUIRED');const result=await this.observe(b);this.assertBooks(b,result.s,result.c);if(b.inTransit!=='0')throw Error('BRIDGE_PUBLIC_NATIVE_RECONCILIATION_REQUIRED');for(const anchor of [b.pair.base,b.pair.zcash,result.s.zcash,result.c.anchor])validateAnchor(anchor,Date.now(),true);return result;}
 private report(b:Readonly<Books>,s:{controlledZatoshi:string},c:{supply:string}):BridgeReconciliation{const r=coverage(b);return {pair:b.pair!,network:'testnet',baseChainId:84532,tokenAddress:this.tokenAddress,contractAddress:this.contractAddress,runtimeCodeHash:this.runtimeCodeHash,decimals:8,principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,controlledZatoshi:s.controlledZatoshi,inTransitZatoshi:'0',circulatingZatoshi:c.supply,unpaidRedemptionsZatoshi:r.unpaidRedemptionsZatoshi,pendingAcknowledgmentsZatoshi:r.pendingAcknowledgmentsZatoshi};}
 async recheck(b:Readonly<Books>):Promise<BridgeReconciliation>{const {s,c}=await this.verifiedObservation(b);return this.report(b,s,c);}
 async refresh(store:BridgeStore,resumeWhenIdle=false){return store.update(async b=>{this.assertBinding(b);const {s,c}=await this.observe(b);b.pair={zcash:s.zcash,base:c.anchor};for(const e of s.deposits){const o=b.orders[e.id];if(o.status==='AWAITING_DEPOSIT')applyNativeDeposit(b,e);}this.assertBooks(b,s,c);if(b.inTransit!=='0')throw Error('BRIDGE_PUBLIC_NATIVE_RECONCILIATION_REQUIRED');validateAnchor(s.zcash,Date.now(),true);validateAnchor(c.anchor,Date.now(),true);if(resumeWhenIdle&&!publicOrders(b,this.binding).some(active))b.paused=Date.now()>=Date.parse(this.binding.permit.expiresAt);return reconciledBridgeStatus(b,this,this.report(b,s,c));});}
 async open(store:BridgeStore){this.assertAdmission();return store.update(async b=>{if(!b.paused||b.incident)throw Error('BRIDGE_PUBLIC_PAUSED_OPEN_REQUIRED');if(b.publicPilot)this.assertBinding(b);const {s,c}=await this.observe(b);this.assertBooks(b,s,c);if(!coverage(b).covered||integer(b.feeCapital)<10000n||c.paused)throw Error('BRIDGE_PUBLIC_CAPITAL_REQUIRED');const p=this.binding.permit;b.publicPilot={permitId:p.permitId,permitSha256:this.binding.sha256,createdAt:p.createdAt,expiresAt:p.expiresAt,qualificationPermitId:p.qualificationPermitId,qualificationPermitSha256:p.qualificationPermitSha256};b.pair={zcash:s.zcash,base:c.anchor};b.paused=false;return {paused:false,...this.availability(b)};});}
}
import {applyEvent} from './model.ts';
function applyNativeDeposit(b:Books,e:Extract<VerifiedEvent,{kind:'DEPOSIT'}>){applyEvent(b,e,Date.now());}
export class PublicBridgeMintCoordinator extends BridgeMintCoordinator {
 constructor(readonly pilot:PublicBridgePilotRuntime){super(pilot);}
 async assert(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){this.pilot.assertOrder(o,b);if(base!==this.pilot.base||o.direction!=='TAZ_TO_ZEETAZ'||!o.accepted||o.status!=='DEPOSIT_FINALIZED'||!o.source)throw Error('BRIDGE_PUBLIC_MINT_SCOPE');const {s,c}=await this.pilot.verifiedObservation(b),e=s.deposits.find(e=>e.id===o.id);if(!e||e.identity!==o.sourceIdentity||digest(e.receipt)!==digest(o.source)||c.paused)throw Error('BRIDGE_PUBLIC_MINT_PROOF');}
}
export class PublicBridgeReverseCoordinator extends BridgeReverseCoordinator {
 constructor(readonly pilot:PublicBridgePilotRuntime){super(pilot,{sha256:pilot.binding.sha256,permit:{permitId:pilot.binding.permit.permitId,expiresAt:pilot.binding.permit.expiresAt}});}
 protected scope(o:Readonly<Order>,b:Readonly<Books>){this.pilot.assertOrder(o,b);if(b.incident||o.direction!=='ZEETAZ_TO_TAZ')throw Error('BRIDGE_PUBLIC_REVERSE_SCOPE');}
 protected async inventory(_o:Readonly<Order>,b:Readonly<Books>){const result=await this.pilot.verifiedObservation(b);if(result.c.paused)throw Error('BRIDGE_CONTRACT_PAUSED');return result;}
 protected async checkOutgoing(o:Readonly<Order>,b?:Readonly<Books>){if(!b)throw Error('BRIDGE_PUBLIC_BOOK_REQUIRED');this.pilot.assertOrder(o,b);const ids=await this.pilot.circle.verify(b);if(!this.pilot.native.assertOutgoingAllowlist)throw Error('BRIDGE_PUBLIC_OUTGOING_VERIFIER_REQUIRED');await this.pilot.native.assertOutgoingAllowlist([...new Set([...ids,o.id])]);}
 async assertAuthorization(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){this.scope(o,b);this.pilot.assertAcceptance(o,b);if(base!==this.pilot.base||o.status!=='QUOTED'||o.accepted||b.paused)throw Error('BRIDGE_PUBLIC_REVERSE_AUTHORIZATION_SCOPE');const {c}=await this.inventory(o,b);const values=await Promise.all(base.clients.map(x=>x.readContract({address:base.profile.contractAddress,abi:bridgeAbi,functionName:'balanceOf',args:[o.payer as `0x${string}`],blockNumber:BigInt(c.anchor.height)})));if(values.some(v=>v<100000n)||values[0]!==values[1])throw Error('BRIDGE_REVERSE_PAYER_BALANCE');}
}
