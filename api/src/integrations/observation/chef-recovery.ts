import {mkdir,open,readFile,rename,rmdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {validateSnapshot,type Snapshot} from '../../observer.ts';
import type {CanonicalReader} from './chef.ts';
import {digest,fresh,height,parseHeader,requireThat,stable,validateRange,type Header,type Policy,type ReplaceRange} from './types.ts';

export type ChefRecoveryIdentity={project:string;generation:string;policy:Policy};
type Proof={target:Header;batch:ReplaceRange;snapshot:Snapshot;previousDigest:string;proofDigest:string};
export type ChefRecoveryJournal={version:1;identity:ChefRecoveryIdentity;target:Header;proofs:Proof[]};
const status='COVERAGE_COMPLETE_AWAITING_LIVE_WINDOW' as const;

function sameIdentity(a:ChefRecoveryIdentity,b:ChefRecoveryIdentity){
 requireThat(stable(a)===stable(b),'CHEF_RECOVERY_IDENTITY_CHANGED');
 requireThat(a.project.length>0&&a.generation.length>0&&typeof a.policy.accountFingerprint==='string'&&a.policy.accountFingerprint.length>0,'CHEF_RECOVERY_ACCOUNT_REQUIRED');
 requireThat(a.policy.adapter==='zeer-chef'&&a.policy.network==='zcash-testnet','CHEF_RECOVERY_NETWORK');
}
function through(j:ChefRecoveryJournal){return j.proofs.at(-1)?.batch.coverage.through.height;}
export function nextChefRecoveryRange(j:ChefRecoveryJournal):{fromHeight:number;throughHeight:number}|null {
 const last=through(j);if(last===j.target.height)return null;
 const fromHeight=last===undefined?j.identity.policy.birthday:Math.max(j.identity.policy.birthday,last-8);
 return {fromHeight,throughHeight:Math.min(j.target.height,fromHeight+Math.min(1000,j.identity.policy.maxBlocks??1000)-1)};
}
function proofDigest(p:Omit<Proof,'proofDigest'>){return digest(p);}

/** Historical proof timestamps are validated at their original read instant.
 * This does not renew freshness or publish a partial SQL checkpoint. */
export function validateChefRecoveryJournal(j:ChefRecoveryJournal,expected:ChefRecoveryIdentity,canonicalTarget:Header):ChefRecoveryJournal {
 requireThat(j?.version===1&&Array.isArray(j.proofs)&&j.proofs.length<=100,'CHEF_RECOVERY_INVALID_JOURNAL');
 sameIdentity(j.identity,expected);parseHeader(j.target,'zcash-testnet');
 requireThat(stable(j.target)===stable(canonicalTarget),'CHEF_RECOVERY_TARGET_REORG');
 requireThat(j.target.height>=expected.policy.birthday+9,'CHEF_RECOVERY_CONFIRMATION_WINDOW');
 const checked:ChefRecoveryJournal={...j,proofs:[]};
 let previousDigest=digest({identity:j.identity});
 let tail:Header[]=[];
 for(const proof of j.proofs){
  requireThat(proof.previousDigest===previousDigest&&proof.proofDigest===proofDigest({target:proof.target,batch:proof.batch,snapshot:proof.snapshot,previousDigest}),'CHEF_RECOVERY_PROOF_CHANGED');
  const batch=validateRange(proof.batch,expected.policy,Date.parse(proof.batch.coverage.readCompletedAt));
  requireThat(batch.coverage.generation===expected.generation,'CHEF_RECOVERY_GENERATION_CHANGED');
  parseHeader(proof.target,'zcash-testnet');
  const prior=checked.proofs.at(-1);
  requireThat(proof.target.height<=j.target.height&&(!prior||proof.target.height>=prior.target.height),'CHEF_RECOVERY_TARGET_REGRESSION');
  if(prior&&stable(prior.target)!==stable(proof.target))requireThat(prior.batch.coverage.through.height===prior.target.height&&proof.target.height>prior.target.height,'CHEF_RECOVERY_UNFINISHED_TARGET');
  checked.target=proof.target;const range=nextChefRecoveryRange(checked);
  requireThat(range&&batch.coverage.fromHeight===range.fromHeight&&batch.coverage.through.height===range.throughHeight,'CHEF_RECOVERY_GAP_OR_OVERLAP');
  requireThat(proof.snapshot.observedAt===batch.coverage.readCompletedAt&&proof.snapshot.scannedHeight===batch.coverage.through.height&&proof.snapshot.tipHash===batch.coverage.through.hash,'CHEF_RECOVERY_SNAPSHOT_MISMATCH');
  // Snapshot validation supplies shape/output binding only here. Its original
  // timestamp remains stored unchanged; final canonical verification is separate.
  validateSnapshot({...proof.snapshot,observedAt:new Date().toISOString()});
  requireThat(stable(proof.snapshot.blocks)===stable(batch.headers.map(({height,hash,time})=>({height,hash,time}))),'CHEF_RECOVERY_HEADER_MISMATCH');
  for(const old of tail){const current=batch.headers.find(h=>h.height===old.height);requireThat(current&&stable(current)===stable(old),'CHEF_RECOVERY_OVERLAP_REORG');}
  tail=batch.headers.slice(-9);checked.proofs.push(proof);previousDigest=proof.proofDigest;
 }
 if(through(j)===j.target.height)requireThat(stable(j.proofs.at(-1)!.batch.coverage.through)===stable(j.target),'CHEF_RECOVERY_TARGET_REORG');
 return j;
}

export function appendChefRecoveryProof(j:ChefRecoveryJournal,identity:ChefRecoveryIdentity,canonicalTarget:Header,batch:ReplaceRange,snapshot:Snapshot,now=Date.now()):ChefRecoveryJournal {
 validateChefRecoveryJournal(j,identity,canonicalTarget);
 validateRange(batch,identity.policy,now);validateSnapshot(snapshot);
 const previousDigest=j.proofs.at(-1)?.proofDigest??digest({identity:j.identity});
 const body={target:j.target,batch,snapshot,previousDigest};
 const next={...j,proofs:[...j.proofs,{...body,proofDigest:proofDigest(body)}]};
 return validateChefRecoveryJournal(next,identity,canonicalTarget);
}

/** A reviewed fresh status may extend a completed target. The old target must
 * still independently match before any additional consecutive coverage is read. */
export function extendChefRecoveryTarget(j:ChefRecoveryJournal,identity:ChefRecoveryIdentity,oldCanonicalTarget:Header,newCanonicalTarget:Header):ChefRecoveryJournal {
 validateChefRecoveryJournal(j,identity,oldCanonicalTarget);
 requireThat(through(j)===j.target.height&&newCanonicalTarget.height>=j.target.height,'CHEF_RECOVERY_EXTENSION_REQUIRES_COMPLETE_PREFIX');
 parseHeader(newCanonicalTarget,'zcash-testnet');
 if(newCanonicalTarget.height===j.target.height)requireThat(stable(newCanonicalTarget)===stable(j.target),'CHEF_RECOVERY_TARGET_REORG');
 return validateChefRecoveryJournal({...j,target:newCanonicalTarget},identity,newCanonicalTarget);
}

/** Private journal IO is crash durable and single writer. A leftover lock is a
 * manual reconciliation stop; it is never timed out or removed automatically. */
export async function withChefRecoveryJournal<T>(directory:string,run:(io:{read():Promise<ChefRecoveryJournal|null>;write(j:ChefRecoveryJournal):Promise<void>})=>Promise<T>):Promise<T>{
 requireThat(resolve(directory)===directory,'CHEF_RECOVERY_ABSOLUTE_DIRECTORY');
 await mkdir(directory,{recursive:true,mode:0o700});
 const info=await lstat(directory);requireThat(info.isDirectory()&&!info.isSymbolicLink()&&(process.platform!=='linux'||((info.mode&0o077)===0&&await realpath(directory)===directory)),'CHEF_RECOVERY_PRIVATE_DIRECTORY');
 const lock=join(directory,'writer.lock');await mkdir(lock,{mode:0o700});
 try{return await run({
  async read(){try{const p=join(directory,'journal.private.json'),s=await lstat(p);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.size<=30_000_000&&(process.platform!=='linux'||(s.mode&0o077)===0),'CHEF_RECOVERY_JOURNAL_FILE');return JSON.parse(await readFile(p,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}},
  async write(j){const path=join(directory,'journal.private.json'),temp=join(directory,'journal.pending.private.json');const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(j));await file.sync();}finally{await file.close();}await rename(temp,path);if(process.platform==='linux'){const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}}}
 });}finally{await rmdir(lock);}
}

