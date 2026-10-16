import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceActorDiagnostic,sourcePrefundWait} from '../src/g5-source-protocol.ts';
import {g5ChildDiagnostic} from '../src/g5-child-diagnostic.ts';
const packet=(phase='SDK_SYNC',code='G5_SOURCE_WALLET_COMMAND_FAILED')=>({version:1,status:'G5_SOURCE_ACTOR_DIAGNOSTIC',command:'sync',sequence:7,phase,code});
const wait=()=>({version:1,status:'SOURCE_PREFUND_WAIT',command:'sync',sequence:7,phase:'NETWORK_TIP',code:'SOURCE_RPC_UNAVAILABLE',sdkCompleted:true,sdkActive:false,uncertain:false,proposalStarted:false,intentCreated:false,intentAbsent:true,resultAbsent:true,lockReleased:true});
test('source wait requires exact command, matching sequence and every completed preintent proof flag',()=>{
 assert.equal(sourcePrefundWait(wait(),7),true);
 for(const delta of [{sequence:9},{command:'fund'},{phase:'SEND'},{code:'G5_SOURCE_WALLET_COMMAND_FAILED'},{sdkCompleted:false},{sdkActive:true},{uncertain:true},{proposalStarted:true},{intentCreated:true},{intentAbsent:false},{resultAbsent:false},{lockReleased:false},{private:'secret'},{status:'OBSERVER_WAIT'}])assert.equal(sourcePrefundWait({...wait(),...delta},7),false);
 const missing:any=wait();delete missing.sdkCompleted;assert.equal(sourcePrefundWait(missing,7),false);
});
test('source diagnostics retain exact primary and at most three cleanup packets without provider data',()=>{
 const stderr=['UPPERCASE_SECRET_TOKEN https://key:SECRET@rpc',packet(),...Array.from({length:5},()=>packet('LOCK_RELEASE','SOURCE_FILE_PERMISSION'))].map(p=>typeof p==='string'?p:JSON.stringify(p)).join('\n');
 const result=g5ChildDiagnostic(stderr,{sequence:7,stage:'SOURCE_FUND'},1,null);
 assert.equal(result.phase,'G5_SOURCE_SDK_SYNC');assert.equal(result.code,'G5_SOURCE_WALLET_COMMAND_FAILED');assert.deepEqual(result.sourceActor,packet());assert.equal(result.cleanup?.length,3);
 assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(JSON.stringify(result).includes('https://'),false);
});
test('source packets cannot override reverse Base body or another source action',()=>{
 for(const action of [{sequence:7,stage:'BROADCAST_COMMIT'},{sequence:8,stage:'SOURCE_FUND'},{sequence:9,stage:'SYNC'}]){
  const result=g5ChildDiagnostic(JSON.stringify(packet()),action,1,null);assert.equal('sourceActor' in result,false);assert.equal(result.code,'CHILD_COMMAND_FAILED');
 }
 const hostile=[{...packet(),phase:'SEND'},{...packet(),code:'UPPERCASE_SECRET_TOKEN'},{...packet(),phase:'PRIVATE_PATH'},{...packet(),private:'secret'},{...packet(),sequence:2}];
 for(const p of hostile)assert.equal(sourceActorDiagnostic(p),undefined);
 const cleanupFirst=[packet('LOCK_RELEASE','SOURCE_FILE_PERMISSION'),packet('SDK_SYNC')].map(p=>JSON.stringify(p)).join('\n');
 assert.equal(g5ChildDiagnostic(cleanupFirst,{sequence:7,stage:'SYNC'},1,null).phase,'G5_SOURCE_SDK_SYNC');
});

test('completed sync scan WAIT has strict positive public heights and cannot originate from fund',()=>{
 const scan={...wait(),phase:'SCAN_FRESHNESS',code:'G5_SOURCE_SCAN_STALE',scannedHeight:100,tipHeight:102};assert.equal(sourcePrefundWait(scan,7),true);
 for(const delta of [{command:'fund'},{scannedHeight:103},{scannedHeight:101},{scannedHeight:'100'},{tipHeight:99},{phase:'NETWORK_TIP'},{sdkCompleted:false},{uncertain:true},{proposalStarted:true},{private:'SECRET'}])assert.equal(sourcePrefundWait({...scan,...delta},7),false);
 const d={...packet('SCAN_FRESHNESS','G5_SOURCE_SCAN_STALE'),scannedHeight:100,tipHeight:102};assert.deepEqual(sourceActorDiagnostic(d),d);
 for(const delta of [{tipHeight:99},{tipHeight:'102'},{phase:'PROPOSE'},{code:'SECRET'},{uri:'https://SECRET'}])assert.equal(sourceActorDiagnostic({...d,...delta}),undefined);
});
