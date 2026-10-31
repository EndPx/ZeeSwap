/** Read-only ExecCondition adapter around the original immutable closed inspector. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT='/opt/zeeswap-testnet',UNIT='zeeswap-testnet-policy-worker.service',MARKER=ROOT+'/state/service-policy/preuser-source-recovery-active.private.json',run=promisify(execFile);
function need(v:unknown,code:string):asserts v{if(!v)throw Error('CLOSED_START_'+code);}
/** The activating unit is allowed only when this exact checker is its ControlPID. */
export function requireClosedStartQualification(info:any,unit:Record<string,string>,pid:number,markerPresent:boolean){
 need(info?.status==='CLOSED_SERVICE_QUALIFIED'&&info.paused===false&&(info.warm===true||info.open===true)&&info.sourceFresh===true&&info.financialWorkerLease===false,'QUALIFICATION');
 need(!markerPresent,'SOURCE_RECOVERY_ACTIVE');
 need(Number.isSafeInteger(pid)&&pid>1&&unit.MainPID==='0','WORKER_PROCESS');
 const own=unit.ControlPID===String(pid),idle=unit.ActiveState==='inactive'||unit.ActiveState==='failed';
 need(idle&&(unit.ControlPID==='0'||own)||unit.ActiveState==='activating'&&own,'WORKER_PROCESS');
}
async function codePin(path:string,sha256:string){
 need(/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{0,79}\/app\/api\/scripts\/[a-z0-9-]+\.ts$/.test(path)&&resolve(path)===path&&/^[a-f0-9]{64}$/.test(sha256),'CODE_PATH');
 for(let d=dirname(path);d.startsWith(ROOT);d=dirname(d)){const s=await lstat(d);need(s.uid===0&&s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0&&await realpath(d)===d,'CODE_DIRECTORY');}
 const s=await lstat(path);need(s.uid===0&&s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o022)===0&&s.size<=16000000&&await realpath(path)===path,'CODE_FILE');
 need(createHash('sha256').update(await readFile(path)).digest('hex')===sha256,'CODE_CHANGED');
}
async function markerPresent(){try{await lstat(MARKER);return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}}
async function unitState(){const r=await run('/bin/systemctl',['show',UNIT,'--property=ActiveState','--property=MainPID','--property=ControlPID'],{timeout:10000,maxBuffer:4096});return Object.fromEntries(r.stdout.trim().split('\n').map(line=>line.split('=',2)));}
export async function checkClosedStart(authorityPath:string,authoritySha:string,inspectorPath:string,inspectorSha:string,selfSha:string){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.env.NODE_OPTIONS===undefined,'ROOT');
 const own=fileURLToPath(import.meta.url);need(own.endsWith('/api/scripts/check-testnet-closed-start.ts')&&inspectorPath.endsWith('/api/scripts/recover-testnet-closed-service.ts'),'ENTRY');
 await codePin(own,selfSha);await codePin(inspectorPath,inspectorSha);
 need(!await markerPresent(),'SOURCE_RECOVERY_ACTIVE');
 const before=await unitState();
 // Import the exact existing release: its authority verifies its own immutable
 // code manifest, current financial configuration and complete SQL/journal proofs.
 const module=await import(pathToFileURL(inspectorPath).href);
 need(typeof module.closedServiceAction==='function','INSPECTOR');
 const info=await module.closedServiceAction({path:authorityPath,sha256:authoritySha},'inspect');
 requireClosedStartQualification(info,before,process.pid,await markerPresent());
 requireClosedStartQualification(info,await unitState(),process.pid,await markerPresent());
 await codePin(own,selfSha);await codePin(inspectorPath,inspectorSha);
 return{status:'POLICY_CLOSED_IDLE_RESTART_ALLOWED',financialAction:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);try{need(args.length===5,'ARGUMENTS');console.log(JSON.stringify(await checkClosedStart(args[0]!,args[1]!,args[2]!,args[3]!,args[4]!)));}catch(e){const code=/^CLOSED_START_[A-Z0-9_]+$/.test((e as Error).message)?(e as Error).message:'CLOSED_START_PRIVATE_FAILURE';console.error(JSON.stringify({status:'POLICY_CLOSED_IDLE_RESTART_REFUSED',code,financialAction:false}));process.exitCode=1;}}
