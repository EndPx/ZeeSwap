/** Explicit operator-scope metadata boundary. Never claims missing event coverage. */
import type pg from 'pg';
import type {ClosedSnapshot,ClosedRows} from './integrations/observation/envio-closed-recovery.ts';
import type {CampaignCheckpoint,CampaignControl} from './integrations/observation/envio-linked-campaign.ts';
import {continuationDigest} from './native-circle-continuation.ts';
import {stable,parseHeader,type Header} from './integrations/observation/types.ts';
import type {FundingHint} from './integrations/observation/envio-live.ts';
import {createHash} from 'node:crypto';
import {databaseIncarnationFields,currentMainDatabaseProvenance,type MainDatabaseRelocationReceipt,type MainRestoredBaseline} from './main-database-relocation.ts';
import {validateOpeningFeeAllocationTransition,type OpeningFeeAllocationTransition} from './swap-opening-fee-allocation.ts';
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
function need(v:unknown,c:string):asserts v{if(!v)throw Error('OPERATOR_OPENING_'+c);}
export type OperatorOpeningApproval={version:1;status:'ROOT_BASE_OPERATOR_SCOPE_OPENING_APPROVED';metadataOnly:true;financialAction:false;
 explicitHistoricalCoverageAmendment:true;profileSha256:string;registrySha256:string;handoffSha256:string;openingProofSha256:string;
 publicCommit:string;collectorPublicCommit?:string;operator:string;evidenceSha256:string;archiveManifestSha256:string;retainedRowsSha256:string;financialDigest:string;
 control:CampaignControl;before:CampaignCheckpoint;after:Omit<CampaignCheckpoint,'xmin'>;originalAdmissionSha256:string;
 generation:string;projectionDigest:string;unverifiedHistoricalInterval:{from:number;through:number};verifiedAt:string;expiresAt:string};
export type OperatorOpeningAdmission={version:4;kind:'OPERATOR_SCOPE_OPENING';hints:FundingHint[];checkpoint:{height:number;hash:string;generation:string;projectionDigest:string};
 scope:{operator:string;openingHeight:number;approvalSha256:string;evidenceSha256:string;archiveManifestSha256:string;retainedRowsSha256:string;unverifiedHistoricalInterval:{from:number;through:number}}};
