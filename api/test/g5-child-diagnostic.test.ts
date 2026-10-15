import test from 'node:test';
import assert from 'node:assert/strict';
test('private transport diagnostics retain only exact known codes and public basename frames',()=>{
 for(const code of ['EWSLROUTE','EWSLPROTO','EWSLPROCESS','EJSONPARSE','EFBIG','EUNKNOWN','PRIVATE_JSON_PARSE_FAILED']){
  const packet={version:1,status:'G5_REVERSE_INITIALIZATION_FAILED',diagnostic:{phase:'G5_REVERSE_INIT_SLOT',code,exceptionClass:'Error',frames:[{file:'private-json-read.ts',line:17,column:8}],message:'postgres://secret:PRIVATE_PASSWORD@host/path',raw:'a'.repeat(64)}};
  const d=g5ChildDiagnostic(JSON.stringify(packet),action,1,null);assert.equal(d.code,code);assert.deepEqual(d.frames,[{file:'private-json-read.ts',line:17,column:8}]);assert.equal(JSON.stringify(d).includes('PRIVATE_PASSWORD'),false);assert.equal(JSON.stringify(d).includes('a'.repeat(64)),false);
 }
 const unknown={version:1,status:'G5_REVERSE_INITIALIZATION_FAILED',diagnostic:{phase:'G5_REVERSE_INIT_SLOT',code:'PRIVATE_JSON_SECRET_TOKEN',exceptionClass:'Error',frames:[{file:'secret-private.ts',line:1,column:1}]}};
 const d=g5ChildDiagnostic(JSON.stringify(unknown),action,1,null);assert.equal(d.code,'CHILD_COMMAND_FAILED');assert.deepEqual(d.frames,[]);
});
import {g5ChildDiagnostic} from '../src/g5-child-diagnostic.ts';
const action={sequence:4,stage:'REVERSE_QUOTE'};
test('child diagnostic retains only closed known error codes and basename source locations',()=>{
 const result=g5ChildDiagnostic("Error [ERR_MODULE_NOT_FOUND]: private module https://user:password@host/path\n at C:\\private\\g5-reverse-operator.ts:44:12\n code: '08006'",action,1,null);
 assert.equal(result.code,'ERR_MODULE_NOT_FOUND');assert.equal(result.exceptionClass,'Error');assert.equal(result.sqlState,'08006');assert.deepEqual(result.frames,[{file:'g5-reverse-operator.ts',line:44,column:12}]);
 const text=JSON.stringify(result);for(const secret of ['password','https://','private module','C:\\private','user:'])assert.equal(text.includes(secret),false);
});
test('arbitrary uppercase/provider secrets and unrecognized frames are never persisted',()=>{
 const secret='G5_PASSWORD_'+'AB'.repeat(32),stderr=`Error: ${secret} postgres://user:myPassword@host/db 0x${'c'.repeat(64)}\n at key_${'a'.repeat(64)}.ts:1:1`;
 const result=g5ChildDiagnostic(stderr,action,1,null);assert.equal(result.code,'CHILD_COMMAND_FAILED');assert.deepEqual(result.frames,[]);
 const text=JSON.stringify(result);for(const value of [secret,'myPassword','postgres://','c'.repeat(64),'a'.repeat(64)])assert.equal(text.includes(value),false);
});
test('strict known initialization and cleanup packets preserve bounded phase without arbitrary packet content',()=>{
 const packet={version:1,status:'G5_REVERSE_CLEANUP_FAILED',diagnostic:{phase:'G5_REVERSE_CLEANUP_PAUSE',code:'REVERSE_OPERATOR_PAUSE_FAILED',exceptionClass:'TypeError',sqlState:'08006',frames:[{file:'g5-context.ts',line:55,column:3},{file:'secret-token.js',line:1,column:1}],private:'never persist'}};
 const result=g5ChildDiagnostic(JSON.stringify(packet),action,1,null);assert.equal(result.phase,'G5_REVERSE_CLEANUP_PAUSE');assert.equal(result.code,'REVERSE_OPERATOR_PAUSE_FAILED');assert.equal(result.exceptionClass,'TypeError');assert.equal(result.sqlState,'08006');assert.deepEqual(result.frames,[{file:'g5-context.ts',line:55,column:3}]);assert.equal(JSON.stringify(result).includes('never persist'),false);
 assert.equal(g5ChildDiagnostic('REVERSE_OPERATOR_PAUSE_FAILED',action,1,null).phase,'CLEANUP');
});
test('first initialization packet survives private diagnostic IO failure and later cleanup packets without raw fallback overriding it',()=>{
 const initial={version:1,status:'G5_REVERSE_INITIALIZATION_FAILED',diagnostic:{phase:'G5_REVERSE_INIT_SLOT',code:'G5_REVERSE_SLOT_BINDING_MISMATCH',exceptionClass:'Error',frames:[{file:'g5-slot.ts',line:12,column:4}]}};
 const cleanup={version:1,status:'G5_REVERSE_CLEANUP_FAILED',diagnostic:{phase:'G5_REVERSE_CLEANUP_PAUSE',code:'REVERSE_OPERATOR_PAUSE_FAILED',exceptionClass:'TypeError',sqlState:'08006',frames:[],secret:'NEVER_KEEP'}};
 const stderr=[JSON.stringify(initial),'Error: EACCES failed writing private diagnostic https://user:PRIVATE_PASSWORD@host',...Array(5).fill(JSON.stringify(cleanup))].join('\n');
 const result=g5ChildDiagnostic(stderr,action,1,null);
 assert.equal(result.phase,'G5_REVERSE_INIT_SLOT');assert.equal(result.code,'G5_REVERSE_SLOT_BINDING_MISMATCH');assert.equal(result.exceptionClass,'Error');assert.deepEqual(result.frames,[{file:'g5-slot.ts',line:12,column:4}]);assert.equal(result.cleanup?.length,3);assert.equal(result.cleanup?.[0].phase,'G5_REVERSE_CLEANUP_PAUSE');assert.equal(result.cleanup?.[0].code,'REVERSE_OPERATOR_PAUSE_FAILED');
 assert.equal(JSON.stringify(result).includes('PRIVATE_PASSWORD'),false);assert.equal(JSON.stringify(result).includes('NEVER_KEEP'),false);
 const unknownPrimary={...initial,diagnostic:{...initial.diagnostic,code:'G5_PRIVATE_PROVIDER_SECRET'}};
 assert.equal(g5ChildDiagnostic([JSON.stringify(unknownPrimary),JSON.stringify(cleanup)].join('\n'),action,1,null).code,'CHILD_COMMAND_FAILED');
});
test('earlier body failure marker survives unavailable private body diagnostic and multiple cleanup packets',()=>{
 const cleanup={version:1,status:'G5_REVERSE_CLEANUP_FAILED',diagnostic:{phase:'G5_REVERSE_CLEANUP_PAUSE',code:'REVERSE_OPERATOR_PAUSE_FAILED',exceptionClass:'TypeError',frames:[]}};
 const stderr=['REVERSE_OPERATOR_STEP_FAILED: reconcile the private state, original transaction and signer journal','Error: EACCES private body diagnostic unavailable PRIVATE_PASSWORD',JSON.stringify(cleanup),JSON.stringify({...cleanup,diagnostic:{...cleanup.diagnostic,phase:'G5_REVERSE_CLEANUP_SLOT_CLOSE'}})].join('\n');
 const result=g5ChildDiagnostic(stderr,action,1,null);assert.equal(result.phase,'OPERATOR_STEP');assert.equal(result.code,'REVERSE_OPERATOR_BODY_FAILED');assert.equal(result.exceptionClass,'Unknown');assert.equal(result.cleanup?.length,2);assert.equal(result.cleanup?.[0].phase,'G5_REVERSE_CLEANUP_PAUSE');assert.equal(result.cleanup?.[1].phase,'G5_REVERSE_CLEANUP_SLOT_CLOSE');assert.equal(JSON.stringify(result).includes('PRIVATE_PASSWORD'),false);
});
