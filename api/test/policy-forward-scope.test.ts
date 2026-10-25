import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import type {PrivateData} from '../src/private-data.ts';
import type {BaseContract} from '../src/base-contract.ts';
import type {BaseSigner} from '../src/base-signer.ts';
const id='00000000-0000-4000-8000-000000000001';
test('exact-order dispatch scopes reconciliation before claiming only that same order',async()=>{
 const calls:{sql:string;values?:unknown[]}[]=[],pool={query:async(sql:string,values?:unknown[])=>{calls.push({sql,values});return{rows:[]};}} as unknown as pg.Pool;
 let preflights=0;const base={preflight:async()=>{preflights++;}} as unknown as BaseContract;
 const result=await dispatchBaseOnce(pool,{} as PrivateData,base,{} as BaseSigner,undefined,id);
 assert.equal(preflights,1);assert.equal(result.status,'NO_ELIGIBLE_JOB');assert.equal(calls.length,2);
 assert.match(calls[0]!.sql,/WHERE NOT a\.confirmed AND a\.order_id=\$1::uuid/);assert.deepEqual(calls[0]!.values,[id]);
 assert.equal(calls[1]!.sql,'SELECT * FROM zee.claim_base_job_for_order($1,$2)');assert.equal(calls[1]!.values?.[1],id);
});
test('legacy receipt reconciliation retains its global behavior when no order is supplied',async()=>{
 let observed:{sql:string;values?:unknown[]}|undefined;const pool={query:async(sql:string,values?:unknown[])=>{observed={sql,values};return{rows:[]};}} as unknown as pg.Pool;
 assert.deepEqual(await reconcileBaseReceipts(pool,{} as PrivateData,{} as BaseContract),{checked:0,finalized:0});
 assert.doesNotMatch(observed!.sql,/a\.order_id=\$1/);assert.equal(observed!.values,undefined);
});