export function validOperatorOpeningEpoch(v:unknown):v is string{return typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&BigInt(v)>=230n&&BigInt(v)<=9223372036854775807n;}
export function validateOperatorOpeningApproval(a:OperatorOpeningApproval,now=Date.now()){
 need(a?.version===1&&a.status==='ROOT_BASE_OPERATOR_SCOPE_OPENING_APPROVED'&&a.metadataOnly===true&&a.financialAction===false&&a.explicitHistoricalCoverageAmendment===true,'EXPLICIT_AMENDMENT');
 need([a.profileSha256,a.registrySha256,a.handoffSha256,a.openingProofSha256,a.evidenceSha256,a.archiveManifestSha256,a.retainedRowsSha256,a.financialDigest,a.originalAdmissionSha256,a.projectionDigest].every(hash)&&/^[a-f0-9]{40}$/.test(a.publicCommit),'PINS');
 need(a.collectorPublicCommit===undefined||/^[a-f0-9]{40}$/.test(a.collectorPublicCommit),'COLLECTOR_PIN');
 need(a.profileSha256==='76711023c2313cf7e1e30382ea1591f5ff7721b56f68b3094ad7dd0f92ff8251'&&a.registrySha256==='56072db2d7b7f40b183257d07ac5384179dcff357c50610ce79feeebd13a3e69'&&a.handoffSha256==='394b2f41bafe98a7e165a8e33ce94232ad8726e160852deaf4e1e877b4d13b57'&&a.openingProofSha256==='9e2141e85105d881c82710a7f859545b6d8702666086bddeb247e71f887ab3c3','CURRENT_MAIN_PROFILE');
 need(a.operator==='0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'&&a.generation.length>0&&validOperatorOpeningEpoch(a.control.epoch)&&!a.control.accepting_orders&&!a.control.dispatch_enabled&&a.control.reconciliation_required===true&&/^[1-9][0-9]*$/.test(a.control.xmin),'SCOPE');
 const at=Date.parse(a.verifiedAt),expires=Date.parse(a.expiresAt);need(Number.isFinite(at)&&at<=now+5000&&now<expires&&expires>at&&expires-at<=300000,'APPROVAL_CLOCK');
 need(Number.isSafeInteger(a.before.height)&&Number.isSafeInteger(a.after.height)&&a.after.height>a.before.height&&a.before.finalizedHeight<=a.before.height
  &&a.after.finalizedHeight>=a.before.finalizedHeight&&a.after.finalizedHeight<=a.after.height&&hash(a.before.hash)&&hash(a.after.hash)
  &&a.unverifiedHistoricalInterval.from===a.before.height+1&&a.unverifiedHistoricalInterval.through===a.after.height-1,'HONEST_HISTORICAL_INTERVAL');
 need(Number.isFinite(Date.parse(a.after.finalizedTime))&&now-Date.parse(a.after.observedAt)>=-5000&&now-Date.parse(a.after.observedAt)<=60000,'SOURCE_CLOCK');return a;
}
export function validateOperatorOpeningAdmission(a:OperatorOpeningAdmission,generation:string,projectionDigest:string){
 need(a?.version===4&&a.kind==='OPERATOR_SCOPE_OPENING'&&Array.isArray(a.hints)&&a.hints.length<=500&&a.checkpoint?.generation===generation&&a.checkpoint.projectionDigest===projectionDigest,'ADMISSION_IDENTITY');
 const s=a.scope;need(s&&s.operator==='0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'&&[s.approvalSha256,s.evidenceSha256,s.archiveManifestSha256,s.retainedRowsSha256].every(hash)
  &&Number.isSafeInteger(s.openingHeight)&&s.openingHeight>0&&a.checkpoint.height>=s.openingHeight&&/^0x[a-f0-9]{64}$/.test(a.checkpoint.hash)
  &&Number.isSafeInteger(s.unverifiedHistoricalInterval.from)&&s.unverifiedHistoricalInterval.from>0&&s.unverifiedHistoricalInterval.through===s.openingHeight-1&&s.unverifiedHistoricalInterval.from<=s.unverifiedHistoricalInterval.through,'ADMISSION_SCOPE');return a;
}
export function operatorOpeningAdmission(a:OperatorOpeningApproval,approvalSha256:string):OperatorOpeningAdmission{
 need(hash(approvalSha256),'APPROVAL_PIN');return {version:4,kind:'OPERATOR_SCOPE_OPENING',hints:[],checkpoint:{height:a.after.height,hash:'0x'+a.after.hash,generation:a.generation,projectionDigest:a.projectionDigest},scope:{operator:a.operator,openingHeight:a.after.height,approvalSha256,evidenceSha256:a.evidenceSha256,archiveManifestSha256:a.archiveManifestSha256,retainedRowsSha256:a.retainedRowsSha256,unverifiedHistoricalInterval:a.unverifiedHistoricalInterval}};
}
export type OperatorOpeningIntent={version:1;purpose:'BASE_OPERATOR_SCOPE_OPENING_METADATA';databaseSystemIdentifier?:string;approvalSha256:string;approval:OperatorOpeningApproval;transactionId:string;expectedXmin:string;before:ClosedSnapshot;after:CampaignCheckpoint;afterRows:ClosedRows;candidateAdmissionSha256:string;candidateAdmissionBase64:string};
type PriorPin={path:string;sha256:string};
export type PriorControlTransition={version:1;purpose:'ROOT_PRIOR_OPERATOR_OPENING_PAUSED_CONTROL_TRANSITION';status:'ROOT_PAUSED_CONTROL_TRANSITION_APPROVED';
 databaseSystemIdentifier:string;priorTransactionId:string;priorOpening:{approval:PriorPin;intent:PriorPin;completed:PriorPin;evidence:PriorPin};
 fromControl:CampaignControl;toControl:CampaignControl;controlTransactionId:string;financialDigest:string;financialRows:70;retainedRowsSha256:string;
 noRepair:PriorPin;fatalDiagnostic:PriorPin;reconciliationOutcome:'ACKNOWLEDGED';verifiedAt:string;expiresAt:string};
