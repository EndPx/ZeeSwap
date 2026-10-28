/** Archival validation only; never renews the catchup permit or financial authority. */
import {createHash} from 'node:crypto';
import {validateSnapshot} from './observer.ts';
import {continuationDigest} from './native-circle-continuation.ts';
import {validateChefLinkedApproval} from './integrations/observation/chef-linked-recovery.ts';
import {digest,hex,object,requireThat,stable} from './integrations/observation/types.ts';

export function validateNativeCatchupMetadataReceipt(receipt:any,intent:any,approval:any,permitSha256:string){
 const need=(v:unknown,c:string)=>requireThat(v,'SERVICE_NATIVE_CATCHUP_'+c);
 object(receipt,['version','status','permitSha256','intentDigest','transactionId','checkpoint','cursorSha256','financialAction']);
 object(intent,['version','permitSha256','journalDigest','transactionId','expectedXmin','before','after','snapshot','cursor','cursorSha256']);
 hex(permitSha256,32);hex(intent.journalDigest,32);
 need(receipt.version===1&&receipt.status==='ROOT_CURRENT_NATIVE_CATCHUP_COMMITTED_EXACT'&&receipt.financialAction===false&&intent.version===1&&receipt.permitSha256===permitSha256&&intent.permitSha256===permitSha256&&receipt.intentDigest===digest(intent),'BINDING');
 need(approval?.version===2&&approval.purpose==='ROOT_CURRENT_CLOSED_NATIVE_CATCHUP'&&approval.metadataOnly===true&&approval.noFinance===true&&approval.appObserverStopped===true&&approval.financialWorkersStopped===true,'ROOT_SCOPE');
 validateChefLinkedApproval(approval,{stateRoot:'/opt/zeeswap-testnet/state',profileSha256:approval.profileSha256,handoffSha256:approval.handoffSha256,openingProofSha256:approval.openingProofSha256,financialDigest:approval.financialDigest,control:approval.control,baseline:approval.baseline,legacyJournal:approval.legacyJournal,identity:approval.identity},Date.parse(approval.verifiedAt));
 const state=approval.before,cp=state?.persisted?.checkpoint,c=state?.persisted?.control;
 need(state?.database==='zee_app_20261023'&&state.role==='zee_app_worker_20261023'&&state.authorizationRows==='0'&&state.books&&cp&&c,'BEFORE_STATE');
 const before={control:{epoch:String(c.epoch),xmin:String(c.xmin),accepting_orders:c.accepting_orders,dispatch_enabled:c.dispatch_enabled,reconciliation_required:c.reconciliation_required},checkpoint:{scanned_height:String(cp.scanned_height),finalized_height:String(cp.finalized_height),tip_hash:cp.tip_hash,observed_at:new Date(cp.observed_at).toISOString(),finalized_time:new Date(cp.finalized_time).toISOString(),xmin:state.checkpointXmin}};
 need(stable(before)===stable({control:approval.control,checkpoint:approval.baseline.checkpoint})&&stable(intent.before)===stable(before)&&approval.financialDigest===continuationDigest(state.books),'BEFORE_BINDING');
 need(typeof intent.transactionId==='string'&&/^[1-9][0-9]*$/.test(intent.transactionId)&&BigInt(intent.transactionId)<=18446744073709551615n&&intent.expectedXmin===(BigInt(intent.transactionId)%4294967296n).toString()&&intent.expectedXmin!=='0'&&receipt.transactionId===intent.transactionId,'ORIGINAL_XID');
 const s=intent.snapshot;validateSnapshot({...s,observedAt:new Date().toISOString()});
 const finalized=s.blocks.find((b:any)=>b.height===s.scannedHeight-9);
 need(finalized&&s.outputs.length===0&&s.scannedHeight>approval.baseline.cursor.value.processedThrough&&s.scannedHeight>=Number(before.checkpoint.finalized_height)+9&&Number.isFinite(Date.parse(s.observedAt))&&Date.parse(s.observedAt)>=Date.parse(before.checkpoint.observed_at),'SNAPSHOT');
 const cursor={version:1,identityDigest:approval.baseline.cursor.value.identityDigest,processedThrough:s.scannedHeight,tipHash:s.tipHash,snapshotDigest:digest(s)},cursorSha256=createHash('sha256').update(JSON.stringify(cursor)+'\n').digest('hex');
 const after={control:approval.control,checkpoint:{scanned_height:String(s.scannedHeight),finalized_height:String(finalized.height),tip_hash:s.tipHash,finalized_time:new Date(finalized.time).toISOString(),observed_at:s.observedAt,xmin:intent.expectedXmin}};
 need(stable(intent.cursor)===stable(cursor)&&intent.cursorSha256===cursorSha256&&stable(intent.after)===stable(after)&&stable(receipt.checkpoint)===stable(after.checkpoint)&&receipt.cursorSha256===cursorSha256,'AFTER_BINDING');
}
