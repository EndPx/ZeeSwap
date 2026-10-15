import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {G5_RETRY_TARGET,type G5State} from './g5-run.ts';
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
