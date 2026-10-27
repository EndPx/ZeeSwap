/** Current source qualification only. No SQL mutation, authority minting or timestamp renewal. */
import {chefPersistedCanonical} from './integrations/observation/chef-live.ts';
import type {CanonicalReader} from './integrations/observation/chef.ts';
import {readJson,safeEndpoint} from './integrations/observation/chef.ts';
import {digest,object,parseHeader,requireThat,stable,type Header,type Policy} from './integrations/observation/types.ts';
import {EVENT_FIRST_MAX_EXPORT_BLOCKS,validateEventFirstState,verifyEventFirstExport,type EventFirstReader} from './integrations/observation/envio-event-first.ts';
import {validateTip5744Approval,validateTip5744Intent,type Tip5744Approval,type Tip5744Intent} from './app-chef-5744-tip-repair.ts';
import {validateEmptyTailApproval,validateEmptyTailIntent,type EmptyTailApproval,type EmptyTailIntent} from './app-chef-empty-tail-repair.ts';

export const SERVICE_EVENT_FIRST_WINDOW_METHODS=16;
export function requireServiceWindowRpcBudget(methods:number){requireThat(Number.isSafeInteger(methods)&&methods>=0&&methods<=SERVICE_EVENT_FIRST_WINDOW_METHODS,'SERVICE_WINDOW_CYCLE_OR_RPC_BUDGET');}
export function serviceWindowRpcFetch(request:typeof fetch,metrics:{requests:number;methods:number}):typeof fetch{return(input,init)=>{const body=JSON.parse(String(init?.body)),count=Array.isArray(body)?body.length:1;requireThat(count>=1&&count<=10,'SERVICE_WINDOW_RPC_BATCH');requireServiceWindowRpcBudget(metrics.methods+count);metrics.requests++;metrics.methods+=count;return request(input,init);};}

/** At most two dense phases, each retaining the original <10,000 span guard. */
export async function serviceNativeDenseCanonical(heights:number[],factory:(range?:{fromHeight:number;throughHeight:number})=>CanonicalReader,sourceId:string,signal:AbortSignal,fence:'sampled-head'|'persisted-range'='sampled-head'){
 requireThat(heights.length>0&&heights.length<=10004&&heights.every(h=>Number.isSafeInteger(h)&&h>=0),'SERVICE_NATIVE_AUDIT_BOUND');
 const min=Math.min(...heights),max=Math.max(...heights),boundary=Math.min(max,min+9999);
 requireThat(max-boundary<10000,'SERVICE_NATIVE_TWO_PHASE_BOUND');
 const phases=[{fromHeight:min,throughHeight:boundary},...(boundary<max?[{fromHeight:boundary,throughHeight:max}]:[])],wanted=new Set([...heights,boundary]),headers=new Map<number,Header>(),samples:Header[]=[];
 for(const phase of phases){signal.throwIfAborted();const sample=await factory().sample(signal);requireThat(sample.sourceId===sourceId,'SERVICE_NATIVE_CANONICAL_SOURCE');samples.push(parseHeader(sample.head,'zcash-testnet'));
  const reader=chefPersistedCanonical(range=>factory(range),fence),part=[...wanted].filter(h=>h>=phase.fromHeight&&h<=phase.throughHeight);
  await reader.prefetchPersisted([...new Set([...part,phase.fromHeight,phase.throughHeight])],signal);
  for(const h of part){const actual=parseHeader(await reader.header(h,signal),'zcash-testnet'),previous=headers.get(h);requireThat(actual.height===h&&(!previous||stable(previous)===stable(actual)),'SERVICE_NATIVE_PHASE_OVERLAP_FORK');headers.set(h,actual);}
  if(fence==='persisted-range'){requireThat(sample.head.height>=max,'SERVICE_NATIVE_SOURCE_BEHIND');requireThat(stable(await factory().header(phase.throughHeight,signal))===stable(headers.get(phase.throughHeight)),'SERVICE_NATIVE_PERSISTED_RANGE_CHANGED');}else requireThat(stable(await factory().header(sample.head.height,signal))===stable(sample.head),'SERVICE_NATIVE_HEAD_CHANGED');
 }
 const overlap=headers.get(boundary)!;requireThat(stable(await factory().header(boundary,signal))===stable(overlap),'SERVICE_NATIVE_FRESH_BOUNDARY_FORK');
 if(fence==='persisted-range'){for(const phase of phases)requireThat(stable(await factory().header(phase.throughHeight,signal))===stable(headers.get(phase.throughHeight)),'SERVICE_NATIVE_PERSISTED_RANGE_CHANGED');}else for(const head of samples)requireThat(stable(await factory().header(head.height,signal))===stable(head),'SERVICE_NATIVE_HEAD_CHANGED');
 signal.throwIfAborted();requireThat(heights.every(h=>headers.has(h)),'SERVICE_NATIVE_MISSING_ROW');return{headers,phases,overlap,verifiedDenseHeaders:phases.reduce((n,p)=>n+p.throughHeight-p.fromHeight+1,0)};
}

