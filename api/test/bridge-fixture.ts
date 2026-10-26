// Explicit synthetic adapters for model/HTTP/PG tests; never imported by runtime.
import {accessHash} from '../src/private-data.ts';
import {coverage,emptyBooks,makeOrder,type Books,type Order,type Receipt} from '../src/bridge/model.ts';
import type {BridgeStore} from '../src/bridge/repository.ts';
import type {BridgeRuntime} from '../src/bridge/service.ts';
export const token='A'.repeat(43),otherToken='B'.repeat(43),address='0x1111111111111111111111111111111111111111';
export const hash='aa'.repeat(32),now=Date.now();
export function fixtureBooks():Books {return {...emptyBooks(),paused:false,principalAccount:'test:principal',feeAccount:'test:fee',swapAccount:'test:swap',feeCapital:'10000',pair:{zcash:{height:100,hash,observedAt:new Date(now).toISOString()},base:{height:200,hash:'0x'+hash,observedAt:new Date(now).toISOString()}}};}
export function receipt(network:Receipt['network']='zcash-testnet',tx='bb'.repeat(32)):Receipt{return {network,transactionHash:tx,blockHeight:50,blockHash:network==='base-sepolia'?'0x'+hash:hash};}
export function forward(b:Books):Order {const o=makeOrder({direction:'TAZ_TO_ZEETAZ',amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'},accessHash(token).toString('hex'),'forward-key',now);o.status='AWAITING_DEPOSIT';o.accepted=true;b.orders[o.id]=o;return o;}
export function reverse(b:Books):Order {const o=makeOrder({direction:'ZEETAZ_TO_TAZ',amountAtomic:'100000',recipient:'test:shielded-recipient',payer:address},accessHash(token).toString('hex'),'reverse-key',now);o.status='AWAITING_BURN';o.accepted=true;b.orders[o.id]=o;return o;}
export class MemoryBridgeStore implements BridgeStore {
 private pending:Promise<unknown>=Promise.resolve();constructor(public books=fixtureBooks()){}
 async read(){return structuredClone(this.books);}
 async update<T>(run:(books:Books)=>Promise<T>|T):Promise<T>{const next=this.pending.then(async()=>{const b=structuredClone(this.books),value=await run(b);this.books=b;return value;});this.pending=next.catch(()=>{});return next;}
}
export function fixtureRuntime(_store:BridgeStore):BridgeRuntime{return {tokenAddress:address,contractAddress:address,runtimeCodeHash:'0x'+hash,authorizerAddress:address,
 recheck:async b=>({pair:b.pair!,network:'testnet',baseChainId:84532,tokenAddress:address,contractAddress:address,runtimeCodeHash:'0x'+hash,decimals:8,principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,...coverage(b)}),
 validateShieldedRecipient:async a=>{if(!a.startsWith('test:shielded-'))throw Error('BRIDGE_INVALID_SHIELDED_RECIPIENT');},
 funding:async o=>({kind:'shielded-deposit',network:'zcash-testnet',address:'test:shielded-deposit',memo:'opaque-fixture:'+o.commitment,cutoffHeight:150,cutoffTime:o.expiresAt})};}
