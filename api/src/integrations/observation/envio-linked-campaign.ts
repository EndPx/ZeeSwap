/** Explicit post-publication catchup. Completed parent is read-only evidence, never a new journal. */
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {authorizedPrefundingSnapshotSql,validateAuthorizedPrefundingSnapshot,requireAuthorizedEnvioPrefix,type EpochAuthority,type EpochContext,type PrefundingEpochProof} from '../../prefunding-epoch.ts';
import {repairChildTables} from '../../app-chef-metadata-repair.ts';
import {initialEnvioRecovery,validateEnvioRecovery,completeEnvioRecovery,type EnvioRecoveryJournal,type RecoveryIdentity,type RecoverySql} from './envio-recovery.ts';
import type {EnvioAdmissionState} from './envio-live.ts';
import {digest,stable,requireThat,parseHeader,type Header} from './types.ts';
const need=(v:unknown,c:string)=>requireThat(v,'ENVIO_LINKED_'+c);
export const rawSha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&!/^0+$/.test(v);
export const LINKED_PARENT='/opt/zeeswap-testnet/state/envio/prefunding-recovery';
export type ParentPins={coverageSha256:string;intentSha256:string;completedSha256:string;originalAdmissionSha256:string};
export type ParentBytes={coverage:Buffer;intent:Buffer;completed:Buffer;originalAdmission:Buffer};
export type CampaignCheckpoint=RecoverySql&{xmin:string};
export type CampaignControl={epoch:string;xmin:string;accepting_orders:false;dispatch_enabled:false;reconciliation_required:true};
export interface LinkedCampaignApproval extends EpochContext {
 version:1;purpose:'POST_PUBLICATION_PREFUNDING_ENVIO_CATCHUP';branchId:'br-broad-pine-ao79wemx';database:'zee_app_20261023';verifiedAt:string;expiresAt:string;
 epoch:'4';runtimeXmin:'284222';authoritySha256:string;parent:ParentPins;activeAdmissionSha256:string;baseline:CampaignCheckpoint;
 sourceGeneration:string;projectionDigest:string;identityDigest:string;baselineCanonical:Header;
 observerInactiveProof:{path:string;sha256:string};capitalProof:{path:string;sha256:string};capital:PrefundingEpochProof['capital'];
 financialWorkersStopped:true;normalObserverStopped:true;latestOperatorNonce:0;pendingOperatorNonce:0;
}
export type CampaignSnapshot={prefunding:any;children:Record<string,string>;apiRequestForeignKey:boolean;checkpoint:CampaignCheckpoint};
export const linkedCampaignSnapshotSql=`SELECT row_to_json(p) prefunding,
 jsonb_build_object(${repairChildTables.map(t=>`'${t}',(SELECT count(*)::text FROM zee.${t})`).join(',')}) children,
 EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute src ON src.attrelid=k.conrelid AND src.attname='quote_id' AND src.attnotnull AND NOT src.attisdropped JOIN pg_attribute dst ON dst.attrelid=k.confrelid AND dst.attname='id' AND NOT dst.attisdropped WHERE k.conrelid='zee.api_quote_requests'::regclass AND k.confrelid='zee.quotes'::regclass AND k.contype='f' AND k.convalidated AND k.conkey=ARRAY[src.attnum]::smallint[] AND k.confkey=ARRAY[dst.attnum]::smallint[]) "apiRequestForeignKey",
 (SELECT jsonb_build_object('height',scanned_height,'hash',tip_hash,'finalizedHeight',finalized_height,'finalizedTime',to_char(finalized_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'xmin',xmin::text) FROM zee.scanner_checkpoints WHERE network='base-sepolia') checkpoint
 FROM (${authorizedPrefundingSnapshotSql}) p`;
