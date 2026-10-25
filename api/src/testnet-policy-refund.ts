/** Explicit accepted-order policy binding. Admission expiry never renews financial authority. */
import type pg from 'pg';
import {loadServicePolicyApi} from './testnet-service-policy.ts';
export type PolicyWorkerOrderContext={version:1;policySha256:string;activeEpoch:string;workerBackendPid:number;orderId:string;rootProofPath:string;rootProofSha256:string};
export function validatePolicyWorkerOrderContext(p:PolicyWorkerOrderContext,id:string){
 if(p?.version!==1||p.orderId!==id||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)||!/^[a-f0-9]{64}$/.test(p.policySha256)||p.policySha256==='0'.repeat(64)||p.rootProofSha256!==p.policySha256||!/^[1-9][0-9]*$/.test(p.activeEpoch)||!Number.isSafeInteger(p.workerBackendPid)||p.workerBackendPid<=0||!/^\/opt\/zeeswap-testnet\/state\/service-policy\/[A-Za-z0-9._-]+\.private\.json$/.test(p.rootProofPath))throw Error('POLICY_REFUND_CONTEXT');
}
export async function requirePolicyWorkerOrder(pool:Pick<pg.Pool,'query'>,p:PolicyWorkerOrderContext,id:string,scope?:Parameters<typeof loadServicePolicyApi>[1]){
 validatePolicyWorkerOrderContext(p,id);
 // The loader independently enforces Root ownership, exact raw SHA and SQL policy bindings.
 const policy=await loadServicePolicyApi({ZEESWAP_TESTNET_SERVICE_POLICY_PROOF:p.rootProofPath,ZEESWAP_TESTNET_SERVICE_POLICY_SHA256:p.rootProofSha256},scope??{} as Parameters<typeof loadServicePolicyApi>[1],pool);
 if(!policy||policy.approval.activeEpoch!==p.activeEpoch)throw Error('POLICY_REFUND_ROOT_EPOCH');await policy.recheck();
 const rows=(await pool.query('SELECT * FROM zee.check_testnet_policy_worker($1,$2)',[Buffer.from(p.policySha256,'hex'),id])).rows;
 if(rows.length!==1||rows[0].order_id!==id||String(rows[0].accepted_epoch)!==p.activeEpoch||rows[0].worker_backend_pid!==p.workerBackendPid)throw Error('POLICY_REFUND_WORKER_BINDING');return rows[0];
}
const functions={begin:'begin_source_refund',operator:'check_source_refund_operator',signing:'check_source_refund_signing',storeBase:'store_source_refund_base',storeZcash:'store_source_refund_zcash',confirmBase:'confirm_source_refund_base',confirmZcash:'confirm_source_refund_zcash'} as const;
/** Function identifiers come solely from this finite map; callers provide values only. */
export function refundQuery(action:keyof typeof functions,id:string,args:unknown[]=[],policy?:PolicyWorkerOrderContext){
 if(!Object.hasOwn(functions,action))throw Error('POLICY_REFUND_ACTION');let name:string=functions[action];if(!name)throw Error('POLICY_REFUND_ACTION');
 const values=policy?(validatePolicyWorkerOrderContext(policy,id),[id,Buffer.from(policy.policySha256,'hex'),...args]):[id,...args];
 if(policy)name=name.replace('source_refund','testnet_policy_source_refund');
 return{sql:`SELECT zee.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')})`,args:values};
}
export async function runRefundQuery(pool:Pick<pg.Pool,'query'>,action:keyof typeof functions,id:string,args:unknown[]=[],policy?:PolicyWorkerOrderContext){if(policy)await requirePolicyWorkerOrder(pool,policy,id);const q=refundQuery(action,id,args,policy);return pool.query(q.sql,q.args);}