/** The status clock is validated, then the actual H..H export is independently verified. */
export async function readServiceEventFirstSelection(url:string,token:string,policy:Policy,generation:string,reader:EventFirstReader,signal:AbortSignal,request:typeof fetch=fetch){
 const base=safeEndpoint(url),headers={authorization:'Bearer '+token};signal.throwIfAborted();
 const response=await request(new URL('/zee-observation/event-first/status',base),{headers,redirect:'error',signal});requireThat(response.ok,'SERVICE_EVENT_FIRST_STATUS_HTTP');
 const status=object(await readJson(response,signal,8_000_000),['protocol','maxExportBlocks','state']);requireThat(status.protocol==='zee-envio-event-first-status-v1'&&status.maxExportBlocks===EVENT_FIRST_MAX_EXPORT_BLOCKS,'SERVICE_EVENT_FIRST_STATUS');
 const state=validateEventFirstState(status.state,policy,generation),H=state.progress.height,u=new URL('/zee-observation/event-first/export',base);u.searchParams.set('from',String(H));u.searchParams.set('through',String(H));
 const raw=await request(u,{headers,redirect:'error',signal});requireThat(raw.ok,'SERVICE_EVENT_FIRST_EXPORT_HTTP');
 const selection=await verifyEventFirstExport(await readJson(raw,signal,8_000_000),policy,reader,signal);
 requireThat(selection.producer.generation===generation&&selection.range.fromHeight===H&&selection.range.through.height===H&&selection.range.headers.length===1,'SERVICE_EVENT_FIRST_SELECTED_RANGE');
 const M=selection.producer.through,actual=await reader.header(M.height,signal);requireThat(stable(actual)===stable(M),'SERVICE_EVENT_FIRST_PRODUCER_CHANGED');signal.throwIfAborted();
 return{selection,producerCanonical:{sourceId:reader.sourceId,height:actual.height,hash:actual.hash,checkedAt:new Date().toISOString()}};
}

/** Completed metadata is archival evidence, checked at original approval issuance. */
export function validateServiceMetadataReceipt(kind:'nativeMetadata'|'baseMetadata',receipt:any,intent:any,approval:any,approvalSha256:string){
 requireThat(receipt?.version===1&&receipt.financialAction===false&&receipt.approvalSha256===approvalSha256&&intent?.approvalSha256===approvalSha256,'SERVICE_METADATA_BINDING');
 if(kind==='baseMetadata'){requireThat(receipt.status==='ENVIO_CLOSED_METADATA_COMMITTED_EXACT'&&receipt.intentDigest===digest(intent),'SERVICE_BASE_METADATA_INTENT');return;}
 requireThat(receipt.afterDigest===digest(intent.after)&&receipt.transactionId===intent.transactionId,'SERVICE_NATIVE_METADATA_INTENT');
 if(receipt.status==='CLOSED_HISTORY_CHEF_SINGLE_TIP_COMMITTED_EXACT')return;
 requireThat(['CLOSED_HISTORY_CHEF_5744_TIP_COMMITTED_EXACT','CLOSED_EMPTY_NATIVE_TAIL_COMMITTED_EXACT'].includes(receipt.status),'SERVICE_NATIVE_METADATA_STATUS');
 const a=approval as Tip5744Approval|EmptyTailApproval,i=intent as Tip5744Intent|EmptyTailIntent,context={profileSha256:a.profileSha256,handoffSha256:a.handoffSha256,openingProofSha256:a.openingProofSha256,financialDigest:a.financialDigest,sourceIdentity:a.sourceIdentity,control:a.control};
 if(receipt.status==='CLOSED_HISTORY_CHEF_5744_TIP_COMMITTED_EXACT'){validateTip5744Approval(a as Tip5744Approval,context,Date.parse(a.verifiedAt));validateTip5744Intent(i as Tip5744Intent,a as Tip5744Approval,approvalSha256);}
 else{validateEmptyTailApproval(a as EmptyTailApproval,context,Date.parse(a.verifiedAt));validateEmptyTailIntent(i as EmptyTailIntent,a as EmptyTailApproval,approvalSha256);}
 requireThat(receipt.beforeDigest===digest(i.before)&&stable(receipt.control)===stable(i.after.control)&&receipt.financialDigest===a.financialDigest&&receipt.newCursorSha256===i.newCursorSha256&&receipt.observedAtPreserved===true&&receipt.finalizedPreserved===true,'SERVICE_NATIVE_METADATA_COMPLETION');
}
