/** One Root-approved post-refund session; no administrative credential or signer. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {accessHash} from './private-data.ts';
import {validateContinuationApproval,type ContinuationApproval} from './native-circle-continuation.ts';
export type ContinuationApi={approval:ContinuationApproval;sha256:string;recheck():Promise<void>};
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CONTINUATION_API_'+c);}
export function assertContinuationOwner(p:ContinuationApproval,token:string,direction:string){
 need(direction==='ZCASH_TO_BASE'||direction==='BASE_TO_ZCASH','DIRECTION');
 need(accessHash(token).toString('hex')===p.ownerHashes[direction],'OWNER');
}
export function assertContinuationQuote(p:ContinuationApproval,token:string,q:{direction:string;inputAmount:string;recipient:string;refundRecipient:string;payer?:string}){
 assertContinuationOwner(p,token,q.direction);need(q.inputAmount==='100000','AMOUNT');
 const base=(v:unknown)=>typeof v==='string'&&v.toLowerCase()===p.actors.basePayer.toLowerCase();
 need(q.direction==='ZCASH_TO_BASE'?base(q.recipient)&&q.refundRecipient===p.actors.nativePayerReceiver&&q.payer===undefined:
  q.recipient===p.actors.nativePayerReceiver&&base(q.refundRecipient)&&base(q.payer),'ACTORS');
}
export async function loadContinuationApi(env:NodeJS.ProcessEnv,scope:{profileSha256:string;handoffSha256:string;openingProofSha256:string},active:()=>Promise<void>):Promise<ContinuationApi|undefined>{
 const path=env.ZEESWAP_CIRCLE_CONTINUATION_PROOF,pin=env.ZEESWAP_CIRCLE_CONTINUATION_SHA256;
 if(path===undefined&&pin===undefined)return undefined;
 need(path&&/^\/opt\/zeeswap-testnet\/state\/continuation\/[a-zA-Z0-9._-]+\.private\.json$/.test(path)&&pin&&/^[a-f0-9]{64}$/.test(pin),'EXPLICIT_ROOT_SELECTORS');
 async function load(){const directory=dirname(path!),d=await lstat(directory);need(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===0&&d.gid===978&&(d.mode&0o777)===0o750&&await realpath(directory)===directory,'ROOT_SERVICE_AUTHORITY_DIRECTORY');const s=await lstat(path!);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===978&&(s.mode&0o777)===0o640&&s.size<=262144&&await realpath(path!)===path,'ROOT_SERVICE_READ_ONLY_AUTHORITY');const b=await readFile(path!);need(createHash('sha256').update(b).digest('hex')===pin,'AUTHORITY_CHANGED');const p:unknown=JSON.parse(b.toString());validateContinuationApproval(p);for(const k of ['profileSha256','handoffSha256','openingProofSha256'] as const)need(p[k]===scope[k],'R9_BINDING');return p;}
 const approval=await load();return{approval,sha256:pin,recheck:async()=>{await load();await active();}};
}
