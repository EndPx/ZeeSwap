import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {LIVE_DISPATCH_SCOPE as s,validateLiveDispatchScope,requireFreshLiveDispatchObservers,withLiveOperatorLock,pauseLiveFailureBeforeUnlock,type LiveRuntime,type LiveBaseSignerConfig} from '../../src/live-dispatch-scope.ts';
import {loadLiveForwardConfig,runLiveForward,liveForwardLoop} from '../../scripts/dispatch-live-testnet.ts';
import type{BaseRegistry}from'../../src/base-contract.ts';

const runtime:LiveRuntime={projectId:s.projectId,branchId:s.branchId,host:s.host,database:s.database,workerUrl:`postgres://${s.worker}:synthetic@${s.host}/${s.database}?sslmode=require`,payloadKeyHex:'11'.repeat(32),lookupKeyHex:'22'.repeat(32)};
const registry={...JSON.parse(await readFile(new URL('../../../contracts/deployments/base-sepolia.json',import.meta.url),'utf8')),operator:s.operator} as BaseRegistry;
const signer:LiveBaseSignerConfig={cast:'/home/albary/.foundry/bin/cast',rpcUrl:registry.rpcUrl,account:s.account,operator:s.operator,passwordFile:s.passwordFile,journalRoot:s.journalRoot,token:s.token,settlement:s.settlement,tokenCodeHash:s.tokenCodeHash,settlementCodeHash:s.settlementCodeHash};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

test('live dispatch scope rejects old branch/operator, wrong role/code hash and old signer journal',()=>{
 validateLiveDispatchScope(runtime,registry,signer);
 assert.throws(()=>validateLiveDispatchScope({...runtime,branchId:'br-twilight-heart-ao6cx6pg'},registry,signer),/WRONG_LIVE_DISPATCH_DATABASE/);
 assert.throws(()=>validateLiveDispatchScope({...runtime,workerUrl:runtime.workerUrl.replace(s.worker,'zee_app_api_20261023')},registry,signer),/WRONG_LIVE_DISPATCH_WORKER/);
 assert.throws(()=>validateLiveDispatchScope(runtime,{...registry,operator:'0x037F334b58D6Be70730aEe0d830096F9a431aF9B'},signer),/WRONG_LIVE_DISPATCH_REGISTRY/);
 const wrong=clone(registry);wrong.contracts.MockUSDC.runtimeCodeHash=`0x${'00'.repeat(32)}`;assert.throws(()=>validateLiveDispatchScope(runtime,wrong,signer),/WRONG_LIVE_DISPATCH_REGISTRY/);
 assert.throws(()=>validateLiveDispatchScope(runtime,registry,{...signer,journalRoot:'/old/g5'}),/WRONG_LIVE_DISPATCH_SIGNER/);
});

test('fresh SQL source admission refuses stale/future/checkpoint omission, pause and epoch change',async()=>{
 const checked=new Date('2026-10-23T10:00:00Z');
 let state={epoch:'7',dispatch_enabled:true,reconciliation_required:false};
 let rows=['base-sepolia','zcash-testnet'].map(network=>({network,scanned_height:'100',finalized_height:'90',observed_at:checked,checked_at:checked}));
 const pool={query:async(sql:string)=>({rows:sql.includes('runtime_control')?[state]:rows})} as unknown as Pool;
 assert.equal(await requireFreshLiveDispatchObservers(pool),'7');
 await assert.rejects(requireFreshLiveDispatchObservers(pool,'6'),/LIVE_DISPATCH_EPOCH_CHANGED/);
 rows[0]!.observed_at=new Date(checked.getTime()-60001);await assert.rejects(requireFreshLiveDispatchObservers(pool),/LIVE_OBSERVER_STALE/);
 rows[0]!.observed_at=new Date(checked.getTime()+5001);await assert.rejects(requireFreshLiveDispatchObservers(pool),/LIVE_OBSERVER_STALE/);
 rows=rows.slice(1);await assert.rejects(requireFreshLiveDispatchObservers(pool),/LIVE_OBSERVER_REQUIRED/);
 state={...state,dispatch_enabled:false};await assert.rejects(requireFreshLiveDispatchObservers(pool),/LIVE_DISPATCH_PAUSED/);
});

