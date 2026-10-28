/** Narrow issuer-history prerequisite for a distinct, explicitly approved service opening.
 * No source-checkpoint publication, admission authority, DB access or signing. */
import {decodeFunctionData,decodeEventLog,getAddress,keccak256,parseTransaction,recoverTransactionAddress,type Hex,type TransactionSerialized} from 'viem';
import {settlementAbi,type BaseRegistry} from './base-contract.ts';
import {continuationDigest} from './native-circle-continuation.ts';
import {createHash} from 'node:crypto';
const need=(v:unknown,c:string)=>{if(!v)throw Error('FIRST_SERVICE_OPENING_'+c);};
/** Original accepted-prefix manifest counts packets separately from intervals. */
export function validateAcceptedOpeningPrefix(p:any){
 need(p?.count===384&&p.intervals===3840&&p.blocks===768000&&p.bytes===57380684
  &&p.lastRecordDigest==='958f1888ac92b873f58eb82f6501dc4cbb5436a032491cb0f816b21b33c2c8c9'
  &&p.lastSdkHeight===51338274&&p.lastRevision==='1224862','ORIGINAL_ACCEPTED_PREFIX');return p;
}
export function requireConsumableOpeningSuffix(openingHeight:number,through:number,recoveryFloor:number,eventCount:number){
 need([openingHeight,through,recoveryFloor,eventCount].every(Number.isSafeInteger)&&openingHeight>31&&through>=openingHeight&&through-openingHeight<=150&&recoveryFloor>=0&&recoveryFloor<=openingHeight-31&&eventCount===0,'FRESH_CONSUMABLE_SOURCE_SUFFIX');
}
export type CancellationIssuerEvidence={
 operator:string;latestNonce:number;pendingNonce:number;
 directoryFiles:{name:string;sha256:string;bytes:number}[];
 signed:{raw:Hex;hash:Hex;nonce:number};
 transaction:{hash:Hex;from:string;to:string;nonce:number;input:Hex;value:string;blockNumber:string;blockHash:Hex};
 receipt:{status:'success'|'reverted';transactionHash:Hex;blockNumber:string;blockHash:Hex;logs:{address:string;topics:Hex[];data:Hex}[]};
 anchor:{height:string;hash:Hex};receiptCanonicalHash:Hex;currentState:number;
};
/** Verifies the actual nonce-0 cancellation and its finalized event. The supplied
 * file inventory still needs Root's protected directory/config/quiescence capture.
 * A nonce bound alone cannot prove that EIP-712 authorizations were never issued. */
export async function verifyCancellationOnlyIssuerHistory(registry:BaseRegistry,id:Hex,e:CancellationIssuerEvidence){
 const operator=getAddress(registry.operator),contract=getAddress(registry.contracts.ZeeSwapSettlement.address);
 need(operator===getAddress(e.operator)&&operator!==getAddress('0x037F334b58D6Be70730aEe0d830096F9a431aF9B'),'CURRENT_PROFILE_OPERATOR_REQUIRED');
 need(e.latestNonce===1&&e.pendingNonce===1&&e.signed.nonce===0,'EXACT_CANCELLATION_ONLY_NONCE');
 const journalName=createHash('sha256').update(id).digest('hex')+'.refund.CANCEL.tx.json';
 need(e.directoryFiles.length===2&&e.directoryFiles.some(f=>f.name==='signer.lock'&&f.bytes===0)
  &&e.directoryFiles.some(f=>f.name===journalName&&f.bytes>0&&f.bytes<=32768)
  &&e.directoryFiles.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)),'EXACT_CAPTURED_JOURNAL_INVENTORY');
 const tx=parseTransaction(e.signed.raw),decoded=decodeFunctionData({abi:settlementAbi,data:tx.data!});
 need(tx.type==='legacy'&&tx.chainId===84532&&tx.nonce===0&&(tx.value??0n)===0n
  &&getAddress(tx.to!)===contract&&keccak256(e.signed.raw)===e.signed.hash
  &&getAddress(await recoverTransactionAddress({serializedTransaction:e.signed.raw as TransactionSerialized}))===operator
  &&decoded.functionName==='cancelSettlement'&&decoded.args[0]===id,'ORIGINAL_SIGNED_CANCELLATION');
 const t=e.transaction,r=e.receipt;
 need(t.hash===e.signed.hash&&getAddress(t.from)===operator&&getAddress(t.to)===contract&&t.nonce===0
  &&t.input===tx.data&&t.value==='0'&&r.transactionHash===t.hash&&r.status==='success'
  &&r.blockNumber===t.blockNumber&&r.blockHash===t.blockHash&&r.blockHash===e.receiptCanonicalHash
  &&/^[1-9][0-9]*$/.test(r.blockNumber)&&/^[1-9][0-9]*$/.test(e.anchor.height)
  &&BigInt(r.blockNumber)<=BigInt(e.anchor.height)&&/^0x[a-f0-9]{64}$/.test(e.anchor.hash)
  &&e.currentState===3,'FINALIZED_CANCELLATION_BINDING');
 const events=r.logs.filter(log=>getAddress(log.address)===contract).map(log=>{
  try{return decodeEventLog({abi:settlementAbi,topics:log.topics as [Hex,...Hex[]],data:log.data,strict:true});}catch{return null;}
 });
 need(events.length===1&&events[0]?.eventName==='SettlementCancelled'&&events[0].args.id===id,'EXACT_CANCELLATION_EVENT');
 return {version:1,status:'CURRENT_ISSUER_CANCELLATION_ONLY_VERIFIED' as const,operator,
  evidenceSha256:continuationDigest(e),anchor:e.anchor,knownSignedTransactionCount:1,knownEip712AuthorizationFileCount:0,
  fullIssuerInventoryProven:false,completeContractHistory:false,admissionAuthorized:false};
}

