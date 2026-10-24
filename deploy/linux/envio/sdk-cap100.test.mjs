import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,link,stat,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {schedulerCapBytes,applySchedulerCap,sha256,STOCK_SHA256,CAPPED_SHA256,SDK_PATH} from './sdk-cap100.mjs';
let stock;try{stock=await readFile(process.env.ENVIO_STOCK_MAIN_PATH??SDK_PATH);}catch{}
const needsStock={skip:!stock?'Requires exact stock Envio 3.14.0 Main.res.mjs fixture':false};
test('exact stock patch adds only cap100 after resume and before state construction',needsStock,()=>{
 assert.equal(sha256(stock),STOCK_SHA256);const patched=schedulerCapBytes(stock),text=patched.toString();
 assert.equal(sha256(patched),CAPPED_SHA256);assert.equal(patched.length-stock.length,74);
 const marker='  config$2 = {...config$2, batchSize: Math.min(config$2.batchSize, 100)};';
 assert.equal(text.replace('\n'+marker,''),stock.toString());
 assert.ok(text.indexOf('Persistence.initForRun(')<text.indexOf(marker));
 assert.ok(text.indexOf('patchConfig(config$1, registrationsByChainId)')<text.indexOf(marker));
 assert.ok(text.indexOf(marker)<text.indexOf('IndexerState.makeFromDbState(config$2'));
 const changed=Buffer.from(stock);changed[0]^=1;assert.throws(()=>schedulerCapBytes(changed),/EXACT_STOCK/);
 assert.throws(()=>schedulerCapBytes(patched),/EXACT_STOCK/);
});
test('atomic replacement breaks pnpm hardlink and preserves exact original archive',needsStock,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zee-sdk-cap100-')),source=join(dir,'Main.res.mjs'),store=join(dir,'pnpm-store-link'),archive=join(dir,'stock.archive');
 try{
  await writeFile(source,stock,{mode:0o600});await link(source,store);const before=await stat(source);
  assert.equal(before.ino,(await stat(store)).ino);
  const result=await applySchedulerCap(source,archive);assert.equal(result.atomicReplacement,true);
  assert.equal(sha256(await readFile(source)),CAPPED_SHA256);assert.equal(sha256(await readFile(store)),STOCK_SHA256);assert.equal(sha256(await readFile(archive)),STOCK_SHA256);
  assert.notEqual((await stat(source)).ino,(await stat(store)).ino);
  await assert.rejects(applySchedulerCap(source,join(dir,'second.archive')),/EXACT_STOCK/);
  await assert.rejects(access(join(dir,'second.archive')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('archive collision and wrong stock leave target bytes untouched',needsStock,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zee-sdk-refuse-')),source=join(dir,'Main.res.mjs'),archive=join(dir,'stock.archive');
 try{
  await writeFile(source,stock,{mode:0o600});await writeFile(archive,'preserve',{mode:0o600});
  await assert.rejects(applySchedulerCap(source,archive),{code:'EEXIST'});
  assert.equal(sha256(await readFile(source)),STOCK_SHA256);assert.equal(await readFile(archive,'utf8'),'preserve');
  await writeFile(source,'wrong stock',{mode:0o600});
  await assert.rejects(applySchedulerCap(source,join(dir,'new.archive')),/EXACT_STOCK/);
  assert.equal(await readFile(source,'utf8'),'wrong stock');await assert.rejects(access(join(dir,'new.archive')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unsupported input never becomes an accepted scheduler artifact',()=>{assert.throws(()=>schedulerCapBytes(Buffer.from('arbitrary runtime')),/EXACT_STOCK/);});
