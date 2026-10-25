import test from 'node:test';import assert from 'node:assert/strict';
import {validateNormalOverlayFile,normalEnvioOverlaySelector,validateNormalEnvioOverlay,verifyNormalEnvioOverlay,NORMAL_ENVIO_SOURCE,NORMAL_ENVIO_RPC,type NormalEnvioOverlay} from '../../src/linux-envio-normal-profile.ts';
import {consumeEnvioExport} from '../../src/integrations/observation/envio.ts';
import {normalEnvioCanonical} from '../../scripts/observe-linux-envio.ts';
import {canonicalRpc} from '../../src/integrations/observation/canonical-rpc.ts';
import {contentDigest,type Policy,type Header} from '../../src/integrations/observation/types.ts';
import type {loadLinuxEnvioProfile} from '../../src/linux-envio-profile.ts';
const now=Date.now(),stamp=new Date(now).toISOString(),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const header=(n:number):Header=>({height:n,hash:hash(n),parentHash:hash(n-1),time:stamp});
const policy:Policy={adapter:'envio-hyperindex',network:'eip155:84532',birthday:100,registryDigest:'a'.repeat(64),projectionDigest:'b'.repeat(64),abiDigest:'c'.repeat(64),canonicalSourceId:'base-sepolia-tenderly-rpc',contract:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20)};
const loaded={profile:{operatorProfile:{sha256:'d'.repeat(64)},relocationProof:{sha256:'e'.repeat(64)}},source:{generation:'original-generation',policy}} as Awaited<ReturnType<typeof loadLinuxEnvioProfile>>;
const proof=():NormalEnvioOverlay=>({version:1,status:'ROOT_ENVIO_NORMAL_RPC_OVERLAY_APPROVED',metadataOnly:true,noFinance:true,network:'eip155:84532',profileSha256:'f'.repeat(64),operatorProfileSha256:'d'.repeat(64),handoffSha256:'e'.repeat(64),generation:'original-generation',projectionDigest:policy.projectionDigest,originalSourceId:policy.canonicalSourceId,normalSourceId:NORMAL_ENVIO_SOURCE,normalRpcUrl:NORMAL_ENVIO_RPC,headerBatchSize:10,maxMethodsPerSecond:24,qualifiedAt:stamp,anchors:[header(100),header(101)]});
test('normal overlay is separate identity and cannot alter original producer/profile/generation or use arbitrary fallback',()=>{
 const original=JSON.stringify(loaded);validateNormalEnvioOverlay(proof(),loaded,'f'.repeat(64),now);assert.equal(JSON.stringify(loaded),original);
 for(const mutate of[(p:any)=>p.normalSourceId=policy.canonicalSourceId,(p:any)=>p.normalRpcUrl='https://other.test',(p:any)=>p.generation='new',(p:any)=>p.projectionDigest='9'.repeat(64),(p:any)=>p.handoffSha256='9'.repeat(64),(p:any)=>p.profileSha256='9'.repeat(64),(p:any)=>p.noFinance=false,(p:any)=>p.extra=true,(p:any)=>p.maxMethodsPerSecond=25,(p:any)=>p.headerBatchSize=11,(p:any)=>p.qualifiedAt=new Date(now+1).toISOString(),(p:any)=>p.anchors=[header(100),header(100)]]){const p=proof();mutate(p);assert.throws(()=>validateNormalEnvioOverlay(p,loaded,'f'.repeat(64),now));}
});
const reader=(sourceId=NORMAL_ENVIO_SOURCE)=>({sample:async()=>({sourceId,checkedAt:new Date().toISOString(),head:header(110),finalized:header(101)}),header:async(n:number)=>header(n)});
test('historical overlay anchors are actually independently checked, refusal never retries another source',async()=>{
 const calls:number[]=[];await verifyNormalEnvioOverlay(proof(),{...reader(),header:async n=>{calls.push(n);return header(n);}},AbortSignal.timeout(1000));assert.deepEqual(calls,[100,101]);
 await assert.rejects(verifyNormalEnvioOverlay(proof(),reader(policy.canonicalSourceId),AbortSignal.timeout(1000)),/CURRENT_SAMPLE/);
 await assert.rejects(verifyNormalEnvioOverlay(proof(),{...reader(),header:async n=>({...header(n),hash:hash(999)})},AbortSignal.timeout(1000)),/CANONICAL_CONFLICT/);
});
function packet(){const headers=[header(100),header(101)],observations:never[]=[];return{protocol:'zee-envio-export-v1',isolation:'repeatable-read-read-only',snapshotToken:'fixture',expiresAt:new Date(now+30000).toISOString(),batch:{headers,observations,coverage:{protocol:'zee-observation-v1',adapter:policy.adapter,network:policy.network,registryDigest:policy.registryDigest,projectionDigest:policy.projectionDigest,generation:'original-generation',revision:'1',fromHeight:100,through:header(101),complete:true,readStartedAt:stamp,readCompletedAt:stamp,sourceSampledAt:stamp,sourceHead:header(110),recoveryFloor:100,canonicalCheckAt:stamp,canonicalSourceId:policy.canonicalSourceId,contentDigest:contentDigest({headers,observations})}}};}
test('coherent producer identity remains unchanged while explicit normal sample identity must match',async()=>{
 await assert.rejects(consumeEnvioExport(packet(),policy,reader(),now),/WRONG_CANONICAL_SOURCE/);
 const p=packet(),before=JSON.stringify(p),result=await consumeEnvioExport(p,policy,reader(),now,AbortSignal.timeout(1000),()=>0,NORMAL_ENVIO_SOURCE);
 assert.equal(result.coverage.canonicalSourceId,policy.canonicalSourceId);assert.equal(JSON.stringify(p),before);
 await assert.rejects(consumeEnvioExport(packet(),policy,reader(policy.canonicalSourceId),now,AbortSignal.timeout(1000),()=>0,NORMAL_ENVIO_SOURCE),/WRONG_CANONICAL_SOURCE/);
 const conflict={...reader(),header:async(n:number)=>({...header(n),hash:hash(999)})};await assert.rejects(consumeEnvioExport(packet(),policy,conflict,now,AbortSignal.timeout(1000),()=>0,NORMAL_ENVIO_SOURCE),/SOURCE_HASH_CONFLICT/);
});
test('actual RPC adapter checks chain84532 and reports honest normal source without producer rewrite',async()=>{
 const calls:string[]=[];const fetcher=(async(_url:unknown,init:any)=>{const req=JSON.parse(init.body),rows=Array.isArray(req)?req:[req],response=rows.map((r:any)=>{calls.push(r.method);return{id:r.id,jsonrpc:'2.0',result:r.method==='eth_chainId'?'0x14a34':{number:r.params[0]==='latest'?'0x6e':r.params[0]==='finalized'?'0x65':r.params[0],hash:hash(r.params[0]==='latest'?110:r.params[0]==='finalized'?101:Number(r.params[0])),parentHash:hash(r.params[0]==='latest'?109:r.params[0]==='finalized'?100:Number(r.params[0])-1),timestamp:'0x'+Math.floor(now/1000).toString(16)}};});return Response.json(Array.isArray(req)?response:response[0]);}) as typeof fetch;
 const rpc=canonicalRpc({url:NORMAL_ENVIO_RPC,sourceId:NORMAL_ENVIO_SOURCE,network:'eip155:84532',fetch:fetcher});const sample=await rpc.sample(AbortSignal.timeout(2000));assert.equal(sample.sourceId,NORMAL_ENVIO_SOURCE);assert.equal(sample.finalized?.height,101);assert.ok(calls.includes('eth_chainId'));
});