export type PriorControlTransitionEvidence={certificate:PriorControlTransition;noRepair:any;fatalDiagnostic:any;controlTransactionStatus:string;
 priorOpening:{approval:PriorPin;intent:PriorPin;completed:PriorPin;evidence:PriorPin}};
export type OriginalOpeningFinishAcknowledgement={version:1;purpose:'ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_CONTROL_ACK';status:'ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_APPROVED';
 databaseSystemIdentifier:string;originalTransactionId:string;originalIntent:PriorPin;originalApproval:PriorPin;originalEvidence:PriorPin;originalConfig:PriorPin;
 fromControl:CampaignControl;toControl:CampaignControl;controlTransactionId:string;financialDigest:string;retainedRowsSha256:string;
 originalAdmissionSha256:string;candidateAdmissionSha256:string;nativeBoundary:PriorPin;fatalDiagnostic:PriorPin;reconciliationOutcome:'ACKNOWLEDGED';
 financialAction:false;admissionEnabled:false;nativeReadinessClaimed:false;verifiedAt:string;expiresAt:string};
export type OriginalOpeningFinishAckEvidence={certificate:OriginalOpeningFinishAcknowledgement;certificatePin:PriorPin;nativeBoundary:any;fatalDiagnostic:any};
/** Filesystem completion only: the original committed SQL operation is never
 * replayed. Native readiness remains a separate unresolved gate. */