export function chefRecoveryCoverageStatus(j:ChefRecoveryJournal){
 return {status:through(j)===j.target.height?status:'RECOVERING_PRIVATE_COVERAGE',chunks:j.proofs.length,
  coveredThrough:through(j)??null,targetHeight:j.target.height,admissionReady:false as const};
}

/** No SQL write occurs here. Only complete private coverage can become a fresh
 * publication candidate; the caller must independently keep controls paused. */
export async function chefRecoverySnapshot(j:ChefRecoveryJournal,identity:ChefRecoveryIdentity,canonical:CanonicalReader,
 checks:number[],readCurrent:()=>Promise<{generation:string;checkpoint:{height:number;hash:string}}>,signal:AbortSignal):Promise<Snapshot>{
 requireThat(checks.length<=502,'RECONCILIATION_WINDOW_LIMIT');
 const current=await readCurrent();
 requireThat(current.generation===identity.generation,'CHEF_RECOVERY_GENERATION_CHANGED');
 requireThat(current.checkpoint.height===j.target.height&&current.checkpoint.hash===j.target.hash,'CHEF_RECOVERY_CURRENT_TAIL_REQUIRED');
 const target=parseHeader(await canonical.header(j.target.height,signal),'zcash-testnet');
 validateChefRecoveryJournal(j,identity,target);
 requireThat(through(j)===j.target.height,'CHEF_RECOVERY_INCOMPLETE');
 const sample=await canonical.sample(signal);fresh(sample.checkedAt,Date.now());
 requireThat(sample.sourceId===identity.policy.canonicalSourceId&&sample.head.height>=j.target.height,'CHEF_RECOVERY_CANONICAL_SOURCE');
 parseHeader(sample.head,'zcash-testnet');
 requireThat(sample.head.height-j.target.height<=6,'CHEF_RECOVERY_SOURCE_LAG');
 const headers=new Map<number,Header>(),outputs=new Map<string,Snapshot['outputs'][number]>(),required=new Set([j.target.height,j.target.height-9,...checks]);
 for(const p of j.proofs){
  for(const header of p.batch.headers){const old=headers.get(header.height);requireThat(!old||stable(old)===stable(header),'CHEF_RECOVERY_OVERLAP_REORG');headers.set(header.height,header);}
  for(const note of p.batch.observations)required.add(note.block.height);
  for(const output of p.snapshot.outputs){const id=stable([output.txid,output.pool,output.index]),old=outputs.get(id);requireThat(!old||stable(old)===stable(output),'CHEF_RECOVERY_OUTPUT_CHANGED');outputs.set(id,output);required.add(output.height);}
 }
 requireThat(required.size<=1000&&outputs.size<=1000,'CHEF_RECOVERY_PUBLICATION_CAPACITY');
 const blocks:Snapshot['blocks']=[];
 for(const h of [...required].sort((a,b)=>a-b)){
  height(h);requireThat(h<=j.target.height,'CHEF_RANGE_BEHIND_PERSISTED_ANCHOR');
  const header=parseHeader(await canonical.header(h,signal),'zcash-testnet');requireThat(header.height===h,'CANONICAL_ANCHOR_HEIGHT_MISMATCH');
  const old=headers.get(h);requireThat(!old||stable(old)===stable(header),'CHEF_RECOVERY_CANONICAL_REORG');
  blocks.push({height:h,hash:header.hash,time:header.time});
 }
 requireThat(stable(await canonical.header(sample.head.height,signal))===stable(sample.head),'CANONICAL_HEAD_CHANGED');
 const after=await readCurrent();requireThat(stable(after)===stable(current),'CHEF_RECOVERY_CURRENT_TAIL_CHANGED');
 return validateSnapshot({schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:sample.checkedAt,
  scannedHeight:j.target.height,tipHash:j.target.hash,blocks,outputs:[...outputs.values()]});
}
