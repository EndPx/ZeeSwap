import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { connect } from '../src/db.ts';
import { createApi } from '../src/http-api.ts';
import { validateSnapshot } from '../src/observer.ts';
import { runtime } from '../scripts/runtime.ts';
import { requireDevelopment } from '../scripts/config.ts';
const config=requireDevelopment(),admin=connect(config.adminUrl),r=await runtime(true),pool=connect(r.apiUrl);
const owner=randomBytes(32).toString('base64url');
const wallet={validate:async(a:string)=>{if(!a.startsWith('fixture-shielded:'))throw Error('INVALID_ZCASH_RECEIVER');return a;},
 allocate:async()=>`fixture-shielded:${randomUUID()}`,snapshot:async()=>{throw Error('test adapter has no chain');}};
const server=createApi({pool,keys:r.keys,wallet,integrationOnly:true,baseFeeBudget:'10000',allowedOrigin:'http://localhost:3030'});
let origin='';let fixtureStarted=false;const accepted:string[]=[];
const body={direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:'0x0000000000000000000000000000000000000001',refundRecipient:'fixture-shielded:refund'};
before(async()=>{
 if(config.branchId!=='br-muddy-waterfall-aoqd8o9b')throw Error('Run HTTP tests through the isolated test runner');
 if((await admin.query('SELECT count(*) FROM zee.deposits')).rows[0].count!=='0')throw Error('Development branch has deposit evidence; do not overwrite its checkpoints with fixtures');
 fixtureStarted=true;
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),
  ('base-sepolia',1000,$1,990,clock_timestamp(),clock_timestamp()) ON CONFLICT(network) DO UPDATE SET
  scanned_height=1000,finalized_height=990,tip_hash=$1,observed_at=clock_timestamp(),finalized_time=clock_timestamp()`,['a'.repeat(64)]);
 await admin.query(`INSERT INTO zee.inventory_accounts SELECT id,p,1000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)
 ON CONFLICT(asset,purpose) DO UPDATE SET balance=1000000000 WHERE zee.inventory_accounts.reserved=0`);
 await admin.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true,dispatch_enabled=false');
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{
 if(!fixtureStarted){await Promise.all([pool.end(),admin.end()]);return;}
 await new Promise<void>(resolve=>server.close(()=>resolve()));
 await admin.query("UPDATE zee.scanner_checkpoints SET scanned_height=2000,finalized_height=2000,observed_at=clock_timestamp(),finalized_time=clock_timestamp()+interval '3 hours'");
 for(const id of accepted)await admin.query('SELECT zee.expire_unfunded($1)',[id]);
 await admin.query('UPDATE zee.inventory_accounts SET balance=0 WHERE reserved=0');await admin.query('SELECT zee.enter_reconciliation()');
 await Promise.all([pool.end(),admin.end()]);
});
function request(path:string,method='GET',input?:unknown,token=owner,key=randomUUID()){
 return fetch(origin+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},
 body:input===undefined?undefined:JSON.stringify(input)});
}
test('health response is no-store and unauthenticated order access is denied',async()=>{
 const h=await fetch(origin+'/health');assert.equal(h.status,200);assert.equal(h.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(origin+'/v1/quotes',{method:'POST'})).status,401);
});
test('quote retries reuse one quote and conflicting retries are rejected',async()=>{
 const key=randomUUID(),a=await request('/v1/quotes','POST',body,owner,key);assert.equal(a.status,201);const q=await a.json() as any;
 assert.equal(q.inputAmount,'100000');assert.equal(q.outputAmount,'100000');assert.equal(q.funding,undefined);
 const b=await request('/v1/quotes','POST',body,owner,key);assert.equal(b.status,200);assert.equal((await b.json() as any).id,q.id);
 assert.equal((await request('/v1/quotes','POST',{...body,inputAmount:'200000'},owner,key)).status,409);
});
test('concurrent identical HTTP requests create one quote',async()=>{
 const key=randomUUID();const responses=await Promise.all([request('/v1/quotes','POST',body,owner,key),request('/v1/quotes','POST',body,owner,key)]);
 const values=await Promise.all(responses.map(async r=>{assert.ok([200,201].includes(r.status));return await r.json() as any;}));
 assert.equal(values[0].id,values[1].id);
});
test('acceptance is authenticated, repeatable and reveals bound funding instructions only to owner',async()=>{
 const q=await (await request('/v1/quotes','POST',body)).json() as any;
 assert.equal((await request(`/v1/orders/${q.id}/accept`,'POST',{},randomBytes(32).toString('base64url'))).status,404);
 const a=await request(`/v1/orders/${q.id}/accept`,'POST',{});assert.equal(a.status,200);accepted.push(q.id);
 const first=await a.json() as any;assert.equal(first.status,'AWAITING_FUNDS');assert.equal(first.funding.cutoffHeight,1012);
 const b=await (await request(`/v1/orders/${q.id}/accept`,'POST',{})).json() as any;assert.deepEqual(first.funding,b.funding);
 assert.equal((await request(`/v1/orders/${q.id}`,'GET',undefined,randomBytes(32).toString('base64url'))).status,404);
});
test('malformed amounts, extra fields, bad addresses, query tokens and foreign origins are rejected',async()=>{
 for(const patch of [{inputAmount:0.001},{inputAmount:'1e5'},{depositReceiver:'attacker'},{recipient:'0xnotvalid'},{refundRecipient:'t-transparent'}])
  assert.equal((await request('/v1/quotes','POST',{...body,...patch})).status,400);
 assert.equal((await request('/v1/quotes?token=should-not-be-used','POST',body)).status,400);
 assert.equal((await fetch(origin+'/health',{headers:{origin:'https://foreign.example'}})).status,403);
 const preflight=await fetch(origin+'/v1/quotes',{method:'OPTIONS',headers:{origin:'http://localhost:3030'}});assert.equal(preflight.status,204);
});
test('reverse funding is gated until the Base escrow exists',async()=>{
 const response=await request('/v1/quotes','POST',{direction:'BASE_TO_ZCASH',inputAmount:'100000',recipient:'fixture-shielded:dest',refundRecipient:body.recipient,payer:body.recipient});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'BASE_ESCROW_NOT_READY'});
});
test('stale or contradictory scanner snapshots are rejected before database ingestion',()=>{
 assert.throws(()=>validateSnapshot({}),/INVALID_SNAPSHOT/);
 const snapshot={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:new Date(Date.now()-61000).toISOString(),scannedHeight:1000,tipHash:'a'.repeat(64),blocks:[],outputs:[]};
 assert.throws(()=>validateSnapshot(snapshot),/STALE_SNAPSHOT/);
 assert.throws(()=>validateSnapshot({...snapshot,observedAt:new Date().toISOString()}),/MISSING_CHECKPOINT_BLOCK/);
});