export function validateOriginalOpeningFinishAcknowledgement(v:OriginalOpeningFinishAckEvidence,i:OperatorOpeningIntent,s:ClosedSnapshot,status:string,controlStatus:string,now=Date.now()){
 const a=v.certificate,n=v.nativeBoundary,d=v.fatalDiagnostic;
 need(a?.version===1&&a.purpose==='ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_CONTROL_ACK'&&a.status==='ROOT_ORIGINAL_OPERATOR_OPENING_FINISH_APPROVED'
  &&a.databaseSystemIdentifier==='7701863382450487342'&&i.databaseSystemIdentifier===a.databaseSystemIdentifier&&a.originalTransactionId==='43498'&&i.transactionId===a.originalTransactionId
  &&status==='committed'&&controlStatus==='committed'&&a.controlTransactionId==='43503','FINISH_ACK_COMMITTED_TRANSACTIONS');
 need(a.financialAction===false&&a.admissionEnabled===false&&a.nativeReadinessClaimed===false&&a.reconciliationOutcome==='ACKNOWLEDGED','FINISH_ACK_SCOPE');
 const at=Date.parse(a.verifiedAt),expires=Date.parse(a.expiresAt);need(Number.isFinite(at)&&at<=now+5000&&now<expires&&expires>at&&expires-at<=300000,'FINISH_ACK_CLOCK');
 need([a.originalIntent,a.originalApproval,a.originalEvidence,a.originalConfig,a.nativeBoundary,a.fatalDiagnostic,v.certificatePin].every(p=>p&&hash(p.sha256)&&p.path.startsWith('/opt/zeeswap-testnet/')&&!p.path.includes('..'))
  &&a.originalApproval.sha256===i.approvalSha256&&a.originalEvidence.sha256===i.approval.evidenceSha256,'FINISH_ACK_PINS');
 need(stable(a.fromControl)===stable(i.before.control)&&a.fromControl.epoch==='234'&&a.fromControl.xmin==='27890'
  &&stable(a.toControl)===stable(s.control)&&a.toControl.epoch==='235'&&a.toControl.xmin==='43503'
  &&!s.control.accepting_orders&&!s.control.dispatch_enabled&&s.control.reconciliation_required===true,'FINISH_ACK_PAUSED_CONTROL');
 need(a.financialDigest===i.approval.financialDigest&&a.retainedRowsSha256===continuationDigest(i.afterRows)&&s.rows.length===269
  &&Object.values(s.books).reduce((total,rows)=>total+rows.length,0)===70&&s.authorizationRows===0
  &&classifyOperatorOpening(status,{...s,control:i.before.control},i)==='COMMITTED_EXACT'
  &&a.originalAdmissionSha256===i.approval.originalAdmissionSha256&&a.candidateAdmissionSha256===i.candidateAdmissionSha256,'FINISH_ACK_ORIGINAL_DATA');
 need(n?.version===1&&n.status==='ROOT_NATIVE_FS_BOUNDARY_READ_ONLY_VERIFIED'&&stable(n.control)===stable(a.toControl)
  &&n.cursor?.processedThrough===4553427&&n.nativeSql?.height===4553427&&n.nativeSql.finalizedHeight===4553418
  &&n.cursor.tipHash===n.nativeSql.hash&&n.canonicalTip?.height===4553427&&n.canonicalTip.hash===n.nativeSql.hash
  &&n.canonicalFinalized?.height===4553418&&n.canonicalFinalized.hash===n.nativeSql.finalizedHash&&hash(n.cursorSha256)
  &&n.sqlMutation===false&&n.cursorMutation===false&&n.nativeReadinessClaimed===false,'FINISH_ACK_NATIVE_BOUNDARY');
 need(d?.code==='CANONICAL_HEAD_CHANGED'&&d.phase==='VERIFY_ANCHORS'&&d.publicationAttempted===false
  &&d.headChange?.expected?.height===4553429&&d.headChange.actual?.height===4553429&&d.headChange.phase==='anchor-recheck'
  &&d.headChange.recheckFailure?.message==='CHEF_CANONICAL_HEADER_FAILED','FINISH_ACK_FATAL_BEFORE_PUBLICATION');
}
/** One explicit Root acknowledgement may account for this known paused-control
 * change. It cannot replace a checkpoint, retained row, financial row or XID. */
