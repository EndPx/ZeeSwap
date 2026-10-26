/** Root-only immutable per-order evidence. This module never calculates or sends a transaction. */
import {lstat,realpath,readFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import {approvedMarketCapital as approvedLiveReverseCapital} from './market-capital-provenance.ts';
import type {CapitalSource} from './live-reverse-capital.ts';
import {requireMarketPolicyWorkerOrder as requirePolicyWorkerOrder,type MarketWorkerOrderContext as PolicyWorkerOrderContext} from './market-policy-worker.ts';
import {requireAcceptedMarketQuote} from './market-pricing.ts';
import {escrowTerms} from './base-escrow.ts';
import {reversePayoutTerms} from './reverse-settlement.ts';
import {approvalDigest} from './reverse-authority.ts';
import {marketNativeRequest} from './market-native-runtime.ts';
import {marketRefundRequest} from './market-refund-native-runtime.ts';
import {sourceRefundTerms,refundContext} from './source-refunds.ts';
import type {PreparedBaseTransaction} from './base-signer.ts';
import type {BaseContract} from './base-contract.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
import {validatePolicyCapitalProof,requirePolicyCapitalProvenance} from './testnet-policy-capital.ts';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error(c);}
type Pin={path:string;sha256:string};
type Scope={stateRoot:'/opt/zeeswap-testnet/state';sourceFingerprint:string;openingProof:Pin;profileSha256:string;loaderSha256:string;captureScriptSha256:string};
async function rootUnpinned(path:string){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&s.size<=1048576&&await realpath(path)===path,'POLICY_CAPITAL_PRIVATE_PROOF');return readFile(path);}
async function rootRead(pin:Pin){const b=await rootUnpinned(pin.path);need(sha(b)===pin.sha256,'POLICY_CAPITAL_PROOF_CHANGED');return b;}
async function directory(path:string){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&await realpath(path)===path,'POLICY_CAPITAL_PRIVATE_DIRECTORY');}
async function exclusive(path:string,bytes:Buffer){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}const d=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await d.sync();}finally{await d.close();}return{path,sha256:sha(bytes)};}
/** Closed own refunds can leave internal change or their original source note.
 * Both require terminal SQL, original signed journal and current unspent capture;
 * neither category creates inventory credit or discards a liability. */
