import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,parseTransaction,type Hex} from 'viem';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {Repository} from '../src/repository.ts';
import {dispatchBaseOnce} from '../src/base-settlement.ts';
import {payoutTypedData,payoutCall,BaseContract,type BaseRegistry} from '../src/base-contract.ts';
import type {BaseSigner,PreparedBaseTransaction} from '../src/base-signer.ts';
import {ObserverWaitError,isObserverWait} from '../src/observer-frontiers.ts';
import {runG5LiveBounded,type G5LiveSnapshot,type G5LiveState} from '../src/g5-live-controller.ts';
let isolated:Awaited<ReturnType<typeof disposableSettlement>>,pool:pg.Pool;
before(async()=>{isolated=await disposableSettlement();pool=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,5);});
after(async()=>{await pool?.end();await isolated?.cleanup();});

test('production post-sign/pre-store observer wait with two slots imports and broadcasts only the original raw before another order prepares',async()=>{
 const keys=new PrivateData(randomBytes(32),randomBytes(32)),operator=privateKeyToAccount(generatePrivateKey()),address='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',hash='ab'.repeat(32);
 await pool.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1010,$1,1001,clock_timestamp(),clock_timestamp()),('base-sepolia',1010,$1,1010,clock_timestamp(),clock_timestamp())`,[hash]);
 await pool.query(`INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)`);
 await pool.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
 const repo=new Repository(pool,keys),orders:Awaited<ReturnType<Repository['issueQuote']>>[]=[];
 for(let i=0;i<2;i++){
  const receiver='fixture:'+i,q=await repo.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',payoutFee:'50000000000000',refundFee:'10000',recipient:address,refundRecipient:'fixture:refund',depositReceiver:receiver,executionMode:'base-settlement-v1',baseContract:address});await repo.accept(q.id,q.accessToken);
  const dep=await repo.observe({network:'zcash-testnet',txid:randomBytes(32).toString('hex'),index:0,pool:'ironwood',reference:q.reference,receiver,amount:'100000',height:1001,blockHash:hash,blockTime:new Date(),shielded:true});
  await pool.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',1001,$1,clock_timestamp()) ON CONFLICT DO NOTHING",[hash]);await repo.confirm(dep);orders.push(q);
 }
 const registry={chainId:84532,operator:operator.address,rpcUrl:'http://127.0.0.1:18799',contracts:{MockUSDC:{address:token},ZeeSwapSettlement:{address}}} as unknown as BaseRegistry;
 const base={registry,localTest:true,preflight:async()=>({}),receipt:async()=>null,assertSignature:async function(q:any,signature:Hex){return BaseContract.prototype.assertSignature.call(this as unknown as BaseContract,q,signature);}} as unknown as BaseContract;
 let chainNonce=11,signatures=0,broadcasts=0,refreshes=0,waitInjected=false;const journal=new Map<string,PreparedBaseTransaction>(),known=new Map<Hex,any>(),events:string[]=[];
 (base as any).client={getTransaction:async({hash}:any)=>{if(!known.has(hash)){const e=new Error('not found');e.name='TransactionNotFoundError';throw e;}return known.get(hash);},getTransactionCount:async()=>chainNonce,sendRawTransaction:async({serializedTransaction}:any)=>{const tx=parseTransaction(serializedTransaction),id=keccak256(serializedTransaction);assert.equal(tx.nonce,chainNonce);chainNonce++;broadcasts++;events.push('broadcast:'+tx.nonce);known.set(id,{hash:id,blockNumber:1n,nonce:tx.nonce});return id;}};
 const signer:BaseSigner={authorize:q=>operator.signTypedData(payoutTypedData(registry,q)),async prepare(q,phase){const key=q.id+':'+phase,old=journal.get(key);if(old){events.push('recover:'+old.nonce);return old;}
  if([...journal.values()].some(s=>s.nonce>=chainNonce))throw Error('INDEPENDENT_SIGNER_PREVIOUS_RAW_MUST_LAND');
  const signature=await this.authorize(q),raw=await operator.signTransaction({chainId:84532,type:'legacy',to:address,data:payoutCall(registry,q,signature,phase),gas:450000n,gasPrice:1000000n,nonce:chainNonce,value:0n}),signed={raw,hash:keccak256(raw),nonce:chainNonce,maxCost:'10000000000000'};journal.set(key,signed);signatures++;events.push('prepare:'+chainNonce);return signed;}};
 const state:G5LiveState={version:2,runId:'fixture',binding:'fixture',slots:[{sequence:1,stage:'DONE'},{sequence:2,stage:'DONE'},{sequence:3,stage:'DISPATCH'},{sequence:4,stage:'DONE'},{sequence:5,stage:'DISPATCH'}],barriers:[],cursor:0,releasedHolds:[],incident:false,closed:false};
 const snapshot=async():Promise<G5LiveSnapshot>=>({status:'G5_CONTROLLER_SNAPSHOT',runId:'fixture',incident:false,reconciliationRequired:false,closed:false,availableBaseFeeWei:'900000000000000',operatorRawPending:false,barriers:[],orders:[1,2,3,4,5].map(sequence=>({sequence,state:sequence===3||sequence===5?'READY':'SETTLED',receiptVerified:sequence!==3&&sequence!==5}))});
 const execute=async(sequence:number,stage:string)=>{assert.equal(stage,'DISPATCH');events.push('dispatch:'+sequence);await pool.query('UPDATE zee.runtime_control SET dispatch_enabled=true');try{
  return await dispatchBaseOnce(pool,keys,base,signer,async()=>{refreshes++;if(!waitInjected&&journal.size===1&&broadcasts===0){waitInjected=true;throw new ObserverWaitError({event:'observer-frontier',status:'WAIT',reason:'HEAD_BEHIND',network:'base-sepolia'});}},orders[sequence===3?0:1].id);
 }catch(error){if(isObserverWait(error))return {status:'OBSERVER_WAIT'};throw error;}finally{await pool.query('UPDATE zee.runtime_control SET dispatch_enabled=false');}};
 const io={now:()=>0,snapshot,save:async()=>{},execute};
 await runG5LiveBounded(state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},io);
 assert.equal(waitInjected,true);assert.equal(signatures,1);assert.equal(broadcasts,0);assert.equal((await pool.query('SELECT count(*)::text AS n FROM zee.base_attempts')).rows[0].n,'0');const original=[...journal.values()][0];
 // The prior forward lease still exists: NO_ELIGIBLE_JOB must retain priority.
 await runG5LiveBounded(state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},io);assert.equal(state.incident,false);assert.equal(signatures,1);assert.equal(broadcasts,0);
 await pool.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE status='LEASED'");
 await runG5LiveBounded(state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},io);assert.equal(state.incident,false);assert.equal(signatures,1);assert.equal(broadcasts,1);
 const row=(await pool.query('SELECT signed_payload FROM zee.base_attempts WHERE order_id=$1',[orders[0].id])).rows[0];assert.deepEqual(keys.open(row.signed_payload,`base-signed:${orders[0].id}:RESERVE:v1`),original);
 await runG5LiveBounded(state,{maxSteps:1,maxMilliseconds:1000,maxActive:4},io);assert.equal(state.incident,false);assert.equal(signatures,2);assert.equal(broadcasts,2);assert(events.indexOf('broadcast:11')<events.indexOf('prepare:12'));assert(refreshes>=4);
});
