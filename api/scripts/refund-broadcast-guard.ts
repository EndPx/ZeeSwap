/** Fixed private refund authority. Stdin contains identity only, never a send. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {connect} from '../src/db.ts';
import {runtime} from './runtime.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {BaseContract,loadBaseRegistry} from '../src/base-contract.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
import {refundContext,forwardRefundPayoutTerms,sourceRefundTerms,verifyBaseRefund} from '../src/source-refunds.ts';
import {validatePreparedZcash,type PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import type {PreparedBaseTransaction} from '../src/base-signer.ts';
import {requireRefundTarget} from '../src/refund-incident.ts';
import {assertIncidentRefund} from './refund-incident-context.ts';
const path=process.argv[2];if(!path||process.argv.length!==3)throw Error('Fixed private source refund config required');
const config=JSON.parse(await readFile(path,'utf8')),database=JSON.parse(await readFile(resolve(config.databaseConfig),'utf8'));
const incident=requireRefundTarget(config,database,[],'broadcast-zcash');
process.env.ZEE_RUNTIME_CONFIG=resolve(config.runtimeConfig);const r=await runtime(true);
requireRefundTarget(config,database,[r.workerUrl],'broadcast-zcash');
const pool=connect(r.workerUrl);
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2048)throw Error('Bounded identity required');}
 const request=JSON.parse(input);
 if(Object.keys(request).sort().join(',')!=='approvedDigest,operationId,rawSha256,txid')throw Error('Exact identity schema required');
 const state=JSON.parse(await readFile(resolve(config.stateFile),'utf8')),approved=JSON.parse(await readFile(resolve(config.approvedRequest),'utf8'));
 const row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId])).rows[0];
 if(!row?.zcash_payload||row.confirmed||row.base_phase!=='CANCEL')throw Error('Durable unresolved forward refund required');
 const p=r.keys.open(row.zcash_payload,refundContext(state.orderId,'ZCASH')) as PreparedZcashTransaction;
 const terms=await forwardRefundPayoutTerms(pool,r.keys,state.orderId);validatePreparedZcash(p,terms);
 const source=await sourceRefundTerms(pool,r.keys,state.orderId),base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl));
 if(incident)await assertIncidentRefund(config,state,pool,r.keys,base);
 const cancellation=r.keys.open(row.base_payload,refundContext(state.orderId,'CANCEL')) as PreparedBaseTransaction;
 const checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
 if(request.operationId!==state.orderId||approved.orderId!==state.orderId||request.approvedDigest!==state.approvedDigest
  ||approvalDigest(approved)!==state.approvedDigest||approved.kind!=='ZCASH_SOURCE_REFUND'||approved.depositId!==source.row.deposit_id
  ||approved.recipient!==terms.recipient||approved.amountZatoshi!==terms.amountZatoshi||approved.maxFeeZatoshi!==terms.maxFeeZatoshi
  ||approved.settlementId!==source.id||approved.base.cancelTxHash!==cancellation.hash||approved.base.cancelBlockHash!=='0x'+row.base_block
  ||approved.base.cancelBlockNumber!==String(row.base_height)||approved.base.contract.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()
  ||approved.base.token.toLowerCase()!==base.registry.contracts.MockUSDC.address.toLowerCase()
  ||request.txid!==p.txid||!r.keys.lookup('zcash-tx',p.txid).equals(row.zcash_hash)
  ||request.rawSha256!==createHash('sha256').update(Buffer.from(p.rawTransaction,'hex')).digest('hex')
  ||!checkpoint||BigInt(p.expiryHeight)<BigInt(checkpoint.scanned_height)+20n)throw Error('Immutable source refund identity/bytes/expiry mismatch');
 if(!await verifyBaseRefund(base,source.id,'CANCEL',cancellation.hash))throw Error('Fresh canonical permanent cancellation required');
 await pool.query('SELECT zee.check_source_refund_signing($1)',[state.orderId]);
 console.log(JSON.stringify({authorized:true,operationId:state.orderId,approvedDigest:request.approvedDigest,txid:request.txid,rawSha256:request.rawSha256}));
}catch{console.error('SOURCE_REFUND_BROADCAST_GUARD_DENIED');process.exitCode=1;}
finally{await pool.end();}
