import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chefObserverCli} from '../../scripts/observe-linux-chef.ts';
import {chefObserverExitStatus,reconcileChefObserverFailure} from '../../src/integrations/observation/chef-live.ts';
import {ObservationError} from '../../src/integrations/observation/types.ts';

test('the exact existing fatal reconciliation set exits 78, while waits and unknown failures stay ordinary errors',()=>{
 for(const code of ['CHEF_LIVE_CURSOR_REORG','CHEF_LIVE_GENERATION_CHANGED','CHEF_RECOVERY_TARGET_REORG','CHEF_RECOVERY_OVERLAP_REORG','CHEF_LIVE_CURSOR_IDENTITY','CHEF_LIVE_SOURCE_REGRESSION','CHEF_RECOVERY_IDENTITY_CHANGED','CANONICAL_CHECKPOINT_MISMATCH','HEADER_GAP_OR_FORK','CANONICAL_NOTE_MISMATCH','CANONICAL_HEAD_CHANGED'])assert.equal(chefObserverExitStatus(new ObservationError(code)),78,code);
 for(const code of ['WAIT_SOURCE_UNAVAILABLE','WAIT_SOURCE_UNREADY','STALE_SOURCE','CHEF_LIVE_SOURCE_LAG','CHEF_HTTP_ERROR','CANONICAL_RPC_HTTP_ERROR','UNRECOGNIZED'])assert.equal(chefObserverExitStatus(new ObservationError(code)),1,code);
 assert.equal(chefObserverExitStatus(Error('CHEF_LIVE_CURSOR_REORG')),78);
 assert.equal(chefObserverExitStatus(Error('private arbitrary error text')),1);
});
test('fatal connected failure requests reconciliation once and keeps fatal classification after unknown acknowledgement',async()=>{
 const error=new ObservationError('CHEF_LIVE_CURSOR_REORG');let attempts=0;
 assert.equal(await reconcileChefObserverFailure(error,true,async()=>{attempts++;}),'ACKNOWLEDGED');assert.equal(attempts,1);
 attempts=0;assert.equal(await reconcileChefObserverFailure(error,true,async()=>{attempts++;throw Error('private database detail');}),'UNKNOWN');assert.equal(attempts,1);assert.equal(chefObserverExitStatus(error),78);
 attempts=0;assert.equal(await reconcileChefObserverFailure(error,false,async()=>{attempts++;}),'NOT_REQUESTED');assert.equal(attempts,0);
 assert.equal(await reconcileChefObserverFailure(new ObservationError('STALE_SOURCE'),true,async()=>{attempts++;}),'NOT_REQUESTED');assert.equal(attempts,0);
});
test('actual CLI boundary exposes fatal exit and allowlisted metadata without leaking private errors',async()=>{
 const failure=Object.assign(new ObservationError('CHEF_LIVE_CURSOR_REORG'),{chefPhase:'VERIFY_ANCHORS',chefReconciliationOutcome:'UNKNOWN',privateDetail:'private-secret-not-for-output'});
 const fatal=await chefObserverCli(['/fixture/runtime.json'],async()=>{throw failure;});assert.equal(fatal.exitCode,78);assert.equal((fatal.value as any).operatorReviewRequired,true);assert.equal((fatal.value as any).reconciliationOutcome,'UNKNOWN');assert.equal((fatal.value as any).phase,'VERIFY_ANCHORS');assert.doesNotMatch(JSON.stringify(fatal),/private-secret/);
 const transient=await chefObserverCli(['/fixture/runtime.json'],async()=>{throw new ObservationError('CHEF_HTTP_ERROR');});assert.equal(transient.exitCode,1);assert.equal((transient.value as any).operatorReviewRequired,false);
 let calls=0;const success=await chefObserverCli(['/fixture/runtime.json','--once'],async(path,once)=>{calls++;assert.equal(path,'/fixture/runtime.json');assert.equal(once,true);return{status:'FIXTURE_STOPPED'};});assert.equal(success.exitCode,0);assert.equal(calls,1);
 const invalid=await chefObserverCli([],async()=>{calls++;});assert.equal(invalid.exitCode,1);assert.equal(calls,1);
});
test('importing the public CLI in a separate Node process performs no observer execution',async()=>{
 const moduleUrl=new URL('../../scripts/observe-linux-chef.ts',import.meta.url).href,loader=new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url).href;
 const result=await promisify(execFile)(process.execPath,['--import',loader,'--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); if(typeof m.chefObserverCli!=='function')throw Error('MISSING_EXPORT'); console.log('IMPORT_ONLY_NO_OBSERVER');`],{windowsHide:true,timeout:15000});
 assert.equal(result.stdout.trim(),'IMPORT_ONLY_NO_OBSERVER');assert.equal(result.stderr,'');
});
