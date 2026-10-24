import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
import{PrepClient}from'@zeer-dev/prep-client';import{singleBlockClient}from'../bounded-prep-client.mjs';
const packageRoot=fileURLToPath(new URL('../node_modules/@zeer-dev/chef/',import.meta.url)),{main}=await import(pathToFileURL(join(packageRoot,'dist/cli.js')));
const h=n=>n.toString(16).padStart(64,'0'),block=height=>({height,hash:h(height),previous_hash:h(height-1),time:1700000000});
function store(){const state={height:99,hash:h(99),anchorHash:null,status:'ready',undoFloor:99},applied=[];let closed=false;
 return{applied,get closed(){return closed;},async acquire(){},async close(){closed=true;},async checkpoint(){return{...state};},async recordSourceObservation(){},async blockHash(n){return n===state.height?state.hash:null;},async markReconciling(){state.status='reconciling';},async markBlocked(){state.status='blocked';},async markReady(){state.status='ready';},async rollback(){throw Error('FIXTURE_REORG_FORBIDDEN');},async apply(b,handler){assert.equal(b.height,state.height+1);assert.equal(b.previousHash,state.hash);await handler({set:async()=>{}});state.height=b.height;state.hash=b.hash;applied.push(b.height);}};
}
function client({badEpoch=false,badNext=false,interrupt=false}={}){const requests=[];
 const actual=new PrepClient({url:'http://localhost/',fetch:async(_url,options)=>{
  assert.ok(options.signal instanceof AbortSignal);
  if(interrupt){process.emit('message',{type:'zeer-stop'});options.signal.throwIfAborted();}
  if(!options.body)return Response.json({network:'testnet',payload_kind:'full-v1',ready:true,start_block:100,epoch:'1',revision:'1',archive_height:105,indexed_height:105,source_height:105,lag_blocks:0,source_observed_at:Math.floor(Date.now()/1000),source_mode:'follower'});
  const q=JSON.parse(options.body);requests.push(q);return Response.json({network:'testnet',epoch:badEpoch?'2':'1',revision:'1',archive_height:105,from_block:q.from_block,to_block:q.to_block,next_block:badNext?q.to_block+1:q.to_block,cursor:null,data:{blocks:[block(q.from_block)],transactions:[]}});
 }});return{bounded:singleBlockClient(actual),requests};
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
