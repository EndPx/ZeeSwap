import test from 'node:test';
import assert from 'node:assert/strict';
import {baseConfirmationSqlDiagnostic,baseReceiptReadinessDiagnostic} from '../src/base-receipt-readiness.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
const context='PL/pgSQL function zee.confirm_base_attempt(uuid,text,zee.digest,bigint,text,zee.atomic,bytea) line 16 at RAISE';
test('only exact six SQL literals and the owned P0001 function context receive a static classification',()=>{
 const expected=[['receipt identity mismatch','BASE_CONFIRM_RECEIPT_IDENTITY_MISMATCH'],['receipt changed; reconciliation required','BASE_CONFIRM_RECEIPT_CHANGED'],['receipt is not finalized canonical','BASE_CONFIRM_FINALITY_PREDICATE_FAILED'],['fee cap exceeded; reconcile','BASE_CONFIRM_FEE_CAP_EXCEEDED'],['reservation missing','BASE_CONFIRM_RESERVE_MISSING'],['reservation insufficient','BASE_CONFIRM_RESERVE_INSUFFICIENT']];
 for(const [message,code] of expected)for(const where of [context,'PL/pgSQL function confirm_base_attempt(uuid,text,digest,bigint,text,atomic,bytea) line 16 at RAISE'])assert.deepEqual(baseConfirmationSqlDiagnostic({code:'P0001',message,where}),{code,sqlState:'P0001',function:'zee.confirm_base_attempt'});
 for(const value of [{code:'23514',message:expected[0][0],where:context},{code:'P0001',message:'UNKNOWN_SQL_SECRET_TOKEN',where:context},{code:'P0001',message:'toString',where:context},{code:'P0001',message:expected[0][0],where:'PL/pgSQL function unrelated() line 16 at RAISE'},{code:'P0001',message:expected[0][0]+' extra',where:context}])assert.equal(baseConfirmationSqlDiagnostic(value),undefined);
});
test('diagnostics redact unknown SQL text and context rather than broad SQL-to-WAIT classification',()=>{
 const value={code:'P0001',message:'UNKNOWN_SQL_SECRET_TOKEN',where:context+'\nprivate query secret',detail:'private-secret'};
 const diagnostic=g5Diagnostic(value,'dispatch','base-preflight');assert.equal(diagnostic.code,'PRIVATE_DIAGNOSTIC_ERROR');assert.equal('baseConfirmation' in diagnostic,false);
 assert.equal(JSON.stringify(diagnostic).includes('SECRET'),false);assert.equal(JSON.stringify(diagnostic).includes('private'),false);
});
test('typed receipt readiness diagnostics retain public headers only and reject coerced objects or extra secret payloads',()=>{
 const input={event:'base-receipt-readiness',source:'base-forward-receipt',status:'WAIT',network:'base-sepolia',reason:'FINALITY_PENDING',receiptHeight:500,receiptBlockHash:'ab'.repeat(32),scannedHeight:'600',finalizedHeight:'490',observedAt:new Date().toISOString(),secret:'PRIVATE_PAYLOAD'};
 const safe=baseReceiptReadinessDiagnostic(input)!;assert.equal(safe.reason,'FINALITY_PENDING');assert.equal(JSON.stringify(safe).includes('PRIVATE_PAYLOAD'),false);
 assert.equal(baseReceiptReadinessDiagnostic({...input,receiptBlockHash:{toString:()=>input.receiptBlockHash,secret:'PRIVATE_PAYLOAD'}}),undefined);
 assert.equal(baseReceiptReadinessDiagnostic({...input,scannedHeight:{toString:()=> '600'}}),undefined);
 assert.equal(baseReceiptReadinessDiagnostic({...input,reason:'UNKNOWN_SECRET_REASON'}),undefined);
});
