/** Error messages from RPC/SQL/SDK commands can contain secrets. Persist only
 * static uppercase codes and source locations, never arbitrary message text.
 */
export function g5Diagnostic(error:unknown,step:string,phase:string){
 const value=error as any;
 const code=typeof value?.message==='string'&&/^[A-Z][A-Z0-9_]{0,119}$/.test(value.message)?value.message:'PRIVATE_DIAGNOSTIC_ERROR';
 const exceptionClass=error instanceof TypeError?'TypeError':error instanceof SyntaxError?'SyntaxError':error instanceof RangeError?'RangeError':error instanceof Error?'Error':'Unknown';
 const frames=typeof value?.stack==='string'?value.stack.split('\n').slice(1).flatMap((line:string)=>{
  const match=line.match(/([A-Za-z0-9_-]+\.(?:ts|js)):(\d+):(\d+)/);return match?[{file:match[1],line:Number(match[2]),column:Number(match[3])}]:[];
 }).slice(0,12):[];
 const observerFrontier=observerFrontierDiagnostic(value?.diagnostic);
 return {version:1,observedAt:new Date().toISOString(),step,phase,code,exceptionClass,
  ...(typeof value?.code==='string'&&/^[A-Z0-9]{5}$/.test(value.code)?{sqlState:value.code}:{}),frames,
  ...(observerFrontier?{observerFrontier}:{})};
}

/** Keep only public observer headers from known internal producers. Arbitrary
 * source strings, object keys, error messages and URLs never cross this boundary.
 */
export function observerFrontierDiagnostic(value:unknown){
 const v=value as any;
 const sources=['source-wallet-snapshot','base-head','reverse-observer-refresh','base-escrow-receipt','base-forward-receipt','base-local-head','reverse-payout-receipt','forward-refund-receipt'];
 const waits=['HEAD_BEHIND','FINALITY_BEHIND','OLDER_OBSERVATION','SCANNER_FINALITY_PENDING'];
 const conflicts=['TIP_HASH_CHANGED','CANONICAL_HASH_CHANGED'];
 if(!v||v.event!=='observer-frontier'||!sources.includes(v.source)||!['zcash-testnet','base-sepolia'].includes(v.network)
  ||!(v.status==='WAIT'&&waits.includes(v.reason)||v.status==='CONFLICT'&&conflicts.includes(v.reason)))return undefined;
 const integer=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const header=(h:any)=>{
  if(h===null)return null;
  if(!h||!integer(h.height)||typeof h.hash!=='string'||!/^[0-9a-f]{64}$/.test(h.hash))return undefined;
  if(h.finalizedHeight!==undefined&&!integer(h.finalizedHeight))return undefined;
  if(h.observedAt!==undefined&&(typeof h.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(h.observedAt)||!Number.isFinite(Date.parse(h.observedAt))))return undefined;
  return {height:h.height,hash:h.hash,...(h.finalizedHeight!==undefined?{finalizedHeight:h.finalizedHeight}:{}),...(h.observedAt!==undefined?{observedAt:h.observedAt}:{})};
 };
 const previous=header(v.previous);
 const incoming=v.reason==='SCANNER_FINALITY_PENDING'
  ?integer(v.incoming?.receiptHeight)&&integer(v.incoming?.requiredScannedHeight)?{receiptHeight:v.incoming.receiptHeight,requiredScannedHeight:v.incoming.requiredScannedHeight}:undefined
  :header(v.incoming);
 if(previous===undefined||incoming===undefined)return undefined;
 return {event:'observer-frontier' as const,source:v.source,status:v.status,reason:v.reason,network:v.network,previous,incoming};
}
