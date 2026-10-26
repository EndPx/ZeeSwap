import {readFile,lstat,realpath,open,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
export const ROOT='/opt/zeeswap-testnet',APP=ROOT+'/current/app',API=APP+'/api',PROJECT=ROOT+'/state/envio-engine/project';
export const NODE_SHA='e237a2839d0cbdc9a9a2adda1a184afc0f5b20306ffbe923af5686550472d8a8';
export const GENERATION='envio314-91dad6a1a769d95f7ccfa828-preintake-20261023T113615131Z';
export const PROJECTION='91dad6a1a769d95f7ccfa8286e5bf2d55bf01225e1e86f9adbf9f2bcc1662e27';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const need=(v,c)=>{if(!v)throw Error(c);};
export const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const eventFirst=c=>c?.version===2&&c.scope==='ZEESWAP_EVENT_FIRST_ENVIO_SOURCE_DOCKER';
const canonical=v=>JSON.stringify(sort(v));function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,sort(x)])):v;}
export function producerProjection(pins){const sources={};for(const name of['live.yaml','schema.graphql','src/handlers/settlement.ts','src/headers.ts','src/event-first-tip.ts']){const p=pins.find(p=>p.path===PROJECT+'/'+name);need(p&&hash(p.sha256),'CONFIG_EVENT_FIRST_PROJECTION_INPUT');sources[name]=p.sha256;}return sha(Buffer.from(canonical({recipe:'envio-event-first-sdk-mvcc-exact-log-v1',envio:'3.14.0',schemaRetained:true,handlerName:'ZeeSwapEmptyBlockVisits',tipId:'84532:source-tip',sources})));}
export function validateConfig(c,component){
 const v2=eventFirst(c);need((v2||c?.version===1&&c.scope==='ZEESWAP_EXISTING_ENVIO_SOURCE_DOCKER')&&c.metadataOnly===true&&c.noFinance===true&&['engine','export'].includes(component)&&c.component===component,'CONFIG_COMPONENT');
 need(c.database==='zee_envio_20261023'&&c.schema==='envio_live_final'&&c.nodeSha256===NODE_SHA&&(v2?hash(c.projectionDigest)&&c.projectionDigest!==PROJECTION&&typeof c.generation==='string'&&c.generation.startsWith('envio314-event-first-'+c.projectionDigest.slice(0,24)+'-')&&c.generation.length<=100:c.generation===GENERATION&&c.projectionDigest===PROJECTION),'CONFIG_EXISTING_IDENTITY');
 need(Array.isArray(c.publicPins)&&c.publicPins.length>=3&&c.publicPins.length<=512&&new Set(c.publicPins.map(p=>p.path)).size===c.publicPins.length,'CONFIG_PUBLIC_PINS');
 for(const p of c.publicPins)need(p&&hash(p.sha256)&&typeof p.path==='string'&&!p.path.includes('..')&&[APP+'/',ROOT+'/releases/linux-live-20261024/app/',PROJECT+'/',ROOT+'/tools/pnpm-10.21.0/'].some(prefix=>p.path.startsWith(prefix))&&!/\.private\.|\/(?:wallet|secrets)\//i.test(p.path),'CONFIG_PUBLIC_PATH');
 if(v2)need(producerProjection(c.publicPins)===c.projectionDigest,'CONFIG_EVENT_FIRST_CODE_PROJECTION');
 for(const [key,path] of [['exportProfile','/run/zeeswap-envio/export-profile.private.json'],['exportCredentials','/run/zeeswap-envio/export-credentials.private.json'],['exportToken','/run/zeeswap-envio/export-token.private.txt']])need(c[key]?.path===path&&hash(c[key].sha256),'CONFIG_EXPORT_PIN');
 if(component==='engine'){
  need(c.systemCa?.path==='/etc/ssl/certs/ca-certificates.crt'&&hash(c.systemCa.sha256),'CONFIG_NATIVE_TLS_CA_PIN');
  need(c.engineEnvironment?.path==='/run/zeeswap-envio/engine.private.env'&&hash(c.engineEnvironment.sha256)&&c.sdkChecksum?.path===ROOT+'/secrets/envio-sdk-runtime.sha256'&&hash(c.sdkChecksum.sha256),'CONFIG_ENGINE_PIN');
  for(const path of [APP+'/deploy/linux/envio/run-engine.sh',APP+'/deploy/linux/envio/rpc-coalescer.mjs',PROJECT+'/node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs',PROJECT+'/node_modules/.pnpm/envio-linux-x64@3.14.0/node_modules/envio-linux-x64/envio.node',ROOT+'/tools/pnpm-10.21.0/bin/pnpm.cjs',PROJECT+'/live.yaml',PROJECT+'/package.json',PROJECT+'/schema.graphql',PROJECT+'/src/headers.ts',PROJECT+'/src/handlers/settlement.ts'])need(c.publicPins.some(p=>p.path===path),'CONFIG_ENGINE_CLOSURE');
 }else for(const path of (v2?[API+'/package.json',APP+'/pnpm-lock.yaml',API+'/scripts/envio-event-first-export-server.ts',API+'/src/envio-event-first-profile.ts',API+'/src/integrations/observation/envio-event-first.ts',API+'/src/integrations/observation/envio-event-first-store.ts',API+'/src/integrations/observation/envio-event-first-rpc.ts',API+'/src/integrations/observation/canonical-rpc.ts',API+'/src/integrations/observation/chef.ts',API+'/src/integrations/observation/types.ts']:[API+'/scripts/envio-export-server.ts',API+'/src/integrations/observation/envio.ts',API+'/src/integrations/observation/envio-selected-export.ts',API+'/src/integrations/observation/types.ts']))need(c.publicPins.some(p=>p.path===path),'CONFIG_EXPORT_CLOSURE');
 return c;
}
export async function pinned(p,secret=false){
 need(p&&hash(p.sha256),'PIN_REQUIRED');const s=await lstat(p.path);
 need(s.isFile()&&!s.isSymbolicLink()&&s.size<=268435456&&[0,986].includes(s.uid)&&(s.mode&0o022)===0,'PIN_FILE');
 if(secret)need(s.uid===0&&s.gid===978&&(s.mode&0o777)===0o640&&s.size<=1048576&&await realpath(p.path)===p.path,'SECRET_MODE');
 const h=createHash('sha256');for await(const chunk of createReadStream(p.path))h.update(chunk);need(h.digest('hex')===p.sha256,'PIN_CHANGED');
}
export async function loadConfig(component,env=process.env,verifyCode=true){
 need(process.platform==='linux'&&process.getuid?.()===986&&process.getgid?.()===978&&process.execPath==='/usr/bin/node'&&process.versions.node.split('.')[0]==='24','NATIVE_CONTAINER_SCOPE');
 const directory=await lstat('/run/zeeswap-envio');need(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===0&&directory.gid===978&&(directory.mode&0o777)===0o750,'SECRET_DIRECTORY');
 const allowed=['config.private.json','export-profile.private.json','export-credentials.private.json','export-token.private.txt',...(component==='engine'?['engine.private.env','envio-live.yaml','envio-sdk-runtime.sha256']:[])];
 const names=await readdir('/run/zeeswap-envio');need(names.length===allowed.length&&names.every(n=>allowed.includes(n)),'SECRET_STAGE_EXACT_FILES');
 const path='/run/zeeswap-envio/config.private.json';await pinned({path,sha256:env.ENVIO_DOCKER_CONFIG_SHA256},true);if(verifyCode)await pinned({path:'/usr/bin/node',sha256:NODE_SHA});
 const cfg=validateConfig(JSON.parse(await readFile(path,'utf8')),component);if(verifyCode)for(const p of cfg.publicPins)await pinned(p);for(const key of ['exportProfile','exportCredentials','exportToken'])await pinned(cfg[key],true);if(component==='engine'&&verifyCode){await pinned(cfg.engineEnvironment,true);await pinned(cfg.sdkChecksum,true);await pinned(cfg.systemCa);}return cfg;
}
export async function exportInputs(cfg){
 const profile=JSON.parse(await readFile(cfg.exportProfile.path,'utf8')),credential=JSON.parse(await readFile(cfg.exportCredentials.path,'utf8')),token=(await readFile(cfg.exportToken.path,'utf8')).trim(),url=new URL(credential.databaseUrl);
 need(profile.schema===cfg.schema&&profile.generation===cfg.generation&&profile.policy?.projectionDigest===cfg.projectionDigest&&profile.policy?.network==='eip155:84532'&&profile.policy?.birthday===49128651&&profile.port===8099,'EXPORT_PROFILE_IDENTITY');
 need(url.hostname==='ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech'&&url.pathname==='/zee_envio_20261023'&&decodeURIComponent(url.username)==='zee_envio_export_20261023'&&token.length>=32&&token.length<=4096,'EXPORT_READONLY_IDENTITY');
 need(profile.databaseUrlEnv==='ENVIO_EXPORT_DATABASE_URL'&&profile.tokenEnv==='ENVIO_EXPORT_TOKEN','EXPORT_ENV_NAMES');if(eventFirst(cfg))need(profile.version===1&&profile.protocol==='zee-envio-event-first-export-v1'&&profile.verification?.sourceId==='base-sepolia-publicnode-normal-rpc'&&profile.verification.url==='https://base-sepolia-rpc.publicnode.com'&&profile.verification.headerBatchSize===10&&profile.verification.maxMethodsPerSecond===24,'EXPORT_EVENT_FIRST_PROTOCOL');return{profile,credential,token};
}
export function engineEnvironment(bytes){
 const env=parseEnv(bytes);need(Object.keys(env).length>0&&Object.keys(env).length<=64&&Object.keys(env).every(k=>/^(?:ENVIO_[A-Z0-9_]+|ZEESWAP_[A-Z0-9_]+|NODE_OPTIONS|COREPACK_ENABLE_NETWORK|npm_config_manage_package_manager_versions)$/.test(k)),'ENGINE_ENV_KEYS');return env;
}
export function nativeEngineEnvironment(bytes,ca,cfg){need(ca?.path==='/etc/ssl/certs/ca-certificates.crt'&&hash(ca.sha256),'CONFIG_NATIVE_TLS_CA_PIN');const env=engineEnvironment(bytes);if(eventFirst(cfg))need(env.ZEESWAP_EVENT_FIRST==='true'&&env.ZEESWAP_EVENT_FIRST_REHEARSAL===undefined&&env.ZEESWAP_EVENT_FIRST_MAX_BLOCK===undefined,'CONFIG_EVENT_FIRST_PRODUCTION_ONLY');else need(['ZEESWAP_EVENT_FIRST','ZEESWAP_EVENT_FIRST_REHEARSAL','ZEESWAP_EVENT_FIRST_MAX_BLOCK'].every(k=>env[k]===undefined),'CONFIG_V1_FORBIDS_EVENT_FIRST_MODE');return{...env,SSL_CERT_FILE:ca.path};}
export function validateSourceCheckpoint(p,now=Date.now()){
 need(p?.complete===true&&p.generation===GENERATION&&p.projectionDigest===PROJECTION,'SOURCE_IDENTITY');
 const age=now-Date.parse(p.sourceSampledAt);need(Number.isFinite(age)&&age>=-5000&&age<=60000&&Number.isSafeInteger(p.through?.height)&&Number.isSafeInteger(p.sourceHead?.height)&&p.sourceHead.height>=p.through.height&&p.sourceHead.height-p.through.height<=40,'SOURCE_NOT_FRESH');return{through:p.through.height,sourceHead:p.sourceHead.height,sourceAgeMs:age};
}
export async function durable(path,value){const f=await open(path,'wx',0o600);try{await f.writeFile(JSON.stringify(value)+'\n');await f.sync();}finally{await f.close();}const d=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await d.sync();}finally{await d.close();}}
