import {runRefundQuery,requirePolicyWorkerOrder} from './testnet-policy-refund.ts';
/** Read-only final native broadcast fence for the relocated operator. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect} from './db.ts';
import {PrivateData} from './private-data.ts';
import {BaseContract} from './base-contract.ts';
import {loadLinuxNativeDispatch,nativeOrderDirectory,applyLinuxNativeFastExecution,type NativePurpose} from './linux-native-dispatch.ts';
import {assertReverseAuthority,approvalDigest} from './reverse-authority.ts';
import {escrowTerms,refreshIncludedEscrowFunding,observeEscrowCommit} from './base-escrow.ts';
import {reversePayoutTerms,validatePreparedZcash,type PreparedZcashTransaction} from './reverse-settlement.ts';
import {readPolicyExecutionEpoch} from './testnet-policy-execution.ts';
import {requireFreshLiveDispatchObservers} from './live-dispatch-scope.ts';
import {sourceRefundTerms,forwardRefundPayoutTerms,refundContext,verifyBaseRefund} from './source-refunds.ts';
import type {PreparedBaseTransaction} from './base-signer.ts';
import {requireLiveRefundEpoch} from './live-source-refund.ts';
function need(v:unknown):asserts v{if(!v)throw Error('LINUX_NATIVE_BROADCAST_GUARD_DENIED');}
export async function runLinuxNativeGuard(purpose:NativePurpose,path:string,request:any){
 const guard=JSON.parse(await readFile(path,'utf8')),loaded=await loadLinuxNativeDispatch(guard.configPath,purpose),{c,verified}=loaded;
 need(c.enabled);const directory=nativeOrderDirectory(verified.profile,purpose,guard.orderId);
 need(path===directory+'/guard.private.json'&&guard.statePath===directory+'/state.private.json'&&guard.approvedRequest===directory+'/approved.private.json');
 need(Object.keys(request).sort().join(',')==='approvedDigest,operationId,rawSha256,txid');
 const state=JSON.parse(await readFile(guard.statePath,'utf8')),approved=JSON.parse(await readFile(guard.approvedRequest,'utf8'));
 need(state.orderId===guard.orderId&&state.approvedDigest===guard.approvedDigest&&state.operatorProfileSha256===verified.profileSha256&&Number.isSafeInteger(state.operatorBackendPid));
 const preparedBytes=await readFile(directory+'/prepared.private.json');need(state.nativeConfigSha256===createHash('sha256').update(preparedBytes).digest('hex'));
 const preparedConfig=JSON.parse(preparedBytes.toString());need(JSON.stringify(preparedConfig.policyContext)===JSON.stringify(state.policyContext));
 if(preparedConfig.fastBaseInclusion){
  need(purpose==='reverse'&&preparedConfig.fastBaseInclusion===true&&state.policyContext);
  const rootPin=preparedConfig.baseFastRoot,stat=await (await import('node:fs/promises')).lstat(rootPin.path),raw=await readFile(rootPin.path);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&(stat.mode&0o077)===0&&await (await import('node:fs/promises')).realpath(rootPin.path)===rootPin.path&&createHash('sha256').update(raw).digest('hex')===rootPin.sha256);
  const root=JSON.parse(raw.toString());need(root.purpose==='ROOT_BASE_L2_FAST_EXECUTION'&&root.profileSha256===verified.profileSha256&&root.policySha256===state.policyContext.policySha256&&root.activeEpoch===state.policyContext.activeEpoch);
  const fast=await applyLinuxNativeFastExecution(loaded,rootPin,root);need(JSON.stringify(fast.nativeFastExecution?.pin)===JSON.stringify(preparedConfig.nativeFastExecution));
 }

 const {runtime,registry}=verified,pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 try{
  const identity=(await pool.query('SELECT current_database() database,current_user role')).rows[0];need(identity?.database==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023');
  const lock=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_database d ON d.oid=l.database WHERE d.datname=current_database()
   AND l.locktype='advisory' AND l.pid=$1 AND l.classid=84532::oid AND l.objid=20261023::oid AND l.objsubid=2 AND l.granted) owned`,[state.operatorBackendPid])).rows[0];need(lock?.owned===true);
  if(state.policyContext)await requirePolicyWorkerOrder(pool,state.policyContext,state.orderId,{profileSha256:verified.profileSha256,handoffSha256:createHash('sha256').update(await readFile(c.handoffProof)).digest('hex'),openingProofSha256:verified.profile.immutable.openingProof.sha256,settlementContract:registry.contracts.ZeeSwapSettlement.address,tokenContract:registry.contracts.MockUSDC.address});
  const checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];need(checkpoint);
  if(purpose==='reverse'){
   need(state.currentLease&&typeof state.dispatchEpoch==='string');
   const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[state.orderId])).rows[0];need(row&&!row.confirmed&&keys.lookup('zcash-tx',request.txid).equals(row.tx_hash));
   const prepared=keys.open(row.signed_payload,`reverse-payout:${state.orderId}:v1`) as PreparedZcashTransaction,terms=await reversePayoutTerms(pool,keys,state.orderId),funding=await escrowTerms(pool,keys,base,state.orderId);
   assertReverseAuthority(request,approved,guard.approvedDigest,state.orderId,prepared,terms,funding,registry.contracts.ZeeSwapSettlement.address,String(checkpoint.scanned_height));
   if(state.policyContext)need(state.dispatchEpoch===await readPolicyExecutionEpoch(pool,state.policyContext.policySha256,state.policyContext.activeEpoch));
   await requireFreshLiveDispatchObservers(pool,state.dispatchEpoch);const lease=state.currentLease;
   if(preparedConfig.fastBaseInclusion){await refreshIncludedEscrowFunding(pool,keys,base,state.orderId);need(['COMMIT_INCLUDED','COMMIT_FINALIZED'].includes((await observeEscrowCommit(pool,keys,base,state.orderId,true)).status));}
   await pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,lease.jobId,lease.owner,lease.fence]);
  }else{
   need(typeof state.refundEpoch==='string');const row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId])).rows[0];need(row?.zcash_payload&&!row.confirmed&&row.base_confirmed&&row.base_phase==='CANCEL');
   const prepared=keys.open(row.zcash_payload,refundContext(state.orderId,'ZCASH')) as PreparedZcashTransaction,terms=await forwardRefundPayoutTerms(pool,keys,state.orderId),source=await sourceRefundTerms(pool,keys,state.orderId),cancel=keys.open(row.base_payload,refundContext(state.orderId,'CANCEL')) as PreparedBaseTransaction;
   validatePreparedZcash(prepared,terms);
   need(request.operationId===state.orderId&&approvalDigest(approved)===guard.approvedDigest&&request.approvedDigest===guard.approvedDigest&&approved.version===1&&approved.kind==='ZCASH_SOURCE_REFUND'
    &&approved.depositId===source.row.deposit_id&&approved.settlementId===source.id&&source.row.direction==='ZCASH_TO_BASE'&&approved.base.chainId===84532
    &&approved.base.contract.toLowerCase()===registry.contracts.ZeeSwapSettlement.address.toLowerCase()&&approved.base.token.toLowerCase()===registry.contracts.MockUSDC.address.toLowerCase()
    &&approved.recipient===terms.recipient&&approved.amountZatoshi===terms.amountZatoshi&&approved.maxFeeZatoshi===terms.maxFeeZatoshi&&approved.base.cancelTxHash===cancel.hash
    &&approved.base.cancelBlockHash==='0x'+row.base_block&&approved.base.cancelBlockNumber===String(row.base_height)&&request.txid===prepared.txid
    &&keys.lookup('zcash-tx',prepared.txid).equals(row.zcash_hash)&&request.rawSha256===createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex')
    &&BigInt(prepared.expiryHeight)>=BigInt(checkpoint.scanned_height)+20n);
   need(await verifyBaseRefund(base,source.id,'CANCEL',cancel.hash));if(state.policyContext)await requirePolicyWorkerOrder(pool,state.policyContext,state.orderId,{profileSha256:verified.profileSha256,handoffSha256:createHash('sha256').update(await readFile(c.handoffProof)).digest('hex'),openingProofSha256:verified.profile.immutable.openingProof.sha256,settlementContract:registry.contracts.ZeeSwapSettlement.address,tokenContract:registry.contracts.MockUSDC.address});await requireLiveRefundEpoch(pool,state.orderId,state.refundEpoch,state.policyContext);await runRefundQuery(pool,'signing',state.orderId,[],state.policyContext);
  }
  return {authorized:true,operationId:state.orderId,approvedDigest:request.approvedDigest,txid:request.txid,rawSha256:request.rawSha256};
 }finally{await pool.end();}
}
export async function linuxNativeGuardMain(purpose:NativePurpose){
 try{const path=process.argv[2];need(path&&process.argv.length===3);let input='';for await(const part of process.stdin){input+=part;need(input.length<=2048);}
  console.log(JSON.stringify(await runLinuxNativeGuard(purpose,path,JSON.parse(input))));}
 catch{console.error('LINUX_NATIVE_BROADCAST_GUARD_DENIED');process.exitCode=1;}
}
