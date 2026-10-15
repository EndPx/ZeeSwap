import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const LIMIT=4_000_000;
const ERRNOS=['ENOENT','EACCES','EPERM','ENOTDIR','EISDIR','EIO','ETIMEDOUT','ELOOP','ENAMETOOLONG','EFBIG','EUNKNOWN'];
/** Constant guest program; the path is a separate argv element, never shell or
 * interpolated Python. Stdout is a private bounded binary envelope only. */
export const PRIVATE_JSON_GUEST_PROGRAM=`import base64,errno,json,sys
LIMIT=4000000
try:
 with open(sys.argv[1],'rb') as stream: data=stream.read(LIMIT+1)
 if len(data)>LIMIT:
  print(json.dumps({'version':1,'status':'ERROR','code':'EFBIG'}));sys.exit(1)
 print(json.dumps({'version':1,'status':'OK','data':base64.b64encode(data).decode('ascii')}))
except OSError as error:
 code=errno.errorcode.get(error.errno,'EUNKNOWN')
 if code not in ('ENOENT','EACCES','EPERM','ENOTDIR','EISDIR','EIO','ETIMEDOUT','ELOOP','ENAMETOOLONG','EFBIG'):code='EUNKNOWN'
 print(json.dumps({'version':1,'status':'ERROR','code':code}));sys.exit(1)
`;
export function privateJsonRoute(path:string,platform=process.platform){
 if(typeof path!=='string'||!path||path.includes('\0'))throw failure('PRIVATE_JSON_PATH_INVALID','EWSLROUTE');
 if(platform!=='win32')return {kind:'native' as const,path};
 const normalized=path.replaceAll('\\','/'),match=normalized.match(/^\/\/(?:wsl\.localhost|wsl\$)\/([^/]+)(\/.*)$/i);
 if(!match){if(/^\/\/(?:wsl\.localhost|wsl\$)(?:\/|$)/i.test(normalized))throw failure('PRIVATE_JSON_WSL_ROUTE_INVALID','EWSLROUTE');return {kind:'native' as const,path};}
 const distro=match[1].toLowerCase()==='ubuntu'?'Ubuntu':match[1].toLowerCase()==='ubuntu-24.04'?'Ubuntu-24.04':undefined;
 if(!distro||match[2].split('/').some(p=>p==='.'||p==='..'))throw failure('PRIVATE_JSON_WSL_DISTRIBUTION_REQUIRED','EWSLROUTE');
 return {kind:'wsl' as const,distro,path:match[2]};
}
function failure(message:string,code:string){return Object.assign(new Error(message),{code});}
export function decodePrivateJsonGuest(stdout:string,exitCode:number|null,signal:string|null){
 let value:any;try{value=JSON.parse(stdout);}catch{throw failure('PRIVATE_JSON_WSL_PROTOCOL_INVALID','EWSLPROTO');}
 if(signal||!value||value.version!==1||typeof value!=='object'||Array.isArray(value))throw failure('PRIVATE_JSON_WSL_PROTOCOL_INVALID','EWSLPROTO');
 if(exitCode===1&&value.status==='ERROR'&&Object.keys(value).sort().join(',')==='code,status,version'&&ERRNOS.includes(value.code))throw failure('PRIVATE_JSON_READ_FAILED',value.code);
 if(exitCode!==0||value.status!=='OK'||Object.keys(value).sort().join(',')!=='data,status,version'||typeof value.data!=='string'
  ||value.data.length>Math.ceil(LIMIT/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data))throw failure('PRIVATE_JSON_WSL_PROTOCOL_INVALID','EWSLPROTO');
 const bytes=Buffer.from(value.data,'base64');if(bytes.length>LIMIT||bytes.toString('base64')!==value.data)throw failure('PRIVATE_JSON_READ_TOO_LARGE','EFBIG');return bytes;
}
function guestRead(distro:string,path:string):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  const child=spawn('wsl.exe',['--distribution',distro,'--exec','python3','-c',PRIVATE_JSON_GUEST_PROGRAM,path],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderrSize=0,done=false;
  const stop=(error:Error)=>{if(!done){done=true;clearTimeout(timer);reject(error);}};
  const timer=setTimeout(()=>{child.kill();stop(failure('PRIVATE_JSON_WSL_TIMEOUT','ETIMEDOUT'));},20_000);
  // A missing wsl/python process is NOT a missing private journal.
  child.on('error',()=>stop(failure('PRIVATE_JSON_WSL_PROCESS_UNAVAILABLE','EWSLPROCESS')));
  child.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>5_400_000){child.kill();stop(failure('PRIVATE_JSON_WSL_OUTPUT_LIMIT','EFBIG'));}});
  child.stderr.on('data',b=>{stderrSize+=b.length;if(stderrSize>8192){child.kill();stop(failure('PRIVATE_JSON_WSL_PROCESS_FAILED','EWSLPROCESS'));}});
  child.on('close',(code,signal)=>{clearTimeout(timer);if(done)return;done=true;try{resolve(decodePrivateJsonGuest(stdout,code,signal));}catch(error){reject(error);}});
 });
}
export function parsePrivateJson(bytes:Buffer){
 if(bytes.length>LIMIT)throw failure('PRIVATE_JSON_READ_TOO_LARGE','EFBIG');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}
 catch{throw failure('PRIVATE_JSON_PARSE_FAILED','EJSONPARSE');}
}
export async function readPrivateJson(path:string){
 const route=privateJsonRoute(path);let bytes:Buffer;
 if(route.kind==='wsl')bytes=await guestRead(route.distro,route.path);
 else try{bytes=await readFile(route.path);}catch(error){const code=(error as any)?.code;throw failure('PRIVATE_JSON_READ_FAILED',typeof code==='string'&&ERRNOS.includes(code)?code:'EUNKNOWN');}
 return parsePrivateJson(bytes);
}
