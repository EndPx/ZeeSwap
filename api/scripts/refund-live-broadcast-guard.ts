import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{createHash}from'node:crypto';
import{connect}from'../src/db.ts';import{PrivateData}from'../src/private-data.ts';import{BaseContract}from'../src/base-contract.ts';
import{loadLiveRefundConfig}from'./refund-live-testnet.ts';import{approvalDigest}from'../src/reverse-authority.ts';
import{sourceRefundTerms,forwardRefundPayoutTerms,refundContext,verifyBaseRefund}from'../src/source-refunds.ts';
import{validatePreparedZcash,type PreparedZcashTransaction}from'../src/reverse-settlement.ts';import type{PreparedBaseTransaction}from'../src/base-signer.ts';import{requireLiveRefundEpoch}from'../src/live-source-refund.ts';
let pool:ReturnType<typeof connect>|undefined;
try{
 const path=process.argv[2];if(!path||process.argv.length!==3)throw Error('LIVE_REFUND_GUARD_REQUIRED');
 const guard=JSON.parse(await readFile(path,'utf8')),{c,runtime,registry}=await loadLiveRefundConfig(guard.configPath);
 if(!c.enabled||resolve(path)!==resolve(c.orderRoot,guard.orderId,'guard.private.json')||resolve(guard.statePath)!==resolve(c.orderRoot,guard.orderId,'state.private.json')||resolve(guard.approvedRequest)!==resolve(c.orderRoot,guard.orderId,'approved.private.json'))throw Error('LIVE_REFUND_GUARD_SCOPE');
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2048)throw Error('LIVE_REFUND_GUARD_INPUT_LIMIT');}const request=JSON.parse(input);
 if(Object.keys(request).sort().join(',')!=='approvedDigest,operationId,rawSha256,txid')throw Error('LIVE_REFUND_GUARD_IDENTITY_FIELDS');
 const state=JSON.parse(await readFile(guard.statePath,'utf8')),approved=JSON.parse(await readFile(guard.approvedRequest,'utf8'));
 if(state.orderId!==guard.orderId||state.approvedDigest!==guard.approvedDigest||!Number.isSafeInteger(state.operatorBackendPid)||typeof state.refundEpoch!=='string')throw Error('LIVE_REFUND_GUARD_STATE');
 pool=connect(runtime.workerUrl,1);const identity=(await pool.query('SELECT current_database() database,current_user role')).rows[0];if(identity.database!=='zee_app_20261023'||identity.role!=='zee_app_worker_20261023')throw Error('LIVE_REFUND_GUARD_DATABASE');
 const held=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=$1 AND classid=84532 AND objid=20261023 AND objsubid=2 AND granted) held",[state.operatorBackendPid])).rows[0];if(!held.held)throw Error('LIVE_REFUND_PARENT_LOCK_LOST');
 const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 const row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId])).rows[0];if(!row?.zcash_payload||row.confirmed||!row.base_confirmed||row.base_phase!=='CANCEL')throw Error('LIVE_REFUND_GUARD_DURABLE_STATE');
 const prepared=keys.open(row.zcash_payload,refundContext(state.orderId,'ZCASH'))as PreparedZcashTransaction,terms=await forwardRefundPayoutTerms(pool,keys,state.orderId),source=await sourceRefundTerms(pool,keys,state.orderId),cancel=keys.open(row.base_payload,refundContext(state.orderId,'CANCEL'))as PreparedBaseTransaction;
 validatePreparedZcash(prepared,terms);
 const checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
 if(request.operationId!==state.orderId||approvalDigest(approved)!==guard.approvedDigest||request.approvedDigest!==guard.approvedDigest||approved.version!==1||approved.kind!=='ZCASH_SOURCE_REFUND'||approved.depositId!==source.row.deposit_id||approved.settlementId!==source.id
  ||source.row.direction!=='ZCASH_TO_BASE'||approved.base.chainId!==84532||approved.base.contract.toLowerCase()!==registry.contracts.ZeeSwapSettlement.address.toLowerCase()||approved.base.token.toLowerCase()!==registry.contracts.MockUSDC.address.toLowerCase()
  ||approved.recipient!==terms.recipient||approved.amountZatoshi!==terms.amountZatoshi||approved.maxFeeZatoshi!==terms.maxFeeZatoshi||approved.base.cancelTxHash!==cancel.hash||approved.base.cancelBlockHash!=='0x'+row.base_block||approved.base.cancelBlockNumber!==String(row.base_height)
  ||request.txid!==prepared.txid||!keys.lookup('zcash-tx',prepared.txid).equals(row.zcash_hash)||request.rawSha256!==createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex')||!checkpoint||BigInt(prepared.expiryHeight)<BigInt(checkpoint.scanned_height)+20n)throw Error('LIVE_REFUND_GUARD_BYTES_OR_APPROVAL');
 if(!await verifyBaseRefund(base,source.id,'CANCEL',cancel.hash))throw Error('LIVE_REFUND_GUARD_CANCEL_FINALITY');await requireLiveRefundEpoch(pool,state.orderId,state.refundEpoch);await pool.query('SELECT zee.check_source_refund_signing($1)',[state.orderId]);
 console.log(JSON.stringify({authorized:true,operationId:state.orderId,approvedDigest:request.approvedDigest,txid:request.txid,rawSha256:request.rawSha256}));
}catch{console.error('LIVE_SOURCE_REFUND_BROADCAST_GUARD_DENIED');process.exitCode=1;}finally{await pool?.end();}