export function validatePriorControlTransition(t:PriorControlTransitionEvidence,i:OperatorOpeningIntent,a:OperatorOpeningApproval,current:ClosedSnapshot,now=Date.now()){
 const c=t.certificate,n=t.noRepair,d=t.fatalDiagnostic,at=Date.parse(c?.verifiedAt),expires=Date.parse(c?.expiresAt);
 need(c?.version===1&&c.purpose==='ROOT_PRIOR_OPERATOR_OPENING_PAUSED_CONTROL_TRANSITION'&&c.status==='ROOT_PAUSED_CONTROL_TRANSITION_APPROVED'
  &&c.databaseSystemIdentifier==='7701863382450487342'&&i.databaseSystemIdentifier===c.databaseSystemIdentifier&&c.priorTransactionId==='25793'&&i.transactionId===c.priorTransactionId,'PRIOR_CONTROL_CERTIFICATE');
 need(Number.isFinite(at)&&at<=now+5000&&now<expires&&expires>at&&expires-at<=300000,'PRIOR_CONTROL_CLOCK');
 need(stable(c.priorOpening)===stable(t.priorOpening)&&Object.values(c.priorOpening).every(p=>p.path.startsWith('/opt/zeeswap-testnet/state/service-policy/opening-primary-20261029-r3/')&&hash(p.sha256))
  &&c.priorOpening.approval.sha256===i.approvalSha256&&c.priorOpening.evidence.sha256===a.evidenceSha256,'PRIOR_CONTROL_PINS');
 need(stable(c.fromControl)===stable(i.before.control)&&c.fromControl.epoch==='233'&&c.fromControl.xmin==='1327'
  &&stable(c.toControl)===stable(current.control)&&c.toControl.epoch==='234'&&c.toControl.xmin==='27890'
  &&c.toControl.accepting_orders===false&&c.toControl.dispatch_enabled===false&&c.toControl.reconciliation_required===true
  &&c.controlTransactionId==='27890'&&t.controlTransactionStatus==='committed'&&c.reconciliationOutcome==='ACKNOWLEDGED','PRIOR_CONTROL_ACKNOWLEDGEMENT');
 need(c.financialDigest===a.financialDigest&&c.financialRows===70&&Object.values(current.books).reduce((total,rows)=>total+rows.length,0)===70
  &&current.rows.length===269&&c.retainedRowsSha256===continuationDigest(current.rows)&&current.authorizationRows===0
  &&classifyOperatorOpening('committed',{...current,control:i.before.control},i)==='COMMITTED_EXACT','PRIOR_CONTROL_ONLY_CHANGE');
 need(hash(c.noRepair?.sha256)&&hash(c.fatalDiagnostic?.sha256)&&n?.version===1&&n.status==='ROOT_NATIVE_NO_REPAIR_RESTART_VERIFIED'
  &&stable(n.control)===stable({epoch:c.toControl.epoch,xmin:c.toControl.xmin})&&n.financialDigest===c.financialDigest
  &&n.allPersistedCanonical===true&&Number.isSafeInteger(n.verifiedPersistedHeaders)&&n.verifiedPersistedHeaders>0
  &&hash(n.cursorSha256)&&hash(n.persistedStateDigest)&&n.cursor?.processedThrough===4553218&&hash(n.cursor.tipHash)
  &&n.sqlMutation===false&&n.cursorMutation===false&&n.restartPerformed===false,'PRIOR_CONTROL_NO_REPAIR');
 need(d?.code==='CANONICAL_CHECKPOINT_MISMATCH'&&d.phase==='TRAVERSE'&&d.publicationAttempted===false
  &&d.checkpointMismatch?.expectedCore?.height===4553220&&d.checkpointMismatch.actualHeader?.height===4553220
  &&d.checkpointMismatch.freshCanonicalHeader?.height===4553220&&!d.checkpointMismatch.freshCanonicalFailure
  &&stable(d.checkpointMismatch.actualHeader)===stable(d.checkpointMismatch.freshCanonicalHeader)
  &&d.checkpointMismatch.recheckFailure?.message==='CHEF_CANONICAL_HEADER_FAILED','PRIOR_CONTROL_FATAL_BEFORE_PUBLICATION');
 need(n.currentSource?.generation==='13d3e6eb-ecfe-4159-8cde-b5d9ed00151e'
  &&n.independentCore?.height===n.currentSource.checkpoint?.height&&n.independentCore.hash===n.currentSource.checkpoint.hash
  &&n.independentCore.height>4553220&&stable(n.displacedCandidateCanonical)===stable(d.checkpointMismatch.freshCanonicalHeader),'PRIOR_CONTROL_SOURCE_RESOLVED');
}
export function classifyOperatorOpening(status:string,s:ClosedSnapshot,i:OperatorOpeningIntent){
 need(i?.version===1&&i.purpose==='BASE_OPERATOR_SCOPE_OPENING_METADATA'&&hash(i.approvalSha256),'INTENT_PURPOSE');
 if(stable(s.control)!==stable(i.before.control)||continuationDigest(s.books)!==i.approval.financialDigest||s.authorizationRows!==0)return'UNKNOWN_OR_INTERVENED_NO_REPLAY';
 if(status==='aborted'&&stable(s.checkpoint)===stable(i.before.checkpoint)&&stable(s.rows)===stable(i.before.rows))return'ABORTED_EXACT_NO_REPLAY';
 if(status==='committed'&&stable(s.checkpoint)===stable(i.after)&&s.checkpoint.xmin===i.expectedXmin&&stable(s.rows)===stable(i.afterRows))return'COMMITTED_EXACT';
 return'UNKNOWN_OR_INTERVENED_NO_REPLAY';
}
export async function publishOperatorOpening(c:Pick<pg.PoolClient,'query'>,a:OperatorOpeningApproval,approvalSha256:string,
 read:()=>Promise<ClosedSnapshot>,guard:()=>Promise<void>,candidate:Buffer,open:(b:Buffer)=>unknown,persist:(i:OperatorOpeningIntent)=>Promise<void>){
 const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 validateOperatorOpeningApproval(a);need(hash(approvalSha256)&&stable(open(candidate))===stable(operatorOpeningAdmission(a,approvalSha256)),'SEALED_CANDIDATE');
 let commitSent=false;await c.query('BEGIN');try{
  await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");
  need((await c.query('SELECT pg_try_advisory_xact_lock(84532,20261024) ok')).rows[0]?.ok===true,'OBSERVER_MUST_BE_STOPPED');
  await c.query('SELECT zee.lock_observer_cycle()');await guard();const before=await read();
  need(before.database==='zee_app_20261023'&&['zee_app_admin_20261023','zee_app_worker_20261023'].includes(before.role)&&stable(before.control)===stable(a.control)&&before.authorizationRows===0
   &&continuationDigest(before.books)===a.financialDigest&&stable(before.checkpoint)===stable(a.before)&&continuationDigest(before.rows)===a.retainedRowsSha256,'EXACT_BASELINE');
  const transactionId=String((await c.query('SELECT pg_current_xact_id()::text id')).rows[0]?.id);need(/^[1-9][0-9]*$/.test(transactionId)&&(await c.query('SELECT pg_xact_status($1::xid8) status',[transactionId])).rows[0]?.status==='in progress','ORIGINAL_XID');
  const expectedXmin=(BigInt(transactionId)%4294967296n).toString(),six=(x:string)=>new Date(x).toISOString().replace(/\.(\d{3})Z$/,'.$1000Z'),after={...a.after,finalizedTime:six(a.after.finalizedTime),observedAt:six(a.after.observedAt),xmin:expectedXmin};
  const i:OperatorOpeningIntent={version:1,purpose:'BASE_OPERATOR_SCOPE_OPENING_METADATA',...databaseIncarnationFields(),approvalSha256,approval:a,transactionId,expectedXmin,before,after,afterRows:before.rows,candidateAdmissionSha256:sha(candidate),candidateAdmissionBase64:candidate.toString('base64')};await persist(i);
  await guard();validateOperatorOpeningApproval(a);need(stable(await read())===stable(before),'INTERVENTION');
  const b=a.before,r=await c.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4::timestamptz,observed_at=$5::timestamptz WHERE network='base-sepolia' AND xmin::text=$6 AND scanned_height=$7 AND tip_hash=$8 AND finalized_height=$9 AND finalized_time=$10::timestamptz AND observed_at=$11::timestamptz RETURNING xmin::text",[after.height,after.hash,after.finalizedHeight,after.finalizedTime,after.observedAt,b.xmin,b.height,b.hash,b.finalizedHeight,b.finalizedTime,b.observedAt]);
  need(r.rows.length===1&&r.rows[0].xmin===expectedXmin,'CHECKPOINT_CAS');need(classifyOperatorOpening('committed',await read(),i)==='COMMITTED_EXACT','EXACT_POST_DML');
  await guard();validateOperatorOpeningApproval(a);commitSent=true;await c.query('COMMIT');return i;
 }catch(error){if(!commitSent)await c.query('ROLLBACK').catch(()=>{});throw error;}
}
export function validateOperatorOpeningReceipt(r:any,i:OperatorOpeningIntent,a:OperatorOpeningApproval,approvalSha256:string){
 validateOperatorOpeningApproval(a,Date.parse(a.verifiedAt));need(r?.version===1&&r.status==='BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT'&&r.financialAction===false&&r.completeContractHistory===false
  &&r.approvalSha256===approvalSha256&&i.approvalSha256===approvalSha256&&stable(i.approval)===stable(a)&&r.intentDigest===continuationDigest(i)
  &&r.transactionId===i.transactionId&&stable(r.checkpoint)===stable(i.after)&&r.retainedRowsSha256===a.retainedRowsSha256
  &&r.evidenceSha256===a.evidenceSha256&&r.archiveManifestSha256===a.archiveManifestSha256&&stable(r.unverifiedHistoricalInterval)===stable(a.unverifiedHistoricalInterval),'RECEIPT_BINDING');
}
/** An already committed scoped opening may supply its own archived finalized
 * anchor when that metadata-only operation intentionally inserted no SQL header.
 * It cannot justify changed control, books, checkpoint, rows or a nonterminal XID. */
