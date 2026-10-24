import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRelease} from './verify-release.mjs';
test('actual release bytes pass; changed bytes, duplicates and unlisted environment files refuse',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'zeeswap-public-release-'));const root=await realpath(temporary);
 try{await mkdir(join(root,'app','api','src'),{recursive:true});const target=join(root,'app','api','src','example.ts');await writeFile(target,'safe');
 const file={path:'app/api/src/example.ts',bytes:4,sha256:createHash('sha256').update('safe').digest('hex')};
 const manifest={version:1,kind:'PUBLIC_SOURCE_RELEASE',release:'linux-test',commit:'a'.repeat(40),containsPrivateState:false,files:[file]};
 const save=()=>writeFile(join(root,'release-manifest.json'),JSON.stringify(manifest));await save();
 assert.equal((await verifyRelease(root)).files,1);
 await writeFile(target,'evil');await assert.rejects(()=>verifyRelease(root),/HASH_CHANGED/);
 await writeFile(target,'safe');manifest.files.push(file);await save();await assert.rejects(()=>verifyRelease(root),/INVALID_RELEASE_FILE/);
 manifest.files.pop();await save();await writeFile(join(root,'app','.env.production'),'PRIVATE=forbidden');await assert.rejects(()=>verifyRelease(root),/UNLISTED_RELEASE_SOURCE_FILE/);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
