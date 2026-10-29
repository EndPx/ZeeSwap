import { bech32m } from 'bech32';
import { fundingPaymentRequest } from './payment-uri.ts';
import type { OrderView } from './protocol.ts';

/** Narrow adapter for the official Noir injected Zcash provider. See
 * noir-wallet-sdk/src/chains/zcash/api.ts; no EVM provider or network switching. */
export interface NoirProvider {
  request(args:{method:string;params?:unknown[]}):Promise<unknown>;
  on?(event:string,listener:(value:unknown)=>void):void;
  removeListener?(event:string,listener:(value:unknown)=>void):void;
}
declare global {interface Window {noirwallet?:{isNoirWallet?:boolean;zcash?:NoirProvider};}}
export const NOIR_INSTALL='https://docs.zknoir.com/noir-sdk-integration/';
// Resolve browser storage inside each method so privacy-mode access failures are
// handled by the same fail-closed path as read/write failures.
export const noirStorage={getItem:(key:string)=>window.localStorage.getItem(key),setItem:(key:string,value:string)=>window.localStorage.setItem(key,value),removeItem:(key:string)=>window.localStorage.removeItem(key)};
export async function noirRequest(provider:NoirProvider,args:{method:string;params?:unknown[]},timeoutMs=120000):Promise<unknown>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([provider.request(args),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Noir request timed out.')),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
export function noirProvider():NoirProvider|null {
  const provider=window.noirwallet?.zcash;
  return window.noirwallet?.isNoirWallet===true&&typeof provider?.request==='function'?provider:null;
}
export function noirAccount(value:unknown):string|null {
  if(value===null)return null;
  const address=value&&typeof value==='object'&&'shielded'in value?value.shielded:undefined;
  if(typeof address!=='string'||!/^utest1[023456789acdefghjklmnpqrstuvwxyz]{30,506}$/.test(address))throw Error('Noir must use a shielded Zcash testnet unified address. Install the Testnet Noir build and unlock its account.');
  try {const decoded=bech32m.decode(address,512);if(decoded.prefix!=='utest'||decoded.words.length<30)throw Error();bech32m.fromWords(decoded.words);}
  catch {throw Error('Noir returned an invalid testnet address checksum.');}
  return address;
}
export function noirDeclined(error:unknown):boolean{return !!error&&typeof error==='object'&&'code'in error&&error.code===4001;}
export function noirConnectError(error:unknown):string {
  if(noirDeclined(error))return 'Noir connection declined. Connect again when you are ready.';
  if(error instanceof Error&&/testnet|checksum/.test(error.message))return error.message;
  return 'Noir is locked, disconnected or unavailable. Unlock its Testnet account and connect again.';
}
export type NoirAttempt={state:'unknown'}|{state:'submitted';txid:string};
const attemptKey=(id:string)=>`zeeswap.noir-send.v1.${id}`;
export function readNoirAttempt(storage:Pick<Storage,'getItem'>,id:string):NoirAttempt|null {
  try {const raw=storage.getItem(attemptKey(id));if(raw===null)return null;const value=JSON.parse(raw);if(value.state==='submitted'&&typeof value.txid==='string'&&/^[a-f0-9]{64}$/.test(value.txid))return {state:'submitted',txid:value.txid};return {state:'unknown'};}
  catch {return {state:'unknown'};}
}
function saveAttempt(storage:Pick<Storage,'setItem'|'getItem'>,id:string,value:NoirAttempt){const raw=JSON.stringify(value);storage.setItem(attemptKey(id),raw);if(storage.getItem(attemptKey(id))!==raw)throw Error('Private send protection is unavailable. Do not send through Noir from this browser.');}
export function noirPayment(order:OrderView,now=Date.now()){
  if(order.executionMode==='observe-only')throw Error('Noir payments are disabled for observation-only orders.');
  const request=fundingPaymentRequest(order,now);
  if(!request)throw Error('The original order is no longer awaiting a deposit. Refresh its status.');
  if(request.cutoffTime===null){
    // Only the authenticated service's freshly observed height can qualify a
    // height-only order. Never fabricate a time deadline or ask an unknown RPC.
    const h=order.source.scannedHeight,scanned=Date.parse(order.source.scannedAt??''),checked=Date.parse(order.source.checkedAt??'');
    if(!Number.isSafeInteger(now)||typeof h!=='number'||!Number.isSafeInteger(h)||h<=0||!Number.isFinite(scanned)||!Number.isFinite(checked)||now-scanned< -5000||now-scanned>30000||now-checked< -5000||now-checked>30000||scanned-checked>5000)throw Error('A fresh service-observed Zcash height is required. Refresh this original order before paying.');
    if(request.cutoffHeight===null||h>=request.cutoffHeight)throw Error('The funding height cutoff has been reached. Do not send to this order.');
  }
  return {to:request.receiver,amount:request.amount,memo:request.memo,fundingSource:'shielded' as const};
}
export interface NoirLocks {request(name:string,options:{mode:'exclusive';ifAvailable:true},callback:(lock:object|null)=>Promise<string>):Promise<string>;}
export async function payWithNoir(provider:NoirProvider,address:string,readOrder:()=>Promise<OrderView>,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,id:string,locks:NoirLocks|undefined=globalThis.navigator?.locks):Promise<string>{
  // Web Locks are shared by tabs on this origin. Acquire before the first read
  // and hold through wallet response and durable outcome, without queuing a send.
  if(!locks)throw Error('Exclusive Noir payment protection is unavailable in this browser. Use the original manual funding instructions and verify your wallet first.');
  return locks.request(`zeeswap.noir-pay.v1.${id}`,{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock)throw Error('This Noir payment is already open in another tab. Check the original wallet request; do not send again.');
    return payWithNoirLocked(provider,address,readOrder,storage,id);
  });
}
async function payWithNoirLocked(provider:NoirProvider,address:string,readOrder:()=>Promise<OrderView>,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,id:string):Promise<string>{
  if(readNoirAttempt(storage,id))throw Error('A Noir payment was already requested for this order. Reconcile the original transaction; do not send again.');
  const current=noirAccount(await noirRequest(provider,{method:'zcash_getAccounts'},4500));
  if(!current||current!==address)throw Error('The Noir account changed or locked. Reconnect before paying.');
  const order=await readOrder();if(order.id!==id)throw Error('The original order could not be verified.');
  if(noirAccount(await noirRequest(provider,{method:'zcash_getAccounts'},4500))!==address)throw Error('The Noir account changed or locked. Reconnect before paying.');
  const params=noirPayment(order);
  if(readNoirAttempt(storage,id))throw Error('A Noir payment was already requested. Reconcile the original transaction; do not send again.');
  // Persist before invoking the wallet. A crash, timeout or unknown rejection
  // after invocation must never permit a second blind send, including reloads.
  saveAttempt(storage,id,{state:'unknown'});
  let result:unknown;
  try {result=await noirRequest(provider,{method:'zcash_sendTransaction',params:[params]});}
  catch(error){if(noirDeclined(error)){storage.removeItem(attemptKey(id));throw Error('Noir payment declined. No approval was given; you may explicitly try again.');}throw Error('Noir payment result is unknown. Check the original wallet transaction and refresh this order. Do not send again.');}
  if(typeof result!=='string'||!/^[a-fA-F0-9]{64}$/.test(result))throw Error('Noir returned an unknown payment result. Check the original transaction; do not send again.');
  const txid=result.toLowerCase();saveAttempt(storage,id,{state:'submitted',txid});return txid;
}
