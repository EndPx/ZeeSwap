import test from 'node:test';import assert from 'node:assert/strict';
import {serializeFundingCutoffHeight} from '../src/http-api.ts';
import {decodeOrder} from '../../apps/web/src/protocol.ts';

test('pg BIGINT cutoff string becomes a JSON number accepted by the existing frontend decoder',()=>{
 const wire={id:'11111111-2222-4333-8444-555555555555',direction:'ZCASH_TO_BASE',status:'AWAITING_FUNDS',inputAmount:'100000',outputAmount:'100000',executionMode:'base-settlement-v1',priceMode:'fixture',integrationOnly:true,expiresAt:'2026-10-25T12:00:00.000Z',source:{received:false,confirmed:false,confirmations:0,policy:'zcash-10-confirmations',requiredConfirmations:10},funding:{network:'zcash-testnet',receiver:'synthetic-receiver',memo:'synthetic-memo',cutoffHeight:serializeFundingCutoffHeight('1012'),cutoffTime:null,cancellationAvailableAt:null}};
 const decoded=decodeOrder(JSON.parse(JSON.stringify(wire)));assert.equal(decoded.funding!.cutoffHeight,1012);assert.equal(typeof decoded.funding!.cutoffHeight,'number');
 assert.throws(()=>decodeOrder({...wire,funding:{...wire.funding,cutoffHeight:'1012'}}));
});
test('nullable and safe integer boundaries preserve the height exactly',()=>{assert.equal(serializeFundingCutoffHeight(null),null);assert.equal(serializeFundingCutoffHeight('0'),0);assert.equal(serializeFundingCutoffHeight(1012),1012);assert.equal(serializeFundingCutoffHeight(String(Number.MAX_SAFE_INTEGER)),Number.MAX_SAFE_INTEGER);});
test('unsafe, fractional, negative and noncanonical values refuse instead of rounding/coercing',()=>{for(const value of ['9007199254740992','9007199254740993',Number.MAX_SAFE_INTEGER+1,'1012.5',1012.5,'-1',-1,'1e3','+1012','01012',' 1012 ','',undefined,true,{},NaN,Infinity])assert.throws(()=>serializeFundingCutoffHeight(value),/INVALID_FUNDING_CUTOFF_HEIGHT/);});
