/** Canonical enrichment only. Entity writes stay in Envio's batch/rollback. */
import { createEffect, S } from 'envio';
export type Header = { height: number; hash: string; parentHash: string; time: string };
function parse(value: unknown): Header {
  const row = value as Record<string, string>;
  const height = Number(BigInt(row.number!)), timestamp = Number(BigInt(row.timestamp!));
  if (!Number.isSafeInteger(height) || height < 0 || !Number.isSafeInteger(timestamp)
    || !/^0x[0-9a-f]{64}$/.test(row.hash!) || !/^0x[0-9a-f]{64}$/.test(row.parentHash!)) throw new Error('INVALID_RPC_HEADER');
  return { height, hash: row.hash!, parentHash: row.parentHash!, time: new Date(timestamp * 1000).toISOString() };
}
async function readHeadersOnce(number: number): Promise<{ header: Header; sourceHead: Header; sampledAt: string }> {
  const url = process.env.ZEESWAP_BASE_RPC_URL;
  if (!url || !/^https:\/\//.test(url)) throw new Error('HTTPS_BASE_RPC_REQUIRED');
  const response = await fetch(url, {method:'POST',headers:{'content-type':'application/json'},redirect:'error',
    signal:AbortSignal.timeout(5000),body:JSON.stringify([
      {jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},
      {jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:[`0x${number.toString(16)}`,false]},
      {jsonrpc:'2.0',id:3,method:'eth_getBlockByNumber',params:['latest',false]},
    ])});
  const rows = await response.json() as Array<{id:number;result?:unknown;error?:unknown}>;
  if(!response.ok || !Array.isArray(rows) || rows.length!==3 || rows.some(row=>row.error||row.result==null)
    || new Set(rows.map(row=>row.id)).size!==3) throw new Error('BASE_HEADER_RPC_ERROR');
  if(rows.find(row=>row.id===1)?.result!=='0x14a34') throw new Error('WRONG_BASE_NETWORK');
  const header=parse(rows.find(row=>row.id===2)?.result),sourceHead=parse(rows.find(row=>row.id===3)?.result);
  if(header.height!==number || sourceHead.height<number) throw new Error('BASE_HEADER_HEIGHT_MISMATCH');
  return {header,sourceHead,sampledAt:new Date().toISOString()};
}
export async function readHeaders(number: number): Promise<{ header: Header; sourceHead: Header; sampledAt: string }> {
  for(let attempt=0;attempt<3;attempt++) {
    try{return await readHeadersOnce(number);}
    catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
  throw new Error('BASE_HEADER_RPC_ERROR');
}

// Cache is disabled: a replay after reorg must re-read the canonical occurrence.
// This also routes preload calls through Envio's supported external-call API.
export const canonicalHeaders = createEffect({ name: 'ZeeSwapCanonicalHeadersV1', input: S.int32, output: S.string,
  cache: false, crossChain: false, rateLimit: { calls: 6, per: 'second' } },
  async ({ input }) => JSON.stringify(await readHeaders(input)));
