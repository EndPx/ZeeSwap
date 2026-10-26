import {open,mkdir,lstat,unlink} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {PrivateData} from '../../private-data.ts';
import {readJournalBytes,writeJournalBytes} from '../journal.ts';

export type OperationBook={version:1;activeTransaction?:string;records:Record<string,Record<string,any>>};
/** Dedicated Base signer journal and nonce fence, independent from application DB.
 * The complete encrypted book is appended with fsync/readback BEFORE external
 * signing/submission. It retains interruption markers and never auto-breaks locks.
 */
export class BaseOperationJournal {
 constructor(readonly root:string,private keys:PrivateData){if(!isAbsolute(root))throw Error('BRIDGE_BASE_JOURNAL_PATH');}
 async run<T>(run:(book:OperationBook,save:()=>Promise<void>)=>Promise<T>):Promise<T>{
  await mkdir(this.root,{recursive:true,mode:0o700});const directory=await lstat(this.root);if(!directory.isDirectory()||directory.isSymbolicLink()||(process.platform!=='win32'&&(directory.mode&0o077)!==0))throw Error('BRIDGE_BASE_JOURNAL_DIRECTORY');
  const lockPath=join(this.root,'base.lock');let lock;try{lock=await open(lockPath,'wx',0o600);await lock.sync();}catch{throw Error('BRIDGE_BASE_JOURNAL_LOCKED');}
  let file;try{
   const path=join(this.root,'base.encrypted');try{const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)!==0))throw Error('BRIDGE_BASE_JOURNAL_FILE');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   file=await open(path,'a+',0o600);await file.sync();if(process.platform!=='win32'){const dir=await open(this.root,'r');try{await dir.sync();}finally{await dir.close();}}
   const size=(await file.stat()).size;if(size>16*1024*1024)throw Error('BRIDGE_BASE_JOURNAL_CAPACITY');const bytes=Buffer.alloc(size);await readJournalBytes(bytes,async(b,offset)=>(await file!.read(b,0,b.length,offset)).bytesRead);
   let book:OperationBook={version:1,records:{}};if(size){const text=bytes.toString('utf8');if(!text.endsWith('\n'))throw Error('BRIDGE_BASE_JOURNAL_TORN');for(const line of text.slice(0,-1).split('\n'))book=this.keys.open(Buffer.from(line,'base64'),'bridge:base-operations:v1') as OperationBook;}
   const save=async()=>{if(Object.keys(book.records).length>1000)throw Error('BRIDGE_BASE_JOURNAL_CAPACITY');const position=(await file!.stat()).size,data=Buffer.from(this.keys.seal(book,'bridge:base-operations:v1').toString('base64')+'\n');await writeJournalBytes(data,async b=>(await file!.write(b)).bytesWritten);await file!.sync();const check=Buffer.alloc(data.length);await readJournalBytes(check,async(b,offset)=>(await file!.read(b,0,b.length,position+offset)).bytesRead);if(!check.equals(data)||(await file!.stat()).size!==position+data.length)throw Error('BRIDGE_BASE_JOURNAL_READBACK');};
   return await run(book,save);
  }finally{await file?.close();await lock.close();await unlink(lockPath);}
 }
}
