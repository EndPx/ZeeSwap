/** Fixed private config, stdin identity only. Used by the raw wallet immediately
 * before broadcasting; cannot sign, change orders or accept caller lease fields.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connect } from '../src/db.ts';
import {config as dbConfig} from './config.ts';
import {requireG5Target,validateG5State,requireG5Next} from '../src/g5-run.ts';
import { runtime } from './runtime.ts';
import {reversePayoutTerms,type PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import {escrowTerms} from '../src/base-escrow.ts';
import {BaseContract,loadBaseRegistry} from '../src/base-contract.ts';
import {assertReverseAuthority} from '../src/reverse-authority.ts';
const path=process.argv[2];if(!path||process.argv.length!==3)throw Error('Fixed private operator config required');
const config=JSON.parse(await readFile(path,'utf8'));
process.env.ZEE_DB_CONFIG=resolve(config.databaseConfig);process.env.ZEE_RUNTIME_CONFIG=resolve(config.runtimeConfig);
requireG5Target(dbConfig());
const r=await runtime(true);requireG5Target(dbConfig(),[r.apiUrl,r.workerUrl]);const pool=connect(r.workerUrl);
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2048)throw Error('guard request too large');}
 const request=JSON.parse(input);
 if(Object.keys(request).sort().join(',')!=='approvedDigest,operationId,rawSha256,txid')throw Error('guard request schema');
 const state=JSON.parse(await readFile(resolve(config.stateFile),'utf8'));
 const manifest=JSON.parse(await readFile(resolve(config.runConfig),'utf8'));
 const run=JSON.parse(await readFile(resolve(manifest.stateFile),'utf8'));validateG5State(run,manifest);
 const slot=requireG5Next(run,config.sequence);
 if(!slot||slot.direction!=='BASE_TO_ZCASH'||slot.orderId!==state.orderId||slot.owner!==state.owner
  ||resolve(manifest.reverseOrders.find((o:any)=>o.sequence===config.sequence)?.configFile??'')!==resolve(path))throw Error('G5_CURRENT_SLOT_REQUIRED');
 const approved=JSON.parse(await readFile(resolve(config.approvedRequest),'utf8'));
 const lease=state.currentLease;if(!lease)throw Error('current lease missing');
 const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[state.orderId])).rows[0];
 if(!row||row.confirmed)throw Error('guard durable attempt missing or already confirmed');
 const prepared=r.keys.open(row.signed_payload,`reverse-payout:${state.orderId}:v1`) as PreparedZcashTransaction;
 const terms=await reversePayoutTerms(pool,r.keys,state.orderId),base=new BaseContract(loadBaseRegistry()),funding=await escrowTerms(pool,r.keys,base,state.orderId);
 const checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
 if(!checkpoint||!r.keys.lookup('zcash-tx',request.txid).equals(row.tx_hash))throw Error('guard durable identity missing');
 assertReverseAuthority(request,approved,config.approvedDigest,state.orderId,prepared,terms,funding,base.registry.contracts.ZeeSwapSettlement.address,String(checkpoint.scanned_height));
 await pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,lease.jobId,lease.owner,lease.fence]);
 console.log(JSON.stringify({authorized:true,operationId:state.orderId,approvedDigest:request.approvedDigest,txid:request.txid,rawSha256:request.rawSha256}));
}catch{console.error('REVERSE_BROADCAST_GUARD_DENIED');process.exitCode=1;}
finally{await pool.end();}
