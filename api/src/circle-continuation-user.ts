import {createHash} from 'node:crypto';
import {accessHash} from './private-data.ts';
import {validateContinuationApproval,type ContinuationApproval} from './native-circle-continuation.ts';
const need=(v:unknown,c:string)=>{if(!v)throw Error('CIRCLE_CONTINUATION_'+c);};
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function bindCircleContinuation(approvalBytes:Buffer,approvalSha:string,parentBytes:Buffer,parentSha:string,owners:Record<string,string>,expiredParent?:{bytes:Buffer;sha256:string;journalAbsent:boolean}):ContinuationApproval{
 need(sha(approvalBytes)===approvalSha&&sha(parentBytes)===parentSha,'ORIGINAL_BYTES_CHANGED');
 const p:unknown=JSON.parse(approvalBytes.toString());validateContinuationApproval(p);
 const old=JSON.parse(parentBytes.toString());need(old.version===1&&old.profile==='native-one-circle-testnet'&&old.routes?.ZCASH_TO_BASE?.id===p.oldOrderId&&old.routes.ZCASH_TO_BASE.view?.status==='REFUNDED'&&!old.routes.BASE_TO_ZCASH&&Object.keys(old.evm??{}).length===0,'ORIGINAL_REFUNDED_SESSION_REQUIRED');
 if(p.version===2){
  need(parentSha===p.originalParentSha256&&expiredParent&&expiredParent.sha256===p.expiredParentSha256&&sha(expiredParent.bytes)===expiredParent.sha256&&expiredParent.journalAbsent===true,'EXPIRED_PARENT_BYTES_OR_JOURNAL');
  assertReplacementHarnessParents(p,old,JSON.parse(expiredParent!.bytes.toString()),expiredParent!.journalAbsent);
 }else need(expiredParent===undefined,'V1_HAS_NO_REPLACEMENT_PARENT');
 for(const direction of ['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const)need(typeof owners?.[direction]==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(owners[direction]!)&&accessHash(owners[direction]!).toString('hex')===p.ownerHashes[direction],'ROOT_OWNER_BINDING');
 return p;
}
export function assertReplacementHarnessParents(p:Extract<ContinuationApproval,{version:2}>,original:any,expired:any,journalAbsent:boolean){
 need(original?.version===1&&original.profile==='native-one-circle-testnet'&&original.routes?.ZCASH_TO_BASE?.id===p.oldOrderId&&original.routes.ZCASH_TO_BASE.view?.status==='REFUNDED'&&!original.routes.BASE_TO_ZCASH&&Object.keys(original.evm??{}).length===0,'ORIGINAL_REFUNDED_SESSION_REQUIRED');
 const route=expired?.routes?.ZCASH_TO_BASE;
 need(journalAbsent===true&&expired.version===1&&expired.profile==='native-one-circle-continuation-testnet'&&route?.id===p.expiredOrderId&&route.view?.status==='EXPIRED_UNFUNDED'&&route.view.source?.received===false&&route.view.source?.confirmed===false&&!route.nativeResult&&!route.nativeTxid&&!expired.routes.BASE_TO_ZCASH&&Object.keys(expired.evm??{}).length===0&&expired.binding?.continuationSha256===p.v1ApprovalSha256&&expired.binding?.parentStateSha256===p.originalParentSha256,'EXACT_UNFUNDED_EXPIRED_PARENT');
}
export function continuationHarnessNamespace(p?:ContinuationApproval){if(!p)return'circle';validateContinuationApproval(p);return p.version===2?'circle-continuation-r2':'circle-continuation';}
export const UNFUNDED_NATIVE_CONFIG_SHA256='31b29673acd0ec678c5185a8a724ac9a157a97c3e34a23d5c274c0c82c4137e0';
export function assertReplacementNativeJournalPaths(fresh:string,original:string,unfunded:string){
 const normalize=(p:string)=>{need(typeof p==='string'&&p.length>0&&!p.includes('\\'),'NATIVE_JOURNAL_PATH');return p.replace(/^([A-Za-z]):\//,(_m,d)=>'/mnt/'+d.toLowerCase()+'/');};
 const next=normalize(fresh),first=normalize(original),retired=normalize(unfunded);
 need(next!==first&&next!==retired,'REPLACEMENT_JOURNAL_REUSES_PARENT');
 const marker='/.deploy-local/live-testnet-20261023/',at=next.indexOf(marker),tail=at>=0?next.slice(at+marker.length):'';
 need(next.startsWith('/mnt/')&&at>=0&&first.includes(marker)&&next.slice(0,at+marker.length)===first.slice(0,first.indexOf(marker)+marker.length)&&!next.includes('/../')&&!next.includes('/./')&&['circle-continuation-r2-payer-send.private.json','continuation-session-20261025-r2/circle-continuation-payer-send.private.json','continuation-session-20261025-r2/circle-continuation-r2-payer-send.private.json'].includes(tail),'NEW_R2_PAYER_JOURNAL_NAMESPACE');
}
export function requireContinuationLead(cutoff:number,head:{height:number;checkedAt:string},now=Date.now()){
 need(Number.isSafeInteger(cutoff)&&Number.isSafeInteger(head.height)&&head.height>=0&&Number.isFinite(Date.parse(head.checkedAt))&&now-Date.parse(head.checkedAt)>=-5000&&now-Date.parse(head.checkedAt)<=60000,'FRESH_CANONICAL_HEAD');
 need(cutoff-head.height>=12,'MINIMUM_TWELVE_BLOCK_LEAD');return cutoff-head.height;
}
