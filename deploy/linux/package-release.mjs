/** Build public source only from a reviewed Git commit; never reads local wallets. */
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function publicReleasePath(path) {
  if (!path || path.includes('\\') || path.split('/').some(p=>!p||p==='.'||p==='..')) return false;
  if (/(^|\/)(node_modules|target|__pycache__|state|secrets|\.deploy-local)(\/|$)/.test(path)
      || /(^|\/)(\.env[^/]*|[^/]*\.private\.[^/]+|[^/]*wallet[^/]*\.(db|dat)|[^/]*\.(pem|key|sqlite))$/i.test(path)) return false;
  if (['package.json','pnpm-lock.yaml','pnpm-workspace.yaml'].includes(path)) return true;
  if (/^(api|apps\/web|indexers\/(envio|zeer))\//.test(path))
    return /\.(ts|tsx|js|mjs|json|yaml|yml|graphql|html|css|svg|png|woff2|sql)$/.test(path) && !path.endsWith('.env.example');
  if (/^workers\//.test(path)) return /\.(py|rs|toml|lock|patch)$/.test(path);
  return /^deploy\/linux\//.test(path) && /\.(mjs|conf|service|timer|txt|md|sh)$/.test(path);
}

export async function packageRelease(commit, release, output, repo=process.cwd()) {
  if (!/^[0-9a-f]{40}$/.test(commit)||!/^linux-[a-z0-9][a-z0-9._-]{1,60}$/.test(release)) throw Error('EXACT_COMMIT_AND_LINUX_RELEASE_REQUIRED');
  const git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:32*1024*1024});
  if(git('rev-parse',commit+'^{commit}').toString().trim()!==commit)throw Error('UNKNOWN_COMMIT');
  const destination=resolve(output);
  try {await lstat(destination);throw Error('NEW_OUTPUT_DIRECTORY_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}
  const tree=git('ls-tree','-r','-z',commit).toString().split('\0').filter(Boolean);
  const selected=tree.map(row=>{const [metadata,path]=row.split('\t');return {mode:metadata.split(' ')[0],path};}).filter(({path})=>publicReleasePath(path));
  if(!selected.some(f=>f.path==='api/scripts/serve-linux-testnet.ts')||!selected.some(f=>f.path==='deploy/linux/package-release.mjs'))throw Error('REVIEWED_LINUX_CODE_MISSING_FROM_COMMIT');
  if(selected.some(f=>!['100644','100755'].includes(f.mode)))throw Error('SOURCE_SYMLINK_OR_SUBMODULE_FORBIDDEN');
  await mkdir(destination,{recursive:true});const files=[];
  for(const {path} of selected){const bytes=git('show',commit+':'+path);const target=resolve(destination,'app',path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx',mode:0o644});files.push({path:'app/'+path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  const manifest={version:1,kind:'PUBLIC_SOURCE_RELEASE',release,commit,files,containsPrivateState:false,servicesStarted:false};
  await writeFile(resolve(destination,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o644});
  return {release,commit,publicFiles:files.length,output:destination,containsPrivateState:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==5)throw Error('Usage: node deploy/linux/package-release.mjs COMMIT linux-RELEASE NEW_OUTPUT');
  console.log(JSON.stringify(await packageRelease(...process.argv.slice(2))));
}