export function assessSharedContractLiabilityExclusions(s:{inventory:string;reserved:string;escrow:string;available:string;tokenBalance:string;known:{id:Hex;state:1|5;payoutAmount:string;escrowAmount:string}[]}){
 for(const x of[s.inventory,s.reserved,s.escrow,s.available,s.tokenBalance,...s.known.flatMap(r=>[r.payoutAmount,r.escrowAmount])])need(/^(0|[1-9][0-9]*)$/.test(x),'EXACT_SHARED_AMOUNT');
 need(s.known.length===2&&new Set(s.known.map(r=>r.id)).size===2&&s.known.every(r=>/^0x[a-f0-9]{64}$/.test(r.id)),'KNOWN_OUTSIDE_LIABILITY_IDS');
 const payouts=s.known.filter(r=>r.state===1),committed=s.known.filter(r=>r.state===5);
 need(payouts.length===1&&committed.length===1&&payouts[0]!.payoutAmount==='100000'&&committed[0]!.escrowAmount==='100000','EXACT_OUTSIDE_LIABILITIES');
 need(s.reserved==='100000'&&s.escrow==='100000','NO_UNEXPLAINED_ACTIVE_LIABILITY');
 need(BigInt(s.inventory)>=BigInt(s.reserved)&&BigInt(s.available)===BigInt(s.inventory)-BigInt(s.reserved)
  &&BigInt(s.tokenBalance)>=BigInt(s.inventory)+BigInt(s.escrow)&&BigInt(s.available)>=200000n,'SHARED_CAPITAL_ACCOUNTING');
 return {knownActiveLiabilitiesExplainAggregates:true,oldLiabilitiesRetained:true,availableInventory:s.available,completeContractHistory:false,admissionAuthorized:false};
}

/** Main database prerequisites. Retains other campaigns' shared-contract
 * liabilities rather than requiring global counters to be zero. */
export function assessFirstServiceOpeningBooks(snapshot:Record<string,any[]>,expectedFinancialDigest:string,baseOrderStatusRows:unknown[]){
 need(continuationDigest(snapshot)===expectedFinancialDigest,'FINANCIAL_SNAPSHOT_PIN');
 need(Array.isArray(baseOrderStatusRows)&&baseOrderStatusRows.length===0,'BASE_STATUS_PRESENT');
 for(const table of ['base_bindings','escrow_bindings','base_attempts','escrow_commits'])
  need(Array.isArray(snapshot[table])&&snapshot[table]!.length===0,'MAIN_BINDINGS_OR_ATTEMPTS_PRESENT');
 need(snapshot.orders?.length===2&&snapshot.orders.every(r=>['REFUNDED','EXPIRED_UNFUNDED'].includes(r.state))
  &&snapshot.orders.filter(r=>r.state==='REFUNDED').length===1&&snapshot.orders.filter(r=>r.state==='EXPIRED_UNFUNDED').length===1,'EXACT_MAIN_CLOSED_ORDERS');
 need(snapshot.obligations?.length===1&&snapshot.obligations[0]?.state==='DISCHARGED','MAIN_OBLIGATION_OPEN');
 need(Array.isArray(snapshot.operations)&&snapshot.operations.length===1&&snapshot.operations[0]?.kind==='REFUND'&&snapshot.operations[0]?.state==='CONFIRMED','MAIN_OPERATION_NOT_CONFIRMED_REFUND');
 need(Array.isArray(snapshot.reservations)&&snapshot.reservations.every(r=>r.released_at!==null),'MAIN_RESERVATION_OPEN');
 return {mainDatabaseClosed:true,completeContractHistory:false,admissionAuthorized:false};
}
