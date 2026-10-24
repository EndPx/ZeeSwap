/** Prefunding retained-history proofs. Never signs, drops hints, or advances a partial checkpoint. */
import type {EnvioAdmissionState} from './envio-live.ts';
import {lstat} from 'node:fs/promises';
import type {CanonicalReader} from './chef.ts';
import {validateSelectedExport,type VerifiedEnvioSelection} from './envio-selected-export.ts';
import {digest,fresh,height,hex,object,parseHeader,utc,validatePolicy,requireThat,stable,type Header,type Policy} from './types.ts';
/** Explicit recovery-only identity. Never relabel PublicNode as the normal
 * Tenderly source or modify the persisted producer/consumer profile. */
export function envioRecoveryTransport(original:Policy,pacing:string|undefined=undefined){
 validatePolicy(original);requireThat(original.adapter==='envio-hyperindex'&&original.network==='eip155:84532'&&original.canonicalSourceId==='base-sepolia-tenderly-rpc','ENVIO_RECOVERY_ORIGINAL_SOURCE_REQUIRED');
 requireThat(pacing===undefined||pacing==='24'||pacing==='80','ENVIO_RECOVERY_PACING_PRESET');
 const sourceId='base-sepolia-recovery-publicnode-v1';
 return{url:'https://base-sepolia-rpc.publicnode.com',sourceId,network:'eip155:84532' as const,headerBatchSize:10,maxMethodsPerSecond:Number(pacing??'24'),policy:{...structuredClone(original),canonicalSourceId:sourceId}};
}
export type RecoverySql={height:number;hash:string;finalizedHeight:number;finalizedTime:string;observedAt:string};
export type RecoveryIdentity={profileSha256:string;handoffSha256:string;generation:string;policy:Policy};
type Proof={selection:VerifiedEnvioSelection;previousDigest:string;proofDigest:string};
export type EnvioRecoveryJournal={version:1;identity:RecoveryIdentity;originalAdmissionSha256:string;originalAdmission:EnvioAdmissionState;originalSql:RecoverySql;proofs:Proof[]};
export async function requireNoEnvioRecovery(marker='/opt/zeeswap-testnet/state/envio/recovery-in-progress'){
 try{await lstat(marker);requireThat(false,'ENVIO_RECOVERY_PENDING');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
}
export function requireEnvioRecoveryPrefunding(row:Record<string,unknown>|undefined,counts:Record<string,unknown>|undefined){
 requireThat(row?.db==='zee_app_20261023'&&row.role==='zee_app_worker_20261023'&&row.accepting_orders===false&&row.dispatch_enabled===false&&row.reconciliation_required===true&&row.epoch==='0','ENVIO_RECOVERY_PAUSED_EPOCH_ZERO_REQUIRED');
 requireThat(counts&&Object.keys(counts).sort().join(',')==='deposits,leases,obligations,operations,orders,quotes'&&Object.values(counts).every(v=>v==='0'),'ENVIO_RECOVERY_CUSTOMER_BOOKS_OR_LEASES');
}
export function initialEnvioRecovery(identity:RecoveryIdentity,admission:EnvioAdmissionState,originalAdmissionSha256:string,sql:RecoverySql):EnvioRecoveryJournal{
 object(sql,['height','hash','finalizedHeight','finalizedTime','observedAt']);height(sql.height);hex(sql.hash,32);height(sql.finalizedHeight);utc(sql.finalizedTime);utc(sql.observedAt);requireThat(sql.finalizedHeight<=sql.height,'ENVIO_RECOVERY_BASELINE');
 requireThat(admission.version===2&&Array.isArray(admission.hints)&&admission.hints.length===0&&admission.checkpoint&&admission.checkpoint.generation===identity.generation&&admission.checkpoint.projectionDigest===identity.policy.projectionDigest,'ENVIO_RECOVERY_EMPTY_ORIGINAL_ADMISSION_REQUIRED');
 requireThat(/^[a-f0-9]{64}$/.test(originalAdmissionSha256)&&/^[a-f0-9]{64}$/.test(identity.profileSha256)&&/^[a-f0-9]{64}$/.test(identity.handoffSha256)&&Number.isSafeInteger(sql.height)&&sql.height>=identity.policy.birthday&&sql.hash===sql.hash.toLowerCase(),'ENVIO_RECOVERY_BASELINE');
 height(admission.checkpoint.height);hex(admission.checkpoint.hash,32,true);requireThat(admission.checkpoint.height>=identity.policy.birthday,'ENVIO_RECOVERY_BASELINE');
 return{version:1,identity,originalAdmissionSha256,originalAdmission:structuredClone(admission),originalSql:structuredClone(sql),proofs:[]};
}
export function nextEnvioRecoveryRange(j:EnvioRecoveryJournal,producerThrough:number){
 const prior=j.proofs.at(-1)?.selection.range.through.height??Math.min(j.originalAdmission.checkpoint!.height,j.originalSql.height);
 const from=Math.max(j.identity.policy.birthday,prior+1-32);
 requireThat(Number.isSafeInteger(producerThrough)&&producerThrough>=prior,'ENVIO_RECOVERY_PRODUCER_BEHIND');
 return{from,through:Math.min(producerThrough,from+255)};
}
export function validateEnvioRecovery(j:EnvioRecoveryJournal,identity:RecoveryIdentity):EnvioRecoveryJournal{
 requireThat(j?.version===1&&stable(j.identity)===stable(identity)&&Array.isArray(j.proofs)&&j.proofs.length<=1024,'ENVIO_RECOVERY_IDENTITY_OR_LIMIT');
 initialEnvioRecovery(identity,j.originalAdmission,j.originalAdmissionSha256,j.originalSql);
 let previousDigest=digest({identity,originalAdmissionSha256:j.originalAdmissionSha256,originalAdmission:j.originalAdmission,originalSql:j.originalSql});
 const prefix={...j,proofs:[] as Proof[]};
 for(const p of j.proofs){
  requireThat(p.previousDigest===previousDigest&&p.proofDigest===digest({selection:p.selection,previousDigest}),'ENVIO_RECOVERY_PROOF_CHANGED');
  const s=p.selection,{verification,...raw}=s;validateSelectedExport(raw,identity.policy,Date.parse(s.range.readCompletedAt));
  requireThat(s.range.observations.length===0,'ENVIO_RECOVERY_EVENTS_REQUIRE_ROOT_REVIEW');
  requireThat(s.producer.generation===identity.generation&&verification.sourceId===identity.policy.canonicalSourceId,'ENVIO_RECOVERY_GENERATION');
  parseHeader(verification.head,identity.policy.network);parseHeader(verification.finalized,identity.policy.network);utc(verification.checkedAt);
  requireThat(verification.head.height>=s.producer.sourceHead.height&&verification.finalized!.height<=verification.head.height&&Date.parse(verification.checkedAt)>=Date.parse(s.range.readStartedAt)-5000&&Date.parse(verification.checkedAt)<Date.parse(s.expiresAt),'ENVIO_RECOVERY_CANONICAL_PROOF');
  const range=nextEnvioRecoveryRange(prefix,s.producer.through.height);
  requireThat(s.range.fromHeight===range.from&&s.range.through.height===range.through,'ENVIO_RECOVERY_GAP');
  const prior=prefix.proofs.at(-1)?.selection;
  if(prior){requireThat(s.range.through.height>prior.range.through.height,'ENVIO_RECOVERY_NO_PROGRESS');for(const h of prior.range.headers.slice(-32))requireThat(stable(s.range.headers.find(n=>n.height===h.height))===stable(h),'ENVIO_RECOVERY_OVERLAP_REORG');}
  previousDigest=p.proofDigest;prefix.proofs.push(p);
 }
 return j;
}
export function appendEnvioRecovery(j:EnvioRecoveryJournal,selection:VerifiedEnvioSelection,now=Date.now()):EnvioRecoveryJournal{
 validateEnvioRecovery(j,j.identity);const{verification,...raw}=selection;validateSelectedExport(raw,j.identity.policy,now);fresh(verification.checkedAt,now);
 const previousDigest=j.proofs.at(-1)?.proofDigest??digest({identity:j.identity,originalAdmissionSha256:j.originalAdmissionSha256,originalAdmission:j.originalAdmission,originalSql:j.originalSql});
 const body={selection,previousDigest},next={...j,proofs:[...j.proofs,{...body,proofDigest:digest(body)}]};return validateEnvioRecovery(next,j.identity);
}
/** Every prior chunk tip commits its full parent-linked prefix. Rechecking all
 * tips plus the two original checkpoints prevents resume across a reorg. */
export async function recheckEnvioRecovery(j:EnvioRecoveryJournal,canonical:CanonicalReader,signal=AbortSignal.timeout(30000)){
 validateEnvioRecovery(j,j.identity);const anchors=new Map<number,string>();
 const add=(height:number,hash:string)=>{const old=anchors.get(height);requireThat(!old||old===hash,'ENVIO_RECOVERY_ANCHOR_CONFLICT');anchors.set(height,hash);};
 add(j.originalSql.height,'0x'+j.originalSql.hash);add(j.originalAdmission.checkpoint!.height,j.originalAdmission.checkpoint!.hash);
 for(const p of j.proofs)add(p.selection.range.through.height,p.selection.range.through.hash);
 const rows=[...anchors],size=canonical.headerBatchSize??10;requireThat(size>=1&&size<=12,'ENVIO_RECOVERY_CANONICAL_PAGE');
 for(let i=0;i<rows.length;i+=size){signal.throwIfAborted();const page=rows.slice(i,i+size),actual=canonical.headers?await canonical.headers(page.map(([h])=>h),signal):await Promise.all(page.map(([h])=>canonical.header(h,signal)));requireThat(actual.length===page.length&&actual.every((h,n)=>h.height===page[n]![0]&&h.hash===page[n]![1]),'ENVIO_RECOVERY_CANONICAL_REORG');}
}
export function completeEnvioRecovery(j:EnvioRecoveryJournal,now=Date.now()):{sql:RecoverySql;admission:EnvioAdmissionState;finalized:Header}{
 validateEnvioRecovery(j,j.identity);const s=j.proofs.at(-1)?.selection;requireThat(s,'ENVIO_RECOVERY_NO_PROOFS');
 const{verification,...raw}=s;validateSelectedExport(raw,j.identity.policy,now);fresh(verification.checkedAt,now);
 requireThat(s.range.through.height===s.producer.through.height&&s.producer.sourceHead.height-s.producer.through.height<=40,'ENVIO_RECOVERY_CURRENT_TAIL_REQUIRED');
 const finalized=verification.finalized;requireThat(finalized&&finalized.height<=s.range.through.height&&finalized.height>=j.originalSql.finalizedHeight,'ENVIO_RECOVERY_FINALITY_REQUIRED');
 return{sql:{height:s.range.through.height,hash:s.range.through.hash.slice(2),finalizedHeight:finalized.height,finalizedTime:finalized.time,observedAt:s.producer.sourceSampledAt},admission:{...j.originalAdmission,checkpoint:{height:s.range.through.height,hash:s.range.through.hash,generation:j.identity.generation,projectionDigest:j.identity.policy.projectionDigest}},finalized};
}
export function recoverySqlOutcome(actual:RecoverySql,original:RecoverySql,candidate:RecoverySql){
 if(stable(actual)===stable(candidate))return'COMMITTED' as const;
 if(stable(actual)===stable(original))return'ORIGINAL' as const;
 throw Object.assign(Error('ENVIO_RECOVERY_SQL_INTERVENTION'),{code:'ENVIO_RECOVERY_SQL_INTERVENTION'});
}