test('explicit selector is paired and missing/redirected proof cannot silently fall back',()=>{
 assert.equal(normalEnvioOverlaySelector({}),undefined);
 const env={ZEESWAP_ENVIO_NORMAL_RPC_PROOF:'/opt/zeeswap-testnet/state/envio/normal-rpc-overlay.private.json',ZEESWAP_ENVIO_NORMAL_RPC_SHA256:'a'.repeat(64)};
 assert.deepEqual(normalEnvioOverlaySelector(env),{path:env.ZEESWAP_ENVIO_NORMAL_RPC_PROOF,sha256:env.ZEESWAP_ENVIO_NORMAL_RPC_SHA256});
 for(const e of [{ZEESWAP_ENVIO_NORMAL_RPC_PROOF:env.ZEESWAP_ENVIO_NORMAL_RPC_PROOF},{ZEESWAP_ENVIO_NORMAL_RPC_SHA256:env.ZEESWAP_ENVIO_NORMAL_RPC_SHA256},{...env,ZEESWAP_ENVIO_NORMAL_RPC_PROOF:'/tmp/redirect'},{...env,ZEESWAP_ENVIO_NORMAL_RPC_SHA256:'invalid'}])assert.throws(()=>normalEnvioOverlaySelector(e));
});
test('Root-pinned transport changes only normal factory pacing; legacy factory remains5/11',()=>{
 assert.equal(normalEnvioCanonical(NORMAL_ENVIO_RPC,NORMAL_ENVIO_SOURCE,{},proof()).headerBatchSize,10);
 assert.equal(normalEnvioCanonical(NORMAL_ENVIO_RPC,NORMAL_ENVIO_SOURCE).headerBatchSize,5);
 assert.throws(()=>normalEnvioCanonical(NORMAL_ENVIO_RPC,NORMAL_ENVIO_SOURCE,{}, {headerBatchSize:10,maxMethodsPerSecond:25} as any),/NORMAL_OVERLAY_PACING/);
});

test('Root-pinned proof permits observer-writable admission directory but rejects observer-owned replacements',()=>{
 const file={isFile:()=>true,isSymbolicLink:()=>false,uid:0,gid:978,mode:0o640,size:1000},dir={isDirectory:()=>true,isSymbolicLink:()=>false,uid:986,gid:978,mode:0o700},path='/opt/zeeswap-testnet/state/envio/normal-rpc-overlay.private.json',parent='/opt/zeeswap-testnet/state/envio';
 validateNormalOverlayFile(file,dir,path,parent);assert.throws(()=>validateNormalOverlayFile(file,{...dir,mode:0o777},path,parent),/ROOT_FILE/);
 for(const replacement of [{...file,uid:986},{...file,mode:0o660},{...file,gid:0},{...file,isSymbolicLink:()=>true}])assert.throws(()=>validateNormalOverlayFile(replacement,dir,path,parent),/ROOT_FILE/);
 assert.throws(()=>validateNormalOverlayFile(file,{...dir,uid:999},path,parent),/ROOT_FILE/);assert.throws(()=>validateNormalOverlayFile(file,dir,path,parent+'/redirect'),/ROOT_FILE/);
});
