/** Check the public source bundle before dependency installation or symlink switch. */
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {publicReleasePath} from './package-release.mjs';
export async function verifyRelease(directory) {
 const root=resolve(directory);if(await realpath(root)!==root)throw Error('RELEASE_ANCESTOR_SYMLINK');
 const manifestPath=resolve(root,'release-manifest.json');const info=await lstat(manifestPath);
 if(!info.isFile()||info.isSymbolicLink())throw Error('REGULAR_MANIFEST_REQUIRED');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.version!==1||manifest.kind!=='PUBLIC_SOURCE_RELEASE'||!/^linux-[a-z0-9][a-z0-9._-]{1,60}$/.test(manifest.release)||!/^[0-9a-f]{40}$/.test(manifest.commit)||manifest.containsPrivateState!==false||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('INVALID_RELEASE_MANIFEST');
 const names=new Set();for(const file of manifest.files){
  if(typeof file.path!=='string'||!file.path.startsWith('app/')||!publicReleasePath(file.path.slice(4))||names.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[0-9a-f]{64}$/.test(file.sha256))throw Error('INVALID_RELEASE_FILE');
  names.add(file.path);const path=resolve(root,file.path);const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||await realpath(path)!==path||stat.size!==file.bytes)throw Error('RELEASE_FILE_TYPE_OR_SIZE');
  if(createHash('sha256').update(await readFile(path)).digest('hex')!==file.sha256)throw Error('RELEASE_FILE_HASH_CHANGED');
 }
 async function walk(relative){
  const directory=resolve(root,relative);if(await realpath(directory)!==directory)throw Error('RELEASE_DIRECTORY_SYMLINK');
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const path=relative+'/'+entry.name;if(entry.isSymbolicLink())throw Error('RELEASE_SOURCE_SYMLINK');
   if(entry.isDirectory())await walk(path);else if(!entry.isFile()||!names.has(path))throw Error('UNLISTED_RELEASE_SOURCE_FILE');
  }
 }
 await walk('app');
 return {status:'PUBLIC_RELEASE_HASHES_VERIFIED',commit:manifest.commit,release:manifest.release,files:names.size,privateStateVerified:false,servicesStarted:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node deploy/linux/verify-release.mjs RELEASE_DIRECTORY');
 console.log(JSON.stringify(await verifyRelease(process.argv[2])));
}
