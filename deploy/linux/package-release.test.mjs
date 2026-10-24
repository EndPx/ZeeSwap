import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicReleasePath,packageRelease} from './package-release.mjs';
test('packager permits application sources and rejects private/generated/escaping inputs',()=>{
 for(const path of ['api/src/http-api.ts','api/scripts/serve-linux-testnet.ts','workers/zcash-wallet/verify/Cargo.lock','deploy/linux/nginx-tls.conf','pnpm-lock.yaml'])assert.equal(publicReleasePath(path),true,path);
 for(const path of ['.deploy-local/live-testnet-20261023/runtime.private.json','api/runtime.private.json','apps/web/.env.production','api/node_modules/a/index.js','workers/zcash-wallet/verify/target/key.rs','workers/wallet.dat','api/state/capture.json','api/../password.json','api\\secret.json','secrets/keys.ts','docs/evidence/foo.md','workers/zcash-wallet/operator.json','workers/zcash-wallet/snapshot.private.json','api/operator.webp','indexers/envio/operator.webp','apps/web/secrets/operator.webp','apps/web/mascot.private.webp'])assert.equal(publicReleasePath(path),false,path);
});
test('package retains actual observer JSON and every literal App public brand asset',async()=>{
 const repository=fileURLToPath(new URL('../../',import.meta.url));
 const observerPath='api/src/observer.ts',observer=await readFile(join(repository,observerPath));
 const assets=[...observer.toString().matchAll(/readFileSync\(new URL\(['"]([^'"]+\.json)['"],import\.meta\.url\)/g)]
  .map(match=>relative(repository,resolve(repository,dirname(observerPath),match[1])).replaceAll('\\','/'));
 assert.ok(assets.includes('workers/zcash-wallet/snapshot.schema.json'),'actual observer runtime schema import must be covered');
 const appPath='apps/web/src/App.tsx',app=await readFile(join(repository,appPath));
 const brandAssets=[...new Set([...app.toString().matchAll(/['"](\/brand\/[^'"]+)['"]/g)].map(match=>'apps/web/public'+match[1]))];
 assert.ok(brandAssets.includes('apps/web/public/brand/zee-mascot.webp'),'actual hero public asset must be covered');
 const temporary=await mkdtemp(join(tmpdir(),'zeeswap-runtime-assets-')),source=join(temporary,'source'),output=join(temporary,'release');
 try{
  await mkdir(source);const files=new Map([[observerPath,observer],['api/scripts/serve-linux-testnet.ts',Buffer.from('// package fixture')],['deploy/linux/package-release.mjs',await readFile(new URL('./package-release.mjs',import.meta.url))]]);
  files.set(appPath,app);
  for(const asset of [...assets,...brandAssets])files.set(asset,await readFile(join(repository,asset)));
  for(const [path,bytes] of files){const target=join(source,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
  const git=(...args)=>execFileSync('git',args,{cwd:source,stdio:'pipe'}).toString().trim();
  git('init');git('add','--',...files.keys());
  git('-c','user.name=ZeeSwap package test','-c','user.email=package-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath='+join(temporary,'no-hooks'),'commit','-m','Runtime asset fixture');
  await packageRelease(git('rev-parse','HEAD'),'linux-asset-test',output,source);
  const manifest=JSON.parse(await readFile(join(output,'release-manifest.json'),'utf8'));
  for(const asset of [...assets,...brandAssets]){assert.ok(manifest.files.some(file=>file.path==='app/'+asset),asset+' must be inventoried');assert.deepEqual(await readFile(join(output,'app',asset)),files.get(asset));}
  const schema=JSON.parse(await readFile(join(output,'app/workers/zcash-wallet/snapshot.schema.json'),'utf8'));
  assert.equal(schema.properties.network.const,'zcash-testnet');assert.ok(schema.required.includes('outputs'));
 }finally{await rm(temporary,{recursive:true,force:true});}
});
test('packager refuses ambiguous revisions before creating output',async()=>{
 await assert.rejects(()=>packageRelease('HEAD','linux-reviewed','unused-output'),/EXACT_COMMIT/);
 await assert.rejects(()=>packageRelease('a'.repeat(40),'../../bad','unused-output'),/EXACT_COMMIT/);
});