export function validatePriorOperatorOpening(r:any,i:OperatorOpeningIntent,a:OperatorOpeningApproval,approvalSha256:string,e:any,status:string,current:ClosedSnapshot,archivedOrigin?:{scope:string;originClassificationSha256?:string;destinationSystemIdentifier?:string|null},relocation:MainDatabaseRelocationReceipt|undefined=currentMainDatabaseProvenance()?.receipt,restoredBaseline:MainRestoredBaseline|undefined=currentMainDatabaseProvenance()?.restoredBaseline,transition?:PriorControlTransitionEvidence,finishAcknowledgement?:OriginalOpeningFinishAckEvidence&{controlTransactionStatus:string},feeAllocationTransition?:OpeningFeeAllocationTransition):Header{
 validateOperatorOpeningReceipt(r,i,a,approvalSha256);
 if(archivedOrigin?.scope==='ARCHIVED_ORIGIN_CLUSTER'){
  const withoutXmin=(v:Record<string,unknown>)=>Object.fromEntries(Object.entries(v).filter(([key])=>key!=='xmin'));
  need(relocation&&restoredBaseline&&archivedOrigin.originClassificationSha256===relocation.origin.originClassificationSha256&&archivedOrigin.destinationSystemIdentifier===relocation.destination.systemIdentifier&&status==='committed'&&current.database==='zee_app_20261023'&&current.authorizationRows===0&&continuationDigest(current.books)===a.financialDigest&&a.financialDigest===restoredBaseline.financialDigest&&continuationDigest(current.rows)===restoredBaseline.retainedBaseRowsSha256&&stable(current.rows)===stable(i.afterRows)&&stable(current.control)===stable(restoredBaseline.control)&&stable(current.checkpoint)===stable(restoredBaseline.baseCheckpoint)&&stable(withoutXmin(current.checkpoint))===stable(withoutXmin(i.after)),'PRIOR_RELOCATED_ORIGIN_STATE');
 }else if(feeAllocationTransition){need(!transition&&!finishAcknowledgement&&status==='committed','FEE_ALLOCATION_PRIOR_COMMITTED');validateOpeningFeeAllocationTransition(feeAllocationTransition,i,current);}
 else if(finishAcknowledgement){need(!transition&&r.controlAcknowledgement?.certificate?.sha256===finishAcknowledgement.certificatePin.sha256&&stable(r.controlAcknowledgement.control)===stable(finishAcknowledgement.certificate.toControl),'PRIOR_FINISH_ACK_RECEIPT');validateOriginalOpeningFinishAcknowledgement(finishAcknowledgement,i,current,status,finishAcknowledgement.controlTransactionStatus,Date.parse(finishAcknowledgement.certificate.verifiedAt));}
 else if(transition){need(status==='committed','PRIOR_EXACT_COMMITTED_STATE');validatePriorControlTransition(transition,i,a,current);}
 else need(status==='committed'&&classifyOperatorOpening(status,current,i)==='COMMITTED_EXACT','PRIOR_EXACT_COMMITTED_STATE');
 need(e?.version===1&&e.status==='ROOT_BASE_OPERATOR_SCOPE_OPENING_COLLECTED'&&e.profileSha256===a.profileSha256&&e.registrySha256===a.registrySha256&&e.operator===a.operator&&e.financialDigest===a.financialDigest&&e.retainedRowsSha256===a.retainedRowsSha256&&e.archiveManifestSha256===a.archiveManifestSha256&&stable(e.before)===stable(i.before)&&stable(e.after)===stable(a.after),'PRIOR_EVIDENCE_BINDING');
 const F=parseHeader(e.selection?.independentSample?.finalized??e.selection?.selection?.verification?.finalized,'eip155:84532');
 if(e.selection?.independentSample)need(e.selection.independentSample.sourceId===e.selection.producerCanonical?.sourceId,'PRIOR_INDEPENDENT_PROVIDER');
 if(e.selection?.independentSample?.sourceId==='base-sepolia-official-independent-rpc')need(e.independentConsumer,'PRIOR_INDEPENDENT_PROVIDER');
 if(e.independentConsumer){const p=e.independentConsumer;need(p.approval?.sourceId==='base-sepolia-official-independent-rpc'&&p.approval.sourceProofSourceId==='base-sepolia-publicnode-normal-rpc'&&e.selection.independentSample?.sourceId===p.approval.sourceId&&e.selection.selection.verification.canonicalSourceId===p.approval.sourceProofSourceId&&continuationDigest(e.archives)===a.archiveManifestSha256&&e.archives.some((r:any)=>r.pin?.path===p.pin.path&&r.pin.sha256===p.pin.sha256&&r.bytesSha256===p.pin.sha256),'PRIOR_INDEPENDENT_PROVIDER');}
 need(F.height===i.after.finalizedHeight&&Date.parse(F.time)===Date.parse(i.after.finalizedTime)&&e.selection.selection.range?.through?.height===i.after.height&&e.selection.selection.range.through.hash==='0x'+i.after.hash,'PRIOR_FINALITY_BINDING');return F;
}
/** Complete only the original transaction's durable file boundary. This kernel
 * contains no checkpoint UPDATE and cannot replay a new metadata transaction. */
