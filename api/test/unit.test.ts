import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { atomic, toAtomic, fixtureOutput } from '../src/amounts.ts';
import { PrivateData, accessHash } from '../src/private-data.ts';
import { makeMemo, parseMemo } from '../src/repository.ts';
import { readFileSync } from 'node:fs';
import { validateSnapshot } from '../src/observer.ts';
import { filterHistorical,validateCapital } from '../scripts/live-forward-state.ts';
import { withLeaseHeartbeat } from '../src/lease-heartbeat.ts';

test('atomic parsing rejects lossy, noncanonical and fractional inputs',()=>{
 for(const bad of ['01','-1','1.2','1e6','NaN',' 1','1'.repeat(79)]) assert.throws(()=>atomic(bad));
 assert.equal(atomic('9007199254740993'),9007199254740993n);
 assert.equal(toAtomic('0.001',8),'100000');
 assert.throws(()=>toAtomic('0.000000001',8));
});
test('fixture conversion uses asset decimals and exact arithmetic in both directions',()=>{
 assert.equal(fixtureOutput(toAtomic('0.01',8),'ZCASH_TO_BASE'),toAtomic('1',6));
 assert.equal(fixtureOutput(toAtomic('10',6),'BASE_TO_ZCASH'),toAtomic('0.1',8));
 assert.throws(()=>fixtureOutput('99999','ZCASH_TO_BASE'));
 assert.throws(()=>fixtureOutput('10000001','BASE_TO_ZCASH'));
});
test('private envelopes are randomized, authenticated and bound to their record',()=>{
 const p=new PrivateData(randomBytes(32),randomBytes(32));const value={recipient:'private shielded receiver'};
 const a=p.seal(value,'quote:a'),b=p.seal(value,'quote:a');
 assert.notDeepEqual(a,b);assert.deepEqual(p.open(a,'quote:a'),value);
 assert.throws(()=>p.open(a,'quote:b'));const corrupted=Buffer.from(a);corrupted[corrupted.length-1]^=1;
 assert.throws(()=>p.open(corrupted,'quote:a'));
 assert.notDeepEqual(p.lookup('reference','x'),p.lookup('receiver','x'));
 assert.equal(accessHash('x').length,32);
});
test('memo permits only canonical versioned references, rejecting duplicate keys and commands',()=>{
 const ref=randomUUID();assert.equal(parseMemo(makeMemo(ref)),ref);
 for(const value of [`{"v":1,"v":1,"ref":"${ref}"}`,`{"v":1,"ref":"${ref}","command":"send"}`,makeMemo(ref)+' ', 'x'.repeat(513)])
  assert.throws(()=>parseMemo(value));
});
test('versioned observer golden fixture passes after refreshing its test clock',()=>{
 const s=JSON.parse(readFileSync(new URL('../../workers/zcash-wallet/snapshot.golden.json',import.meta.url),'utf8'));
 s.observedAt=new Date().toISOString();assert.equal(validateSnapshot(s).scannedHeight,1000);
 assert.throws(()=>validateSnapshot({...s,ufvk:'must never cross this boundary'}),/INVALID_SNAPSHOT_SHAPE/);
 assert.throws(()=>validateSnapshot({...s,network:'zcash-mainnet'}),/INVALID_SNAPSHOT/);
});

test('capital proof excludes held funds exactly and rejects stale, inflated or missing liabilities',()=>{
 const proof={schemaVersion:1,network:'zcash-testnet',observedAt:new Date().toISOString(),scannedHeight:100,
  totalSpendableZatoshis:'590000',excludedHeldZatoshis:'100000',operatorFeeCapitalZatoshis:'490000'};
 assert.equal(validateCapital(proof,103,100000n),'490000');
 assert.throws(()=>validateCapital(proof,107,100000n),/STALE_CAPITAL/);
 assert.throws(()=>validateCapital({...proof,operatorFeeCapitalZatoshis:'590000'},100,100000n),/INVALID_CAPITAL/);
 assert.throws(()=>validateCapital(proof,100,200000n),/INVALID_CAPITAL/);
 assert.throws(()=>validateCapital({...proof,observedAt:new Date(Date.now()-300001).toISOString()},100,100000n),/STALE_CAPITAL/);
});
test('historical exclusion matches audited output identities and preserves unmatched new receipts',()=>{
 const s=JSON.parse(readFileSync(new URL('../../workers/zcash-wallet/snapshot.golden.json',import.meta.url),'utf8'));
 const old={txid:'a'.repeat(64),pool:'ironwood',index:0,amount:'100000',height:990};s.outputs=[old];
 const historical=[{txid:old.txid,pool:old.pool,index:old.index,amount:old.amount,height:old.height}];
 s.outputs.push({...old,index:old.index+1,memo:'unmatched new receipt'});
 const filtered=filterHistorical(s,historical);assert.equal(filtered.outputs.length,1);assert.equal(filtered.outputs[0].index,old.index+1);
 assert.throws(()=>filterHistorical(s,[{...historical[0],amount:'1'}]),/HISTORICAL_OUTPUT_CHANGED/);
 assert.throws(()=>filterHistorical(s,[historical[0],historical[0]]),/DUPLICATE_HISTORICAL/);
});
test('lease heartbeat failure prevents the next signing or broadcast checkpoint',async()=>{
 let renewals=0,broadcasts=0;
 await assert.rejects(()=>withLeaseHeartbeat(async()=>{renewals++;throw Error('paused or stale owner');},async check=>{
  await new Promise(resolve=>setTimeout(resolve,20));await check();broadcasts++;
 },2),/BASE_LEASE_RENEWAL_FAILED/);
 assert.equal(renewals,1);assert.equal(broadcasts,0);
});
test('lease heartbeat serializes renewals and stops after its operation completes',async()=>{
 let concurrent=0,maxConcurrent=0,renewals=0;
 await withLeaseHeartbeat(async()=>{concurrent++;renewals++;maxConcurrent=Math.max(maxConcurrent,concurrent);
  await new Promise(resolve=>setTimeout(resolve,3));concurrent--;
 },async check=>{await new Promise(resolve=>setTimeout(resolve,15));await check();},2);
 const finished=renewals;await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(maxConcurrent,1);assert.equal(renewals,finished);assert.ok(renewals>0);
});
