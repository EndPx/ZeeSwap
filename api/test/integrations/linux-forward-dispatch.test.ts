import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {linuxForwardStep,linuxForwardAdapters,validateLinuxForwardScope,type LinuxForwardConfig} from '../../src/linux-forward-dispatch.ts';
import {LIVE_DISPATCH_SCOPE as s,type LiveRuntime,type LiveBaseSignerConfig} from '../../src/live-dispatch-scope.ts';
import type {LinuxOperatorProfile} from '../../src/linux-testnet-profile.ts';
import type {BaseRegistry} from '../../src/base-contract.ts';
const root='/opt/zeeswap-testnet',release=root+'/releases/linux-reviewed',pin=(path:string)=>({path,sha256:'a'.repeat(64)});
const profile={roots:{base:root,release},paths:{baseJournal:root+'/state/base-signer-journal',basePassword:root+'/secrets/operator-password'},artifacts:{cast:pin(release+'/bin/cast')}} as LinuxOperatorProfile;
const config:LinuxForwardConfig={version:1,mode:'LINUX_TESTNET_FORWARD',enabled:false,operatorProfile:root+'/secrets/linux-operator-profile.private.json',python:root+'/tools/python/bin/python',signerConfig:pin(root+'/secrets/forward-signer.private.json'),supervisor:pin(release+'/app/workers/zcash-wallet/owned_wallet_call.py'),signerScript:pin(release+'/app/workers/base-signer/signer.py'),handoffProof:root+'/secrets/relocation-applied-proof.private.json',pollSeconds:5};
const runtime:LiveRuntime={projectId:s.projectId,branchId:s.branchId,host:s.host,database:s.database,workerUrl:`postgres://${s.worker}:synthetic@${s.host}/${s.database}`,payloadKeyHex:'11'.repeat(32),lookupKeyHex:'22'.repeat(32)};
const registry={...JSON.parse(await readFile(new URL('../../../contracts/deployments/base-sepolia.json',import.meta.url),'utf8')),operator:s.operator} as BaseRegistry;
const signer:LiveBaseSignerConfig={cast:profile.artifacts.cast.path,rpcUrl:registry.rpcUrl,account:s.account,operator:s.operator,passwordFile:profile.paths.basePassword,journalRoot:profile.paths.baseJournal,token:s.token,settlement:s.settlement,tokenCodeHash:s.tokenCodeHash,settlementCodeHash:s.settlementCodeHash};
test('native forward scope binds Linux release and shared journal while refusing old transports/identity',()=>{
 validateLinuxForwardScope(config,profile,runtime,registry,signer);
 assert.throws(()=>validateLinuxForwardScope({...config,python:'wsl.exe'},profile,runtime,registry,signer));
 assert.throws(()=>validateLinuxForwardScope({...config,signerScript:pin('/home/albary/old/signer.py')},profile,runtime,registry,signer));
 assert.throws(()=>validateLinuxForwardScope(config,profile,{...runtime,branchId:'old-g5'},registry,signer));
 assert.throws(()=>validateLinuxForwardScope(config,profile,runtime,{...registry,operator:'0x0000000000000000000000000000000000000001'},signer));
 assert.throws(()=>validateLinuxForwardScope(config,profile,runtime,registry,{...signer,journalRoot:s.journalRoot}));
 const bad=structuredClone(registry);bad.contracts.MockUSDC.runtimeCodeHash=`0x${'00'.repeat(32)}`;assert.throws(()=>validateLinuxForwardScope(config,profile,runtime,bad,signer));
});
function fake(options:{paused?:boolean;stale?:boolean;wrongIdentity?:boolean}={}){
 const events:string[]=[],checked=new Date(),client={on(){},removeListener(){},release(){events.push('release');},async query(sql:string){
  if(sql.includes('pg_try_advisory_lock')){events.push('lock');return{rows:[{locked:true,pid:12}]};}
  if(sql.includes('pg_advisory_unlock')){events.push('unlock');return{rows:[{unlocked:true}]};}return{rows:[{pid:12}]};
 }};
 const pool={connect:async()=>client,async query(sql:string){
  if(sql.includes('current_database'))return{rows:[{database:options.wrongIdentity?'old-g5':s.database,role:s.worker}]};
  if(sql.includes('runtime_control'))return{rows:[{epoch:'0',dispatch_enabled:!options.paused,reconciliation_required:!!options.paused}]};
  if(sql.includes('scanner_checkpoints'))return{rows:['base-sepolia','zcash-testnet'].map(network=>({network,scanned_height:'100',finalized_height:'90',checked_at:checked,observed_at:new Date(checked.getTime()-(options.stale?60001:0))}))};
  if(sql.includes('enter_reconciliation')){events.push('pause');return{rows:[]};}throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;return{pool,events};
}
test('paused or stale Linux step makes zero financial and reconcile preflight calls',async()=>{
 for(const options of [{paused:true},{stale:true}])for(const reconcile of [false,true]){
  const f=fake(options);let calls=0;const result=await linuxForwardStep(f.pool,async()=>{calls++;throw Error('FINANCIAL_CALL_FORBIDDEN');},reconcile,async()=>{calls++;});
  assert.deepEqual(result,{status:'WAIT_OBSERVERS_OR_POLICY',financialAction:false});assert.equal(calls,0);assert.deepEqual(f.events,['lock','unlock','release']);
 }
});
test('verified hard failure pauses while shared lock is held; wrong identity cannot pause',async()=>{
 const f=fake();await assert.rejects(linuxForwardStep(f.pool,async()=>{f.events.push('step');throw Error('TEST_HARD_FAILURE');}),/TEST_HARD_FAILURE/);assert.deepEqual(f.events,['lock','step','pause','unlock','release']);
 const bad=fake({wrongIdentity:true});await assert.rejects(linuxForwardStep(bad.pool,async()=>{throw Error('NO_FINANCIAL_CALL');}),/LINUX_FORWARD_CONNECTED_SCOPE/);assert.deepEqual(bad.events,['lock','unlock','release']);
});
test('actual Linux adapter binding refuses paused SQL before touching keys, Base or signer',async()=>{
 for(const reconcile of [false,true]){
  const f=fake({paused:true});let touches=0;
  const forbidden=new Proxy({}, {get(){touches++;throw Error('FINANCIAL_ADAPTER_TOUCHED');}});
  const result=await linuxForwardAdapters(f.pool,forbidden as never,forbidden as never,forbidden as never,reconcile);
  assert.deepEqual(result,{status:'WAIT_OBSERVERS_OR_POLICY',financialAction:false});assert.equal(touches,0);
 }
});
