/** One manually approved user actor; no keys, network, SQL or operator wallet access. */
import {createHash} from 'node:crypto';
import {parseTransaction,recoverTransactionAddress,keccak256,encodeFunctionData,parseAbi,isAddress} from 'viem';
import {decodeOrder} from '../../apps/web/src/protocol.ts';
export const NS='market-user-circle-20261027-r1',ORIGIN='https://zeeswap.endpx.cloud';
export let PAYER,TOKEN,SETTLEMENT;
export const need=(v,c)=>{if(!v)throw Error('MARKET_USER_'+c);};
export const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const sha=v=>createHash('sha256').update(v).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export function configureActor(p){
 need(p?.version===1&&p.status==='ROOT_MARKET_ACTOR_APPROVED'&&p.namespace===NS&&p.apiOrigin===ORIGIN&&p.mockMintAuthorized===false&&p.operatorNativeSetupAuthorized===false&&p.sourceCollectorsClosed===true,'ROOT_APPROVAL');
 need(hash(p.identityProofSha256)&&hash(p.profileSha256)&&hash(p.policySha256)&&hash(p.gatesProofSha256)&&p.forwardInput==='100000'&&p.reverseInput==='1000000'&&p.maxAcceptedPerDirection===1&&p.maxExpiredQuotesPerDirection===2&&p.nativeFeeCap==='10000'&&p.baseFeeCap==='10000000000000'&&p.baseAggregateFeeCap==='20000000000000','FINITE_CAPS');
 need([p.payerAddress,p.tokenContract,p.settlementContract].every(v=>typeof v==='string'&&isAddress(v)&&!/^0x0{40}$/i.test(v))&&/^utest1[023456789acdefghjklmnpqrstuvwxyz]{30,506}$/.test(p.nativePayerReceiver),'ACTOR_IDENTITIES');
 need(Number.isFinite(Date.parse(p.verifiedAt))&&Date.parse(p.verifiedAt)<=Date.now()+5000&&Date.parse(p.expiresAt)>Date.parse(p.verifiedAt)&&Date.parse(p.expiresAt)-Date.parse(p.verifiedAt)<=7200000,'ACTOR_AUTHORITY_TTL');
 PAYER=p.payerAddress.toLowerCase();TOKEN=p.tokenContract.toLowerCase();SETTLEMENT=p.settlementContract.toLowerCase();return p;
}
export function validateIdentityProof(p,approval){
 need(p?.version===1&&p.status==='ROOT_MARKET_ACTOR_IDENTITY_CAPITAL_VERIFIED'&&p.namespace===NS&&sha(stable(p))===approval.identityProofSha256&&['new-faucet','reused-non-g5'].includes(p.identityMode)&&p.nonG5===true&&p.pendingCalculatedCount===0&&p.originalJournalsClosed===true,'IDENTITY_EVIDENCE');
 need(p.baseAddress.toLowerCase()===PAYER&&p.nativeReceiver===approval.nativePayerReceiver&&p.initialMockAtomic==='0'&&/^[0-9]+$/.test(p.initialBaseNonce)&&[p.walletDir,p.walletLockPath,p.ufvkFile,p.baseAccount,p.basePasswordFile,p.baseNonceLockPath].every(v=>typeof v==='string'&&v.length>0&&!/g5/i.test(v))&&hash(p.ufvkSha256),'ISOLATED_USER_KEYS');
 need(Array.isArray(p.evidenceFiles)&&p.evidenceFiles.length>0&&p.evidenceFiles.every(v=>typeof v.path==='string'&&hash(v.sha256))&&Array.isArray(p.expectedProvenance)&&p.expectedProvenance.length>0,'CAPITAL_EVIDENCE_PINS');
 need(p.expectedProvenance.every(n=>n.pool==='ironwood'&&hash(n.txid)&&Number.isSafeInteger(n.index)&&n.index>=0&&/^[1-9][0-9]*$/.test(n.value)&&Number.isSafeInteger(n.height)&&n.height>0&&hash(n.blockHash)&&typeof n.ownChange==='boolean'),'CAPITAL_PROVENANCE');
 if(p.identityMode==='new-faucet')need(p.expectedProvenance.every(n=>n.ownChange===false),'ACTUAL_FAUCET_NOT_INTERNAL_CHANGE');
 need(new Set(p.expectedProvenance.map(n=>n.txid+':'+n.index)).size===p.expectedProvenance.length&&BigInt(p.capitalBalanceZatoshi)===p.expectedProvenance.reduce((s,n)=>s+BigInt(n.value),0n)&&BigInt(p.capitalBalanceZatoshi)>=110000n,'SOURCE_CAPITAL');return p;
}
export function validateBinding(r,policy,policySha,accepted,token,now=Date.now()){
 need(r?.version===1&&r.status==='ROOT_MARKET_USER_ORDER_BOUND'&&r.namespace===NS&&r.policySha256===policySha&&hash(policySha)&&r.activeEpoch===policy.activeEpoch&&r.branchId==='br-broad-pine-ao79wemx'&&uuid(r.orderId)&&['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(r.direction),'ROOT_ORDER_BINDING');
 need(hash(r.rootMembershipEvidenceSha256)&&hash(r.acceptedView?.sha256)&&/^0x[a-f0-9]{64}$/.test(r.settlementId)&&hash(r.snapshotSha256),'ROOT_MEMBER_SNAPSHOT');
 need(r.inputAmountAtomic===(r.direction==='ZCASH_TO_BASE'?'100000':'1000000')&&r.maxNativeFeeAtomic==='10000'&&r.maxEvmFeeWei==='10000000000000'&&r.payerAddress.toLowerCase()===PAYER&&r.tokenContract.toLowerCase()===TOKEN&&r.settlementContract.toLowerCase()===SETTLEMENT&&r.accessTokenSha256===sha(token)&&r.apiOrigin===ORIGIN,'EXACT_ACTOR_AMOUNT');
 need(Number.isFinite(Date.parse(r.verifiedAt))&&Date.parse(r.expiresAt)>Date.parse(r.verifiedAt)&&Date.parse(r.expiresAt)-Date.parse(r.verifiedAt)<=7200000&&Date.parse(r.verifiedAt)<=now+5000,'BINDING_TTL');assertOrder(r,accepted,false);
 if(r.direction==='ZCASH_TO_BASE'){
  need(BigInt(r.outputAmountAtomic)>=1000000n&&Number.isSafeInteger(r.acceptedSourceHeight)&&r.funding.cutoffHeight===r.acceptedSourceHeight+40,'FORWARD_PROCEEDS_AND_CUTOFF');const m=JSON.parse(r.funding.memo);need(Object.keys(m).sort().join(',')==='ref,v'&&m.v===1&&uuid(m.ref)&&JSON.stringify(m)===r.funding.memo&&r.funding.receiver.startsWith('utest1')&&r.funding.network==='zcash-testnet','CANONICAL_MEMO');
 }else need(/^(0|[1-9][0-9]*)$/.test(r.approvalNonce)&&BigInt(r.fundingNonce)===BigInt(r.approvalNonce)+1n&&Number.isSafeInteger(Number(r.fundingNonce)),'DYNAMIC_NONCES');
}
export function validateMembership(r,evidence,approval){
 need(evidence?.version===1&&evidence.status==='ROOT_MARKET_USER_MEMBERSHIP_VERIFIED'&&evidence.namespace===NS&&evidence.policySha256===r.policySha256&&evidence.activeEpoch===r.activeEpoch&&evidence.orderId===r.orderId&&evidence.profileSha256===approval.profileSha256&&evidence.membershipCount===1&&evidence.globalActiveOrders===1,'ACTUAL_ROOT_MEMBERSHIP');
 const q=evidence.acceptedQuote;need(q?.id===r.orderId&&q.direction===r.direction&&q.inputAmount===r.inputAmountAtomic&&q.outputAmount===r.outputAmountAtomic&&q.snapshotSha256===r.snapshotSha256&&q.settlementId===r.settlementId&&q.recipient===(r.direction==='ZCASH_TO_BASE'?PAYER:approval.nativePayerReceiver)&&q.refundRecipient===(r.direction==='ZCASH_TO_BASE'?approval.nativePayerReceiver:PAYER)&&(r.direction==='ZCASH_TO_BASE'||q.payer===PAYER),'ROOT_PRIVATE_DESTINATIONS');
 need(Array.isArray(evidence.evidenceFiles)&&evidence.evidenceFiles.length>0&&evidence.evidenceFiles.every(p=>typeof p.path==='string'&&hash(p.sha256)),'ROOT_MEMBERSHIP_READBACK_FILES');return evidence;
}
export function assertOrder(r,value,effect=true){
 const v=decodeOrder(value);need(v.id===r.orderId&&v.direction===r.direction&&!v.integrationOnly&&v.priceMode==='market-reference'&&v.pricing.locked&&v.pricing.snapshotSha256===r.snapshotSha256&&v.inputAmount===r.inputAmountAtomic&&v.outputAmount===r.outputAmountAtomic&&v.executionMode===(r.direction==='ZCASH_TO_BASE'?'base-settlement-v1':'base-escrow-v1'),'ACCEPTED_MARKET_ORDER');
 if(effect)need(v.status==='AWAITING_FUNDS'&&v.source.received===false&&v.source.confirmed===false,'OWN_EMPTY_SOURCE');
 if(v.status==='AWAITING_FUNDS')need(stable(r.direction==='ZCASH_TO_BASE'?v.funding:v.escrowFunding)===stable(r.funding),'ACCEPTED_FUNDING_IMMUTABLE');return v;
}
export function assertOwnBusy(r,v,a,h,now=Date.now()){
 assertOrder(r,v);need(Date.parse(r.expiresAt)>now&&h?.integrationOnly===false&&a?.version===2&&a.pricingMode==='market-reference'&&a.status==='busy'&&a.policy?.sha256===r.policySha256&&a.policy.activeOrders===1&&a.policy.maxConcurrent===1&&now-Date.parse(a.checkedAt)>=-5000&&now-Date.parse(a.checkedAt)<=60000,'OWN_ACCEPTED_CURRENT_GATES');
}
export function nativeRequest(r){need(r.direction==='ZCASH_TO_BASE','FORWARD_ONLY');return {version:1,profile:NS,branchId:r.branchId,orderId:r.orderId,recipient:r.funding.receiver,amountZatoshi:'100000',maxFeeZatoshi:'10000',memo:r.funding.memo,cutoffHeight:r.funding.cutoffHeight,acceptedSourceHeight:r.acceptedSourceHeight,policySha256:r.policySha256,activeEpoch:r.activeEpoch};}
export function requireOriginalJournal(state,action){if(action==='prepare')need(state===undefined,'EXISTING_INTENT_NEVER_RECALCULATE');if(action==='broadcast')need(state==='PREPARED','UNKNOWN_NO_RESEND');}
export async function assertUserRaw(raw,expected){const tx=parseTransaction(raw);need(tx.type==='legacy'&&tx.chainId===84532&&Number.isSafeInteger(expected.nonce)&&tx.nonce===expected.nonce&&tx.to?.toLowerCase()===expected.to.toLowerCase()&&(tx.data??'0x')===expected.data&&(tx.value??0n)===0n&&tx.gas===450000n&&tx.gasPrice===20000000n&&(raw.length-2)/2<=(expected.kind==='approve'?512:768)&&(await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()===expected.payer.toLowerCase(),'SIGNED_RAW');return {hash:keccak256(raw),nonce:tx.nonce,maxFeeWei:'10000000000000'};}
export function assertMinedApprovalForFunding(a,f,r,c){const data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[SETTLEMENT,1000000n]});need(f.kind==='fund'&&f.payer===PAYER&&f.to===SETTLEMENT&&Number.isSafeInteger(f.nonce)&&f.nonce>0&&stable(a)===stable({...f,kind:'approve',to:TOKEN,data,nonce:f.nonce-1}),'APPROVAL_TERMS');need(r?.mined===true&&/^0x[a-f0-9]{64}$/.test(r.hash)&&/^0x[a-f0-9]{64}$/.test(r.blockHash)&&/^(0|[1-9][0-9]*)$/.test(r.fee)&&BigInt(r.fee)<=10000000000000n&&c.latest===f.nonce&&c.pending===f.nonce&&c.allowance===1000000n,'MINED_APPROVAL_PREREQUISITE');}
