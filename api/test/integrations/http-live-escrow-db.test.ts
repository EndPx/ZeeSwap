import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decodeFunctionData,recoverTypedDataAddress,type Hex} from 'viem';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {connect} from '../../src/db.ts';
import {PrivateData} from '../../src/private-data.ts';
import {Repository} from '../../src/repository.ts';
import {createApi} from '../../src/http-api.ts';
import {fundingTypedData} from '../../src/base-escrow.ts';
import {settlementAbi,type BaseContract} from '../../src/base-contract.ts';
import {decodeOrder} from '../../../apps/web/src/protocol.ts';

test('actual disposable Postgres HTTP reverse quote/accept/binding and bounded concurrent acceptance',{skip:process.env.ZEE_TEST_LIVE_HTTP_DATABASE!=='1'},async()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const target=JSON.parse(await readFile(new URL('../../../.deploy-local/live-testnet-20261023/admin.private.json',import.meta.url),'utf8'));
 assert.equal(target.branchId,'br-broad-pine-ao79wemx');const host='ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech';assert.equal(new URL(target.adminUrl).hostname,host);
 const source=JSON.parse(await readFile(new URL('../../../.deploy-local/neon-primary.json',import.meta.url),'utf8'));assert.equal(source.projectId,'raspy-truth-63998651');assert.equal(source.branchId,'br-empty-meadow-aowxzfl5');
 const controlUrl=new URL(source.adminUrl);controlUrl.hostname=host;controlUrl.pathname='/neondb';
 const name='zee_http_20261023_'+randomUUID().replaceAll('-','');assert.match(name,/^zee_http_20261023_[0-9a-f]{32}$/);
 const admin=connect(controlUrl.toString(),1);let created=false;let owner:ReturnType<typeof connect>|undefined,apiPool:ReturnType<typeof connect>|undefined,worker:ReturnType<typeof connect>|undefined,server:ReturnType<typeof createApi>|undefined;
 try{
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);await admin.query(`CREATE DATABASE ${name}`);created=true;
  const dbUrl=new URL(controlUrl);dbUrl.pathname='/'+name;owner=connect(dbUrl.toString(),1);
  const paths=execFileSync('git',['ls-tree','--name-only','HEAD','api/migrations/'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>/^api\/migrations\/00(?:0[1-9]|1[0-4])_\w+\.sql$/.test(p));assert.equal(paths.length,14);
  await owner.query('BEGIN');for(const path of paths){const sql=execFileSync('git',['show',`HEAD:${path}`],{cwd:root,encoding:'utf8'}).replace(/^CREATE ROLE (zeeswap_(?:api|worker|reader)) NOLOGIN;\r?$/gm,'');await owner.query(sql);}await owner.query('COMMIT');
  const runtime=JSON.parse(await readFile(new URL('../../../.deploy-local/live-testnet-20261023/app-runtime.private.json',import.meta.url),'utf8'));
  const userUrl=(value:string)=>{const u=new URL(value);assert.equal(u.hostname,host);u.pathname='/'+name;return u.toString();};apiPool=connect(userUrl(runtime.apiUrl),4);worker=connect(userUrl(runtime.workerUrl),2);
  await owner.query("UPDATE zee.assets SET live_enabled=true WHERE id IN ('TAZ','mockUSDC')");await owner.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=false,reconciliation_required=false');
  await owner.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',1000,$1,990,clock_timestamp(),clock_timestamp())",['a'.repeat(64)]);
  await owner.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) v(p)");
  const signer=privateKeyToAccount(generatePrivateKey()),payer=privateKeyToAccount(generatePrivateKey()),otherPayer=privateKeyToAccount(generatePrivateKey());
  const base={registry:{chainId:84532,operator:signer.address,contracts:{MockUSDC:{address:'0x1111111111111111111111111111111111111111'},ZeeSwapSettlement:{address:'0x2222222222222222222222222222222222222222'}}},preflight:async()=>({availableInventory:'1000000000000000'}),client:{getBalance:async()=>1000000000000000n,getTransactionReceipt:async()=>{throw Object.assign(Error('fixture pending'),{name:'TransactionReceiptNotFoundError'});}}} as unknown as BaseContract;
  const wallet={validate:async(value:string)=>{assert.match(value,/^fixture-shielded:/);return value;},allocate:async()=>`fixture-shielded:${randomUUID()}`,snapshot:async()=>{throw Error('No live wallet in synthetic test');}};
  const keys=new PrivateData(randomBytes(32),randomBytes(32));server=createApi({pool:apiPool,keys,wallet,base,baseFeeBudget:'100000000000000',quoteBounds:{inputAmountAtomic:'100000',maxAcceptedPerDirection:1},escrow:{pool:worker,authorize:q=>signer.signTypedData(fundingTypedData(base,q))}});
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as any).port}`,token=randomBytes(32).toString('base64url');
  const request=async(path:string,body?:unknown,key=randomUUID(),credential=token)=>{const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential,'Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json() as any};};
  const health=await request('/health');assert.deepEqual(health.body.quoteBounds,{inputAmountAtomic:'100000',maxAcceptedPerDirection:1});
  const reverse={direction:'BASE_TO_ZCASH',inputAmount:'100000',recipient:'fixture-shielded:recipient',refundRecipient:otherPayer.address,payer:payer.address};
  assert.equal((await request('/v1/quotes',{...reverse,inputAmount:'1000000'})).body.error,'BOUNDED_AMOUNT_REQUIRED');
  const oldQuote=await new Repository(apiPool,keys).issueQuote({direction:'BASE_TO_ZCASH',inputAmount:'1000000',recipient:reverse.recipient,refundRecipient:reverse.refundRecipient,payer:payer.address,depositReceiver:'fixture',payoutFee:'10000',refundFee:'100000000000000',executionMode:'base-escrow-v1',baseContract:base.registry.contracts.ZeeSwapSettlement.address},token);assert.equal((await request(`/v1/orders/${oldQuote.id}/accept`,{})).body.error,'BOUNDED_AMOUNT_REQUIRED');
  assert.equal((await request('/v1/quotes',{...reverse,payer:undefined})).status,400);
  const key=randomUUID(),quote=await request('/v1/quotes',reverse,key);assert.equal(quote.status,201);assert.equal(quote.body.executionMode,'base-escrow-v1');decodeOrder(quote.body);assert.equal(quote.body.escrowFunding,undefined);
  assert.equal((await request('/v1/quotes',{...reverse,payer:otherPayer.address},key)).status,409);
  const second=await request('/v1/quotes',reverse);assert.equal(second.status,201);
  const outcomes=await Promise.all([request(`/v1/orders/${quote.body.id}/accept`,{}),request(`/v1/orders/${second.body.id}/accept`,{})]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const accepted=outcomes.find(r=>r.status===200)!.body;decodeOrder(accepted);assert.equal(accepted.funding,undefined);assert.equal(accepted.source.received,false);assert.equal(accepted.escrowFunding.chainId,84532);
  const f=accepted.escrowFunding;assert.equal(f.terms.payer,payer.address);assert.equal(f.terms.refundRecipient,otherPayer.address);assert.equal(f.terms.amount,'100000');assert.equal(f.terms.token,base.registry.contracts.MockUSDC.address);assert.equal(f.contract,base.registry.contracts.ZeeSwapSettlement.address);
  const decoded=decodeFunctionData({abi:settlementAbi,data:f.calldata});assert.equal(decoded.functionName,'fund');assert.equal(await recoverTypedDataAddress({...fundingTypedData(base,f.terms),signature:f.signature}),signer.address);
  const pinned=(await worker.query('SELECT count(*) FROM zee.escrow_bindings')).rows[0].count;assert.equal(pinned,'1');
  assert.equal((await request(`/v1/orders/${accepted.id}`)).body.escrowFunding.signature,f.signature);
  assert.equal((await request(`/v1/orders/${accepted.id}/accept`,{})).status,200);
  assert.equal((await request(`/v1/orders/${accepted.id}`,undefined,randomUUID(),randomBytes(32).toString('base64url'))).status,404);
  assert.equal((await request(`/v1/orders/${accepted.id}/funding`,{transactionHash:'bad'})).status,400);
  const pending=await request(`/v1/orders/${accepted.id}/funding`,{transactionHash:('0x'+'77'.repeat(32)) as Hex});assert.equal(pending.status,200);assert.equal(pending.body.source.received,false);assert.equal(pending.body.status,'AWAITING_FUNDS');
  const forward=await request('/v1/quotes',{direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:payer.address,refundRecipient:'fixture-shielded:refund'});assert.equal(forward.status,201);assert.equal((await request(`/v1/orders/${forward.body.id}/accept`,{})).status,200);
  const generic=createApi({pool:apiPool,keys,wallet,base,baseFeeBudget:'100000000000000'});await new Promise<void>(resolve=>generic.listen(0,'127.0.0.1',resolve));try{const response=await fetch(`http://127.0.0.1:${(generic.address() as any).port}/v1/quotes`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':randomUUID()},body:JSON.stringify({direction:'ZCASH_TO_BASE',inputAmount:'1000000',recipient:payer.address,refundRecipient:'fixture-shielded:generic-refund'})});assert.equal(response.status,201);}finally{await new Promise<void>(resolve=>generic.close(()=>resolve()));}
  assert.equal((await owner.query('SELECT count(*) FROM zee.deposits')).rows[0].count,'0');assert.equal((await owner.query('SELECT count(*) FROM zee.orders')).rows[0].count,'2');
 }finally{
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await Promise.all([apiPool?.end(),worker?.end(),owner?.end()]);if(created){assert.match(name,/^zee_http_20261023_[0-9a-f]{32}$/);assert.equal(admin.options.host,host);await admin.query(`DROP DATABASE ${name}`);}await admin.end();
 }
});
