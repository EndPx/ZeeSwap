/** Explicit operator patch for one stock Envio 3.14.0 runtime file. No DB API. */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const STOCK_SHA256='0e0e1b8985c0c4b37fde11bcd915a803e9efa76fea521ac380613d7626712f77';
export const CAPPED_SHA256='eab1bb2c44294b25a456a367c90eb0c4d87b0b2f2f2f51259144e7be7de64f9f';
export const SDK_PATH='/opt/zeeswap-testnet/state/envio-engine/project/node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs';
export const ARCHIVE_PATH='/opt/zeeswap-testnet/state/envio-engine/sdk-originals/Main.res.mjs.stock-'+STOCK_SHA256;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const seam='  let config$2 = patchConfig !== undefined ? patchConfig(config$1, registrationsByChainId) : config$1;';
const addition='\n  config$2 = {...config$2, batchSize: Math.min(config$2.batchSize, 100)};';
export function schedulerCapBytes(stock){
 if(sha256(stock)!==STOCK_SHA256)throw Error('EXACT_STOCK_ENVIO_314_MAIN_REQUIRED');
 const text=stock.toString('utf8');
 if(text.split(seam).length!==2)throw Error('EXACT_POST_RESUME_SEAM_REQUIRED');
 const patched=Buffer.from(text.replace(seam,seam+addition));
 if(patched.length-stock.length!==74||sha256(patched)!==CAPPED_SHA256)throw Error('EXACT_CAP100_ARTIFACT_REQUIRED');
 return patched;
}
/** Filesystem seam is exported for disposable hardlink/negative tests. The CLI
 * separately enforces root, Linux and the exact approved installation paths. */
export async function applySchedulerCap(path,archive){
 if(resolve(path)!==path||resolve(archive)!==archive||path===archive)throw Error('ABSOLUTE_DISTINCT_PATHS_REQUIRED');
 if(await realpath(dirname(archive))!==dirname(archive))throw Error('CANONICAL_ARCHIVE_DIRECTORY_REQUIRED');
 const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||await realpath(path)!==path||(stat.mode&0o022)!==0)throw Error('REGULAR_PROTECTED_SDK_FILE_REQUIRED');
 const before=await readFile(path),patched=schedulerCapBytes(before);
 const original=await open(archive,'wx',0o600);
 try{await original.writeFile(before);await original.sync();}finally{await original.close();}
 const archiveDirectory=await open(dirname(archive),'r');try{await archiveDirectory.sync();}finally{await archiveDirectory.close();}
 const temp=path+'.cap100.'+randomUUID()+'.tmp';let renamed=false;
 try{
  const file=await open(temp,'wx',stat.mode&0o777);try{await file.writeFile(patched);await file.sync();}finally{await file.close();}
  if(sha256(await readFile(path))!==STOCK_SHA256)throw Error('SDK_SOURCE_CHANGED_DURING_PREPARATION');
  await rename(temp,path);renamed=true;
  const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
  if(sha256(await readFile(path))!==CAPPED_SHA256||sha256(await readFile(archive))!==STOCK_SHA256)throw Error('CAP100_POSTCHECK_FAILED');
  return{status:'MODIFIED_ENVIO_SCHEDULER_CAP100_APPLIED',stockSha256:STOCK_SHA256,runtimeSha256:CAPPED_SHA256,originalArchived:true,atomicReplacement:true,databaseAccess:false,servicesStarted:false};
 }finally{if(!renamed)await unlink(temp).catch(()=>{});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,path,archive]=process.argv.slice(2);
  if(process.platform!=='linux'||!['check','apply'].includes(mode)||path!==SDK_PATH||(mode==='apply'?(archive!==ARCHIVE_PATH||process.argv.length!==5):process.argv.length!==4))throw Error('EXPLICIT_SCOPED_LINUX_COMMAND_REQUIRED');
  if(mode==='check'){
   const digest=sha256(await readFile(path));if(![STOCK_SHA256,CAPPED_SHA256].includes(digest))throw Error('UNKNOWN_ENVIO_RUNTIME');
   console.log(JSON.stringify({status:digest===STOCK_SHA256?'STOCK_ENVIO_314_RUNTIME':'MODIFIED_ENVIO_SCHEDULER_CAP100',sha256:digest,databaseAccess:false}));
  }else{if(process.getuid()!==0)throw Error('ROOT_OPERATOR_REQUIRED');console.log(JSON.stringify(await applySchedulerCap(path,archive)));}
 }catch(error){console.error(JSON.stringify({status:'ENVIO_CAP100_REFUSED',reason:typeof error.code==='string'?error.code:error.message}));process.exitCode=1;}
}
