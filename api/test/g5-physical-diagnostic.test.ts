import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePhysicalCaptureDiagnostics,physicalCaptureDiagnostic} from '../src/g5-physical-diagnostic.ts';
import {runG5PhysicalCaptureProcess} from '../scripts/g5-physical-capture.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
const packet=(phase='ZERO_CHANGE_PROOF',wallet:string|number=4)=>({version:1,status:'G5_PHYSICAL_CAPTURE_DIAGNOSTIC',phase,code:'CAPTURE_REFUSED',wallet});
test('physical packets preserve original primary and cap later diagnostics without raw stderr',()=>{
 const text=['UPPERCASE_SECRET_TOKEN https://private:secret@provider',JSON.stringify(packet()),JSON.stringify(packet('LOCK_RELEASE')),...Array.from({length:6},()=>JSON.stringify(packet('SDK_NOTES',6)))].join('\n');
 const d=parsePhysicalCaptureDiagnostics(text)!;assert.deepEqual(d.primary,packet());assert.equal(d.secondary.length,3);assert.equal(JSON.stringify(d).includes('secret'),false);
 const persisted=g5Diagnostic(Object.assign(Error('G5_PHYSICAL_CAPTURE_FAILED'),{physicalCaptureDiagnostic:d}),'recover-sdk-fault','fresh-held-physical-partition');
 assert.deepEqual((persisted as any).physicalCapture,d);
});
test('physical packet vocabulary, wallet identities and exact shape reject hostile data',()=>{
 for(const p of [{...packet(),wallet:3},{...packet(),wallet:22},{...packet(),wallet:'private-receiver'},{...packet(),phase:'SDK_SECRET_TOKEN'},{...packet(),code:'UPPERCASE_SECRET_TOKEN'},{...packet(),raw:'private-key'},{...packet(),version:2}])assert.equal(parsePhysicalCaptureDiagnostics(JSON.stringify(p)),undefined);
 for(const wallet of ['deposit','fee',2,20])assert.equal(parsePhysicalCaptureDiagnostics(JSON.stringify(packet('CONFIG_READ',wallet)))?.primary.wallet,wallet);
 assert.equal(physicalCaptureDiagnostic({primary:{...packet(),memo:'secret'},secondary:[]}),undefined);
});
test('cleanup packet cannot replace an available substantive original failure',()=>{
 const d=parsePhysicalCaptureDiagnostics([packet('LOCK_RELEASE'),packet('CAPITAL_VALIDATION')].map(p=>JSON.stringify(p)).join('\n'))!;
 assert.equal(d.primary.phase,'CAPITAL_VALIDATION');assert.equal(d.secondary[0].phase,'LOCK_RELEASE');
});

test('actual failed capture child retains sanitized primary and cleanup without raw child output',async()=>{
 const script=`console.error('PRIVATE_STDERR_SECRET');console.error(JSON.stringify(${JSON.stringify(packet())}));console.error(JSON.stringify(${JSON.stringify(packet('LOCK_RELEASE'))}));process.exitCode=1;`;
 await assert.rejects(()=>runG5PhysicalCaptureProcess(process.execPath,['-e',script]),(error:any)=>{
  assert.equal(error.message,'G5_PHYSICAL_CAPTURE_FAILED');assert.deepEqual(error.physicalCaptureDiagnostic,{primary:packet(),secondary:[packet('LOCK_RELEASE')]});
  assert.equal(JSON.stringify(error).includes('PRIVATE_STDERR_SECRET'),false);return true;
 });
});
