import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import type pg from 'pg';
import type {PrivateData} from '../src/private-data.ts';
import type {BaseContract} from '../src/base-contract.ts';
import {sourceRefundTerms} from '../src/source-refunds.ts';
import {validateIncidentRefund,requireRefundHeaderSnapshot} from '../src/refund-incident.ts';
import {requireG5CommandConfig,g5PathIdentity} from '../src/g5-run.ts';
import {refreshReverseObservers} from '../src/reverse-observer-refresh.ts';

export async function assertIncidentRefund(config:any,state:any,pool:pg.Pool,keys:PrivateData,base:BaseContract){
 if(typeof config.incidentRunConfig!=='string')throw Error('FIXED_INCIDENT_RUN_CONFIG_REQUIRED');
 const runConfig=JSON.parse(await readFile(resolve(config.incidentRunConfig),'utf8'));
 const runState=JSON.parse(await readFile(resolve(runConfig.stateFile),'utf8'));
 if(resolve(runConfig.databaseConfig)!==resolve(config.databaseConfig)||resolve(runConfig.runtimeConfig)!==resolve(config.runtimeConfig))throw Error('ORIGINAL_INCIDENT_DATABASE_CONFIG_REQUIRED');
 const source=await sourceRefundTerms(pool,keys,state.orderId);
 const [record,control]=await Promise.all([
  pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[state.orderId]),
  pool.query('SELECT * FROM zee.runtime_control WHERE singleton')]);
 const approval=JSON.parse(await readFile(resolve(config.refundBaseApprovedRequest),'utf8'));
 validateIncidentRefund(runConfig,runState,state,source,record.rows[0],control.rows[0],approval);
 const address=base.registry.contracts.ZeeSwapSettlement.address.toLowerCase();
 if(source.row.base_contract.toLowerCase()!==address||approval.token?.toLowerCase()!==base.registry.contracts.MockUSDC.address.toLowerCase()
  ||approval.payer?.toLowerCase()!==base.registry.operator.toLowerCase()||approval.refundRecipient?.toLowerCase()!==base.registry.operator.toLowerCase())
  throw Error('ORIGINAL_INCIDENT_DEPLOYMENT_APPROVAL_REQUIRED');
 return source;
}

/** Fixed --refresh capture reads canonical headers only. Never invokes scanOnce
 * or ingests output notes, including the operator's separate 10000 fee note.
 */
export async function refreshIncidentRefundHeaders(config:any,pool:pg.Pool,base:BaseContract,depositId:string){
 const args=config.observerRefreshArgs;
 if(typeof config.observerRefreshCommand!=='string'||!Array.isArray(args)||args.filter((v:any)=>v==='--refresh').length!==1
  ||args.includes('--funding-txid')||typeof config.zcashPrivateConfig!=='string'||typeof config.capitalProofFile!=='string')throw Error('FIXED_HEADER_ONLY_REFRESH_REQUIRED');
 requireG5CommandConfig(args,config.zcashPrivateConfig);
 const output=args.indexOf('--output');if(output<0||args.filter((v:any)=>v==='--output').length!==1
  ||g5PathIdentity(args[output+1])!==g5PathIdentity(config.capitalProofFile))throw Error('FIXED_HEADER_PROOF_OUTPUT_REQUIRED');
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(config.observerRefreshCommand,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let size=0,done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();};
  const timer=setTimeout(()=>{child.kill();finish(Error('INCIDENT_HEADER_REFRESH_TIMEOUT'));},240000);
  child.on('error',()=>finish(Error('INCIDENT_HEADER_REFRESH_FAILED')));child.stdout.on('data',b=>{size+=b.length;if(size>32768)child.kill();});child.stderr.on('data',()=>{});
  child.on('close',code=>finish(code===0&&size<=32768?undefined:Error('INCIDENT_HEADER_REFRESH_FAILED')));
 });
 const proof=JSON.parse(await readFile(resolve(config.capitalProofFile),'utf8'));
 const deposit=(await pool.query('SELECT block_height FROM zee.deposits WHERE id=$1',[depositId])).rows[0];
 if(!deposit)throw Error('ORIGINAL_INCIDENT_SOURCE_REQUIRED');
 await refreshReverseObservers(pool,base,requireRefundHeaderSnapshot(proof.snapshot,[Number(deposit.block_height)]));
}
