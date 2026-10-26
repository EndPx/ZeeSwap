import type pg from 'pg';
import {requireMarketPolicyWorkerOrder,validateMarketWorkerContext,type MarketWorkerOrderContext} from './market-policy-worker.ts';
const functions={begin:'begin_market_source_refund',operator:'check_market_source_refund_operator',signing:'check_market_source_refund_signing',storeBase:'store_market_source_refund_base',storeZcash:'store_market_source_refund_zcash',confirmBase:'confirm_market_source_refund_base',confirmZcash:'confirm_market_source_refund_zcash'} as const;
export async function runMarketRefundQuery(pool:Pick<pg.Pool,'query'>,action:keyof typeof functions,id:string,args:unknown[]=[],context?:MarketWorkerOrderContext){
 if(!context||!Object.hasOwn(functions,action))throw Error('MARKET_REFUND_CONTEXT_REQUIRED');validateMarketWorkerContext(context,id);await requireMarketPolicyWorkerOrder(pool,context,id);const values=[id,Buffer.from(context.policySha256,'hex'),...args];return pool.query(`SELECT zee.${functions[action]}(${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);
}
