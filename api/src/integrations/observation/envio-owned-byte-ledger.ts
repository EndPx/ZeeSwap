/** Opt-in collection budget only. Full actual startup inventory, then exact
 * single-writer byte/entry reservations. A failed IO poisons this instance. */
import {lstat,realpath,opendir,readFile,rename} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {createHash,randomUUID} from 'node:crypto';import {join,relative,isAbsolute,sep} from 'node:path';
import {requireThat,stable} from './types.ts';import {writeV2Exclusive,syncV2Directory} from './envio-closed-v2-store.ts';import type {V2Manifest} from './envio-event-first-closed.ts';
type Limits={bytes:number;entries:number;storeFiles:number};
type Entry={kind:'file'|'directory';bytes:number;sha256:string|null};
const MAX_BYTES=536870912,MAX_ENTRIES=42000,MAX_STORE_FILES=40000,sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{requireThat(v,'ENVIO_BYTE_LEDGER_'+c);}
function privateMode(s:{uid:number;mode:number},directory=false){if(process.platform==='linux')need(s.uid===0&&(s.mode&0o777)===(directory?0o700:0o600),'OWNER_MODE');}
export class OwnedCaseByteLedger{
 private entries=new Map<string,Entry>();private reserved=new Set<string>();private bytes=0;private storeFiles=0;private poisoned=false;
 private constructor(readonly directory:string,readonly storeDirectory:string,private limits:Limits){}
 private alive(){need(!this.poisoned,'POISONED');}
 private inside(path:string){const r=relative(this.directory,path);need(r!==''&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r),'PATH');}
 private async inventory(){
  const map=new Map<string,Entry>();let bytes=0,storeFiles=0;
  const walk=async(path:string,depth:number)=>{need(depth<=2,'DEPTH');const root=await lstat(path);need(root.isDirectory()&&!root.isSymbolicLink()&&await realpath(path)===path,'DIRECTORY');privateMode(root,true);
   for await(const e of await opendir(path)){const p=join(path,e.name);need(!e.isSymbolicLink()&&/^[a-z0-9._-]+$/.test(e.name)&&!e.name.includes('..'),'ENTRY_NAME');const s=await lstat(p);need(await realpath(p)===p,'SYMLINK');if(s.isDirectory()){privateMode(s,true);map.set(p,{kind:'directory',bytes:0,sha256:null});await walk(p,depth+1);}else{need(s.isFile(),'SPECIAL_FILE');privateMode(s);bytes+=s.size;if(path===this.storeDirectory)storeFiles++;need(bytes<=this.limits.bytes,'BYTE_CAP');const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);map.set(p,{kind:'file',bytes:s.size,sha256:h.digest('hex')});}need(map.size<=this.limits.entries&&storeFiles<=this.limits.storeFiles,'ENTRY_CAP');}
  };await walk(this.directory,0);return{map,bytes,storeFiles};
 }
 private checkNames(map:Map<string,Entry>,m:Pick<V2Manifest,'count'>){
  const store=new Set(['initial.private.json','manifest.private.json','original-admission.bin']);for(let n=0;n<m.count;n++){const id=String(n).padStart(5,'0');store.add('packet-'+id+'.private.json');store.add('record-'+id+'.private.json');}for(let n=0;n<Math.floor(m.count/256);n++)store.add('segment-'+String(n).padStart(3,'0')+'.private.json');
  for(const[path,e]of map){const relative=path.slice(this.directory.length+1);if(e.kind==='directory'){need(relative==='packets'||relative==='writer.lock','UNKNOWN_DIRECTORY');continue;}if(path.startsWith(this.storeDirectory+sep))need(store.has(path.slice(this.storeDirectory.length+1)),'UNKNOWN_STORE_FILE');else need(/^(?:original-admission\.bin|collection-permit\.private\.json|resume-(?:[a-f0-9]{64}|[1-9][0-9]{12})\.private\.json|pilot-[0-9]+-[0-9]+\.private\.json)$/.test(relative),'UNKNOWN_CASE_FILE');}
  for(const name of store)need(map.has(join(this.storeDirectory,name)),'MISSING_STORE_FILE');
 }
 static async open(directory:string,storeDirectory:string,m:Pick<V2Manifest,'count'>,limits:Limits={bytes:MAX_BYTES,entries:MAX_ENTRIES,storeFiles:MAX_STORE_FILES}){need(limits.bytes>0&&limits.bytes<=MAX_BYTES&&limits.entries>0&&limits.entries<=MAX_ENTRIES&&limits.storeFiles>0&&limits.storeFiles<=MAX_STORE_FILES,'TEST_LIMITS_MUST_NOT_WIDEN');need(storeDirectory===join(directory,'packets'),'STORE_SCOPE');const ledger=new OwnedCaseByteLedger(directory,storeDirectory,Object.freeze({...limits})),actual=await ledger.inventory();ledger.checkNames(actual.map,m);ledger.entries=actual.map;ledger.bytes=actual.bytes;ledger.storeFiles=actual.storeFiles;return ledger;}
 snapshot(){return{bytes:this.bytes,entries:this.entries.size,storeFiles:this.storeFiles,poisoned:this.poisoned};}
 reserveBatch(files:{path:string;bytes:Buffer}[]){this.alive();need(new Set(files.map(f=>f.path)).size===files.length,'BATCH_DUPLICATE');let bytes=0,store=0;for(const f of files){this.inside(f.path);need(!this.entries.has(f.path),'EXCLUSIVE_PATH');bytes+=f.bytes.length;if(f.path.startsWith(this.storeDirectory+sep))store++;}need(this.bytes+bytes<=this.limits.bytes,'BYTE_CAP');need(this.entries.size+files.length<=this.limits.entries&&this.storeFiles+store<=this.limits.storeFiles,'ENTRY_CAP');for(const f of files){this.entries.set(f.path,{kind:'file',bytes:f.bytes.length,sha256:sha(f.bytes)});this.reserved.add(f.path);}this.bytes+=bytes;this.storeFiles+=store;}
 manifestTemp(){this.alive();return join(this.storeDirectory,'manifest-'+randomUUID()+'.tmp');}
 async writeExclusive(path:string,b:Buffer,writer=writeV2Exclusive){
  if(!this.reserved.has(path))this.reserveBatch([{path,bytes:b}]);this.alive();const expected=this.entries.get(path);need(expected?.bytes===b.length&&expected.sha256===sha(b),'RESERVATION_BYTES');try{await writer(path,b);const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size===b.length&&await realpath(path)===path,'WRITE_STAT');privateMode(s);need((await readFile(path)).equals(b),'WRITE_READBACK');this.reserved.delete(path);}catch(error){this.poisoned=true;throw error;}
 }
 async replaceManifest(path:string,b:Buffer,beforeRename:()=>Promise<void>,io={rename,sync:process.platform==='win32'?async()=>{}:syncV2Directory},preparedTemp?:string){
  this.alive();need(path===join(this.storeDirectory,'manifest.private.json'),'MANIFEST_PATH');const old=this.entries.get(path);need(old?.kind==='file','OLD_MANIFEST');const temp=preparedTemp??this.manifestTemp();need(temp.startsWith(this.storeDirectory+sep)&&/manifest-[a-f0-9-]+\.tmp$/.test(temp),'MANIFEST_TEMP');
  await this.writeExclusive(temp,b);try{await beforeRename();await io.rename(temp,path);await io.sync(this.storeDirectory);need((await readFile(path)).equals(b),'RENAME_READBACK');const s=await lstat(path);privateMode(s);need(s.size===b.length&&s.isFile()&&!s.isSymbolicLink(),'RENAME_STAT');
   // Both old+temp stay charged through every ambiguous boundary above.
   this.entries.delete(temp);this.entries.set(path,{kind:'file',bytes:b.length,sha256:sha(b)});this.bytes-=old.bytes;this.storeFiles--;
  }catch(error){this.poisoned=true;throw error;}
 }
 async audit(m:Pick<V2Manifest,'count'>){this.alive();try{need(this.reserved.size===0,'UNFINISHED_RESERVATION');const actual=await this.inventory();this.checkNames(actual.map,m);need(actual.bytes===this.bytes&&actual.storeFiles===this.storeFiles&&stable([...actual.map].sort(([a],[b])=>a<b?-1:1))===stable([...this.entries].sort(([a],[b])=>a<b?-1:1)),'INVENTORY_CHANGED');return this.snapshot();}catch(error){this.poisoned=true;throw error;}}
}
