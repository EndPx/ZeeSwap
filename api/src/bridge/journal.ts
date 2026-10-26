import {open,lstat,mkdir,unlink} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {PrivateData} from '../private-data.ts';
import {digest} from './model.ts';
import type {PreparedDelivery} from './worker.ts';

type RecordState={binding:string;signingStarted:true;prepared?:PreparedDelivery;broadcastAttempted?:true};
/** Node file I/O may make partial progress. Zero/invalid progress must never
 * permit a caller to proceed past an undurable signing/broadcast marker. */
export async function writeJournalBytes(bytes:Buffer,write:(remaining:Buffer)=>Promise<number>):Promise<void>{
 let offset=0;while(offset<bytes.length){const count=await write(bytes.subarray(offset));if(!Number.isSafeInteger(count)||count<=0||count>bytes.length-offset)throw Error('BRIDGE_JOURNAL_SHORT_WRITE');offset+=count;}
}
export async function readJournalBytes(bytes:Buffer,read:(remaining:Buffer,offset:number)=>Promise<number>):Promise<void>{
 let offset=0;while(offset<bytes.length){const count=await read(bytes.subarray(offset),offset);if(!Number.isSafeInteger(count)||count<=0||count>bytes.length-offset)throw Error('BRIDGE_JOURNAL_SHORT_READ');offset+=count;}
}
/** Independent encrypted append journal. Never put root in Git or a public volume.
 * Linux owner-only permissions and file+directory fsync are enforced. Windows
 * file fsync is supported for tests; operator ACL/directory durability must be
 * qualified separately before live use. A torn record or stale lock fails closed.
 */
export class BridgeJournal {
 constructor(private root:string,private keys:PrivateData){if(!isAbsolute(root))throw Error('BRIDGE_JOURNAL_ABSOLUTE_PATH_REQUIRED');}
 private async locked<T>(id:string,run:(load:()=>Promise<RecordState|undefined>,append:(state:RecordState)=>Promise<void>)=>Promise<T>):Promise<T>{
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('BRIDGE_JOURNAL_ID');
  await mkdir(this.root,{recursive:true,mode:0o700});const directory=await lstat(this.root);if(directory.isSymbolicLink()||!directory.isDirectory()||(process.platform!=='win32'&&(directory.mode&0o077)!==0))throw Error('BRIDGE_JOURNAL_PRIVATE_DIRECTORY_REQUIRED');
  const path=join(this.root,id+'.bridge'),lockPath=path+'.lock';let lock;
  try{lock=await open(lockPath,'wx',0o600);await lock.sync();}catch{throw Error('BRIDGE_JOURNAL_LOCKED');}
  let file;
  try{
   try{const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('BRIDGE_JOURNAL_PRIVATE_FILE_REQUIRED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   file=await open(path,'a+',0o600);await file.sync();
   if(process.platform!=='win32'){const dir=await open(this.root,'r');try{await dir.sync();}finally{await dir.close();}}
   const load=async()=>{const stat=await file!.stat();if(stat.size>16*1024*1024)throw Error('BRIDGE_JOURNAL_CAPACITY');const bytes=Buffer.alloc(stat.size);await readJournalBytes(bytes,async(remaining,offset)=>(await file!.read(remaining,0,remaining.length,offset)).bytesRead);if(!bytes.length)return undefined;
    const text=bytes.toString('utf8');if(!text.endsWith('\n'))throw Error('BRIDGE_JOURNAL_TORN_RECORD');let latest:RecordState|undefined;
    for(const line of text.slice(0,-1).split('\n')){if(!/^[A-Za-z0-9+/]+=*$/.test(line))throw Error('BRIDGE_JOURNAL_INVALID_RECORD');latest=this.keys.open(Buffer.from(line,'base64'),`bridge:journal:${id}:v1`) as RecordState;}
    return latest;
   };
   const append=async(state:RecordState)=>{const before=(await file!.stat()).size,bytes=Buffer.from(this.keys.seal(state,`bridge:journal:${id}:v1`).toString('base64')+'\n');
    await writeJournalBytes(bytes,async remaining=>(await file!.write(remaining)).bytesWritten);await file!.sync();
    if((await file!.stat()).size!==before+bytes.length)throw Error('BRIDGE_JOURNAL_WRITE_READBACK');
    const check=Buffer.alloc(bytes.length);await readJournalBytes(check,async(remaining,offset)=>(await file!.read(remaining,0,remaining.length,before+offset)).bytesRead);if(!bytes.equals(check))throw Error('BRIDGE_JOURNAL_WRITE_READBACK');
   };
   return await run(load,append);
  }finally{await file?.close();await lock.close();await unlink(lockPath);}
 }
 async prepareOnce(id:string,binding:unknown,sign:()=>Promise<PreparedDelivery>):Promise<PreparedDelivery>{return this.locked(id,async(load,append)=>{
  const expected=digest(binding),old=await load();if(old){if(old.binding!==expected)throw Error('BRIDGE_JOURNAL_BINDING');if(!old.prepared)throw Error('BRIDGE_SIGNING_RECONCILIATION_REQUIRED');return old.prepared;}
  await append({binding:expected,signingStarted:true});const prepared=await sign();if(prepared.intentId!==id)throw Error('BRIDGE_JOURNAL_SIGNED_BINDING');await append({binding:expected,signingStarted:true,prepared});return prepared;
 });}
 async broadcastOnce(id:string,prepared:PreparedDelivery,broadcast:(original:PreparedDelivery)=>Promise<void>):Promise<void>{return this.locked(id,async(load,append)=>{
  const old=await load();if(!old?.prepared||digest(old.prepared)!==digest(prepared))throw Error('BRIDGE_JOURNAL_ORIGINAL_REQUIRED');if(old.broadcastAttempted)throw Error('BRIDGE_JOURNAL_BROADCAST_RECONCILIATION_REQUIRED');
  await append({...old,broadcastAttempted:true});await broadcast(old.prepared!);
 });}
}
