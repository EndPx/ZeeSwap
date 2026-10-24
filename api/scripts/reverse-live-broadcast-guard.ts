/** Private native signer fence. Never signs or broadcasts. */
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {loadLiveReverseConfig} from './reverse-live-testnet.ts';
import {assertReverseAuthority} from '../src/reverse-authority.ts';
import {escrowTerms} from '../src/base-escrow.ts';
import {reversePayoutTerms,type PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import {requireFreshLiveDispatchObservers} from '../src/live-dispatch-scope.ts';
const guardPath=process.argv[2];let pool:ReturnType<typeof connect>|undefined;
try{
 if(!guardPath||process.argv.length!==3)throw Error('LIVE_GUARD_CONFIG_REQUIRED');
 const guard=JSON.parse(await readFile(guardPath,'utf8')),{c,runtime,registry}=await loadLiveReverseConfig(guard.configPath);
 if(!c.enabled||resolve(guardPath)!==resolve(c.orderRoot,guard.orderId,'guard.private.json')||resolve(guard.statePath)!==resolve(c.orderRoot,guard.orderId,'state.private.json')
  ||resolve(guard.approvedRequest)!==resolve(c.orderRoot,guard.orderId,'approved.private.json'))throw Error('LIVE_GUARD_SCOPE');
 let input='';for await(const part of process.stdin){input+=part;if(input.length>2048)throw Error('LIVE_GUARD_INPUT_LIMIT');}
 const request=JSON.parse(input),state=JSON.parse(await readFile(guard.statePath,'utf8')),approved=JSON.parse(await readFile(guard.approvedRequest,'utf8'));
 if(state.orderId!==guard.orderId||state.approvedDigest!==guard.approvedDigest||!state.currentLease||typeof state.dispatchEpoch!=='string'||!Number.isSafeInteger(state.operatorBackendPid))throw Error('LIVE_GUARD_STATE');
 pool=connect(runtime.workerUrl,1);const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 const identity=(await pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];if(identity.database!=='zee_app_20261023'||identity.role!=='zee_app_worker_20261023')throw Error('LIVE_GUARD_DATABASE');
 const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[state.orderId])).rows[0];if(!row||row.confirmed)throw Error('LIVE_GUARD_ATTEMPT');
 const prepared=keys.open(row.signed_payload,`reverse-payout:${state.orderId}:v1`) as PreparedZcashTransaction;
 if(!keys.lookup('zcash-tx',request.txid).equals(row.tx_hash))throw Error('LIVE_GUARD_TX_HASH');
 const terms=await reversePayoutTerms(pool,keys,state.orderId),funding=await escrowTerms(pool,keys,base,state.orderId);
 const checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
 if(!checkpoint)throw Error('LIVE_GUARD_CHECKPOINT');
 assertReverseAuthority(request,approved,guard.approvedDigest,state.orderId,prepared,terms,funding,registry.contracts.ZeeSwapSettlement.address,String(checkpoint.scanned_height));
 await requireFreshLiveDispatchObservers(pool,state.dispatchEpoch);
 const lock=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_database d ON d.oid=l.database WHERE d.datname=current_database()
  AND l.locktype='advisory' AND l.pid=$1 AND l.classid=84532::oid AND l.objid=20261023::oid AND l.objsubid=2 AND l.granted) AS owned`,[state.operatorBackendPid])).rows[0];
 if(lock?.owned!==true)throw Error('LIVE_GUARD_PARENT_OPERATOR_LOCK_LOST');
 const lease=state.currentLease;await pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,lease.jobId,lease.owner,lease.fence]);
 console.log(JSON.stringify({authorized:true,operationId:state.orderId,approvedDigest:request.approvedDigest,txid:request.txid,rawSha256:request.rawSha256}));
}catch{console.error('LIVE_REVERSE_BROADCAST_GUARD_DENIED');process.exitCode=1;}
finally{await pool?.end();}
