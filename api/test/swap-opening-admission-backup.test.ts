import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
import {ensureOpeningAdmissionBackup} from '../src/swap-opening-admission-backup.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('existing exact backup reuses original bytes only before an intent; corruption and active mismatch stop',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'swap-opening-backup-')),backup=join(directory,'original-admission.bin'),intent=join(directory,'publication-intent.private.json'),active=Buffer.from('original encrypted admission');
 try{await writeFile(backup,active,{mode:0o600});const before=await stat(backup);assert.deepEqual(await ensureOpeningAdmissionBackup(directory,active,sha(active)),{created:false});assert.deepEqual(await readFile(backup),active);assert.equal((await stat(backup)).mtimeMs,before.mtimeMs);
  await assert.rejects(ensureOpeningAdmissionBackup(directory,Buffer.from('changed'),sha(active)),/ACTIVE_BYTES_CHANGED/);
  await writeFile(intent,'{}',{mode:0o600});await assert.rejects(ensureOpeningAdmissionBackup(directory,active,sha(active)),/INTENT_RECONCILE_ONLY/);await rm(intent);
  await writeFile(backup,Buffer.from('corrupted backup'),{mode:0o600});await assert.rejects(ensureOpeningAdmissionBackup(directory,active,sha(active)),/FILE|ORIGINAL_BYTES_CHANGED/);assert.equal((await readFile(backup)).toString(),'corrupted backup');
 }finally{assert.equal(dirname(directory),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});
test('unknown directory at backup path never becomes an overwrite',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'swap-opening-backup-'));try{await mkdir(join(directory,'original-admission.bin'));const active=Buffer.from('original');await assert.rejects(ensureOpeningAdmissionBackup(directory,active,sha(active)),/FILE/);}finally{assert.equal(dirname(directory),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});
