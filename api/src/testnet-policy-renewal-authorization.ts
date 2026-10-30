/** Explicit human-approved 24-hour renewal; no quota, capital or admission reset. */
import {createHash} from 'node:crypto';
export const RENEWAL_PARENT_SHA='d6998cc7c70205938b1cf97e5b3e40ab90346d3a91f5f5a3e5ae0c0d4ee3509c';
export const RENEWAL_ANCESTOR_SHA='10f877f468032e3c54b748748825dab5e7fe17e5a50d2ec78710392222417dae';
export const RENEWAL_HUMAN_TEXT='Perpanjang 24 jam, kuota tetap';
export type PolicyRenewalAuthorization={version:1;purpose:'ROOT_RENEW_EXPIRED_POLICY_24H_SAME_QUOTA';authorizationId:string;humanApprovalText:typeof RENEWAL_HUMAN_TEXT;humanApprovalSha256:string;approvedAt:string;expiresAt:string;parentPolicySha256:typeof RENEWAL_PARENT_SHA;ancestorPolicySha256:typeof RENEWAL_ANCESTOR_SHA;parentActivationXid:'195922';reconciliationXid:'250387';control:{epoch:'239';xmin:'250387'};carry:{quotes:1;forward:1;reverse:0};remaining:{quotes:31;forward:1;reverse:2};renewalDurationSeconds:86400;metadataOnlyBaseCatchup:true;financialAction:false};
export function validatePolicyRenewalAuthorization(a:PolicyRenewalAuthorization,now=Date.now()){
 const need=(v:unknown,c:string)=>{if(!v)throw Error('POLICY_RENEWAL_AUTH_'+c);};
 need(a?.version===1&&a.purpose==='ROOT_RENEW_EXPIRED_POLICY_24H_SAME_QUOTA'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.authorizationId),'PURPOSE');
 need(a.humanApprovalText===RENEWAL_HUMAN_TEXT&&a.humanApprovalSha256===createHash('sha256').update(RENEWAL_HUMAN_TEXT).digest('hex'),'EXACT_HUMAN_APPROVAL');
 need(a.parentPolicySha256===RENEWAL_PARENT_SHA&&a.ancestorPolicySha256===RENEWAL_ANCESTOR_SHA&&a.parentActivationXid==='195922'&&a.reconciliationXid==='250387'&&a.control?.epoch==='239'&&a.control.xmin==='250387','EXACT_PARENT_CONTROL');
 need(a.carry?.quotes===1&&a.carry.forward===1&&a.carry.reverse===0&&a.remaining?.quotes===31&&a.remaining.forward===1&&a.remaining.reverse===2&&a.renewalDurationSeconds===86400&&a.metadataOnlyBaseCatchup===true&&a.financialAction===false,'SAME_QUOTA_METADATA_SCOPE');
 const start=Date.parse(a.approvedAt),end=Date.parse(a.expiresAt);need(Number.isFinite(start)&&Number.isFinite(end)&&start<=now+5000&&end>now&&end>start&&end-start<=1800000,'FINITE_ROOT_AUTHORITY');return a;
}
