import test from 'node:test';
import assert from 'node:assert/strict';
import {liveOpeningAccounts,validateLiveOpeningRows} from '../../src/live-testnet-opening.ts';
const event='fixed-opening-event';
const accounts=()=>liveOpeningAccounts.map(a=>({...a}));
const rows=()=>liveOpeningAccounts.flatMap(a=>[{event_id:event,asset:a.asset,bucket:a.purpose+':available',amount:a.balance},{event_id:event,asset:a.asset,bucket:a.purpose+':operator-capital',amount:'-'+a.balance}]);
test('opening is four exact capital accounts and eight balanced rows, not pooled inventory or excess TAZ',()=>{validateLiveOpeningRows(event,accounts(),rows());assert.equal(accounts().filter(a=>a.asset==='TAZ').reduce((n,a)=>n+BigInt(a.balance),0n),220000n);assert.equal(rows().reduce((n,r)=>n+BigInt(r.amount),0n),0n);});
test('source fee misallocation, changed event, partial row, reservation or extra pooled capital refuses',()=>{const a=accounts();a[2]!.asset='baseETH' as never;assert.throws(()=>validateLiveOpeningRows(event,a,rows()));assert.throws(()=>validateLiveOpeningRows('other',accounts(),rows()));assert.throws(()=>validateLiveOpeningRows(event,accounts(),rows().slice(1)));const reserved=accounts();reserved[0]!.reserved='1' as never;assert.throws(()=>validateLiveOpeningRows(event,reserved,rows()));const pooled=accounts();pooled[0]!.balance='10000000' as never;assert.throws(()=>validateLiveOpeningRows(event,pooled,rows()));});
