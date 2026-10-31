import {boundedHttp,requireHttpResponse,type OrdinaryReadDiagnostic,type OrdinaryReadStage} from './bounded-http.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalRpc} from './canonical-rpc.ts';
import {readJson,safeEndpoint} from './chef.ts';
import {height,requireThat} from './types.ts';
import {EVENT_FIRST_MAX_EXPORT_BLOCKS,type EventFirstReader} from './envio-event-first.ts';
/** One shared dispatch queue counts all header, sample, log and retried methods. */
export function eventFirstRpc(c:{url:string;sourceId:string;sourceProofSourceId?:string;headerBatchSize:10;maxMethodsPerSecond:24;contract:string;fetch?:typeof fetch;batchSample?:true;logRangeLimit?:1000;ordinaryTransport?:{rpcAttemptMs:5000;maxResponseBytes:8000000;diagnostic?:(d:OrdinaryReadDiagnostic)=>void;stage?:()=>OrdinaryReadStage|undefined}}):EventFirstReader{
 const proofSourceId=c.sourceProofSourceId??c.sourceId,publicNode=c.url==='https://base-sepolia-rpc.publicnode.com'&&c.sourceId==='base-sepolia-publicnode-normal-rpc',official=c.url==='https://sepolia.base.org'&&c.sourceId==='base-sepolia-official-independent-rpc';
 requireThat((c.logRangeLimit===undefined||c.logRangeLimit===1000)&&(publicNode||official)&&proofSourceId==='base-sepolia-publicnode-normal-rpc'&&c.headerBatchSize===10&&c.maxMethodsPerSecond===24&&/^0x[a-f0-9]{40}$/.test(c.contract),'EVENT_FIRST_RPC_EXPLICIT_SCOPE');
 if(c.ordinaryTransport)requireThat(official&&c.ordinaryTransport.rpcAttemptMs===5000&&c.ordinaryTransport.maxResponseBytes===8000000,'ORDINARY_TRANSPORT_SCOPE');
 const endpoint=safeEndpoint(c.url);let next=0,queue=Promise.resolve();const window:{at:number;count:number}[]=[];
 const request:typeof fetch=async(input,init)=>{requireThat(String(input)===String(endpoint),'EVENT_FIRST_RPC_ENDPOINT');const body=JSON.parse(String(init?.body));const calls=Array.isArray(body)?body:[body];requireThat(calls.length>=1&&calls.length<=10&&calls.every(r=>['eth_chainId','eth_getBlockByNumber','eth_getLogs'].includes(r.method)),'EVENT_FIRST_RPC_METHOD');
  const signal=init?.signal??AbortSignal.timeout(30000);const permit=queue.then(async()=>{for(;;){signal.throwIfAborted();const now=Date.now();while(window.length&&now-window[0]!.at>=1000)window.shift();const used=window.reduce((n,r)=>n+r.count,0),wait=Math.max(0,next-now,used+calls.length>24?window[0]!.at+1001-now:0);if(wait){await delay(wait,undefined,{signal});continue;}window.push({at:now,count:calls.length});next=now+Math.ceil(calls.length*1000/c.maxMethodsPerSecond);break;}});queue=permit.catch(()=>{});await permit;return c.ordinaryTransport?boundedHttp(c.fetch??fetch,input,init??{},{timeoutMs:c.ordinaryTransport.rpcAttemptMs,maxBytes:c.ordinaryTransport.maxResponseBytes,stage:c.ordinaryTransport.stage?.()??(calls.every(r=>r.method==='eth_getLogs')?'independent-logs':calls.some(r=>r.method==='eth_chainId'||['latest','finalized'].includes(r.params?.[0]))?'finality-anchors':'independent-headers'),methodCount:calls.length,diagnostic:c.ordinaryTransport.diagnostic}):(c.fetch??fetch)(input,init);
 };
 const canonical=canonicalRpc({url:c.url,sourceId:c.sourceId,network:'eip155:84532',headerBatchSize:c.headerBatchSize,fetch:request,batchEvmSample:c.batchSample});
 return{...canonical,sourceId:c.sourceId,sourceProofSourceId:proofSourceId,async logs(from,through,signal){
  height(from);height(through);requireThat(through>=from&&through-from+1<=(c.logRangeLimit??EVENT_FIRST_MAX_EXPORT_BLOCKS),'EVENT_FIRST_RANGE_BOUND');
  const width=c.logRangeLimit===1000?200:EVENT_FIRST_MAX_EXPORT_BLOCKS,calls=[];
  for(let first=from;first<=through;first+=width)calls.push({jsonrpc:'2.0',id:calls.length+1,method:'eth_getLogs',params:[{address:c.contract,fromBlock:'0x'+first.toString(16),toBlock:'0x'+Math.min(through,first+width-1).toString(16)}]});
  const response=await request(endpoint,{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json'},body:JSON.stringify(calls.length===1?calls[0]:calls)});requireHttpResponse(response,'EVENT_FIRST_LOG_HTTP');
  const raw=await readJson(response,signal,8_000_000)as any,replies=calls.length===1?[raw]:raw;
  requireThat(Array.isArray(replies)&&replies.length===calls.length&&replies.every(r=>r?.jsonrpc==='2.0'&&Number.isInteger(r.id)&&r.id>=1&&r.id<=calls.length&&r.error==null&&Array.isArray(r.result)&&r.result.length<=1000),'EVENT_FIRST_LOG_RESPONSE');
  const byId=new Map(replies.map(r=>[r.id,r]));requireThat(byId.size===calls.length,'EVENT_FIRST_LOG_RESPONSE');const logs:unknown[]=[];
  for(const call of calls){const reply=byId.get(call.id)as any;requireThat(reply,'EVENT_FIRST_LOG_RESPONSE');logs.push(...reply.result);requireThat(logs.length<=1000,'EVENT_FIRST_LOG_RESPONSE');}
  return logs;
 }};
}
