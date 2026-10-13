import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { atomic, toAtomic, fixtureOutput } from '../src/amounts.ts';
import { PrivateData, accessHash } from '../src/private-data.ts';
import { makeMemo, parseMemo } from '../src/repository.ts';
import { readFileSync } from 'node:fs';
import { validateSnapshot } from '../src/observer.ts';

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
