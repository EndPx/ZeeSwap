import test from 'node:test';
import assert from 'node:assert/strict';
import {g5Diagnostic,observerFrontierDiagnostic} from '../src/g5-diagnostic.ts';

const header={height:1000,hash:'a'.repeat(64),finalizedHeight:991,observedAt:'2026-10-15T00:00:00.000Z'};
const frontier={event:'observer-frontier',source:'source-wallet-snapshot',status:'WAIT',reason:'HEAD_BEHIND',network:'zcash-testnet',previous:header,incoming:{...header,height:999}};
test('core diagnostics retain only allowlisted public observer frontier fields',()=>{
 const secret='https://user:private-secret@provider.invalid/?memo=private-order';
 const diagnostic={...frontier,rpc:secret,memo:secret,orderId:secret,previous:{...header,url:secret},incoming:{...frontier.incoming,wallet:secret}};
 const failure=Object.assign(new Error('OBSERVER_WAIT'),{diagnostic});
 const actual=g5Diagnostic(failure,'observe','source-snapshot');
 assert.deepEqual(actual.observerFrontier,frontier);
 assert.equal(JSON.stringify(actual).includes(secret),false);
 assert.equal(JSON.stringify(actual).includes('private-secret'),false);
});

test('unknown producer, unsafe heights, hostile hashes/timestamps and unrecognized states drop observer details',()=>{
 for(const change of [{source:'https://private-secret.invalid'},{network:'unknown'},{status:'FAIL'},{reason:'PRIVATE_MEMO'},
  {previous:{...header,height:-1}},{previous:{...header,height:Number.MAX_SAFE_INTEGER+1}},
  {incoming:{...header,hash:'private-secret'}},{incoming:{...header,observedAt:'private-secret'}}])
  assert.equal(observerFrontierDiagnostic({...frontier,...change}),undefined);
});

test('receipt scanner WAIT and canonical conflict preserve their bounded public evidence',()=>{
 const receipt={...frontier,source:'reverse-payout-receipt',reason:'SCANNER_FINALITY_PENDING',previous:null,incoming:{receiptHeight:1000,requiredScannedHeight:1009}};
 assert.deepEqual(observerFrontierDiagnostic(receipt),receipt);
 const conflict={...frontier,status:'CONFLICT',reason:'CANONICAL_HASH_CHANGED',previous:{height:1000,hash:'a'.repeat(64)},incoming:{height:1000,hash:'b'.repeat(64)}};
 assert.deepEqual(observerFrontierDiagnostic(conflict),conflict);
});
