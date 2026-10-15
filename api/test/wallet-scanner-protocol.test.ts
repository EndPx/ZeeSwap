import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalWalletAdapter} from '../src/wallet-adapter.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import {walletChildFailure,walletAdapterFailure} from '../src/wallet-scanner-protocol.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';

const packet={version:1,status:'WALLET_READ_ONLY_WAIT',command:'snapshot',phase:'LIGHTD_INFO',code:'GRPC_UNAVAILABLE',uncertain:false,lockReleased:true,processCompleted:true};
function child(value:unknown,exit=75,signal=false){
 const script=`let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{process.stdout.write(${JSON.stringify(JSON.stringify(value))},()=>{${signal?"process.kill(process.pid,'SIGTERM');":`process.exit(${exit});`}});});`;
 return new LocalWalletAdapter(process.execPath,['-e',script]);
}
test('actual completed snapshot process with exact exit75 provider envelope yields typed observer WAIT without a snapshot',async()=>{
 for(const code of ['GRPC_UNAVAILABLE','GRPC_DEADLINE_EXCEEDED']){
  await assert.rejects(()=>child({...packet,code}).snapshot([]),error=>{
   assert.equal(isObserverWait(error),true);
   const diagnostic=g5Diagnostic(error,'observe','source-snapshot');
   assert.deepEqual(diagnostic.scanner,{...packet,code});return true;
  });
 }
});
test('real child processes with broader, uncertain, unreleased, wrong-command or malformed envelopes remain hard failures',async()=>{
 for(const value of [{...packet,uncertain:true},{...packet,lockReleased:false},{...packet,processCompleted:false},
  {...packet,command:'allocate'},{...packet,phase:'SDK_NOTES'},{...packet,code:'SDK_TIMEOUT_RECONCILE'},
  {...packet,extra:'private URL or memo'},{...packet,version:2},'not a protocol']){
  await assert.rejects(()=>child(value).snapshot([]),error=>{assert.equal(isObserverWait(error),false);assert.equal((error as Error).message,'WALLET_UNAVAILABLE');assert.equal(JSON.stringify(g5Diagnostic(error,'observe','scan')).includes('private URL'),false);return true;});
 }
});
test('exit status, signal and requested operation are mandatory; a WAIT-looking payload cannot override them',async()=>{
 for(const action of [()=>child(packet,0).snapshot([]),()=>child(packet,1).snapshot([]),()=>child(packet,75,true).snapshot([]),()=>child(packet).allocate(),()=>child(packet).validate('synthetic')])
  await assert.rejects(action,error=>{assert.equal(isObserverWait(error),false);return true;});
 assert.equal(isObserverWait(walletChildFailure(JSON.stringify(packet),'snapshot',null,'SIGTERM')),false);
});
test('completed SDK errors retain only static scanner diagnostics; outer timeout remains uncertain and hard',async()=>{
 const failure={...packet,status:'WALLET_READ_ONLY_ERROR',phase:'SDK_NOTES',code:'SDK_PROCESS_FAILED_RECONCILE'};
 await assert.rejects(()=>child(failure,1).snapshot([]),error=>{assert.equal(isObserverWait(error),false);assert.deepEqual(g5Diagnostic(error,'observe','scan').scanner,failure);return true;});
 const timeout=walletAdapterFailure('snapshot','ADAPTER_TIMEOUT','WALLET_ADAPTER_TIMEOUT_RECONCILE');
 assert.equal(isObserverWait(timeout),false);assert.equal(g5Diagnostic(timeout,'observe','scan').scanner?.uncertain,true);
 assert.equal(g5Diagnostic(Object.assign(new Error('WALLET_UNAVAILABLE'),{scannerDiagnostic:{...failure,url:'private-secret'}}),'observe','scan').scanner,undefined);
});