export function validateCampaignSnapshot(s:CampaignSnapshot,a:EpochAuthority){
 validateAuthorizedPrefundingSnapshot(s?.prefunding,a);need(s.prefunding.role==='zee_app_worker_20261023','WORKER_ROLE');
 need(s.apiRequestForeignKey===true&&s.children&&Object.keys(s.children).sort().join(',')===[...repairChildTables].sort().join(',')&&Object.values(s.children).every(v=>v==='0'),'FINANCIAL_CHILDREN_OR_FK');
 need(s.checkpoint&&/^[1-9][0-9]*$/.test(s.checkpoint.xmin),'CHECKPOINT_XMIN');return s;
}
export async function readCampaignSnapshot(c:Pick<pg.PoolClient,'query'>,a:EpochAuthority){return validateCampaignSnapshot((await c.query(linkedCampaignSnapshotSql)).rows[0],a);}
export function validateLinkedApproval(p:LinkedCampaignApproval,context:EpochContext,authority:EpochAuthority,identity:RecoveryIdentity,now=Date.now()){
 need(p?.version===1&&p.purpose==='POST_PUBLICATION_PREFUNDING_ENVIO_CATCHUP'&&p.branchId==='br-broad-pine-ao79wemx'&&p.database==='zee_app_20261023','APPROVAL_SCOPE');
 need(p.epoch==='4'&&p.runtimeXmin==='284222'&&authority.proof.version===2&&authority.proof.epoch===p.epoch&&authority.proof.runtimeXmin===p.runtimeXmin&&p.authoritySha256===authority.sha256,'EXACT_ISSUED_AUTHORITY');
 for(const k of ['profileSha256','handoffSha256','openingProofSha256','openingEventId'] as const)need(p[k]===context[k],'R9_BINDING');
 const at=Date.parse(p.verifiedAt),end=Date.parse(p.expiresAt);need(Number.isFinite(at)&&at<=now+5000&&Number.isFinite(end)&&end>now&&end>at&&end-at<=86400000,'APPROVAL_VALIDITY');
 need(Object.keys(p.parent??{}).sort().join(',')==='completedSha256,coverageSha256,intentSha256,originalAdmissionSha256'&&Object.values(p.parent).every(hash)&&hash(p.activeAdmissionSha256)&&hash(p.identityDigest),'RAW_PINS');
 need(p.sourceGeneration===identity.generation&&p.projectionDigest===identity.policy.projectionDigest&&p.identityDigest===digest(identity)&&p.profileSha256===identity.profileSha256&&p.handoffSha256===identity.handoffSha256,'SOURCE_IDENTITY');
 need(p.baseline&&Object.keys(p.baseline).sort().join(',')==='finalizedHeight,finalizedTime,hash,height,observedAt,xmin'&&hash(p.baseline.hash)&&Number.isSafeInteger(p.baseline.finalizedHeight)&&p.baseline.finalizedHeight>=0&&p.baseline.finalizedHeight<=p.baseline.height,'BASELINE_SHAPE');
 campaignBaselineSql(p.baseline);parseHeader(p.baselineCanonical,identity.policy.network);
 need(p.baseline?.height===49676611&&p.baselineCanonical?.height===p.baseline.height&&p.baselineCanonical.hash==='0x'+p.baseline.hash&&/^[1-9][0-9]*$/.test(p.baseline.xmin),'EXACT_ACTIVE_BASELINE');
 need(p.financialWorkersStopped===true&&p.normalObserverStopped===true&&p.latestOperatorNonce===0&&p.pendingOperatorNonce===0,'STOPPED_AND_NONCES');
 for(const pin of [p.observerInactiveProof,p.capitalProof])need(pin?.path.startsWith('/opt/zeeswap-testnet/state/')&&!pin.path.includes('..')&&hash(pin.sha256),'ROOT_EVIDENCE_PIN');
 const c=p.capital;need(c?.physicalZatoshi==='12500000'&&c.openingNoteCanonical===true&&hash(c.nativeCaptureSha256)&&hash(c.baseProofSha256)&&c.gasWei==='500000000000000'&&c.inventory==='10100000'&&c.available==='10000000'&&c.reserved==='100000'&&c.liability==='100000'&&at-Date.parse(c.observedAt)>=-5000&&at-Date.parse(c.observedAt)<=60000,'FRESH_CAPITAL_AT_ISSUANCE');return p;
}
/** Check every parent raw byte, its hash chain, closure, and encrypted zero-hint candidate. */
export function validateCompletedParent(bytes:ParentBytes,pins:ParentPins,open:(b:Buffer)=>unknown,authority:EpochAuthority,identity:RecoveryIdentity){
 for(const [name,pin] of [['coverage','coverageSha256'],['intent','intentSha256'],['completed','completedSha256'],['originalAdmission','originalAdmissionSha256']] as const)need(rawSha(bytes[name])===pins[pin],'PARENT_RAW_CHANGED');
 const j=JSON.parse(bytes.coverage.toString()) as EnvioRecoveryJournal,intent=JSON.parse(bytes.intent.toString()),completed=JSON.parse(bytes.completed.toString());
 validateEnvioRecovery(j,identity);requireAuthorizedEnvioPrefix(j,authority);
 need(j.proofs.length===542&&j.originalAdmissionSha256===pins.originalAdmissionSha256,'PARENT_EXACT_INVENTORY');
 need(intent.version===1&&intent.journalDigest===digest(j)&&intent.originalAdmissionSha256===j.originalAdmissionSha256&&stable(intent.originalSql)===stable(j.originalSql),'PARENT_INTENT_BINDING');
 const candidate=Buffer.from(intent.candidateAdmissionBase64,'base64');need(hash(intent.candidateAdmissionSha256)&&rawSha(candidate)===intent.candidateAdmissionSha256,'PARENT_CANDIDATE_BYTES');
 const last=j.proofs.at(-1)!.selection,at=Math.max(Date.parse(last.range.readCompletedAt),Date.parse(last.verification.checkedAt)),expected=completeEnvioRecovery(j,at);
 need(expected.sql.height===49672405&&stable(intent.candidateSql)===stable(expected.sql)&&stable(open(candidate))===stable(expected.admission),'PARENT_COMPLETE_CANDIDATE');
 need(stable(open(bytes.originalAdmission))===stable(j.originalAdmission)&&j.originalAdmission.hints.length===0&&expected.admission.hints.length===0,'PARENT_HINTS');
 need(completed.version===1&&completed.status==='ENVIO_PREFUNDING_RECOVERY_COMMITTED'&&completed.intentSha256===digest(intent)&&completed.financialAction===false,'PARENT_CLOSURE');
 return {journal:j,candidateSha256:intent.candidateAdmissionSha256,published:expected.sql};
}
export function campaignBaselineSql(p:CampaignCheckpoint):RecoverySql{
 const stamp=(v:string)=>{need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}(?:000)?)?Z$/.test(v)&&Number.isFinite(Date.parse(v)),'EXACT_MILLISECOND_BASELINE');return new Date(v).toISOString();};
 const{xmin:_,...sql}=p;return{...sql,finalizedTime:stamp(sql.finalizedTime),observedAt:stamp(sql.observedAt)};
}
export function beginLinkedCampaign(p:LinkedCampaignApproval,identity:RecoveryIdentity,activeBytes:Buffer,active:EnvioAdmissionState,s:CampaignSnapshot){
 need(rawSha(activeBytes)===p.activeAdmissionSha256&&stable(s.checkpoint)===stable(p.baseline),'ACTIVE_BASELINE_INTERVENTION');
 need(active.version===2&&active.hints?.length===0&&active.checkpoint?.height===p.baseline.height&&active.checkpoint.hash==='0x'+p.baseline.hash&&active.checkpoint.generation===p.sourceGeneration&&active.checkpoint.projectionDigest===p.projectionDigest,'ACTIVE_ZERO_HINT_CHECKPOINT');
 return initialEnvioRecovery(identity,active,p.activeAdmissionSha256,campaignBaselineSql(p.baseline));
}
export type LinkedCampaignIntent={version:1;purpose:'POST_PUBLICATION_PREFUNDING_ENVIO_CATCHUP';approvalSha256:string;parent:ParentPins;journalDigest:string;transactionId:string;expectedXmin:string;control:CampaignControl;before:CampaignCheckpoint;after:CampaignCheckpoint;candidateAdmissionSha256:string;candidateAdmissionBase64:string;originalAdmissionSha256:string;financialDigest:string};
export function campaignFinancialDigest(s:CampaignSnapshot){return digest({counts:s.prefunding.counts,assets:[...s.prefunding.assets].sort((a,b)=>stable(a).localeCompare(stable(b))),accounts:[...s.prefunding.accounts].sort((a,b)=>stable(a).localeCompare(stable(b))),ledger:[...s.prefunding.ledger].sort((a,b)=>stable(a).localeCompare(stable(b))),children:s.children,apiRequestForeignKey:s.apiRequestForeignKey});}
export function classifyLinkedCommit(status:string,s:CampaignSnapshot,intent:LinkedCampaignIntent){
 need(stable(s.prefunding.control)===stable(intent.control)&&campaignFinancialDigest(s)===intent.financialDigest,'COMMIT_CONTROL_OR_FINANCIAL_INTERVENTION');
 if(status==='committed'&&stable(s.checkpoint)===stable(intent.after)&&s.checkpoint.xmin===intent.expectedXmin)return'COMMITTED_EXACT' as const;
 if(status==='aborted'&&stable(s.checkpoint)===stable(intent.before))return'ABORTED_STOP_ROOT_REVIEW' as const;
 return'UNKNOWN_OR_INTERVENED_STOP_NO_REPLAY' as const;
}
/** Worker restricted definer lock first; guard and every write share this transaction.
 * Durable intent is persisted before the sole checkpoint batch. Never retry here. */
