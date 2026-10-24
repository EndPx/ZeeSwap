import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type{Pool}from'pg';
import type{BaseContract}from'../../src/base-contract.ts';
import {publicSettlementId}from'../../src/base-contract.ts';
import {PrivateData}from'../../src/private-data.ts';
import {observeEnvioOnce,replaceEnvioFundingHints,type EnvioAdmissionState}from'../../src/integrations/observation/envio-live.ts';
import {contentDigest,type Policy,type ReplaceRange,type BaseEvent}from'../../src/integrations/observation/types.ts';
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
const policy:Policy={adapter:'envio-hyperindex',network:'eip155:84532',birthday:100,registryDigest:'1'.repeat(64),projectionDigest:'2'.repeat(64),abiDigest:'3'.repeat(64),canonicalSourceId:'test',contract:`0x${'11'.repeat(20)}`,token:`0x${'22'.repeat(20)}`,maxBlocks:1000};
const id='11111111-1111-4111-8111-111111111111',settlement='22222222-2222-4222-8222-222222222222';
async function fixture(through:number,run:(args:Parameters<typeof observeEnvioOnce>,state:{advanced:boolean;exports:number;saved:EnvioAdmissionState[];requestedFrom?:number})=>Promise<void>){
 const time=new Date().toISOString(),header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
 const source:BaseEvent={kind:'base-contract-event',chainId:84532,contract:policy.contract!,token:policy.token!,abiDigest:policy.abiDigest!,txHash:hash(9999),transactionIndex:0,logIndex:0,block:header(550),event:'Funded',settlementId:publicSettlementId(settlement),amountAtomic:'100000',decoded:{id:publicSettlementId(settlement),payer:`0x${'33'.repeat(20)}`,amount:'100000',cancellationAvailableAt:'9999999999'}};
 const state={advanced:false,exports:0,saved:[] as EnvioAdmissionState[],requestedFrom:undefined as number|undefined};
 const server=createServer((request,response)=>{
  const url=new URL(request.url!,'http://localhost');assert.equal(request.headers.authorization,'Bearer test-token');response.setHeader('content-type','application/json');
  if(url.pathname.endsWith('/status')){response.end(JSON.stringify({protocol:'zee-envio-status-v1',checkpoint:{complete:true,through:{height:through}}}));return;}
  state.exports++;const from=Number(url.searchParams.get('from'));state.requestedFrom=from;
  const headers=Array.from({length:through-from+1},(_,index)=>header(from+index)),observations=[source].filter(row=>row.block.height>=from&&row.block.height<=through);
  const batch:ReplaceRange={headers,observations,coverage:{protocol:'zee-observation-v1',adapter:'envio-hyperindex',network:'eip155:84532',registryDigest:policy.registryDigest,projectionDigest:policy.projectionDigest,canonicalSourceId:'test',generation:'live-gen',revision:'3',fromHeight:from,through:header(through),complete:true,readStartedAt:time,readCompletedAt:time,sourceSampledAt:time,sourceHead:header(through+3),recoveryFloor:350,canonicalCheckAt:time,contentDigest:contentDigest({headers,observations})}};
  response.end(JSON.stringify({protocol:'zee-envio-export-v1',isolation:'repeatable-read-read-only',snapshotToken:'test-snapshot',expiresAt:new Date(Date.now()+30000).toISOString(),batch}));
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client={async query(sql:string){
  if(sql.includes('FOR UPDATE'))return{rows:[{network:'base-sepolia',scanned_height:'850',tip_hash:hash(850).slice(2),finalized_height:'390',finalized_time:time,observed_at:time}]};
  if(sql.includes('INSERT INTO zee.scanner_checkpoints'))state.advanced=true;
  if(sql.includes('SELECT epoch'))return{rows:[{epoch:'1'}]};return{rows:[]};},release(){}};
 const pool={async query(sql:string){
  if(sql.includes('WITH required'))return{rows:[{height:'850',expected_hash:hash(850).slice(2),persist:false},{height:'390',expected_hash:hash(390).slice(2),persist:true}]};
  if(sql.includes('SELECT scanned_height'))return{rows:[{scanned_height:'850'}]};
  if(sql.includes('count(*)'))return{rows:[{count:'1'}]};
  if(sql.includes('JOIN zee.escrow_bindings'))return{rows:[{id,settlement_id:settlement}]};return{rows:[]};},async connect(){return client;}} as unknown as Pool;
 const journal={version:2,hints:[],checkpoint:{height:500,hash:hash(500),generation:'live-gen',projectionDigest:policy.projectionDigest}} as EnvioAdmissionState;
 const hints={async load(){return journal;},async save(value:EnvioAdmissionState){if(value.hints.length&&state.saved.length===0)assert.equal(state.advanced,false);state.saved.push(structuredClone(value));}};
 const base={registry:{chainId:84532,contracts:{ZeeSwapSettlement:{address:policy.contract},MockUSDC:{address:policy.token}}}} as unknown as BaseContract;
 const canonical={async sample(){return{sourceId:'test',checkedAt:time,head:header(through+3),finalized:header(400)};},async header(height:number){return header(height);},async headers(heights:readonly number[]){return heights.map(header);}};
 try{await run([pool,new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2)),base,{url:`http://127.0.0.1:${(server.address() as{port:number}).port}`,token:'test-token',policy,canonical,hints}],state);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
test('delayed observer discovers Funded older than200 using its admission frontier despite SQLhead advancing elsewhere',async()=>{
 await fixture(900,async(args,state)=>{const result=await observeEnvioOnce(...args);assert.equal(result.pendingFundingHints,1);assert.equal(state.requestedFrom,469);assert.equal(state.advanced,true);assert.equal(state.saved.at(-1)?.hints[0]?.height,550);assert.equal(state.saved.at(-1)?.checkpoint?.height,900);});
});
test('more than1000complete blocks refuses before export, hint save or SQL checkpoint advance',async()=>{
 await fixture(1600,async(args,state)=>{await assert.rejects(observeEnvioOnce(...args),/ENVIO_ADMISSION_GAP/);assert.equal(state.exports,0);assert.equal(state.saved.length,0);assert.equal(state.advanced,false);});
});
test('canonical empty replacement invalidates orphaned pending hints only inside the replaced range',()=>{
 const hint={orderId:id,txHash:hash(9999) as`0x${string}`,height:550};const batch={coverage:{fromHeight:500,through:{height:600}},observations:[]}as unknown as ReplaceRange;
 assert.equal(replaceEnvioFundingHints([hint],batch,new Map()).pending.size,0);
 assert.equal(replaceEnvioFundingHints([{...hint,height:450}],batch,new Map()).pending.size,1);
});
