import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type pg from 'pg';
import type {PrivateData} from '../src/private-data.ts';
import type {BaseContract} from '../src/base-contract.ts';
import {sourceRefundTerms} from '../src/source-refunds.ts';
import {validateIncidentRefund} from '../src/refund-incident.ts';
import {refreshReverseObserversFromWallet} from '../src/reverse-observer-refresh.ts';
import {requireExplicitObserverWallet} from '../src/explicit-observer-wallet.ts';
import {explicitObserverWallet} from './explicit-observer-wallet.ts';

export async function assertIncidentRefund(config:any,state:any,pool:pg.Pool,keys:PrivateData,base:BaseContract){
 await requireExplicitObserverWallet(config);
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

/** Refresh real viewing-wallet scan and canonical headers without allocating
 * any output notes or publishing a network-only height as scanner readiness.
 */
export async function refreshIncidentRefundHeaders(config:any,pool:pg.Pool,base:BaseContract,depositId:string){
 const wallet=await explicitObserverWallet(config);
 const deposit=(await pool.query('SELECT block_height FROM zee.deposits WHERE id=$1',[depositId])).rows[0];
 if(!deposit)throw Error('ORIGINAL_INCIDENT_SOURCE_REQUIRED');
 await refreshReverseObserversFromWallet(pool,base,wallet);
}
