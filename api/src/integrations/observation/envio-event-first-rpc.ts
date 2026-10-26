import {setTimeout as delay} from 'node:timers/promises';
import {canonicalRpc} from './canonical-rpc.ts';
import {readJson,safeEndpoint} from './chef.ts';
import {height,requireThat} from './types.ts';
import {EVENT_FIRST_MAX_EXPORT_BLOCKS,type EventFirstReader} from './envio-event-first.ts';
/** One shared dispatch queue counts all header, sample, log and retried methods. */
export function eventFirstRpc(c:{url:string;sourceId:string;headerBatchSize:10;maxMethodsPerSecond:24;contract:string;fetch?:typeof fetch}):EventFirstReader{
 requireThat(c.url==='https://base-sepolia-rpc.publicnode.com'&&c.sourceId==='base-sepolia-publicnode-normal-rpc'&&c.headerBatchSize===10&&c.maxMethodsPerSecond===24&&/^0x[a-f0-9]{40}$/.test(c.contract),'EVENT_FIRST_RPC_EXPLICIT_SCOPE');
 const endpoint=safeEndpoint(c.url);let next=0,queue=Promise.resolve();
 const request:typeof fetch=async(input,init)=>{requireThat(String(input)===String(endpoint),'EVENT_FIRST_RPC_ENDPOINT');const body=JSON.parse(String(init?.body));const calls=Array.isArray(body)?body:[body];requireThat(calls.length>=1&&calls.length<=10&&calls.every(r=>['eth_chainId','eth_getBlockByNumber','eth_getLogs'].includes(r.method)),'EVENT_FIRST_RPC_METHOD');
  const signal=init?.signal??AbortSignal.timeout(30000);const permit=queue.then(async()=>{signal.throwIfAborted();const wait=Math.max(0,next-Date.now());if(wait)await delay(wait,undefined,{signal});next=Date.now()+Math.ceil(calls.length*1000/c.maxMethodsPerSecond);});queue=permit.catch(()=>{});await permit;return(c.fetch??fetch)(input,init);
 };
 const canonical=canonicalRpc({url:c.url,sourceId:c.sourceId,network:'eip155:84532',headerBatchSize:c.headerBatchSize,fetch:request});
 return{...canonical,sourceId:c.sourceId,async logs(from,through,signal){height(from);height(through);requireThat(through>=from&&through-from+1<=EVENT_FIRST_MAX_EXPORT_BLOCKS,'EVENT_FIRST_RANGE_BOUND');const response=await request(endpoint,{method:'POST',redirect:'error',signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getLogs',params:[{address:c.contract,fromBlock:'0x'+from.toString(16),toBlock:'0x'+through.toString(16)}]})});requireThat(response.ok,'EVENT_FIRST_LOG_HTTP');const raw=await readJson(response,signal,8_000_000) as any;requireThat(raw?.jsonrpc==='2.0'&&raw.id===1&&raw.error==null&&Array.isArray(raw.result)&&raw.result.length<=1000,'EVENT_FIRST_LOG_RESPONSE');return raw.result;}};
}
