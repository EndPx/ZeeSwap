import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
import{PrepClient}from'@zeer-dev/prep-client';import{singleBlockClient,fixedPayloadClient}from'../bounded-prep-client.mjs';
const packageRoot=fileURLToPath(new URL('../node_modules/@zeer-dev/chef/',import.meta.url)),{main}=await import(pathToFileURL(join(packageRoot,'dist/cli.js')));
const h=n=>n.toString(16).padStart(64,'0'),block=height=>({height,hash:h(height),previous_hash:h(height-1),time:1700000000});
function store(){const state={height:99,hash:h(99),anchorHash:null,status:'ready',undoFloor:99},applied=[];let closed=false;
 return{applied,get closed(){return closed;},async acquire(){},async close(){closed=true;},async checkpoint(){return{...state};},async recordSourceObservation(){},async blockHash(n){return n===state.height?state.hash:null;},async markReconciling(){state.status='reconciling';},async markBlocked(){state.status='blocked';},async markReady(){state.status='ready';},async rollback(){throw Error('FIXTURE_REORG_FORBIDDEN');},async apply(b,handler){assert.equal(b.height,state.height+1);assert.equal(b.previousHash,state.hash);await handler({set:async()=>{}});state.height=b.height;state.hash=b.hash;applied.push(b.height);}};
}
function client({badEpoch=false,badNext=false,interrupt=false,cap=1,end=105,shortPage=false,missingBlock=false,interruptPayload=false,refusePayload=false}={}){const requests=[];
 const actual=new PrepClient({url:'http://localhost/',fetch:async(_url,options)=>{
  assert.ok(options.signal instanceof AbortSignal);
  if(interrupt){process.emit('message',{type:'zeer-stop'});options.signal.throwIfAborted();}
  if(!options.body)return Response.json({network:'testnet',payload_kind:'full-v1',ready:true,start_block:100,epoch:'1',revision:'1',archive_height:end,indexed_height:end,source_height:end,lag_blocks:0,source_observed_at:Math.floor(Date.now()/1000),source_mode:'follower'});
  const q=JSON.parse(options.body);requests.push(q);
  if(refusePayload&&q.limit===2)return new Response('fixture response too large',{status:413});
  if(interruptPayload&&q.limit===2){process.emit('message',{type:'zeer-stop'});options.signal.throwIfAborted();}
  const next=shortPage&&q.limit===2?q.from_block+1:q.to_block;
  const blocks=Array.from({length:next-q.from_block},(_,i)=>block(q.from_block+i));
  if(missingBlock&&q.limit===2)blocks.pop();
  return Response.json({network:'testnet',epoch:badEpoch?'2':'1',revision:'1',archive_height:end,from_block:q.from_block,to_block:q.to_block,next_block:badNext?q.to_block+1:next,cursor:next===q.to_block?null:'aa',data:{blocks,transactions:[]}});
 }});return{bounded:cap===1?singleBlockClient(actual):fixedPayloadClient(actual,cap),requests};
}
async function fixture(run){const directory=await mkdtemp(join(tmpdir(),'chef-single-client-')),config=join(directory,'chef.config.mjs'),oldPrep=process.env.PREP_URL,oldDb=process.env.DATABASE_URL;
 try{process.env.PREP_URL='http://localhost/';process.env.DATABASE_URL='postgresql://localhost/fixture';
  await writeFile(join(directory,'schema.graphql'),'type Block { id: ID! height: BigInt! }\n');
  await writeFile(config,`import{defineConfig,defineIndexer}from${JSON.stringify(pathToFileURL(join(packageRoot,'dist/index.js')).href)};export default defineConfig({project:'fixture_single',network:'testnet',startHeight:100,schema:'./schema.graphql',handlerVersion:'fixture',indexer:defineIndexer({block:async({block,context})=>context.entities.set('Block',{id:String(block.height),height:BigInt(block.height)})})});`);
  return await run(config);
 }finally{if(oldPrep===undefined)delete process.env.PREP_URL;else process.env.PREP_URL=oldPrep;if(oldDb===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldDb;await rm(directory,{recursive:true,force:true});}}
test('bounded client changes only outgoing bounds, preserves input/options and exact response identity',async()=>{
 const signal=new AbortController().signal,options={signal},response={fixture:true},query=Object.freeze({from_block:100,to_block:106,limit:16,field_selection:Object.freeze({block:Object.freeze(['height']),transaction:Object.freeze([])}),transaction_filter:Object.freeze({shielded_pools:Object.freeze(['ironwood'])})});let actual;
 const c=singleBlockClient({getHeight(o){assert.equal(o,options);return response;},get(q,o){actual=q;assert.equal(o,options);return response;}});
 assert.equal(await c.get(query,options),response);assert.equal(await c.getHeight(options),response);assert.equal(query.to_block,106);assert.equal(query.limit,16);assert.equal(actual.to_block,101);assert.equal(actual.limit,1);assert.equal(actual.field_selection,query.field_selection);assert.equal(actual.transaction_filter,query.transaction_filter);
 assert.throws(()=>c.get({...query,scan_mode:'adaptive'},options),/FIXED_SINGLE_REQUEST_SCOPE/);
});
test('official pinned CLI/runtime processes all six contiguous fixture blocks through partial pages',async()=>fixture(async config=>{
 const s=store(),c=client(),before=await readFile(config);await main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}});
 assert.deepEqual(s.applied,[100,101,102,103,104,105]);assert.ok(s.closed);assert.ok(c.requests.every(q=>q.limit===1&&q.to_block===q.from_block+1));assert.deepEqual(await readFile(config),before);
}));
test('official runtime still rejects epoch conflict and PrepClient rejects malformed continuation',async()=>fixture(async config=>{
 for(const options of[{badEpoch:true},{badNext:true}]){const s=store(),c=client(options);await assert.rejects(main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}}));assert.equal(s.applied.length,0);assert.ok(s.closed);}
}));
test('official interruption forwards AbortSignal and closes without committing fixture blocks',async()=>fixture(async config=>{
 const s=store(),c=client({interrupt:true});await main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}});assert.deepEqual(s.applied,[]);assert.ok(s.closed);
}));
test('installed 0.7.0 status exposes artifact and source-reconciliation diagnostics without starting a writer',async()=>fixture(async config=>{
 const s=store(),c=client();let status,acquired=false;
 s.acquire=async()=>{acquired=true;};await s.markReconciling();
 await main(['status','--config',config,'--json'],{store:s,client:c.bounded,write:text=>{status=JSON.parse(text);}});
 assert.equal(acquired,false);assert.equal(s.applied.length,0);assert.ok(s.closed);
 assert.equal(status.readGate,'reconciling');assert.equal(status.state,'reconciling');
 assert.equal(status.diagnostic.artifact.packageVersion,'0.7.0');
 assert.equal(status.diagnostic.artifact.buildCommit,'95adb373625d0a25d6369f4b6e2613e2e553cdff');
 assert.equal(status.diagnostic.artifact.sourceState,'modified');
 assert.deepEqual(status.diagnostic.action,{category:'reconcile',retryPolicy:'after_operator_correction'});
}));
test('fixed-two preserves original request/options/response and never widens one-block header queries',async()=>{
 const options=Object.freeze({signal:new AbortController().signal}),response=Object.freeze({fixture:true});const requests=[];
 const c=fixedPayloadClient({getHeight:o=>{assert.equal(o,options);return response;},get:(q,o)=>{assert.equal(o,options);requests.push(q);return response;}},2);
 const query=Object.freeze({from_block:100,to_block:116,limit:16,field_selection:Object.freeze({transaction:Object.freeze(['raw'])}),transaction_filter:Object.freeze({shielded_pools:Object.freeze(['ironwood'])})});
 assert.equal(c.get(query,options),response);assert.equal(c.getHeight(options),response);
 assert.equal(requests[0].to_block,102);assert.equal(requests[0].limit,2);
 assert.equal(requests[0].field_selection,query.field_selection);assert.equal(requests[0].transaction_filter,query.transaction_filter);
 assert.equal(query.to_block,116);assert.equal(query.limit,16);
 c.get({...query,to_block:101,limit:1},options);assert.equal(requests[1].to_block,101);assert.equal(requests[1].limit,1);
 c.get({...query,limit:1},options);assert.equal(requests[2].to_block,101);assert.equal(requests[2].limit,1);
 for(const cap of[0,3,'2',null])assert.throws(()=>fixedPayloadClient({},cap),/FIXED_PAYLOAD_CAP_INVALID/);
 assert.throws(()=>c.get({...query,scan_mode:'adaptive'},options),/FIXED_SINGLE_REQUEST_SCOPE/);
});
test('installed CLI fixed-two commits every block once with an odd last block and unchanged config',async()=>fixture(async config=>{
 const s=store(),c=client({cap:2,end:104}),before=await readFile(config);
 await main(['sync','--config',config,'--to','104','--json'],{store:s,client:c.bounded,write:()=>{}});
 assert.deepEqual(s.applied,[100,101,102,103,104]);assert.ok(s.closed);assert.deepEqual(await readFile(config),before);
 assert.deepEqual(c.requests.filter(q=>q.from_block>=100&&q.limit===2).map(q=>[q.from_block,q.to_block]),[[100,102],[102,104]]);
 assert.ok(c.requests.some(q=>q.from_block===104&&q.limit===1&&q.to_block===105));
}));
test('installed CLI resumes a valid shorter two-block partial page without skipping or duplicating blocks',async()=>fixture(async config=>{
 const s=store(),c=client({cap:2,end:104,shortPage:true});
 await main(['sync','--config',config,'--to','104','--json'],{store:s,client:c.bounded,write:()=>{}});
 assert.deepEqual(s.applied,[100,101,102,103,104]);assert.ok(s.closed);
 assert.ok(c.requests.some(q=>q.from_block===101&&q.to_block===103&&q.limit===2));
}));
test('fixed-two retains installed SDK missing-block, epoch, continuation and interruption refusals',async()=>fixture(async config=>{
 for(const options of[{missingBlock:true},{badEpoch:true},{badNext:true}]){
  const s=store(),c=client({cap:2,...options});
  await assert.rejects(main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}}));
  assert.deepEqual(s.applied,[]);assert.ok(s.closed);
 }
 const s=store(),c=client({cap:2,interruptPayload:true});
 await main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}});
 assert.deepEqual(s.applied,[]);assert.ok(s.closed);assert.ok(c.requests.some(q=>q.limit===2));
}));
test('fixed-two provider 413 fails without automatic one-block fallback or a commit',async()=>fixture(async config=>{
 const s=store(),c=client({cap:2,refusePayload:true});
 await assert.rejects(main(['sync','--config',config,'--to','105','--json'],{store:s,client:c.bounded,write:()=>{}}));
 assert.deepEqual(s.applied,[]);assert.ok(s.closed);
 assert.deepEqual(c.requests.map(q=>[q.from_block,q.limit]),[[99,1],[100,2]]);
}));
