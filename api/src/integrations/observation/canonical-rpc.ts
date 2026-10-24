import { safeEndpoint, readJson, type CanonicalReader, type CanonicalSample } from "./chef.ts";
import { height, hex, object, parseHeader, requireThat, type Header, type Policy } from "./types.ts";
import {setTimeout as delay}from'node:timers/promises';
export type CanonicalRpcDiagnostic={event:'canonical-rpc-failure';attempt:number;methodCount:number;httpStatus:number|null;retryAfterMs:number|null;willRetry:boolean};
/** Only bounded numeric metadata is logged. Header text, URLs and bodies stay private. */
export function canonicalRetryAfterMs(value:string|null,now=Date.now()):number|null{
 if(value===null)return null;let ms:number;
 if(/^[0-9]{1,10}$/.test(value))ms=Number(value)*1000;
 else if(/^[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value))ms=Date.parse(value)-now;
 else return null;
 return Number.isFinite(ms)?Math.max(0,Math.min(300000,Math.ceil(ms))):null;
}

/** Deliberately exposes only allowlisted read RPC methods, never a generic RPC passthrough. */
export function canonicalRpc(config: { url: string; authorization?: string; network: Policy["network"]; sourceId: string; consensusBranchId?: string; fetch?: typeof fetch; now?: () => number;headerBatchSize?:number;maxMethodsPerSecond?:number;diagnostic?:(value:CanonicalRpcDiagnostic)=>void }): CanonicalReader {
  const endpoint = safeEndpoint(config.url); const now = config.now ?? Date.now;
  const rate=config.maxMethodsPerSecond??0;requireThat(rate===0||Number.isSafeInteger(rate)&&rate>=1&&rate<=100,'CANONICAL_RATE_LIMIT');
  let nextMethodAt=0,permits=Promise.resolve();
  const pace=(count:number,signal:AbortSignal)=>{const permit=permits.then(async()=>{signal.throwIfAborted();const wait=Math.max(0,nextMethodAt-Date.now());if(wait)await delay(wait,undefined,{signal});nextMethodAt=Date.now()+Math.ceil(count*1000/rate);});permits=permit.catch(()=>{});return permit;};
  const request=async(body:unknown,signal:AbortSignal):Promise<Response>=>{
    for(let attempt=0;attempt<2;attempt++){
      if(rate)await pace(Array.isArray(body)?body.length:1,signal);
      try{const response=await(config.fetch??fetch)(endpoint,{method:'POST',signal,redirect:'error',headers:{'content-type':'application/json',...(config.authorization?{authorization:config.authorization}:{})},body:JSON.stringify(body)});
        if(!response.ok){const diagnostic:CanonicalRpcDiagnostic={event:'canonical-rpc-failure',attempt:attempt+1,methodCount:Array.isArray(body)?body.length:1,httpStatus:response.status,retryAfterMs:canonicalRetryAfterMs(response.headers.get('retry-after')),willRetry:attempt===0&&(response.status===429||response.status>=500)};try{if(config.diagnostic)config.diagnostic(diagnostic);else console.error(JSON.stringify(diagnostic));}catch{}}
        if(attempt===0&&(response.status===429||response.status>=500)){await response.body?.cancel();await delay(500,undefined,{signal});continue;}return response;
      }catch(error){if(attempt===1||signal.aborted)throw error;await delay(500,undefined,{signal});}
    }throw Error('CANONICAL_RPC_HTTP_ERROR');
  };
  const call = async (method: "eth_chainId" | "eth_getBlockByNumber" | "getblockchaininfo" | "getblockhash" | "getblockheader", params: unknown[], signal: AbortSignal): Promise<unknown> => {
    const response = await request({jsonrpc:'2.0',id:1,method,params},signal);
    requireThat(response.ok, "CANONICAL_RPC_HTTP_ERROR");
    const raw = await readJson(response, signal) as Record<string, unknown>;
    requireThat(raw && typeof raw === "object" && raw.id === 1 && (raw.error === null || raw.error === undefined) && raw.result !== undefined && raw.result !== null, "CANONICAL_RPC_ERROR"); return raw.result;
  };
  const parseEvmHeader = (value: unknown): Header => {
    const r = value as Record<string, unknown>;
    for (const field of ["number", "timestamp"]) requireThat(typeof r[field] === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(r[field] as string), "INVALID_RPC_QUANTITY");
    return parseHeader({ height: height(Number(BigInt(r.number as string))), hash: r.hash, parentHash: r.parentHash, time: new Date(height(Number(BigInt(r.timestamp as string))) * 1000).toISOString() }, config.network);
  };
  const evmHeader = async (tag: string, signal: AbortSignal): Promise<Header> => parseEvmHeader(await call("eth_getBlockByNumber", [tag, false], signal));
  const zcashHeader = async (h: number, signal: AbortSignal): Promise<Header> => {
    const hash = hex(await call("getblockhash", [h], signal), 32);
    const r = await call("getblockheader", [hash, true], signal) as Record<string, unknown>;
    requireThat(r.hash === hash && r.height === h, "CANONICAL_RPC_HEADER_MISMATCH");
    return parseHeader({ height: h, hash, parentHash: h === 0 ? "0".repeat(64) : r.previousblockhash, time: new Date(height(r.time) * 1000).toISOString() }, config.network);
  };
  const batchSize=config.headerBatchSize??50;requireThat(Number.isSafeInteger(batchSize)&&batchSize>=1&&batchSize<=50,'CANONICAL_BATCH_LIMIT');
  requireThat(!rate||batchSize<=rate,'CANONICAL_BATCH_EXCEEDS_RATE');
  return {
    headerBatchSize:batchSize,
    ...(config.network === 'eip155:84532' ? { async headers(heights: readonly number[], signal: AbortSignal): Promise<Header[]> {
      requireThat(heights.length > 0 && heights.length <= batchSize, 'CANONICAL_BATCH_LIMIT');
      const requests = heights.map((h,index) => ({jsonrpc:'2.0',id:index+1,method:'eth_getBlockByNumber',params:[`0x${height(h).toString(16)}`,false]}));
      const response = await request(requests,signal);
      requireThat(response.ok,'CANONICAL_RPC_HTTP_ERROR');
      const rows = await readJson(response,signal,8_000_000) as Array<{id:number;result?:unknown;error?:unknown}>;
      requireThat(Array.isArray(rows)&&rows.length===heights.length&&new Set(rows.map(row=>row.id)).size===rows.length,'CANONICAL_BATCH_RESPONSE');
      return heights.map((h,index) => {
        const row=rows.find(row=>row.id===index+1);
        requireThat(row&&row.error==null&&row.result!=null,'CANONICAL_RPC_ERROR');
        const header=parseEvmHeader(row.result);requireThat(header.height===h,'CANONICAL_RPC_HEADER_MISMATCH');return header;
      });
    }} : {}),
    async sample(signal): Promise<CanonicalSample> {
      if (config.network === "eip155:84532") {
        requireThat(await call("eth_chainId", [], signal) === "0x14a34", "WRONG_RPC_NETWORK");
        const head = await evmHeader("latest", signal), finalized = await evmHeader("finalized", signal);
        requireThat(finalized.height <= head.height, "FINALIZED_HEAD_REGRESSION");
        return { sourceId: config.sourceId, head, finalized, checkedAt: new Date(now()).toISOString() };
      }
      requireThat(config.network === "zcash-testnet" && typeof config.consensusBranchId === "string" && /^[0-9a-f]{8}$/.test(config.consensusBranchId), "CONSENSUS_BRANCH_REQUIRED");
      const state = await call("getblockchaininfo", [], signal) as Record<string, unknown>;
      requireThat(state.chain === "test" && (state.consensus as Record<string, unknown>)?.chaintip === config.consensusBranchId, "WRONG_RPC_NETWORK_OR_BRANCH");
      const head = await zcashHeader(height(state.blocks), signal);
      requireThat(head.hash === state.bestblockhash, "SOURCE_HEAD_CHANGED");
      return { sourceId: config.sourceId, head, checkedAt: new Date(now()).toISOString() };
    },
    async header(h, signal) { height(h); return config.network === "eip155:84532" ? evmHeader(`0x${h.toString(16)}`, signal) : zcashHeader(h, signal); },
  };
}
