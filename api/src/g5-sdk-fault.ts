import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {G5_RETRY_TARGET,validateG5WalletPartitionCommon,validateG5ReverseWalletCapital,type G5State} from './g5-run.ts';
import {approvalDigest} from './reverse-authority.ts';
import {validatePreparedZcash,type PreparedZcashTransaction,type ReversePayoutTerms} from './reverse-settlement.ts';

/** This is the deliberately induced fourth-slot durable-calculate interruption,
 * never a generic unknown signing/broadcast recovery. */
export function requireG5SdkFaultRecovery(state:G5State,config:any,reverse:any,marker:any){
 if(config.branchId!==G5_RETRY_TARGET.branchId||state.batchSize!==5||!state.incident||!state.policyInitialized||state.closed
  ||state.orders.length!==4||(state.barriers?.length??0)!==0
  ||state.orders.some((o,i)=>o.sequence!==i+1||!o.orderId||o.direction!==(i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE'))
  ||state.orders.slice(0,3).some(o=>!o.receiptVerified)||state.orders[3].receiptVerified
  ||reverse.orderId!==state.orders[3].orderId||reverse.owner!==state.orders[3].owner
  ||reverse.lastFailure?.step!=='prepare-zcash'||reverse.lastFailure?.message!=='REVERSE_WALLET_UNAVAILABLE_RECONCILE'
  ||!reverse.approvedRequest||!/^[0-9a-f]{64}$/.test(reverse.approvedDigest??'')||approvalDigest(reverse.approvedRequest)!==reverse.approvedDigest
  ||marker?.version!==1||marker.boundary!=='SDK_DURABLE_BEFORE_ADAPTER_PREPARED'||marker.orderId!==reverse.orderId
  ||marker.approvedDigest!==reverse.approvedDigest||!/^[0-9a-f]{64}$/.test(marker.txid??'')||!/^[0-9a-f]{64}$/.test(marker.rawSha256??''))
  throw Error('G5_ONLY_R4_DURABLE_SDK_FAULT_RECOVERABLE');
}

export function validateG5SdkFaultPrepared(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms,marker:any,approvedNote:any){
 validatePreparedZcash(prepared,terms);
 if(prepared.txid!==marker.txid||createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex')!==marker.rawSha256
  ||prepared.amount!=='100000'||prepared.feeZatoshi!=='10000'||prepared.selectedNotes.length!==1
  ||!isDeepStrictEqual(prepared.selectedNotes[0],approvedNote)||approvedNote.value!=='110000'
  ||prepared.outputs.some(o=>o.ownChange&&o.amount!=='0'))throw Error('G5_SDK_FAULT_ORIGINAL_BYTES_REQUIRED');
}

const SDK_FAULT_PROOF_PINS={cliCommand:'ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1',verifyCommand:'df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2',readCommand:'fda8623aa1ad759976865e45bca797f50fd7cd45fe8730cf4abf03527ae3aba1'};
/** One literal faulted R4 may hold its original input in the SDK calculation.
 * This reports zero spendable balance; it never promotes locked input to cash.
 * The caller has run the fixed original-byte verifier, not a caller proof API.
 */
export function validateG5SdkFaultWalletBalances(proof:any,state:G5State,forwardNotes:{pool:string;txid:string;index:number;value:string}[],config:any,reverse:any,marker:any,faultProof:any,terms:ReversePayoutTerms,approvedNote:any,completedReversePrepared:PreparedZcashTransaction){
 requireG5SdkFaultRecovery(state,config,reverse,marker);
 if(faultProof?.version!==1||faultProof.status!=='G5_ORIGINAL_SDK_FAULT_RECOVERED_NOT_BROADCAST'||faultProof.notFound!==true||!isDeepStrictEqual(faultProof.marker,marker)||!isDeepStrictEqual(faultProof.pins,SDK_FAULT_PROOF_PINS))throw Error('G5_SDK_FAULT_PRIVATE_PROOF_MISMATCH');
 validateG5SdkFaultPrepared(faultProof.prepared,terms,marker,approvedNote);
 if(!Number.isSafeInteger(faultProof.tipHeight)||faultProof.tipHeight<=0||BigInt(faultProof.tipHeight)+20n>BigInt(faultProof.prepared.expiryHeight))throw Error('G5_SDK_FAULT_SAFE_ORIGINAL_EXPIRY_REQUIRED');
 validateG5WalletPartitionCommon(proof,state,forwardNotes);
 const allocated=(state.openingCapital as any[])?.find(n=>n.sequence===4),p=proof.reverse[1],pending=p.pendingSdkFault,prepared=faultProof.prepared;
 if(!isDeepStrictEqual(approvedNote,{pool:allocated.pool,txid:allocated.txid,index:allocated.index,value:allocated.amount})||p.spendableZatoshi!=='0'||p.notes.length!==0||p.pendingLockedCapitalZatoshi!=='110000'||p.pendingCalculatedTransactions!==1
  ||pending?.version!==1||pending.boundary!==marker.boundary||pending.txid!==marker.txid||pending.rawSha256!==marker.rawSha256||pending.approvedDigest!==marker.approvedDigest||!isDeepStrictEqual(pending.selectedNote,approvedNote)||pending.originalNotFound!==true
  ||!Number.isSafeInteger(pending.calculatedHeight)||pending.calculatedHeight<=0||pending.calculatedHeight>p.scannedHeight||typeof pending.expiryHeight!=='string'||!/^[1-9][0-9]*$/.test(pending.expiryHeight)||pending.expiryHeight!==prepared.expiryHeight||BigInt(pending.calculatedHeight)>=BigInt(pending.expiryHeight)||BigInt(p.scannedHeight)+20n>BigInt(prepared.expiryHeight))throw Error('G5_SDK_FAULT_EXACT_LOCKED_CAPITAL_REQUIRED');
 const expected=prepared.outputs.filter((o:any)=>o.ownChange).map((o:any)=>({pool:'ironwood',txid:marker.txid,index:o.index,rawSha256:marker.rawSha256}));
 if(expected.length!==1||!isDeepStrictEqual(p.zeroOwnChange,expected))throw Error('G5_SDK_FAULT_EXACT_ZERO_CHANGE_REQUIRED');
 const priorZeros=completedReversePrepared.outputs.filter(o=>o.ownChange).map(o=>({pool:'ironwood',txid:completedReversePrepared.txid,index:o.index,rawSha256:createHash('sha256').update(Buffer.from(completedReversePrepared.rawTransaction,'hex')).digest('hex')}));
 if(!isDeepStrictEqual(proof.reverse[0].zeroOwnChange,priorZeros))throw Error('G5_SDK_FAULT_PRIOR_ZERO_CHANGE_REQUIRED');
 for(let i=0;i<10;i++)if(i!==1){validateG5ReverseWalletCapital(proof.reverse[i],(state.openingCapital as any[]).find(n=>n.sequence===(i+1)*2),i===0);if(i>1&&(!Array.isArray(proof.reverse[i].zeroOwnChange)||proof.reverse[i].zeroOwnChange.length))throw Error('G5_SDK_FAULT_UNKNOWN_OTHER_ZERO_CHANGE');}
}

export function validateG5SdkFaultAccounts(accounts:any[],chargedFees:string){
 const expected=[['mockUSDC','principal','800000','0'],['TAZ','principal','900000','100000'],['TAZ','fee','120000','10000'],
  ['baseETH','fee',(300000000000000n-BigInt(chargedFees)).toString(),'50000000000000']];
 if(accounts.length!==4||expected.some(([asset,purpose,balance,reserved])=>accounts.filter(a=>a.asset===asset&&a.purpose===purpose&&a.balance===balance&&a.reserved===reserved).length!==1))
  throw Error('G5_SDK_FAULT_HELD_BOOKS_MISMATCH');
}

export function validateG5SdkFaultPhysical(opening:{inventory:string;operatorGas:string},chargedFees:string,commitFee:string,p:any){
 const inventory=BigInt(opening.inventory)-100000n,gas=BigInt(opening.operatorGas)-BigInt(chargedFees)-BigInt(commitFee);
 if(gas<0n||p.inventory!==inventory.toString()||p.available!==inventory.toString()||p.tokenBalance!==(inventory+100000n).toString()
  ||p.escrowLiability!=='100000'||p.gas!==gas.toString())throw Error('G5_SDK_FAULT_HELD_PHYSICAL_MISMATCH');
}

/** enter_reconciliation has already retired the failed worker lease. Accept
 * exactly that single fence advance, never an active or subsequently claimed job. */
export function requireG5SdkFaultRetiredLease(job:any,lease:any){
 if(!job||!lease||job.id!==lease.jobId||job.status!=='QUEUED'||job.lease_owner!==null||job.lease_until!==null
  ||BigInt(job.fence)!==BigInt(lease.fence)+1n)throw Error('G5_SDK_FAULT_RETIRED_LEASE_REQUIRED');
}
