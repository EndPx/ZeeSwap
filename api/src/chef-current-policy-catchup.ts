/** Explicit closed-current observation authority; never financial ingestion. */
import {createHash} from 'node:crypto';
import {stable,requireThat,type Header} from './integrations/observation/types.ts';
import type {ChefLinkedCoverageAuthority,ChefLinkedCheckpoint} from './integrations/observation/chef-linked-recovery.ts';
import type {SuccessorState} from './testnet-policy-successor.ts';
import {continuationTables,continuationDigest} from './native-circle-continuation.ts';
import {decodePgJsonbBytea} from './pg-jsonb-bytea.ts';
const need=(v:unknown,c:string)=>requireThat(v,'CHEF_CURRENT_'+c);
export const CLOSED_NATIVE_CASE={baselineSha256:'3a0d5bb8c006c2589837c9171dcf522bbab65553bfd9ecdcd5ecc96dc15a9876',financialSha256:'a2876950c8c101092087fcb597abf5b53ceef8a855c0c31826591bee2b6970a2',policySha256:'d6998cc7c70205938b1cf97e5b3e40ab90346d3a91f5f5a3e5ae0c0d4ee3509c',epoch:'239',xmin:'250387',height:4556142,hash:'0000170aee4534cf25aef8f9b1169c498a354fe3850089dea802c898b163b7c9',generation:'13d3e6eb-ecfe-4159-8cde-b5d9ed00151e',systemIdentifier:'7701863382450487342'} as const;
export type CurrentChefApproval=Extract<ChefLinkedCoverageAuthority,{version:4}>&{profileSha256:string;persistedSha256:string;baselineState:{path:string;sha256:string};legacyJournal:{path:string;sha256:string};verifiedAt:string;expiresAt:string;maxGap:5000;publicCommit:string};
export const rawSha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function validateCurrentChefApproval(a:CurrentChefApproval,now=Date.now()){
 const c=CLOSED_NATIVE_CASE;
 need(a.version===4&&a.status==='ROOT_CHEF_CURRENT_POLICY_CLOSED_CATCHUP'&&a.metadataOnly===true&&a.noFinance===true&&a.maxGap===5000,'PURPOSE');
 need(a.baselineState.sha256===c.baselineSha256&&a.baselineState.path==='/opt/zeeswap-testnet/state/service-policy/reconcile239-20261030-r1/baseline.private.json','BASELINE_PIN');
 need(a.control.epoch===c.epoch&&a.control.xmin===c.xmin&&!a.control.accepting_orders&&!a.control.dispatch_enabled&&a.control.reconciliation_required,'CONTROL');
 need(a.identity.project==='zeeswap_shadow_app_20261023'&&a.identity.generation===c.generation&&a.identity.policy.maxBlocks===1000&&a.identity.policy.network==='zcash-testnet','IDENTITY');
 need(a.baseline.cursor.value.processedThrough===c.height&&a.baseline.cursor.value.tipHash===c.hash&&a.baseline.checkpoint.scanned_height===String(c.height)&&a.baseline.checkpoint.tip_hash===c.hash,'CURSOR_CHECKPOINT');
 need(/^[a-f0-9]{40}$/.test(a.publicCommit)&&/^[a-f0-9]{64}$/.test(a.profileSha256)&&/^[a-f0-9]{64}$/.test(a.persistedSha256),'CODE_PROFILE_PIN');
 const start=Date.parse(a.verifiedAt),end=Date.parse(a.expiresAt);need(Number.isFinite(start)&&start<=now+5000&&end>now&&end>start&&end-start<=3600000,'APPROVAL_TIME');
}
export function validateCurrentChefBooks(s:SuccessorState,baseline:SuccessorState){
 const c=CLOSED_NATIVE_CASE;need(stable(s)===stable(baseline),'CLOSED_STATE_CHANGED');
 need(s.control.epoch===c.epoch&&s.control.xmin===c.xmin&&!s.control.accepting_orders&&!s.control.dispatch_enabled&&s.control.reconciliation_required&&!s.workerLease&&!s.globalBusy&&s.authorizationRows===0,'CLOSED_CONTROL');
 need(continuationDigest(Object.fromEntries(continuationTables.map(t=>[t,s.snapshot[t]])))===c.financialSha256,'LEGACY_FINANCIAL_BASELINE');
 need(s.snapshot.root_testnet_service_policies!.length===2&&s.predecessors.length===1&&s.snapshot.testnet_service_runtime!.length===2,'POLICY_LINEAGE');
 const admissions=s.snapshot.testnet_policy_admissions!,quotes=s.snapshot.testnet_policy_quotes!;need(admissions.length===1&&quotes.length===1,'CARRIED_ATTEMPTS');
 const member=admissions[0],order=s.snapshot.orders!.find(r=>r.id===member.order_id),quote=s.snapshot.quotes!.find(r=>r.id===member.order_id);
 need(order?.state==='EXPIRED_UNFUNDED'&&order.primary_deposit===null&&quote&&quote.deposit_reference_hash&&!s.snapshot.deposits!.some(r=>r.order_id===order.id||r.reference_hash===quote.deposit_reference_hash),'NO_POLICY_FUNDS');
 need(s.snapshot.root_testnet_service_policies!.some(r=>decodePgJsonbBytea(r.policy_sha256,32).toString('hex')===c.policySha256),'CURRENT_POLICY_RETAINED');
}
export function requireCurrentChefTarget(a:CurrentChefApproval,target:Header){need(Number.isSafeInteger(target.height)&&target.height>a.baseline.cursor.value.processedThrough&&target.height-a.baseline.cursor.value.processedThrough<=a.maxGap,'FINITE_GAP_BOUND');}
export function validateCurrentChefCandidate(a:CurrentChefApproval,snapshot:{scannedHeight:number;tipHash:string;observedAt:string;outputs:unknown[]},cursor:any,after:ChefLinkedCheckpoint){
 need(snapshot.outputs.length===0&&snapshot.scannedHeight>a.baseline.cursor.value.processedThrough&&snapshot.scannedHeight-a.baseline.cursor.value.processedThrough<=a.maxGap,'NO_FINANCIAL_CANDIDATE');
 need(cursor.version===1&&cursor.identityDigest===a.baseline.cursor.value.identityDigest&&cursor.processedThrough===snapshot.scannedHeight&&cursor.tipHash===snapshot.tipHash,'CANDIDATE_CURSOR');
 need(after.scanned_height===String(snapshot.scannedHeight)&&after.tip_hash===snapshot.tipHash&&after.finalized_height===String(snapshot.scannedHeight-9)&&after.observed_at===new Date(snapshot.observedAt).toISOString(),'CANDIDATE_CHECKPOINT');
}