export async function publishLinkedCampaign(c:Pick<pg.PoolClient,'query'>,guard:()=>Promise<CampaignSnapshot>,j:EnvioRecoveryJournal,approvalSha256:string,p:LinkedCampaignApproval,candidate:Buffer,openCandidate:(b:Buffer)=>unknown,persist:(i:LinkedCampaignIntent)=>Promise<void>){
 let commitSent=false;await c.query('BEGIN');
 try{
  await c.query('SELECT zee.lock_observer_cycle()');const before=await guard();need(stable(before.checkpoint)===stable(p.baseline),'PUBLICATION_BASELINE');
  const complete=completeEnvioRecovery(j);need(stable(openCandidate(candidate))===stable(complete.admission)&&complete.admission.hints.length===0,'SEALED_CANDIDATE');const xid=String((await c.query('SELECT pg_current_xact_id()::text id')).rows[0]?.id);need(/^[1-9][0-9]*$/.test(xid),'TRANSACTION_ID');
  need((await c.query('SELECT pg_xact_status($1::xid8) status',[xid])).rows[0]?.status==='in progress','TRANSACTION_STATUS');
  const expectedXmin=(BigInt(xid)%4294967296n).toString(),normalize=(v:string)=>{const m=v.match(/^(.*?)(?:\.(\d{1,6}))?Z$/);need(m,'SQL_UTC');return m![1]+'.'+(m![2]??'').padEnd(6,'0')+'Z';};
  const after={...complete.sql,finalizedTime:normalize(complete.sql.finalizedTime),observedAt:normalize(complete.sql.observedAt),xmin:expectedXmin};
  const intent:LinkedCampaignIntent={version:1,purpose:p.purpose,approvalSha256,parent:p.parent,journalDigest:digest(j),transactionId:xid,expectedXmin,control:before.prefunding.control,before:before.checkpoint,after,candidateAdmissionSha256:rawSha(candidate),candidateAdmissionBase64:candidate.toString('base64'),originalAdmissionSha256:j.originalAdmissionSha256,financialDigest:campaignFinancialDigest(before)};
  await persist(intent);
  // Independently verified checkpoints/anchors are checked before this function.
  // Existing stored canonical anchors are immutable; never UPSERT a conflicting hash.
  const blocks=new Map<number,{hash:string;time:string}>();for(const proof of j.proofs)for(const h of proof.selection.range.headers)blocks.set(h.height,{hash:h.hash.slice(2),time:h.time});
  blocks.set(complete.finalized.height,{hash:complete.finalized.hash.slice(2),time:complete.finalized.time});
  const old=(await c.query("SELECT height::text,block_hash FROM zee.chain_observations WHERE network='base-sepolia'")).rows;
  need(old.every(r=>!blocks.has(Number(r.height))||blocks.get(Number(r.height))!.hash===r.block_hash),'CANONICAL_STORED_CONFLICT');
  need(after.height>=before.checkpoint.height&&after.finalizedHeight>=before.checkpoint.finalizedHeight&&Date.parse(after.observedAt)>=Date.parse(before.checkpoint.observedAt),'FRONTIER_REGRESSION');
  completeEnvioRecovery(j); // No stale tail may precede the first SQL mutation.
  // Persist only checkpoint+finalized anchors, not the large private coverage history.
  for(const h of [j.proofs.at(-1)!.selection.range.through,complete.finalized])await c.query("INSERT INTO zee.chain_observations(network,height,block_hash,block_time) VALUES('base-sepolia',$1,$2,$3::timestamptz) ON CONFLICT(network,height) DO NOTHING",[h.height,h.hash.slice(2),h.time]);
  completeEnvioRecovery(j);
  const r=await c.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4::timestamptz,observed_at=$5::timestamptz WHERE network='base-sepolia' AND xmin::text=$6 AND scanned_height=$7 AND tip_hash=$8 AND finalized_height=$9 AND finalized_time=$10::timestamptz AND observed_at=$11::timestamptz RETURNING xmin::text",[after.height,after.hash,after.finalizedHeight,after.finalizedTime,after.observedAt,before.checkpoint.xmin,before.checkpoint.height,before.checkpoint.hash,before.checkpoint.finalizedHeight,before.checkpoint.finalizedTime,before.checkpoint.observedAt]);
  need(r.rows.length===1&&r.rows[0].xmin===expectedXmin,'CHECKPOINT_CAS');commitSent=true;await c.query('COMMIT');return intent;
 }catch(e){if(!commitSent)await c.query('ROLLBACK').catch(()=>{});throw e;}
}

/** A lost SQL/advisory session during filesystem awaits must leave the marker.
 * No retry or compensation occurs: the same sealed candidate may already exist. */
export async function finishLinkedFileBoundary(status:string,state:CampaignSnapshot,intent:LinkedCampaignIntent,io:{leaseGuard():Promise<void>;readAdmission():Promise<void>;installAdmission():Promise<void>;writeCompletion():Promise<void>;removeMarker():Promise<void>}){
 need(classifyLinkedCommit(status,state,intent)==='COMMITTED_EXACT','COMMIT_NOT_CONFIRMED_NO_REPLAY');
 await io.readAdmission();await io.leaseGuard();await io.installAdmission();await io.leaseGuard();
 await io.writeCompletion();await io.leaseGuard();await io.removeMarker();
}
