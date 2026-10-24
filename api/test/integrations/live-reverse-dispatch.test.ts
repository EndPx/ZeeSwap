import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextLiveReverseStep,dispatchLiveReverseOnce,type LiveReverseContext} from '../../src/live-reverse-dispatch.ts';
import {parseLiveReverseArgs} from '../../scripts/reverse-live-testnet.ts';
const id='11111111-2222-3333-4444-555555555555';
test('reverse CLI refuses unknown or duplicate flags, missing values and unscoped retries before DB access',()=>{
 assert.deepEqual(parseLiveReverseArgs(['/config.json','--once','--order',id,'--step','NATIVE']),{path:'/config.json',once:true,order:id,step:'NATIVE',retry:false});
 for(const args of [['--oncefoo'],['--once','--once'],['--order'],['--order','not-a-uuid'],['--step','NATIVE'],['--retry-same-bytes'],['--once','--order',id,'--step','TYPO']])assert.throws(()=>parseLiveReverseArgs(['/config.json',...args]));
});
test('reverse progresses only after commitment, native proof and final Base ACK',()=>{
 assert.equal(nextLiveReverseStep({orderState:'AWAITING_FUNDS',approved:false}),'WAIT_ORDER');
 assert.equal(nextLiveReverseStep({orderState:'READY',approved:false}),'COMMIT');
 assert.equal(nextLiveReverseStep({orderState:'READY',commit:{confirmed:false},approved:true}),'COMMIT');
 assert.equal(nextLiveReverseStep({orderState:'READY',commit:{confirmed:true},approved:false}),'APPROVE_NATIVE');
 assert.equal(nextLiveReverseStep({orderState:'READY',commit:{confirmed:true},approved:true,payout:{confirmed:false}}),'NATIVE');
 assert.equal(nextLiveReverseStep({orderState:'READY',commit:{confirmed:true},approved:true,payout:{confirmed:true},settle:{confirmed:false}}),'ACK_BASE');
 assert.equal(nextLiveReverseStep({orderState:'SETTLED',approved:true}),'COMPLETE');
});
function fixture(override:any={}){
 let financialCalls=0,pauses=0,held=false;
 const client={on(){},removeListener(){},release(){held=false;},async query(sql:string){if(sql.includes('pg_try_advisory_lock'))held=true;return {rows:[sql.includes('pg_try_advisory_lock')?{locked:true,pid:12}:sql.includes('pg_advisory_unlock')?{unlocked:true}:{pid:12}]};}};
 const pool={async connect(){return client;},async query(sql:string){
  if(sql.includes('current_database'))return {rows:[{database:'zee_app_20261023',role:'zee_app_worker_20261023'}]};
  if(sql.includes('FROM zee.orders'))return {rows:[{state:'READY',direction:'BASE_TO_ZCASH',execution_mode:'base-escrow-v1',output_amount:'100000',...override}]};
  if(sql.includes('runtime_control'))return {rows:[{dispatch_enabled:false,reconciliation_required:true}]};
  if(/SELECT \* FROM zee\.(escrow_commits|reverse_payouts|escrow_settlements)/.test(sql))return {rows:[]};
  if(sql.includes('enter_reconciliation')){assert.equal(held,true);pauses++;return {rows:[]};}
  financialCalls++;throw Error('unexpected financial SQL');
 }};
 const context={pool,maxAmountZatoshi:'100000',keys:{},base:{async preflight(){}},async load(){return {version:1,orderId:id};},async save(){financialCalls++;},async baseSigner(){financialCalls++;throw Error('must not sign');},async wallet(){financialCalls++;throw Error('must not invoke native');},async approve(){financialCalls++;},async nativeJournal(){return {exists:false,broadcast:false};}} as unknown as LiveReverseContext;
 return {context,calls:()=>financialCalls,pauses:()=>pauses};
}
test('paused reverse dispatch cannot claim, sign, broadcast or invoke native wallet',async()=>{
 const f=fixture();assert.deepEqual(await dispatchLiveReverseOnce(f.context,id),{status:'WAIT_DISPATCH_PAUSED'});assert.equal(f.calls(),0);
});
test('hard failure pauses the verified database while shared lock remains held; ordinary observer waits do not',async()=>{
 const hard=fixture();hard.context.base.preflight=async()=>{throw Error('uncertain signer outcome');};
 await assert.rejects(dispatchLiveReverseOnce(hard.context,id));assert.equal(hard.pauses(),1);
 const soft=fixture();soft.context.base.preflight=async()=>{throw Error('LIVE_OBSERVER_STALE');};
 assert.deepEqual(await dispatchLiveReverseOnce(soft.context,id),{status:'WAIT_OBSERVERS_OR_POLICY'});assert.equal(soft.pauses(),0);
});
test('wrong direction, over-limit payout or explicitly wrong step refuse before financial action',async()=>{
 for(const overrides of [{direction:'ZCASH_TO_BASE'},{output_amount:'100001'}]){const f=fixture(overrides);await assert.rejects(dispatchLiveReverseOnce(f.context,id),/LIVE_REVERSE_ORDER_SCOPE/);assert.equal(f.calls(),0);}
 const f=fixture();await assert.rejects(dispatchLiveReverseOnce(f.context,id,'NATIVE'),/LIVE_REVERSE_STEP_MISMATCH/);assert.equal(f.calls(),0);
});
