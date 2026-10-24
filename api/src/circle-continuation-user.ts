import {createHash} from 'node:crypto';
import {accessHash} from './private-data.ts';
import {validateContinuationApproval,type ContinuationApproval} from './native-circle-continuation.ts';
const need=(v:unknown,c:string)=>{if(!v)throw Error('CIRCLE_CONTINUATION_'+c);};
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function bindCircleContinuation(approvalBytes:Buffer,approvalSha:string,parentBytes:Buffer,parentSha:string,owners:Record<string,string>):ContinuationApproval{
 need(sha(approvalBytes)===approvalSha&&sha(parentBytes)===parentSha,'ORIGINAL_BYTES_CHANGED');
 const p:unknown=JSON.parse(approvalBytes.toString());validateContinuationApproval(p);
 const old=JSON.parse(parentBytes.toString());need(old.version===1&&old.profile==='native-one-circle-testnet'&&old.routes?.ZCASH_TO_BASE?.id===p.oldOrderId&&old.routes.ZCASH_TO_BASE.view?.status==='REFUNDED'&&!old.routes.BASE_TO_ZCASH&&Object.keys(old.evm??{}).length===0,'ORIGINAL_REFUNDED_SESSION_REQUIRED');
 for(const direction of ['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const)need(typeof owners?.[direction]==='string'&&/^[a-zA-Z0-9_-]{43}$/.test(owners[direction]!)&&accessHash(owners[direction]!).toString('hex')===p.ownerHashes[direction],'ROOT_OWNER_BINDING');
 return p;
}
export function requireContinuationLead(cutoff:number,head:{height:number;checkedAt:string},now=Date.now()){
 need(Number.isSafeInteger(cutoff)&&Number.isSafeInteger(head.height)&&head.height>=0&&Number.isFinite(Date.parse(head.checkedAt))&&now-Date.parse(head.checkedAt)>=-5000&&now-Date.parse(head.checkedAt)<=60000,'FRESH_CANONICAL_HEAD');
 need(cutoff-head.height>=12,'MINIMUM_TWELVE_BLOCK_LEAD');return cutoff-head.height;
}
