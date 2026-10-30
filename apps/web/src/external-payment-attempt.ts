/** Read-only compatibility for previous external-wallet requests. Never clear
 * these records: an unknown result may already have submitted a transaction. */
export type ExternalPaymentAttempt={state:'unknown'}|{state:'submitted';txid:string};
export const externalPaymentAttemptStorage={getItem:(key:string)=>window.localStorage.getItem(key)};
export function readExternalPaymentAttempt(storage:Pick<Storage,'getItem'>,id:string):ExternalPaymentAttempt|null {
  try {
    // Historical key retained solely to read existing records; no writer remains.
    const raw=storage.getItem(`zeeswap.noir-send.v1.${id}`);
    if(raw===null)return null;
    const value:unknown=JSON.parse(raw);
    if(value!==null&&typeof value==='object'&&!Array.isArray(value)&&'state'in value&&value.state==='submitted'&&'txid'in value&&typeof value.txid==='string'&&/^[a-f0-9]{64}$/.test(value.txid))return {state:'submitted',txid:value.txid};
    return {state:'unknown'};
  }catch{return {state:'unknown'};}
}
