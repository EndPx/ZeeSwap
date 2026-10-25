/** Copies an exact public allowlist. Never copies the runtime project, credentials or node_modules. */
import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha,need} from './config.mjs';
export const BUILD_FILES=['Dockerfile','.dockerignore','runtime.mjs','config.mjs','healthcheck.mjs','probe.mjs'];
export async function prepareContext(source,destination,nodeImage){
 need(/^node:24\.14\.0-(?:bookworm|trixie)-slim@sha256:[a-f0-9]{64}$/.test(nodeImage),'PINNED_NODE_BASE_REQUIRED');
 const files=[];for(const name of BUILD_FILES){const path=source+'/'+name,s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=1048576,'PUBLIC_BUILD_FILE');const bytes=await readFile(path);files.push({name,bytes,sha256:sha(bytes)});}
 const dockerfile=files.find(p=>p.name==='Dockerfile').bytes.toString();need(!/^\s*(?:ADD|RUN)\s/im.test(dockerfile)&&dockerfile.includes('COPY runtime.mjs config.mjs healthcheck.mjs probe.mjs ./'),'NO_BUILD_BOOTSTRAP_OR_SECRET_COPY');
 await mkdir(destination,{mode:0o700});for(const f of files)await writeFile(destination+'/'+f.name,f.bytes,{flag:'wx',mode:0o644});
 const manifest={version:1,nodeImage,files:files.map(({name,sha256})=>({name,sha256}))};await writeFile(destination+'/public-build-manifest.json',JSON.stringify(manifest)+'\n',{flag:'wx',mode:0o600});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){need(process.argv.length===4,'EXPLICIT_NEW_CONTEXT_AND_BASE');prepareContext(dirname(fileURLToPath(import.meta.url)),resolve(process.argv[2]),process.argv[3]).then(()=>console.log('PUBLIC_ENVIO_BUILD_CONTEXT_PREPARED')).catch(()=>{console.error('PUBLIC_ENVIO_BUILD_CONTEXT_REFUSED');process.exitCode=1;});}
