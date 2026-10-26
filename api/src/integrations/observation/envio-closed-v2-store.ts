/** Append-only packet/record/segment files; a fsynced atomic index is the only
 * mutable file. An orphan never becomes acknowledged evidence automatically. */
import {readFile,open,mkdir,rename,lstat,realpath,opendir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {rawSha} from './envio-linked-campaign.ts';
import {stable,requireThat} from './types.ts';
import {digest} from './types.ts';
import {V2_CAPS,validateV2ArchivedPacket,type V2CollectionPermit,type V2Manifest,type V2PacketRecord} from './envio-event-first-closed.ts';
const need=(v:unknown,c:string)=>requireThat(v,'ENVIO_CLOSED_V2_STORE_'+c);
const json=(v:unknown)=>Buffer.from(JSON.stringify(v)+'\n');
export async function syncV2Directory(path:string){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
export async function writeV2Exclusive(path:string,bytes:Buffer){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}if(process.platform!=='win32')await syncV2Directory(join(path,'..'));}
export async function readV2Private(path:string,max=8000000){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max&&await realpath(path)===path,'FILE');if(process.platform==='linux')need(s.uid===0&&(s.mode&0o777)===0o600,'OWNER_MODE');return readFile(path);}
export async function v2CampaignBudget(directory:string,add=0){let bytes=0,count=0;const visit=async(path:string,depth:number)=>{need(depth<=2,'DIRECTORY_DEPTH');for await(const e of await opendir(path)){need(++count<=42000&&!e.isSymbolicLink()&&/^[A-Za-z0-9._-]+$/.test(e.name)&&!e.name.includes('..'),'CAMPAIGN_ENTRY');const p=join(path,e.name),s=await lstat(p);need(await realpath(p)===p,'CAMPAIGN_PATH');if(e.isDirectory())await visit(p,depth+1);else{need(e.isFile(),'CAMPAIGN_FILE');bytes+=s.size;need(bytes+add<=V2_CAPS.maxBytes,'CAMPAIGN_DISK_CAP');}}};await visit(directory,0);return bytes;}
export class V2PacketStore{
 constructor(readonly directory:string){}
 path(name:string){need(/^[a-z0-9._-]+$/.test(name)&&!name.includes('..'),'NAME');return join(this.directory,name);}
 async check(){const s=await lstat(this.directory);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(this.directory)===this.directory,'DIRECTORY');if(process.platform==='linux')need(s.uid===0&&(s.mode&0o777)===0o700,'DIRECTORY_OWNER');}
 async budget(add=0){let bytes=0,count=0;for await(const entry of await opendir(this.directory)){need(++count<=40000&&entry.isFile()&&!entry.isSymbolicLink(),'ENTRY_BOUND');bytes+=(await lstat(this.path(entry.name))).size;need(bytes+add<=V2_CAPS.maxBytes,'DISK_CAP');}return bytes;}
 async initialize(m:V2Manifest,original:Buffer){await mkdir(this.directory,{mode:0o700});await this.check();await writeV2Exclusive(this.path('original-admission.bin'),original);await writeV2Exclusive(this.path('initial.private.json'),json(m));await writeV2Exclusive(this.path('manifest.private.json'),json(m));}
 async manifest(){await this.check();return JSON.parse((await readV2Private(this.path('manifest.private.json'),262144)).toString()) as V2Manifest;}
 async append(before:V2Manifest,next:V2Manifest,record:V2PacketRecord,packet:Buffer){
  await this.check();need(stable(await this.manifest())===stable(before)&&next.count===before.count+1&&record.index===before.count,'INDEX_CHANGED');
  const n=String(record.index).padStart(5,'0'),recordRaw=json(record);await this.budget(packet.length+recordRaw.length+524288);await writeV2Exclusive(this.path('packet-'+n+'.private.json'),packet);await writeV2Exclusive(this.path('record-'+n+'.private.json'),recordRaw);
  if(next.count%V2_CAPS.segmentPackets===0){const index=next.count/V2_CAPS.segmentPackets-1,digests=[];for(let i=index*256;i<next.count;i++)digests.push(rawSha(await readV2Private(this.path('record-'+String(i).padStart(5,'0')+'.private.json'),16384)));const raw=json({version:2,index,previousSegment:before.segments.at(-1)?.sha256??null,records:digests});await writeV2Exclusive(this.path('segment-'+String(index).padStart(3,'0')+'.private.json'),raw);next.segments=[...before.segments,{index,sha256:rawSha(raw),count:256}];}
  const tmp=this.path('manifest-'+randomUUID()+'.tmp');await writeV2Exclusive(tmp,json(next));need(stable(await this.manifest())===stable(before),'PREINSTALL_INDEX_CHANGED');await rename(tmp,this.path('manifest.private.json'));if(process.platform!=='win32')await syncV2Directory(this.directory);return next;
 }
 async verify(a:V2CollectionPermit){
  const m=await this.manifest();need(m?.version===2&&Number.isInteger(m.count)&&m.count>=0&&m.count<=V2_CAPS.maxPackets&&m.segments.length===Math.floor(m.count/256),'MANIFEST');await this.budget();let rebuilt=JSON.parse((await readV2Private(this.path('initial.private.json'),262144)).toString()) as V2Manifest;
  need(rebuilt.version===2&&rebuilt.count===0&&rebuilt.blocks===0&&rebuilt.bytes===0&&rebuilt.segments.length===0&&rebuilt.lastRevision===null&&rebuilt.last.height===a.baseline.checkpoint.height&&rebuilt.last.hash==='0x'+a.baseline.checkpoint.hash&&rebuilt.lastRecordDigest===digest(['envio-event-first-closed-v2',m.collectionSha256,a.baselineSha256,a.originalAdmission.sha256])&&rebuilt.collectionSha256===m.collectionSha256,'INITIAL');for(let n=0;n<m.count;n++){
   const name=String(n).padStart(5,'0'),record=JSON.parse((await readV2Private(this.path('record-'+name+'.private.json'),16384)).toString()) as V2PacketRecord,raw=await readV2Private(this.path('packet-'+name+'.private.json'));rebuilt=validateV2ArchivedPacket(a,rebuilt,record,raw);
   if((n+1)%256===0){const index=(n+1)/256-1,raw=await readV2Private(this.path('segment-'+String(index).padStart(3,'0')+'.private.json'),65536),segment=JSON.parse(raw.toString()),digests=[];for(let i=index*256;i<=n;i++)digests.push(rawSha(await readV2Private(this.path('record-'+String(i).padStart(5,'0')+'.private.json'),16384)));need(segment.version===2&&segment.index===index&&segment.previousSegment===(rebuilt.segments.at(-1)?.sha256??null)&&stable(segment.records)===stable(digests)&&m.segments[index]?.sha256===rawSha(raw),'SEGMENT');rebuilt.segments=[...rebuilt.segments,{index,sha256:rawSha(raw),count:256}];}
  }
  need(stable(rebuilt)===stable(m),'MANIFEST_CHAIN');
  // A torn append is never adopted or overwritten on restart.
  const next=String(m.count).padStart(5,'0');for(const name of['packet-'+next+'.private.json','record-'+next+'.private.json']){try{await lstat(this.path(name));throw Error('ENVIO_CLOSED_V2_STORE_ORPHAN_REVIEW_REQUIRED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  return m;
 }
}
