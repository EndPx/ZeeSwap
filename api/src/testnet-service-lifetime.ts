/** Separate Root service lifetime. Original financial policy and all quotas remain immutable. */
import {createHash} from 'node:crypto';
export type ServiceLifetimeAuthorization={version:1;purpose:'ROOT_TESTNET_SERVICE_NO_EXPIRY';authorizationId:string;policySha256:string;humanApprovalSha256:string;serviceExpiresAt:null;originalActivationXid:string;activeEpoch:string;controlXmin:string;profileSha256:string;settlementContract:string;tokenContract:string;originalExpiresAt:string;approvedAt:string;publishBefore:string;financialAction:false};
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
export function validateServiceLifetimeAuthorization(a:ServiceLifetimeAuthorization,now=Date.now()){
 const need=(v:unknown,c:string)=>{if(!v)throw Error('SERVICE_LIFETIME_'+c);};
 need(a?.version===1&&a.purpose==='ROOT_TESTNET_SERVICE_NO_EXPIRY'&&a.serviceExpiresAt===null&&a.financialAction===false,'PURPOSE');
 need(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.authorizationId)&&[a.policySha256,a.humanApprovalSha256,a.profileSha256].every(hash),'PINS');
 need([a.originalActivationXid,a.activeEpoch,a.controlXmin].every(n=>typeof n==='string'&&/^[1-9][0-9]*$/.test(n))&&BigInt(a.originalActivationXid)<=18446744073709551615n&&BigInt(a.activeEpoch)<=9223372036854775807n&&BigInt(a.controlXmin)<=4294967295n,'CONTROL');
 need([a.settlementContract,a.tokenContract].every(n=>/^0x[a-f0-9]{40}$/.test(n))&&Number.isFinite(Date.parse(a.originalExpiresAt)),'ORIGINAL_POLICY');
 const start=Date.parse(a.approvedAt),end=Date.parse(a.publishBefore);
 need(Number.isFinite(start)&&Number.isFinite(end)&&start<=now+5000&&end>now&&end>start&&end-start<=1800000,'FINITE_PUBLICATION_AUTHORITY');return a;
}
export function serviceLifetimeInsert(a:ServiceLifetimeAuthorization,raw:Buffer,now=Date.now()){
 validateServiceLifetimeAuthorization(a,now);
 if(JSON.stringify(JSON.parse(raw.toString('utf8')))!==JSON.stringify(a))throw Error('SERVICE_LIFETIME_RAW_BINDING');
 return {sql:`INSERT INTO zee.testnet_service_lifetime_authorizations(policy_sha256,authorization_id,authorization_sha256,human_approval_sha256,purpose,service_expires_at,original_activation_xid,active_epoch,control_xmin,profile_sha256,settlement_contract,token_contract,original_expires_at,root_approved_at,root_publish_before) VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,args:[Buffer.from(a.policySha256,'hex'),a.authorizationId,createHash('sha256').update(raw).digest(),Buffer.from(a.humanApprovalSha256,'hex'),a.purpose,a.originalActivationXid,a.activeEpoch,a.controlXmin,Buffer.from(a.profileSha256,'hex'),a.settlementContract,a.tokenContract,a.originalExpiresAt,a.approvedAt,a.publishBefore]};
}
