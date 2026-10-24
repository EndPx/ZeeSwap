/** Explicit atomic transition from reviewed cap100 to cap100/header coalescer. */
import {readFile,lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CAPPED_SHA256,SDK_PATH,sha256} from './sdk-cap100.mjs';
export const TRANSPORT_MAIN_SHA256='f86148bd6e8cbe777b5021f2e7f58ed6b717af4182c0e00f032036e93e8ae82f';
export const CAP_ARCHIVE='/opt/zeeswap-testnet/state/envio-engine/sdk-originals/Main.res.mjs.cap100-'+CAPPED_SHA256;
const seam='  config$2 = {...config$2, batchSize: Math.min(config$2.batchSize, 100)};';
const addition='\n  await (await import("file:///opt/zeeswap-testnet/current/app/deploy/linux/envio/rpc-coalescer.mjs")).installEnvioRpcTransport({sdkMainUrl: import.meta.url, importHandler: HandlerLoader.importHandler, config: config$2});';
export function coalescedRuntimeBytes(cap){
 if(sha256(cap)!==CAPPED_SHA256)throw Error('EXACT_REVIEWED_CAP100_REQUIRED');
 const text=cap.toString('utf8');if(text.split(seam).length!==2)throw Error('EXACT_POST_RESUME_CAP_SEAM_REQUIRED');
 const result=Buffer.from(text.replace(seam,seam+addition));
 if(result.length-cap.length!==222||sha256(result)!==TRANSPORT_MAIN_SHA256)throw Error('EXACT_REVIEWED_TRANSPORT_MAIN_REQUIRED');return result;
}
export async function applyCoalescedRuntime(path,archive){
 if(resolve(path)!==path||resolve(archive)!==archive||path===archive||await realpath(dirname(archive))!==dirname(archive))throw Error('CANONICAL_DISTINCT_PATHS_REQUIRED');
 const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||await realpath(path)!==path||(stat.mode&0o022)!==0)throw Error('PROTECTED_MAIN_REQUIRED');
 const before=await readFile(path),modified=coalescedRuntimeBytes(before),saved=await open(archive,'wx',0o600);
 try{await saved.writeFile(before);await saved.sync();}finally{await saved.close();}
 const archiveDir=await open(dirname(archive),'r');try{await archiveDir.sync();}finally{await archiveDir.close();}
 const temp=path+'.transport.'+randomUUID()+'.tmp';let renamed=false;
 try{
  const file=await open(temp,'wx',stat.mode&0o777);try{await file.writeFile(modified);await file.sync();}finally{await file.close();}
  if(sha256(await readFile(path))!==CAPPED_SHA256)throw Error('CAP100_CHANGED_DURING_PREPARATION');
  await rename(temp,path);renamed=true;const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
  if(sha256(await readFile(path))!==TRANSPORT_MAIN_SHA256||sha256(await readFile(archive))!==CAPPED_SHA256)throw Error('TRANSPORT_POSTCHECK_FAILED');
  return{status:'MODIFIED_ENVIO_CAP100_HEADER_TRANSPORT_APPLIED',runtimeSha256:TRANSPORT_MAIN_SHA256,previousCapArchived:true,atomicReplacement:true,databaseAccess:false,servicesStarted:false};
 }finally{if(!renamed)await unlink(temp).catch(()=>{});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [step,path,archive]=process.argv.slice(2);if(process.platform!=='linux'||process.getuid()!==0||step!=='apply'||path!==SDK_PATH||archive!==CAP_ARCHIVE||process.argv.length!==5)throw Error('EXPLICIT_ROOT_SCOPED_APPLY_REQUIRED');console.log(JSON.stringify(await applyCoalescedRuntime(path,archive)));}
 catch(e){console.error(JSON.stringify({status:'ENVIO_TRANSPORT_PATCH_REFUSED',reason:e.code??e.message}));process.exitCode=1;}
}
