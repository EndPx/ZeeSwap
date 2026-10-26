import {lstat,readFile,realpath} from 'node:fs/promises';
import {digest,object,requireThat,validatePolicy,type Policy} from './integrations/observation/types.ts';
import {safeEndpoint} from './integrations/observation/chef.ts';
export type EventFirstExportConfig={version:1;protocol:'zee-envio-event-first-export-v1';generation:string;policy:Policy;schema:string;databaseUrlEnv:string;tokenEnv:string;port:number;verification:{sourceId:string;url:string;headerBatchSize:10;maxMethodsPerSecond:24}};
/** Input hashes are actual staged bytes at their runtime-relative names, including the new tip helper. */
export function eventFirstProducerIdentity(pins:Record<string,string>,issuedAt:string){
 const files=['live.yaml','schema.graphql','src/handlers/settlement.ts','src/headers.ts','src/event-first-tip.ts'];requireThat(Object.keys(pins).sort().join(',')===[...files].sort().join(',')&&Object.values(pins).every(v=>/^[a-f0-9]{64}$/.test(v)),'EVENT_FIRST_PROJECTION_INPUTS');requireThat(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(issuedAt)&&Number.isFinite(Date.parse(issuedAt)),'EVENT_FIRST_PROJECTION_TIME');const projectionDigest=digest({recipe:'envio-event-first-sdk-mvcc-exact-log-v1',envio:'3.14.0',schemaRetained:true,handlerName:'ZeeSwapEmptyBlockVisits',tipId:'84532:source-tip',sources:pins});return{projectionDigest,generation:'envio314-event-first-'+projectionDigest.slice(0,24)+'-'+issuedAt.replace(/[^0-9TZ]/g,'')};
}
export function validateEventFirstExportConfig(value:unknown):EventFirstExportConfig{
 const c=object(value,['version','protocol','generation','policy','schema','databaseUrlEnv','tokenEnv','port','verification']) as unknown as EventFirstExportConfig;
 object(c.verification,['sourceId','url','headerBatchSize','maxMethodsPerSecond']);validatePolicy(c.policy);
 requireThat(c.version===1&&c.protocol==='zee-envio-event-first-export-v1'&&c.policy.adapter==='envio-hyperindex'&&(c.policy.contractVersion??'v1')==='v1'&&/^[A-Za-z0-9_-]{1,100}$/.test(c.generation)&&/^[a-z_][a-z0-9_]{0,62}$/.test(c.schema),'EVENT_FIRST_CONFIG_IDENTITY');
 requireThat(c.databaseUrlEnv==='ENVIO_EXPORT_DATABASE_URL'&&c.tokenEnv==='ENVIO_EXPORT_TOKEN'&&Number.isInteger(c.port)&&c.port>=1024&&c.port<=65535,'EVENT_FIRST_CONFIG_INPUTS');
 requireThat(c.verification.sourceId==='base-sepolia-publicnode-normal-rpc'&&c.verification.url==='https://base-sepolia-rpc.publicnode.com'&&c.verification.headerBatchSize===10&&c.verification.maxMethodsPerSecond===24,'EVENT_FIRST_VERIFIER_EXPLICIT');safeEndpoint(c.verification.url);return c;
}
/** Standalone source config: no wallet/operator key or financial authority is loaded. */
export async function loadEventFirstExportConfig(path:string,sha256:string){
 requireThat(path==='/opt/zeeswap-testnet/secrets/envio-event-first-export-profile.private.json'&&/^[a-f0-9]{64}$/.test(sha256),'EVENT_FIRST_CONFIG_SELECTOR');
 const stat=await lstat(path);requireThat(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&stat.gid===978&&(stat.mode&0o777)===0o640&&stat.size<=65536&&await realpath(path)===path,'EVENT_FIRST_CONFIG_PROTECTION');
 const bytes=await readFile(path);const {createHash}=await import('node:crypto');requireThat(createHash('sha256').update(bytes).digest('hex')===sha256,'EVENT_FIRST_CONFIG_SHA');return validateEventFirstExportConfig(JSON.parse(bytes.toString('utf8')));
}
