/** Root-only immutable per-order evidence. This module never calculates or sends a transaction. */
import {lstat,realpath,readFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import {approvedLiveReverseCapital,type CapitalSource} from './live-reverse-capital.ts';
import {requirePolicyWorkerOrder,type PolicyWorkerOrderContext} from './testnet-policy-refund.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
import {validatePolicyCapitalProof,requirePolicyCapitalProvenance} from './testnet-policy-capital.ts';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error(c);}
type Pin={path:string;sha256:string};
type Scope={stateRoot:'/opt/zeeswap-testnet/state';sourceFingerprint:string;openingProof:Pin;profileSha256:string;loaderSha256:string;captureScriptSha256:string;continuousCapitalApproval?:Pin};
async function rootUnpinned(path:string){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&s.size<=1048576&&await realpath(path)===path,'POLICY_CAPITAL_PRIVATE_PROOF');return readFile(path);}
async function rootRead(pin:Pin){const b=await rootUnpinned(pin.path);need(sha(b)===pin.sha256,'POLICY_CAPITAL_PROOF_CHANGED');return b;}
async function directory(path:string){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&await realpath(path)===path,'POLICY_CAPITAL_PRIVATE_DIRECTORY');}
async function exclusive(path:string,bytes:Buffer){const f=await open(path,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}const d=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await d.sync();}finally{await d.close();}return{path,sha256:sha(bytes)};}
/** Resolve only the bounded currently selected physical outputs, never all historical members. */
export async function continuousCurrentCapitalRows(pool:Pick<pg.Pool,'query'>,keys:PrivateData,policySha256:string,outputs:any[],refundOrderId?:string){
 need(outputs.length>0&&outputs.length<=32,'POLICY_CAPITAL_BOUND');const sources:{kind:CapitalSource['kind'];orderId:string;output?:any}[]=[],seen=new Set<string>();
 for(const output of outputs){
  const identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
  const incoming=(await pool.query(`SELECT a.order_id,o.state FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id JOIN zee.deposits d ON d.id=o.primary_deposit WHERE a.policy_sha256=$1 AND q.direction='ZCASH_TO_BASE' AND d.identity_hash=$2 AND (o.state='SETTLED' OR (o.id=$3::uuid AND o.state='REFUND_REQUIRED'))`,[Buffer.from(policySha256,'hex'),keys.lookup('deposit',identity),refundOrderId??null])).rows;
  need(incoming.length<=1,'POLICY_CAPITAL_SOURCE_IDENTITY');if(incoming[0]){sources.push({kind:incoming[0].state==='SETTLED'?'settled-source':'refund-source',orderId:incoming[0].order_id,output});continue;}
  if(!output.ownChange)continue;
  const change=(await pool.query(`SELECT a.order_id,'confirmed-own-change' kind FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.reverse_payouts r ON r.order_id=o.id WHERE a.policy_sha256=$1 AND o.state='SETTLED' AND r.confirmed AND r.tx_hash=$2
   UNION ALL SELECT a.order_id,'confirmed-refund-own-change' kind FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.source_refunds r ON r.order_id=o.id WHERE a.policy_sha256=$1 AND o.state='REFUNDED' AND r.confirmed AND r.base_confirmed AND r.zcash_hash=$2`,[Buffer.from(policySha256,'hex'),keys.lookup('zcash-tx',output.txid)])).rows;
  need(change.length<=1,'POLICY_CAPITAL_CHANGE_IDENTITY');if(change[0]){const key=change[0].kind+':'+change[0].order_id;if(!seen.has(key)){seen.add(key);sources.push({kind:change[0].kind,orderId:change[0].order_id});}}
 }
 return sources;
}
async function continuousSources(input:{pool:pg.Pool;keys:PrivateData;policySha256:string;outputs:any[];scope:Scope;directory:string;refundOrderId?:string}){
 const rows=await continuousCurrentCapitalRows(input.pool,input.keys,input.policySha256,input.outputs,input.refundOrderId),sources:CapitalSource[]=[];let n=0;
 for(const row of rows){let bytes:Buffer;
  if(row.output)bytes=Buffer.from(JSON.stringify({snapshot:{outputs:[row.output]}}));
  else bytes=await rootUnpinned(input.scope.stateRoot+(row.kind==='confirmed-own-change'?'/reverse-orders/':'/refund-orders/')+row.orderId+(row.kind==='confirmed-own-change'?'/payout-intent.private.json':'/refund-intent.private.json'));
  const pin=await exclusive(input.directory+`/current-${n++}.private.json`,bytes);sources.push({kind:row.kind,orderId:row.orderId,...pin,continuousPolicySha256:input.policySha256});
 }
 return sources;
}
async function continuousEnabled(pool:pg.Pool,policy:string,scope:Scope){if(!scope.continuousCapitalApproval)return false;const p=scope.continuousCapitalApproval;await rootRead(p);need((await pool.query('SELECT zee.testnet_continuous_demo_enabled($1) AND EXISTS(SELECT 1 FROM zee.testnet_continuous_demo_authorizations WHERE policy_sha256=$1 AND capital_approval_sha256=$2) yes',[Buffer.from(policy,'hex'),Buffer.from(p.sha256,'hex')])).rows[0]?.yes===true,'POLICY_CONTINUOUS_CAPITAL_AUTHORITY');return true;}
/** Idle readiness checks the same actual notes against immutable terminal provenance. */
export async function verifyPolicyIdleCapital(input:{pool:pg.Pool;keys:PrivateData;policySha256:string;scope:Scope;capture:Pin;seedSources:CapitalSource[]}){
 const {pool,keys,scope}=input;need(process.platform==='linux'&&process.getuid?.()===0,'POLICY_CAPITAL_ROOT_ONLY');
 const proof=JSON.parse((await rootRead(input.capture)).toString()),current=validatePolicyCapitalProof(proof,{policySha256:input.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 const dir=input.capture.path+'.proofs';await directory(dir);const sources:CapitalSource[]=[];
 for(const source of input.seedSources){await rootRead(source);sources.push(source);}
 const continuous=await continuousEnabled(pool,input.policySha256,scope);
 if(continuous)sources.push(...await continuousSources({pool,keys,policySha256:input.policySha256,outputs:proof.snapshot.outputs,scope,directory:dir}));
 else{
 let index=0;
 for(const output of proof.snapshot.outputs){
  const identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
  const r=(await pool.query(`SELECT a.order_id FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.deposits d ON d.id=o.primary_deposit WHERE a.policy_sha256=$1 AND o.state='SETTLED' AND d.identity_hash=$2`,[Buffer.from(input.policySha256,'hex'),keys.lookup('deposit',identity)])).rows;
  need(r.length<=1,'POLICY_CAPITAL_SOURCE_IDENTITY');if(r[0]){const pin=await exclusive(dir+`/source-${index++}.private.json`,Buffer.from(JSON.stringify({snapshot:{outputs:[output]}})));sources.push({kind:'settled-source',orderId:r[0].order_id,...pin});}
 }
 const rows=(await pool.query(`SELECT a.order_id FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.reverse_payouts p ON p.order_id=o.id AND p.confirmed WHERE a.policy_sha256=$1 AND o.state='SETTLED' ORDER BY a.order_id LIMIT 5`,[Buffer.from(input.policySha256,'hex')])).rows;need(rows.length<=4,'POLICY_CAPITAL_MEMBER_BOUND');
 for(const row of rows){const path=scope.stateRoot+'/reverse-orders/'+row.order_id+'/payout-intent.private.json';const b=await rootUnpinned(path);sources.push({kind:'confirmed-own-change',path,sha256:sha(b),orderId:row.order_id});}
 }
 const provenance=await approvedLiveReverseCapital(pool,keys,[{kind:'opening',...scope.openingProof},...sources]);requirePolicyCapitalProvenance(current.notes,provenance);return current;
}
export async function buildPolicyOrderCapital(input:{pool:pg.Pool;keys:PrivateData;context:PolicyWorkerOrderContext;purpose:'reverse'|'refund';scope:Scope;capture:Pin;seedSources:CapitalSource[]}){
 need(process.platform==='linux'&&process.getuid?.()===0,'POLICY_CAPITAL_ROOT_ONLY');
 const {pool,keys,context:c,purpose,scope,capture}=input;await requirePolicyWorkerOrder(pool,c,c.orderId);
 const raw=await rootRead(capture),proof=JSON.parse(raw.toString()),current=validatePolicyCapitalProof(proof,{policySha256:c.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 need(capture.path.startsWith(scope.stateRoot+'/testnet-policy/'+c.policySha256+'/capital-captures/'),'POLICY_CAPITAL_CAPTURE_SCOPE');
 const orderDir=scope.stateRoot+'/'+purpose+'-orders/'+c.orderId,proofDir=orderDir+'/proofs';await directory(orderDir);await directory(proofDir);
 // The existing immutable approval is never overwritten or refreshed after signing uncertainty.
 const target=orderDir+'/capital-approval.private.json';try{await lstat(target);throw Error('POLICY_CAPITAL_APPROVAL_ALREADY_FROZEN');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const sources:CapitalSource[]=[];let ordinal=0;
 for(const seed of input.seedSources){need(['confirmed-refund-own-change','discharged-refund-residual','confirmed-own-change','settled-source'].includes(seed.kind),'POLICY_CAPITAL_SEED_KIND');const bytes=await rootRead(seed);const pin=await exclusive(proofDir+`/seed-${ordinal++}.private.json`,bytes);sources.push({...seed,...pin});}
 const continuous=await continuousEnabled(pool,c.policySha256,scope);
 if(continuous)sources.push(...await continuousSources({pool,keys,policySha256:c.policySha256,outputs:proof.snapshot.outputs,scope,directory:proofDir,refundOrderId:purpose==='refund'?c.orderId:undefined}));
 else{
 // Only this policy's exact confirmed primary receipts can become new source capital.
 const rows=(await pool.query(`SELECT a.order_id,o.state,q.direction FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id WHERE a.policy_sha256=$1 AND q.direction='ZCASH_TO_BASE' AND (o.state='SETTLED' OR (o.id=$2 AND o.state='REFUND_REQUIRED')) ORDER BY o.id LIMIT 5`,[Buffer.from(c.policySha256,'hex'),c.orderId])).rows;
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
 const changes=(await pool.query(`SELECT a.order_id FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.reverse_payouts p ON p.order_id=o.id AND p.confirmed WHERE a.policy_sha256=$1 AND o.state='SETTLED' ORDER BY a.order_id LIMIT 5`,[Buffer.from(c.policySha256,'hex')])).rows;
 need(changes.length<=4,'POLICY_CAPITAL_MEMBER_BOUND');
 for(const row of changes){const path=scope.stateRoot+'/reverse-orders/'+row.order_id+'/payout-intent.private.json',bytes=await rootUnpinned(path),pin=await exclusive(proofDir+`/change-${ordinal++}.private.json`,bytes);sources.push({kind:'confirmed-own-change',orderId:row.order_id,...pin});}
 }
 const provenance=await approvedLiveReverseCapital(pool,keys,[{kind:'opening',...scope.openingProof},...sources],purpose==='refund'?c.orderId:undefined,c);
 requirePolicyCapitalProvenance(current.notes,provenance);await requirePolicyWorkerOrder(pool,c,c.orderId);
 // Revalidate the SAME capture at the final freeze; never replace its observation timestamp.
 validatePolicyCapitalProof(proof,{policySha256:c.policySha256,profileSha256:scope.profileSha256,loaderSha256:scope.loaderSha256,captureScriptSha256:scope.captureScriptSha256});
 const frozenCapture=await exclusive(proofDir+'/physical-capital.private.json',raw);
 const approval={version:1,orderId:c.orderId,sourceFingerprint:scope.sourceFingerprint,openingProofSha256:scope.openingProof.sha256,sources,policyCapital:{version:1,policySha256:c.policySha256,capture:frozenCapture,notes:current.notes,observedAt:current.observedAt,...(continuous?{continuousCapitalApproval:scope.continuousCapitalApproval}: {})}};
 return exclusive(target,Buffer.from(JSON.stringify(approval,null,2)));
}
