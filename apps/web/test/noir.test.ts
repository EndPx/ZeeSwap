import assert from 'node:assert/strict';
import test from 'node:test';
import { bech32m } from 'bech32';
import { noirAccount, noirPayment, payWithNoir, readNoirAttempt, type NoirProvider, type NoirLocks } from '../src/noir.ts';
import type { OrderView } from '../src/protocol.ts';
const address=bech32m.encode('utest',bech32m.toWords(new Uint8Array(64).fill(7)),512);
const txid='a'.repeat(64),id='22222222-2222-4222-8222-222222222222';
const testLocks:NoirLocks={request:async(_name,_options,callback)=>callback({})};
function storage(){const rows=new Map<string,string>();return {getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{rows.set(key,value);},removeItem:(key:string)=>{rows.delete(key);}};}
function order():OrderView{return {id,direction:'ZCASH_TO_BASE',status:'AWAITING_FUNDS',inputAmount:'100001',outputAmount:'100001',executionMode:'base-settlement-v1',priceMode:'fixture',integrationOnly:true,expiresAt:new Date(0).toISOString(),source:{received:false,confirmed:false,confirmations:0,policy:'zcash-10-confirmations',requiredConfirmations:10},funding:{network:'zcash-testnet',receiver:address,memo:'{"v":1,"ref":"11111111-1111-4111-8111-111111111111"}',cutoffHeight:5000000,cutoffTime:new Date(Date.now()+120000).toISOString(),cancellationAvailableAt:null}};}
test('Noir account only accepts the testnet unified checksum, never mainnet or transparent fallback',()=>{
 assert.equal(noirAccount({shielded:address,transparent:'tmock'}),address);assert.equal(noirAccount(null),null);
 for(const value of [{shielded:bech32m.encode('u',bech32m.toWords(new Uint8Array(64).fill(7)),512)},{shielded:address.slice(0,-1)+'q'},{shielded:'',transparent:'tmock'},{},[]])assert.throws(()=>noirAccount(value));
});
test('Noir sends exact canonical terms from latest accepted order using shielded funding only',async()=>{
 const store=storage(),calls:{method:string;params?:unknown[]}[]=[],o=order();
 const provider:NoirProvider={request:async args=>{calls.push(args);if(args.method==='zcash_getAccounts')return {shielded:address};assert.equal(readNoirAttempt(store,id)?.state,'unknown');return txid;}};
 assert.equal(await payWithNoir(provider,address,async()=>o,store,id,testLocks),txid);
 assert.deepEqual(calls.at(-1),{method:'zcash_sendTransaction',params:[{to:address,amount:'0.00100001',memo:o.funding!.memo,fundingSource:'shielded'}]});
 assert.deepEqual(readNoirAttempt(store,id),{state:'submitted',txid});
 await assert.rejects(payWithNoir(provider,address,async()=>o,store,id,testLocks),/already requested/);assert.equal(calls.filter(c=>c.method==='zcash_sendTransaction').length,1);
});
test('only user rejection permits explicit retry; unknown error and malformed hash survive reload',async()=>{
 for(const failure of [{code:4001},new Error('transport lost'),'bad-hash']){
  const store=storage();let sends=0;const provider:NoirProvider={request:async({method})=>{if(method==='zcash_getAccounts')return {shielded:address};sends++;if(typeof failure==='string')return failure;throw failure;}};
  await assert.rejects(payWithNoir(provider,address,async()=>order(),store,id,testLocks));
  if('code'in Object(failure)){assert.equal(readNoirAttempt(store,id),null);await assert.rejects(payWithNoir(provider,address,async()=>order(),store,id,testLocks));assert.equal(sends,2);}
  else{assert.deepEqual(readNoirAttempt(store,id),{state:'unknown'});await assert.rejects(payWithNoir(provider,address,async()=>order(),store,id,testLocks),/already requested/);assert.equal(sends,1);}
 }
});
test('Noir blocks stale order, cutoff, observe-only, changed account and unavailable storage before sending',async()=>{
 for(const change of [(o:OrderView)=>{o.status='CONFIRMING';},(o:OrderView)=>{o.source.received=true;},(o:OrderView)=>{o.executionMode='observe-only';},(o:OrderView)=>{o.funding!.cutoffTime=null;},(o:OrderView)=>{o.funding!.cutoffTime=new Date(0).toISOString();},(o:OrderView)=>{o.funding!.memo='wrong';}]){const o=order();change(o);assert.throws(()=>noirPayment(o));}
 let sends=0;const provider:NoirProvider={request:async({method})=>{if(method==='zcash_getAccounts')return null;sends++;return txid;}};
 await assert.rejects(payWithNoir(provider,address,async()=>order(),storage(),id,testLocks),/changed or locked/);assert.equal(sends,0);
 provider.request=async({method})=>{if(method==='zcash_getAccounts')return {shielded:address};sends++;return txid;};
 const blocked={getItem:()=>null,setItem:()=>{throw Error('blocked');},removeItem:()=>{}};
 await assert.rejects(payWithNoir(provider,address,async()=>order(),blocked,id,testLocks),/blocked/);assert.equal(sends,0);
});
test('Noir payment fails closed without origin-wide Web Locks before any provider call',async()=>{
 let calls=0;const provider:NoirProvider={request:async()=>{calls++;return txid;}};
 // This injected missing manager has the same absence behavior as an unsupported browser.
 await assert.rejects(payWithNoir(provider,address,async()=>order(),storage(),id,null as unknown as NoirLocks),/protection is unavailable/);
 assert.equal(calls,0);
});
