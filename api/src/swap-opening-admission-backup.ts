import {lstat,readFile,realpath,open} from 'node:fs/promises';import {createHash} from 'node:crypto';import {join,resolve} from 'node:path';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error('OPENING_BACKUP_'+c);}
/** Idempotent file preparation only. An existing original XID intent always
 * requires reconciliation and can never authorize another publication attempt. */
export async function ensureOpeningAdmissionBackup(directory:string,active:Buffer,approvedSha256:string){
 need(active.length>0&&active.length<=16000000&&/^[a-f0-9]{64}$/.test(approvedSha256)&&sha(active)===approvedSha256,'ACTIVE_BYTES_CHANGED');
 const root=resolve(directory),d=await lstat(root);need(d.isDirectory()&&!d.isSymbolicLink()&&await realpath(root)===root,'DIRECTORY');if(process.platform!=='win32')need(d.uid===0&&(d.mode&0o777)===0o700,'DIRECTORY_OWNER');
 const intent=join(root,'publication-intent.private.json'),path=join(root,'original-admission.bin');
 async function noIntent(){try{await lstat(intent);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}throw Error('OPENING_BACKUP_INTENT_RECONCILE_ONLY');}
 async function exact(){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size===active.length&&s.size<=16000000&&await realpath(path)===path,'FILE');if(process.platform!=='win32')need(s.uid===0&&(s.mode&0o777)===0o600,'OWNER');const old=await readFile(path);need(old.equals(active)&&sha(old)===approvedSha256,'ORIGINAL_BYTES_CHANGED');}
 await noIntent();let fd;
 try{fd=await open(path,'wx',0o600);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await exact();await noIntent();return{created:false};}
 try{await fd.writeFile(active);await fd.sync();}finally{await fd.close();}const parent=await open(root,'r');try{await parent.sync();}finally{await parent.close();}await exact();await noIntent();return{created:true};
}
