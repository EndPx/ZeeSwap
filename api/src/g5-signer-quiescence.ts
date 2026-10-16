import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {privateJsonRoute} from './private-json-read.ts';
export const G5_EMPTY_SIGNER_LOCK_SHA256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
/** The retained incident inventories excluded the OS lock. Authenticate that
 * one live entry explicitly without mutating or weakening either baseline. */
export function g5SignerDirectoryWithLock(kind:'operator'|'payer',baseline:any[],names:string[],stat:{isFile():boolean;isSymbolicLink():boolean;size:number|bigint},bytes:Buffer){
 const expected=kind==='operator'?64:8;
 if(!Array.isArray(baseline)||baseline.length!==expected||new Set(baseline.map(f=>f.name)).size!==expected||baseline.some(f=>typeof f.name!=='string'||f.name==='signer.lock'||f.name.endsWith('.tmp')||f.name.includes('/')||f.name.includes('\\'))||new Set(names).size!==names.length||!stat.isFile()||stat.isSymbolicLink()||BigInt(stat.size)!==0n||bytes.length!==0||createHash('sha256').update(bytes).digest('hex')!==G5_EMPTY_SIGNER_LOCK_SHA256)throw Error('G5_SIGNER_EXACT_EMPTY_LOCK_REQUIRED');
 const result=[...baseline,{name:'signer.lock',sha256:G5_EMPTY_SIGNER_LOCK_SHA256,bytesBase64:'',nonce:null,hash:null,hasRaw:false}];
 if(JSON.stringify(result.map(f=>f.name).sort())!==JSON.stringify([...names].sort()))throw Error('G5_SIGNER_COMPLETE_DIRECTORY_CHANGED');return result;
}
/** A dangling journal symlink is present and unknown, never an absent intent. */
export async function requireG5PrivateArtifactAbsent(path:string,stat:(path:string)=>Promise<unknown>=lstat){
 try{await stat(path);}catch(error){if((error as any).code==='ENOENT')return;throw error;}throw Error('G5_PRIVATE_ARTIFACT_NOT_ABSENT');
}
export function g5SignerAuditConfig(client:{command:string;args:string[]}){
 if(!client||!Array.isArray(client.args)||client.args.filter(a=>a==='--config').length!==1||client.args.filter(a=>a.replaceAll('\\','/').endsWith('/signer.py')).length!==1)throw Error('G5_FORWARD_SIGNER_CLIENT_BINDING_REQUIRED');
 const path=client.args[client.args.indexOf('--config')+1];if(typeof path!=='string'||!path.startsWith('/')||path.includes('\0')||path.split('/').some(p=>p==='.'||p==='..'))throw Error('G5_FORWARD_SIGNER_CONFIG_REQUIRED');
 const command=client.command.replaceAll('\\','/').split('/').at(-1)?.toLowerCase();if(command==='wsl'||command==='wsl.exe'){const positions=client.args.flatMap((a,i)=>a==='--distribution'||a==='-d'?[i]:[]);if(positions.length!==1||!['Ubuntu','Ubuntu-24.04'].includes(client.args[positions[0]+1]))throw Error('G5_FORWARD_SIGNER_DISTRIBUTION_REQUIRED');return '//wsl.localhost/'+client.args[positions[0]+1]+path;}
 if(process.platform==='win32')throw Error('G5_FORWARD_SIGNER_EXPLICIT_WSL_REQUIRED');return path;
}
export function requireG5SignerQuiescence(value:any,configSha256:string,files:{name:string;sha256:string}[]){
 const age=Date.now()-Date.parse(value?.observedAt),digest=createHash('sha256').update([...files].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(f=>f.name+'\0'+f.sha256+'\n').join('')).digest('hex');
 if(!value||Object.keys(value).sort().join(',')!=='configSha256,fileCount,flockAcquired,journalDigest,lockReleased,observedAt,readOnly,scopeSha256,scopedProcessesAbsent,status,version,walletAddressMatches'||value.version!==1||value.status!=='G5_SIGNER_QUIESCENT_READ_ONLY'||value.configSha256!==configSha256||value.journalDigest!==digest||value.fileCount!==files.length||!/^[0-9a-f]{64}$/.test(value.scopeSha256)||!Number.isFinite(age)||age< -5000||age>30000||value.scopedProcessesAbsent!==true||value.flockAcquired!==true||value.lockReleased!==true||value.readOnly!==true||value.walletAddressMatches!==true)throw Error('G5_SIGNER_QUIESCENCE_REQUIRED');return value;
}
/** Fixed repository program and same-distribution config transport only. */
export async function captureG5SignerQuiescence(configPath:string){
 const route=privateJsonRoute(configPath),program=fileURLToPath(new URL('../../workers/base-signer/g5_signer_quiescence.py',import.meta.url));let command='python3',args=[program,'--config',configPath];
 if(route.kind==='wsl'){const normalized=program.replaceAll('\\','/');if(!/^[A-Za-z]:\//.test(normalized))throw Error('G5_SIGNER_AUDIT_GUEST_PROGRAM_PATH_REQUIRED');const guest='/mnt/'+normalized[0].toLowerCase()+normalized.slice(2);command='wsl.exe';args=['--distribution',route.distro,'--exec','python3',guest,'--config',route.path];}
 else if(process.platform==='win32')throw Error('G5_SIGNER_AUDIT_EXPLICIT_WSL_CONFIG_REQUIRED');
 return new Promise<any>((resolve,reject)=>{let output='',size=0,done=false;const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});const fail=()=>{if(!done){done=true;reject(Error('G5_SIGNER_QUIESCENCE_UNAVAILABLE'));}};const timer=setTimeout(()=>{child.kill();fail();},20000);child.on('error',fail);child.stdout.on('data',b=>{output+=b;if(output.length>4096){child.kill();fail();}});child.stderr.on('data',b=>{size+=b.length;if(size>4096){child.kill();fail();}});child.on('close',(code,signal)=>{clearTimeout(timer);if(done)return;if(code!==0||signal){fail();return;}try{const value=JSON.parse(output);done=true;resolve(value);}catch{fail();}});});
}
