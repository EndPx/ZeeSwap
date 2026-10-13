/** Explicit development-only incoming-payment experiment. Never fulfills a swap. */
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { connect } from '../src/db.ts';
import { createApi } from '../src/http-api.ts';
import { baseHead,scanOnce } from '../src/observer.ts';
import { runtime } from './runtime.ts';
import { requireDevelopment } from './config.ts';
const config=requireDevelopment();if(config.branchId!=='br-solitary-flower-ao8ccjex')throw Error('Intake evidence branch required');
const r=await runtime(true),admin=connect(config.adminUrl),apiPool=connect(r.apiUrl),worker=connect(r.workerUrl);
const server=createApi({pool:apiPool,keys:r.keys,wallet:r.wallet,integrationOnly:true,baseFeeBudget:'10000'});
const path=new URL('../../.deploy-local/api-intake-order.json',import.meta.url);
let origin='';
async function call(endpoint:string,token:string,method='GET',body?:unknown,key=randomUUID()){
 const response=await fetch(origin+endpoint,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json() as any;if(response.status>=400)throw Error(`HTTP ${response.status}: ${result.error}`);return result;
}
try{
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`;
 if(process.argv.includes('--prepare')){
  const refundRecipient=process.env.ZEE_INTAKE_REFUND_RECIPIENT;
  if(!refundRecipient)throw Error('Set ZEE_INTAKE_REFUND_RECIPIENT to your dedicated testnet shielded receiver');
  try{await readFile(path);throw Error('Private experiment already exists; do not recreate');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const heads={base:await baseHead(worker),zcash:await scanOnce(worker,r.keys,r.wallet)};
  await admin.query(`INSERT INTO zee.inventory_accounts SELECT id,p,1000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)
   ON CONFLICT(asset,purpose) DO UPDATE SET balance=1000000 WHERE zee.inventory_accounts.reserved=0`);
  await admin.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true,dispatch_enabled=false');
  const token=randomBytes(32).toString('base64url'),key=randomUUID();
  const q=await call('/v1/quotes',token,'POST',{direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:'0x0000000000000000000000000000000000000001',
   refundRecipient},key);
  const local={branchId:config.branchId,token,key,quote:q};await writeFile(path,JSON.stringify(local),{flag:'wx',mode:0o600});
  const order=await call(`/v1/orders/${q.id}/accept`,token,'POST',{});
  await writeFile(path,JSON.stringify({...local,order}),{mode:0o600});
  console.log(JSON.stringify({phase:'prepared',status:order.status,inputTAZ:'0.001',output:'fixture only; no mockUSDC deployed',cutoffHeight:order.funding.cutoffHeight,heads}));
 }else{
  const local=JSON.parse(await readFile(path,'utf8'));if(local.branchId!==config.branchId)throw Error('Wrong evidence branch');
  await baseHead(worker);const first=await scanOnce(worker,r.keys,r.wallet);
  const order=await call(`/v1/orders/${local.quote.id}`,local.token);
  const counts=(await admin.query(`SELECT (SELECT count(*) FROM zee.deposits WHERE order_id=$1) AS deposits,
   (SELECT count(*) FROM zee.operations WHERE order_id=$1) AS operations,
   (SELECT count(*) FROM zee.outbox_jobs j JOIN zee.operations o ON o.id=j.operation_id WHERE o.order_id=$1) AS jobs,
   (SELECT bool_or(chain_authorization_verified) FROM zee.operations WHERE order_id=$1) AS authorized`,[local.quote.id])).rows[0];
  const evidence={phase:'observed',status:order.status,source:order.source,counts,first,automatedPayout:false};
  if(order.status==='READY'){
   assert.equal(order.funding,undefined);assert.equal(counts.deposits,'1');assert.equal(counts.operations,'1');assert.equal(counts.jobs,'1');assert.equal(counts.authorized,false);
   const replay=await scanOnce(worker,r.keys,r.wallet);
   assert.equal((await admin.query('SELECT count(*) FROM zee.operations WHERE order_id=$1',[local.quote.id])).rows[0].count,'1');
   const unknown=await fetch(origin+`/v1/orders/${local.quote.id}`,{headers:{authorization:`Bearer ${randomBytes(32).toString('base64url')}`}});assert.equal(unknown.status,404);
   await writeFile(new URL('../../.deploy-local/api-intake-evidence.json',import.meta.url),JSON.stringify({...evidence,replay,replaySafe:true,unauthorizedStatus:404},null,2),{mode:0o600});
   console.log(JSON.stringify({...evidence,replaySafe:true}));
  }else console.log(JSON.stringify(evidence));
 }
}finally{
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
 await new Promise<void>(resolve=>server.close(()=>resolve()));await Promise.all([apiPool.end(),worker.end(),admin.end()]);
}