export async function finishOperatorOpeningUnderObserverLock(c:Pick<pg.PoolClient,'query'>,read:()=>Promise<ClosedSnapshot>,i:OperatorOpeningIntent,finish:()=>Promise<void>,acknowledgement?:OriginalOpeningFinishAckEvidence){
 const relocation=currentMainDatabaseProvenance();if(relocation)need(i.databaseSystemIdentifier===relocation.receipt.destination.systemIdentifier,'ORIGIN_FINISH_ARCHIVE_ONLY');
 await c.query('BEGIN');try{await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");await c.query('SELECT zee.lock_observer_cycle()');need((await c.query('SELECT pg_try_advisory_xact_lock(84532,20261024) ok')).rows[0]?.ok===true,'OBSERVER_MUST_BE_STOPPED');const status=(await c.query('SELECT pg_xact_status($1::xid8) status',[i.transactionId])).rows[0]?.status;
  const exact=async(code:string)=>{const current=await read();if(acknowledgement){const controlStatus=(await c.query('SELECT pg_xact_status($1::xid8) status',[acknowledgement.certificate.controlTransactionId])).rows[0]?.status;validateOriginalOpeningFinishAcknowledgement(acknowledgement,i,current,status,controlStatus);}else need(classifyOperatorOpening(status,current,i)==='COMMITTED_EXACT',code);};
  await exact('ORIGINAL_XID_FINISH');await finish();await exact('FINISH_INTERVENTION');await c.query('COMMIT');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
