/** Append-only packet/record/segment files; a fsynced atomic index is the only
 * mutable file. An orphan never becomes acknowledged evidence automatically. */
import {readFile,open,mkdir,rename,lstat,realpath,opendir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {rawSha} from './envio-linked-campaign.ts';
import {stable,requireThat} from './types.ts';
import {digest} from './types.ts';
import {EVENT_AUDIT_CAPS,validateArchivedEventAuditPacket,type EventAuditPermit,type EventAuditManifest,type EventAuditRecord} from './envio-closed-event-coverage.ts';
import type {OwnedCaseByteLedger} from './envio-owned-byte-ledger.ts';
const need=(v:unknown,c:string)=>requireThat(v,'CLOSED_EVENT_STORE_'+c);
const json=(v:unknown)=>Buffer.from(JSON.stringify(v)+'\n');
export {syncV2Directory as syncEventAuditDirectory,writeV2Exclusive as writeEventAuditExclusive,readV2Private as readEventAuditPrivate} from './envio-closed-v2-store.ts';
import {syncV2Directory,writeV2Exclusive,readV2Private} from './envio-closed-v2-store.ts';
export class EventAuditStore{
 constructor(readonly directory:string){}
 path(name:string){need(/^[a-z0-9._-]+$/.test(name)&&!name.includes('..'),'NAME');return join(this.directory,name);}
 async check(){const s=await lstat(this.directory);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(this.directory)===this.directory,'DIRECTORY');if(process.platform==='linux')need(s.uid===0&&(s.mode&0o777)===0o700,'DIRECTORY_OWNER');}
 async budget(add=0){let bytes=0,count=0;for await(const entry of await opendir(this.directory)){need(++count<=40000&&entry.isFile()&&!entry.isSymbolicLink(),'ENTRY_BOUND');bytes+=(await lstat(this.path(entry.name))).size;need(bytes+add<=EVENT_AUDIT_CAPS.maxBytes,'DISK_CAP');}return bytes;}
 async initialize(m:EventAuditManifest,original:Buffer){await mkdir(this.directory,{mode:0o700});await this.check();await writeV2Exclusive(this.path('original-admission.bin'),original);await writeV2Exclusive(this.path('initial.private.json'),json(m));await writeV2Exclusive(this.path('manifest.private.json'),json(m));}
 async manifest(){await this.check();return JSON.parse((await readV2Private(this.path('manifest.private.json'),262144)).toString()) as EventAuditManifest;}
 async append(before:EventAuditManifest,next:EventAuditManifest,record:EventAuditRecord,packet:Buffer,ledger?:OwnedCaseByteLedger,guard?:()=>void){
  guard?.();await this.check();need(stable(await this.manifest())===stable(before)&&next.count===before.count+1&&record.index===before.count,'INDEX_CHANGED');
  if(ledger){
   const id=String(record.index).padStart(5,'0'),recordRaw=json(record),writes=[{path:this.path('packet-'+id+'.private.json'),bytes:packet},{path:this.path('record-'+id+'.private.json'),bytes:recordRaw}];
   if(next.count%256===0){const index=next.count/256-1,digests=[];for(let n=index*256;n<next.count;n++)digests.push(n===record.index?rawSha(recordRaw):rawSha(await readV2Private(this.path('record-'+String(n).padStart(5,'0')+'.private.json'),16384)));const raw=json({version:1,index,previousSegment:before.segments.at(-1)?.sha256??null,records:digests});writes.push({path:this.path('segment-'+String(index).padStart(3,'0')+'.private.json'),bytes:raw});next.segments=[...before.segments,{index,sha256:rawSha(raw),count:256}];}
   const manifest=json(next),temp=ledger.manifestTemp();ledger.reserveBatch([...writes,{path:temp,bytes:manifest}]);for(const w of writes){guard?.();await ledger.writeExclusive(w.path,w.bytes);}
   await ledger.replaceManifest(this.path('manifest.private.json'),manifest,async()=>{guard?.();need(stable(await this.manifest())===stable(before),'PREINSTALL_INDEX_CHANGED');guard?.();},undefined,temp);guard?.();return next;
  }
  const write=writeV2Exclusive;
  const n=String(record.index).padStart(5,'0'),recordRaw=json(record);if(!ledger)await this.budget(packet.length+recordRaw.length+524288);guard?.();await write(this.path('packet-'+n+'.private.json'),packet);guard?.();await write(this.path('record-'+n+'.private.json'),recordRaw);
  if(next.count%EVENT_AUDIT_CAPS.segmentPackets===0){const index=next.count/EVENT_AUDIT_CAPS.segmentPackets-1,digests=[];for(let i=index*256;i<next.count;i++)digests.push(rawSha(await readV2Private(this.path('record-'+String(i).padStart(5,'0')+'.private.json'),16384)));const raw=json({version:1,index,previousSegment:before.segments.at(-1)?.sha256??null,records:digests});await write(this.path('segment-'+String(index).padStart(3,'0')+'.private.json'),raw);next.segments=[...before.segments,{index,sha256:rawSha(raw),count:256}];}
  const tmp=this.path('manifest-'+randomUUID()+'.tmp');guard?.();await writeV2Exclusive(tmp,json(next));guard?.();need(stable(await this.manifest())===stable(before),'PREINSTALL_INDEX_CHANGED');guard?.();await rename(tmp,this.path('manifest.private.json'));if(process.platform!=='win32')await syncV2Directory(this.directory);need(stable(await this.manifest())===stable(next),'INDEX_READBACK');guard?.();return next;
 }
 async verify(a:EventAuditPermit){
  const m=await this.manifest();need(m?.version===1&&m.proofKind==='CLOSED_EVENT_COVERAGE'&&Number.isInteger(m.count)&&m.count>=0&&m.count<=EVENT_AUDIT_CAPS.maxPackets&&m.segments.length===Math.floor(m.count/256),'MANIFEST');await this.budget();let rebuilt=JSON.parse((await readV2Private(this.path('initial.private.json'),262144)).toString()) as EventAuditManifest;
  need(rebuilt.version===1&&rebuilt.proofKind==='CLOSED_EVENT_COVERAGE'&&rebuilt.count===0&&rebuilt.intervals===0&&rebuilt.blocks===0&&rebuilt.bytes===0&&rebuilt.lastSdkHeight===0&&rebuilt.sourceEnd===null&&rebuilt.sourceEndCheckedAt===null&&rebuilt.eventHeaders.length===0&&stable(rebuilt.last)===stable(a.initialCheckpoint)&&rebuilt.segments.length===0&&rebuilt.lastRevision===null&&rebuilt.last.height===a.baseline.checkpoint.height&&rebuilt.last.hash==='0x'+a.baseline.checkpoint.hash&&rebuilt.lastRecordDigest===digest(['base-closed-event-coverage-v1',m.collectionSha256,a.baselineSha256,a.originalAdmission.sha256])&&rebuilt.collectionSha256===m.collectionSha256,'INITIAL');for(let n=0;n<m.count;n++){
   const name=String(n).padStart(5,'0'),record=JSON.parse((await readV2Private(this.path('record-'+name+'.private.json'),16384)).toString()) as EventAuditRecord,raw=await readV2Private(this.path('packet-'+name+'.private.json'));rebuilt=validateArchivedEventAuditPacket(a,rebuilt,record,raw);
   if((n+1)%256===0){const index=(n+1)/256-1,raw=await readV2Private(this.path('segment-'+String(index).padStart(3,'0')+'.private.json'),65536),segment=JSON.parse(raw.toString()),digests=[];for(let i=index*256;i<=n;i++)digests.push(rawSha(await readV2Private(this.path('record-'+String(i).padStart(5,'0')+'.private.json'),16384)));need(segment.version===1&&segment.index===index&&segment.previousSegment===(rebuilt.segments.at(-1)?.sha256??null)&&stable(segment.records)===stable(digests)&&m.segments[index]?.sha256===rawSha(raw),'SEGMENT');rebuilt.segments=[...rebuilt.segments,{index,sha256:rawSha(raw),count:256}];}
  }
  need(stable(rebuilt)===stable(m),'MANIFEST_CHAIN');const expected=new Set(['initial.private.json','manifest.private.json','original-admission.bin']);for(let n=0;n<m.count;n++)for(const prefix of ['packet-','record-'])expected.add(prefix+String(n).padStart(5,'0')+'.private.json');for(let n=0;n<m.segments.length;n++)expected.add('segment-'+String(n).padStart(3,'0')+'.private.json');for await(const entry of await opendir(this.directory)){need(expected.delete(entry.name)&&entry.isFile()&&!entry.isSymbolicLink(),'ORPHAN_REVIEW_REQUIRED');}need(expected.size===0,'MISSING_FILE');
  // A torn append is never adopted or overwritten on restart.
  const next=String(m.count).padStart(5,'0');for(const name of['packet-'+next+'.private.json','record-'+next+'.private.json']){try{await lstat(this.path(name));throw Error('CLOSED_EVENT_STORE_ORPHAN_REVIEW_REQUIRED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  need(rawSha(await readV2Private(this.path('original-admission.bin')))===a.originalAdmission.sha256,'ORIGINAL_ADMISSION_BYTES');return m;
 }
}
