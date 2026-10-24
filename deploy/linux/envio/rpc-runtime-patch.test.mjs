import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,link,stat,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {schedulerCapBytes,STOCK_SHA256,CAPPED_SHA256,SDK_PATH,sha256} from './sdk-cap100.mjs';
import {coalescedRuntimeBytes,applyCoalescedRuntime,TRANSPORT_MAIN_SHA256} from './rpc-runtime-patch.mjs';
let cap;try{const bytes=await readFile(process.env.ENVIO_STOCK_MAIN_PATH??SDK_PATH);cap=sha256(bytes)===STOCK_SHA256?schedulerCapBytes(bytes):bytes;if(sha256(cap)!==CAPPED_SHA256)cap=undefined;}catch{}
const fixture={skip:!cap?'Requires exact stock or reviewed cap100 fixture':false};
test('transport entry is exactly pinned after cap/resume and before state creation',fixture,()=>{
 const next=coalescedRuntimeBytes(cap),text=next.toString();assert.equal(sha256(next),TRANSPORT_MAIN_SHA256);assert.equal(next.length-cap.length,222);
 const start=text.indexOf('await (await import("file:///opt/zeeswap-testnet/current/app/deploy/linux/envio/rpc-coalescer.mjs"))');
 assert.ok(text.indexOf('Persistence.initForRun(')<start);assert.ok(text.indexOf('batchSize: Math.min(config$2.batchSize, 100)')<start);assert.ok(start<text.indexOf('IndexerState.makeFromDbState(config$2'));
 assert.throws(()=>coalescedRuntimeBytes(next),/EXACT_REVIEWED_CAP100/);
});
test('transport patch archives cap100 and breaks hardlinks; collision/reapply never overwrite',fixture,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zee-rpc-runtime-')),main=join(dir,'Main.res.mjs'),store=join(dir,'shared-store'),archive=join(dir,'cap.archive');
 try{await writeFile(main,cap,{mode:0o600});await link(main,store);await applyCoalescedRuntime(main,archive);
  assert.equal(sha256(await readFile(main)),TRANSPORT_MAIN_SHA256);assert.equal(sha256(await readFile(store)),CAPPED_SHA256);assert.equal(sha256(await readFile(archive)),CAPPED_SHA256);assert.notEqual((await stat(main)).ino,(await stat(store)).ino);
  await assert.rejects(applyCoalescedRuntime(main,join(dir,'again')),/EXACT_REVIEWED_CAP100/);await assert.rejects(access(join(dir,'again')));
  await writeFile(main,cap);await assert.rejects(applyCoalescedRuntime(main,archive),{code:'EEXIST'});assert.equal(sha256(await readFile(main)),CAPPED_SHA256);
 }finally{await rm(dir,{recursive:true,force:true});}
});