async function completedRefundSources(pool:pg.Pool,keys:PrivateData,policy:string,stateRoot:string,outputs:any[],proofDir:string){
 const rows=(await pool.query(`SELECT a.order_id,d.identity_hash FROM zee.market_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.source_refunds r ON r.order_id=o.id AND r.confirmed JOIN zee.deposits d ON d.id=r.deposit_id WHERE a.policy_sha256=$1 AND o.state='REFUNDED' ORDER BY a.order_id LIMIT 5`,[Buffer.from(policy,'hex')])).rows;need(rows.length<=4,'MARKET_REFUND_CAPITAL_MEMBER_BOUND');
 const sources:CapitalSource[]=[];let index=0;
 for(const row of rows){const raw=await rootUnpinned(stateRoot+'/market-refund-orders/'+row.order_id+'/refund-intent.private.json'),journal=JSON.parse(raw.toString()),change=await exclusive(proofDir+`/refund-change-${index++}.private.json`,raw);sources.push({kind:'confirmed-refund-own-change',orderId:row.order_id,...change});
  for(const output of outputs){const identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);if(!keys.lookup('deposit',identity).equals(row.identity_hash)||journal.prepared?.selectedNotes?.some((n:any)=>n.pool===output.pool&&n.txid===output.txid&&n.index===output.index))continue;
   const residual=await exclusive(proofDir+`/refund-residual-${index++}.private.json`,Buffer.from(JSON.stringify({version:1,purpose:'DISCHARGED_REFUND_RESIDUAL',sourceOrderId:row.order_id,unspent:true,refundJournal:journal,snapshot:{outputs:[output]}})));sources.push({kind:'discharged-refund-residual',orderId:row.order_id,...residual});
  }
 }return sources;
}
/** Idle readiness checks the same actual notes against immutable terminal provenance. */
export async function verifyMarketIdleCapital(input:{pool:pg.Pool;keys:PrivateData;policySha256:string;scope:Scope;capture:Pin;seedSources:CapitalSource[]}){
 const {pool,keys,scope}=input;need(process.platform==='linux'&&process.getuid?.()===0,'POLICY_CAPITAL_ROOT_ONLY');
 const proof=JSON.parse((await rootRead(input.capture)).toString()),current=validatePolicyCapitalProof(proof,{policySha256:input.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 const dir=input.capture.path+'.proofs';await directory(dir);const sources:CapitalSource[]=[];
 for(const source of input.seedSources){await rootRead(source);sources.push(source);}
 let index=0;
 for(const output of proof.snapshot.outputs){
  const identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
  const r=(await pool.query(`SELECT a.order_id FROM zee.market_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.deposits d ON d.id=o.primary_deposit WHERE a.policy_sha256=$1 AND o.state='SETTLED' AND d.identity_hash=$2`,[Buffer.from(input.policySha256,'hex'),keys.lookup('deposit',identity)])).rows;
  need(r.length<=1,'POLICY_CAPITAL_SOURCE_IDENTITY');if(r[0]){const pin=await exclusive(dir+`/source-${index++}.private.json`,Buffer.from(JSON.stringify({snapshot:{outputs:[output]}})));sources.push({kind:'settled-source',orderId:r[0].order_id,...pin});}
 }
 const rows=(await pool.query(`SELECT a.order_id FROM zee.market_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.reverse_payouts p ON p.order_id=o.id AND p.confirmed WHERE a.policy_sha256=$1 AND o.state='SETTLED' ORDER BY a.order_id LIMIT 5`,[Buffer.from(input.policySha256,'hex')])).rows;need(rows.length<=4,'POLICY_CAPITAL_MEMBER_BOUND');
 for(const row of rows){const path=scope.stateRoot+'/market-reverse-orders/'+row.order_id+'/payout-intent.private.json';const b=await rootUnpinned(path);sources.push({kind:'confirmed-own-change',path,sha256:sha(b),orderId:row.order_id});}
 sources.push(...await completedRefundSources(pool,keys,input.policySha256,scope.stateRoot,proof.snapshot.outputs,dir));
 const provenance=await approvedLiveReverseCapital(pool,keys,[{kind:'opening',...scope.openingProof},...sources]);requirePolicyCapitalProvenance(current.notes,provenance);return current;
}
export async function buildMarketOrderCapital(input:{pool:pg.Pool;keys:PrivateData;context:PolicyWorkerOrderContext;purpose:'reverse'|'refund';base:BaseContract;scope:Scope;capture:Pin;seedSources:CapitalSource[]}){
 need(process.platform==='linux'&&process.getuid?.()===0,'POLICY_CAPITAL_ROOT_ONLY');
 const {pool,keys,context:c,purpose,scope,capture}=input;await requirePolicyWorkerOrder(pool,c,c.orderId);
 const raw=await rootRead(capture),proof=JSON.parse(raw.toString()),current=validatePolicyCapitalProof(proof,{policySha256:c.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 need(capture.path.startsWith(scope.stateRoot+'/testnet-policy/'+c.policySha256+'/capital-captures/'),'POLICY_CAPITAL_CAPTURE_SCOPE');
 const orderDir=scope.stateRoot+'/'+(purpose==='reverse'?'market-reverse':'market-refund')+'-orders/'+c.orderId,proofDir=orderDir+'/proofs';await directory(orderDir);await directory(proofDir);
 // The existing immutable approval is never overwritten or refreshed after signing uncertainty.
 const target=orderDir+'/capital-approval.private.json';try{await lstat(target);throw Error('POLICY_CAPITAL_APPROVAL_ALREADY_FROZEN');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const sources:CapitalSource[]=[];let ordinal=0;
 for(const seed of input.seedSources){need(['confirmed-refund-own-change','discharged-refund-residual','confirmed-own-change','settled-source'].includes(seed.kind),'POLICY_CAPITAL_SEED_KIND');const bytes=await rootRead(seed);const pin=await exclusive(proofDir+`/seed-${ordinal++}.private.json`,bytes);sources.push({...seed,...pin});}
 // Only this policy's exact confirmed primary receipts can become new source capital.
 const rows=(await pool.query(`SELECT a.order_id,o.state,q.direction FROM zee.market_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id WHERE a.policy_sha256=$1 AND q.direction='ZCASH_TO_BASE' AND (o.state='SETTLED' OR (o.id=$2 AND o.state='REFUND_REQUIRED')) ORDER BY o.id LIMIT 5`,[Buffer.from(c.policySha256,'hex'),c.orderId])).rows;
 need(rows.length<=4,'POLICY_CAPITAL_MEMBER_BOUND');
 for(const row of rows){const kind=row.state==='SETTLED'?'settled-source':'refund-source';if(kind==='refund-source'&&purpose!=='refund')continue;
  for(const output of proof.snapshot.outputs){if(output.ownChange)continue;const candidate=Buffer.from(JSON.stringify({snapshot:{outputs:[output]}}));
   // Existing kernel decrypts the SQL primary receipt and checks its HMAC, amount, receiver,
   // canonical block identity, terminal state, and discharged/refund signing restrictions.
   const pin=await exclusive(proofDir+`/source-${ordinal++}.private.json`,candidate),source={kind,path:pin.path,sha256:pin.sha256,orderId:row.order_id} as CapitalSource;
   try{await approvedLiveReverseCapital(pool,keys,[source],purpose==='refund'?c.orderId:undefined,c);sources.push(source);}catch(e){if(!['LIVE_SOURCE_CAPITAL_NOT_SETTLED','LIVE_SOURCE_CAPITAL_NATIVE_SQL_MISMATCH'].includes((e as Error).message))throw e;}
  }
 }
 // Confirmed change comes only from immutable journals of settled members, never a global scan.
 const changes=(await pool.query(`SELECT a.order_id FROM zee.market_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.reverse_payouts p ON p.order_id=o.id AND p.confirmed WHERE a.policy_sha256=$1 AND o.state='SETTLED' ORDER BY a.order_id LIMIT 5`,[Buffer.from(c.policySha256,'hex')])).rows;
 need(changes.length<=4,'POLICY_CAPITAL_MEMBER_BOUND');
 for(const row of changes){const path=scope.stateRoot+'/market-reverse-orders/'+row.order_id+'/payout-intent.private.json',bytes=await rootUnpinned(path),pin=await exclusive(proofDir+`/change-${ordinal++}.private.json`,bytes);sources.push({kind:'confirmed-own-change',orderId:row.order_id,...pin});}
 sources.push(...await completedRefundSources(pool,keys,c.policySha256,scope.stateRoot,proof.snapshot.outputs,proofDir));
 const provenance=await approvedLiveReverseCapital(pool,keys,[{kind:'opening',...scope.openingProof},...sources],purpose==='refund'?c.orderId:undefined,c);
 requirePolicyCapitalProvenance(current.notes,provenance);await requirePolicyWorkerOrder(pool,c,c.orderId);
 // Revalidate the SAME capture at the final freeze; never replace its observation timestamp.
 validatePolicyCapitalProof(proof,{policySha256:c.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 // Market-native approval binds the accepted price lock and actual finalized
 // COMMIT before the operator freezes exact physical note provenance.
 let approval:unknown;
 if(purpose==='reverse'){
  const q=await requireAcceptedMarketQuote(pool,keys,c.orderId,c),funding=await escrowTerms(pool,keys,input.base,c.orderId),payout=await reversePayoutTerms(pool,keys,c.orderId),commit=(await pool.query('SELECT receipt_payload FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[c.orderId])).rows[0];need(commit,'MARKET_CAPITAL_COMMIT_REQUIRED');
  const approved=marketNativeRequest(q,funding,payout,keys.open(commit.receipt_payload,`escrow-proof:${c.orderId}:v1`),input.base.registry.contracts.ZeeSwapSettlement.address);
  approval={version:1,purpose:'market-reverse-v1',orderId:c.orderId,approvedDigest:approvalDigest(approved),marketPolicySha256:c.policySha256,sourceFingerprint:scope.sourceFingerprint,notes:current.notes,sources,capture};
 }else{
  const q=await requireAcceptedMarketQuote(pool,keys,c.orderId,c),source=await sourceRefundTerms(pool,keys,c.orderId),row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1 AND base_confirmed',[c.orderId])).rows[0];need(row,'MARKET_CAPITAL_CANCEL_REQUIRED');const cancel=keys.open(row.base_payload,refundContext(c.orderId,'CANCEL')) as PreparedBaseTransaction,approved=marketRefundRequest(q,row,source,cancel.hash,input.base.registry.contracts.ZeeSwapSettlement.address,input.base.registry.contracts.MockUSDC.address);
  approval={version:1,purpose:'market-refund-v1',orderId:c.orderId,approvedDigest:approvalDigest(approved),marketPolicySha256:c.policySha256,sourceFingerprint:scope.sourceFingerprint,notes:current.notes,sources,capture};
 }
 return exclusive(target,Buffer.from(JSON.stringify(approval,null,2)));
}