test('disabled once reads only reviewed config and rejects quote-only signer, extra args and unbounded timeout',async()=>{
 const root=await mkdtemp(join(tmpdir(),'zee-forward-')),dir=join(root,'.deploy-local','live-testnet-20261023');
 await mkdir(dir,{recursive:true});const configPath=join(dir,'worker.json'),runtimePath=join(dir,'runtime.json'),registryPath=join(dir,'registry.json'),signerConfigPath=join(dir,'signer.json');
 const wsl=(path:string)=>path.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_all,drive:string)=>`/mnt/${drive.toLowerCase()}`);
 const c={mode:'LIVE_TESTNET_FORWARD',enabled:false,runtimePath,registryPath,signerConfigPath,signerCommand:'wsl.exe',signerArgs:['-d','Ubuntu','--','python3',wsl(fileURLToPath(new URL('../../../workers/zcash-wallet/owned_wallet_call.py',import.meta.url))),'--kind','base-forward','--script',wsl(fileURLToPath(new URL('../../../workers/base-signer/signer.py',import.meta.url))),'--config',wsl(signerConfigPath)],signerTimeoutMs:120000,pollSeconds:5};
 try{
  await Promise.all([[runtimePath,runtime],[registryPath,registry],[signerConfigPath,signer],[configPath,c]].map(([path,value])=>writeFile(path as string,JSON.stringify(value))));
  assert.deepEqual(await runLiveForward(configPath,true),{status:'DISPATCH_DISABLED',broadcastAuthority:false});
  const wrong=clone(c);wrong.signerArgs[8]=wrong.signerArgs[8]!.replace('signer.py','funding_authorizer.py');await writeFile(configPath,JSON.stringify(wrong));await assert.rejects(loadLiveForwardConfig(configPath),/RESTRICTED_FORWARD_SIGNER_REQUIRED/);
  await writeFile(configPath,JSON.stringify({...c,signerTimeoutMs:0}));await assert.rejects(loadLiveForwardConfig(configPath),/INVALID_LIVE_DISPATCH_CONFIG/);
  await writeFile(configPath,JSON.stringify({...c,signerArgs:[...c.signerArgs,'--unexpected']}));await assert.rejects(loadLiveForwardConfig(configPath),/RESTRICTED_FORWARD_SIGNER_REQUIRED/);
  await assert.rejects(loadLiveForwardConfig(resolve('old-g5.json')),/EXPLICIT_NEW_LIVE_DISPATCH_CONFIG_REQUIRED/);
 }finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'zee-forward-'));await rm(root,{recursive:true});}
});

test('once scheduling awaits exactly one step, never polls, and propagates timeout without detached retry',async()=>{
 let calls=0,sleeps=0;
 await liveForwardLoop(async()=>{calls++;return{status:'NO_ELIGIBLE_JOB'};},true,new AbortController().signal,async()=>{sleeps++;});
 assert.equal(calls,1);assert.equal(sleeps,0);
 await assert.rejects(liveForwardLoop(async()=>{throw Error('SIGNER_TIMEOUT');},false,new AbortController().signal,async()=>{sleeps++;}),/SIGNER_TIMEOUT/);
 assert.equal(sleeps,0);
});

test('real PG operator lock excludes another worker and remains held while timeout cleanup finishes',{skip:!process.env.ENVIO_TEST_DATABASE_URL},async()=>{
 const a=new Pool({connectionString:process.env.ENVIO_TEST_DATABASE_URL,max:2}),b=new Pool({connectionString:process.env.ENVIO_TEST_DATABASE_URL,max:2});
 let cleanupStarted!:()=>void,finishCleanup!:()=>void;
 const entered=new Promise<void>(resolve=>{cleanupStarted=resolve;}),cleanup=new Promise<void>(resolve=>{finishCleanup=resolve;});
 let first:Promise<unknown>|undefined;
 try{
  first=withLiveOperatorLock(a,async lock=>{await lock.check();try{throw Error('SIGNER_TIMEOUT');}finally{cleanupStarted();await cleanup;}});
  // Attach rejection ownership before releasing the asynchronous cleanup gate.
  const rejected=assert.rejects(first,/SIGNER_TIMEOUT/);
  await entered;let ran=false;
  assert.deepEqual(await withLiveOperatorLock(b,async()=>{ran=true;return 'bad';}),{status:'WAIT_OPERATOR_LOCK'});assert.equal(ran,false);
  finishCleanup();await rejected;
  assert.equal(await withLiveOperatorLock(b,async lock=>{await lock.check();return 'AFTER_CLEANUP';}),'AFTER_CLEANUP');
 }finally{finishCleanup?.();await first?.catch(()=>{});await Promise.all([a.end(),b.end()]);}
});

test('real PG hard failure pauses while operator key is held, before another worker can acquire',{skip:!process.env.ENVIO_TEST_DATABASE_URL},async()=>{
 const a=new Pool({connectionString:process.env.ENVIO_TEST_DATABASE_URL,max:2}),b=new Pool({connectionString:process.env.ENVIO_TEST_DATABASE_URL,max:2});const order:string[]=[];
 try{
  await assert.rejects(withLiveOperatorLock(a,async lock=>{
   order.push('LOCKED');
   return pauseLiveFailureBeforeUnlock(async()=>{throw Error('BROADCAST_UNKNOWN');},async()=>{
    const row=(await b.query('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype=$1 AND pid=$2 AND classid=84532 AND objid=20261023 AND objsubid=2 AND granted) AS held',['advisory',lock.backendPid])).rows[0];
    assert.equal(row.held,true);assert.deepEqual(await withLiveOperatorLock(b,async()=> 'UNSAFE'),{status:'WAIT_OPERATOR_LOCK'});order.push('PAUSED');
   },()=>false);
  }),/BROADCAST_UNKNOWN/);
  await withLiveOperatorLock(b,async()=>{order.push('NEXT_WORKER');});assert.deepEqual(order,['LOCKED','PAUSED','NEXT_WORKER']);
 }finally{await Promise.all([a.end(),b.end()]);}
});
