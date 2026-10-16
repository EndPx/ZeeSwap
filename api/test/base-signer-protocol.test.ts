import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalBaseSigner,LocalReverseBaseSigner} from '../src/base-signer.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
import {g5ChildDiagnostic} from '../src/g5-child-diagnostic.ts';
import {signerBinding,signerInvokePacket} from '../src/base-signer-protocol.ts';
const terms:any={id:'0x'+'11'.repeat(32),token:'0x'+'22'.repeat(20),recipient:'0x'+'33'.repeat(20),amount:'100000',nonce:'123',deadline:'9999999999'};
const binding=signerBinding({command:'prepare',phase:'PAY',terms});
const packet=(extra:any={})=>({version:1,status:'BASE_SIGNER_DIAGNOSTIC',...binding,stage:'PAY_STATE_READ',code:'CAST_READ_TIMEOUT',...extra});
const wait=(extra:any={})=>({version:1,status:'BASE_SIGNER_READ_WAIT',...binding,stage:'PAY_STATE_READ',code:'CAST_READ_TIMEOUT',noNewMutation:true,signingStarted:false,nonceStarted:false,readChildCompleted:true,lockHeld:false,...extra});
const reply={raw:'0xaabb',hash:'0x'+'ab'.repeat(32),nonce:27,maxCost:'10000000000000'};
function child(result:any,code:number,stderr='',mode=''){
 const script=`let x='';process.stdin.on('data',c=>x+=c);process.stdin.on('end',()=>{${mode||`process.stderr.write(${JSON.stringify(stderr)});process.stdout.write(${JSON.stringify(JSON.stringify(result))});process.exitCode=${code};`}});`;
 return new LocalBaseSigner(process.execPath,['-e',script],1000);
}
async function failure(signer:LocalBaseSigner){try{await signer.prepare(terms,'PAY');assert.fail('Expected refusal');}catch(error:any){return error;}}
test('actual completed child protocol permits only matching read WAIT with one safe primary',async()=>{
 const error=await failure(child(wait(),75,JSON.stringify(packet())));assert.ok(isObserverWait(error));assert.equal((error as any).signerDiagnostic.python.stage,'PAY_STATE_READ');
 assert.equal((g5Diagnostic(error,'dispatch','base-preflight') as any).signer.code,'SIGNER_READ_WAIT');
});
test('actual child refuses wrong identity, phase, flags, exit, signal and contradictory cleanup WAIT',async()=>{
 const cases:[any,number,string][]=[
  [wait({requestDigest:'0'.repeat(64)}),75,JSON.stringify(packet())],[wait({command:'authorize'}),75,JSON.stringify(packet())],
  [wait({phase:'RESERVE'}),75,JSON.stringify(packet())],[wait({noNewMutation:false}),75,JSON.stringify(packet())],
  [wait({nonceStarted:true}),75,JSON.stringify(packet())],[wait({lockHeld:true}),75,JSON.stringify(packet())],
  [wait({secret:'UPPERCASE_SECRET'}),75,JSON.stringify(packet())],[wait(),0,JSON.stringify(packet())],
  [wait(),75,JSON.stringify(packet({code:'CAST_NONZERO'}))],[wait(),75,JSON.stringify(packet())+'\n'+JSON.stringify(packet({stage:'LOCK_RELEASE',code:'FILE_PERMISSION'}))],
  [wait(),75,JSON.stringify(packet({requestDigest:'0'.repeat(64)}))],[wait(),75,''],[wait(),75,'PRIVATE_PROVIDER_ERROR'],
  [wait(),75,JSON.stringify({version:1,status:'G5_SOURCE_ACTOR_DIAGNOSTIC',sequence:11})],
 ];
 for(const [out,exit,stderr] of cases){const error=await failure(child(out,exit,stderr));assert.equal(isObserverWait(error),false);assert.equal(error.message,'BASE_SIGNER_UNAVAILABLE');}
 const signal=await failure(child(null,1,'',"process.kill(process.pid,'SIGTERM');"));assert.equal(isObserverWait(signal),false);assert.ok(['SIGNER_SIGNAL','SIGNER_PROCESS_EXIT'].includes(signal.signerDiagnostic.code));
});
test('authenticated finality WAIT has prepare PAY identity, dedicated exit and matching evidence',async()=>{
 const w=wait({status:'BASE_SIGNER_FINALITY_WAIT',stage:'PAY_RESERVE_AHEAD',code:'RESERVE_AHEAD_OF_FINALIZED'}),p=packet({stage:'PAY_RESERVE_AHEAD',code:'RESERVE_AHEAD_OF_FINALIZED'});
 assert.ok(isObserverWait(await failure(child(w,76,JSON.stringify(p)))));
 assert.equal(isObserverWait(await failure(child(w,75,JSON.stringify(p)))),false);
 assert.equal(isObserverWait(await failure(child({...w,phase:'RESERVE'},76,JSON.stringify({...p,phase:'RESERVE'})))),false);
});
test('normal forward/reverse/refund shared transport reply compatibility',async()=>{
 const normal=child(reply,0);assert.deepEqual(await normal.prepare(terms,'RESERVE'),reply);assert.deepEqual(await normal.prepare(terms,'PAY'),reply);
 const signature='0x'+'ab'.repeat(65);assert.equal(await child({signature},0).authorize(terms),signature);
 const script=`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify(reply))}));`;
 const reverse=new LocalReverseBaseSigner(process.execPath,['-e',script]);for(const phase of ['COMMIT','SETTLE'] as const)assert.deepEqual(await reverse.prepareEscrow(terms,phase),reply);
 const authScript=`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(JSON.stringify({signature}))}));`;
 assert.equal(await new LocalReverseBaseSigner(process.execPath,['-e',authScript]).authorizeFunding(terms),signature);
 class Refund extends LocalBaseSigner{prepareRefund(){return this.invoke({command:'prepare'});}}
 assert.deepEqual(await new Refund(process.execPath,['-e',script]).prepareRefund(),reply);
});
test('reverse FUNDING COMMIT SETTLE unknown nonzero errors stay hard without forward WAIT',async()=>{
 const badScript="process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('SECRET_PROVIDER_ERROR');process.exitCode=1;});";
 const reverse=new LocalReverseBaseSigner(process.execPath,['-e',badScript]);
 for(const phase of ['FUNDING','COMMIT','SETTLE']){try{if(phase==='FUNDING')await reverse.authorizeFunding(terms);else await reverse.prepareEscrow(terms,phase as 'COMMIT'|'SETTLE');assert.fail('expected refusal');}catch(error:any){assert.equal(error.message,'BASE_SIGNER_UNAVAILABLE');assert.equal(isObserverWait(error),false);assert.equal(error.signerDiagnostic.phase,phase);assert.equal(JSON.stringify(error.signerDiagnostic).includes('SECRET_PROVIDER_ERROR'),false);}}
});
test('hard child failures retain static phase and reject private hostile extra fields',async()=>{
 const error=await failure(child(null,1,JSON.stringify(packet({code:'CAST_NONZERO',castExit:1}))+'\nSECRET_PROVIDER_PASSWORD'));
 assert.equal(error.signerDiagnostic.python.code,'CAST_NONZERO');assert.equal(JSON.stringify(g5Diagnostic(error,'dispatch','base-preflight')).includes('SECRET_PROVIDER'),false);
 assert.equal(signerInvokePacket({version:1,status:'BASE_SIGNER_INVOKE_FAILED',diagnostic:{...error.signerDiagnostic,secret:'UPPERCASE_SECRET'}}),undefined);
 const malformed=await failure(child({raw:'PRIVATE'},0));assert.equal(malformed.signerDiagnostic.code,'SIGNER_RESPONSE_INVALID');
});
test('parent preserves earlier signer diagnostic only on forward DISPATCH and never overrides prior body',()=>{
 const d={version:1,...binding,code:'SIGNER_PROCESS_EXIT',exitCode:1,signal:null,python:packet({code:'CAST_NONZERO',castExit:1})};
 const line=JSON.stringify({version:1,status:'BASE_SIGNER_INVOKE_FAILED',diagnostic:d}),action={sequence:11,stage:'DISPATCH'};
 const parsed=g5ChildDiagnostic(line+'\nG5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS',action,1,null);assert.equal(parsed.phase,'BASE_SIGNER_PAY_STATE_READ');assert.equal(parsed.signer?.requestDigest,binding.requestDigest);
 for(const other of [{sequence:12,stage:'DISPATCH'},{sequence:11,stage:'SOURCE_FUND'},{sequence:11,stage:'VERIFY'}])assert.equal(g5ChildDiagnostic(line,other,1,null).signer,undefined);
 assert.equal(g5ChildDiagnostic('G5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS\n'+line,action,1,null).signer,undefined);
 for(const python of [{...d.python,requestDigest:'0'.repeat(64)},{...d.python,command:'authorize'},{...d.python,secret:'PRIVATE'}])assert.equal(g5ChildDiagnostic(JSON.stringify({version:1,status:'BASE_SIGNER_INVOKE_FAILED',diagnostic:{...d,python}}),action,1,null).signer,undefined);
});
