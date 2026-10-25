/** Explicit normal-reader transport authorization. Original producer/recovery identity is immutable. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import type {Stats} from 'node:fs';
import {loadLinuxEnvioProfile} from './linux-envio-profile.ts';
import {linuxRawSha256} from './linux-testnet-profile.ts';
import {object,requireThat,utc,parseHeader,stable,type Header} from './integrations/observation/types.ts';
import type {CanonicalReader} from './integrations/observation/chef.ts';
const root='/opt/zeeswap-testnet';
export const NORMAL_ENVIO_SOURCE='base-sepolia-publicnode-normal-rpc';
export const NORMAL_ENVIO_RPC='https://base-sepolia-rpc.publicnode.com';
export type NormalEnvioOverlay={version:1;status:'ROOT_ENVIO_NORMAL_RPC_OVERLAY_APPROVED';metadataOnly:true;noFinance:true;network:'eip155:84532';profileSha256:string;operatorProfileSha256:string;handoffSha256:string;generation:string;projectionDigest:string;originalSourceId:string;normalSourceId:string;normalRpcUrl:string;headerBatchSize:10;maxMethodsPerSecond:24;qualifiedAt:string;anchors:Header[]};
type Loaded=Awaited<ReturnType<typeof loadLinuxEnvioProfile>>;
export function normalEnvioOverlaySelector(env:NodeJS.ProcessEnv){
 const path=env.ZEESWAP_ENVIO_NORMAL_RPC_PROOF,sha256=env.ZEESWAP_ENVIO_NORMAL_RPC_SHA256;
 requireThat(Boolean(path)===Boolean(sha256),'NORMAL_OVERLAY_SELECTOR_PAIR');
 if(path)requireThat(path===root+'/state/envio/normal-rpc-overlay.private.json'&&/^[a-f0-9]{64}$/.test(sha256!),'NORMAL_OVERLAY_SELECTOR');
 return path?{path,sha256:sha256!}:undefined;
}
export function validateNormalOverlayFile(s:Pick<Stats,'isFile'|'isSymbolicLink'|'uid'|'gid'|'mode'|'size'>,dir:Pick<Stats,'isDirectory'|'isSymbolicLink'|'uid'|'gid'|'mode'>,resolved:string,parentResolved:string){
 requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===978&&(s.mode&0o777)===0o640&&s.size<=262144&&resolved===root+'/state/envio/normal-rpc-overlay.private.json'&&dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===986&&dir.gid===978&&(dir.mode&0o777)===0o700&&parentResolved===root+'/state/envio','NORMAL_OVERLAY_ROOT_FILE');
}
export function validateNormalEnvioOverlay(value:unknown,loaded:Loaded,profileSha256:string,now=Date.now()):NormalEnvioOverlay{
 const p=object(value,['version','status','metadataOnly','noFinance','network','profileSha256','operatorProfileSha256','handoffSha256','generation','projectionDigest','originalSourceId','normalSourceId','normalRpcUrl','headerBatchSize','maxMethodsPerSecond','qualifiedAt','anchors']) as unknown as NormalEnvioOverlay;
 requireThat(p.version===1&&p.status==='ROOT_ENVIO_NORMAL_RPC_OVERLAY_APPROVED'&&p.metadataOnly===true&&p.noFinance===true&&p.network==='eip155:84532','NORMAL_OVERLAY_SCOPE');
 requireThat(p.profileSha256===profileSha256&&p.operatorProfileSha256===loaded.profile.operatorProfile.sha256&&p.handoffSha256===loaded.profile.relocationProof.sha256&&p.generation===loaded.source.generation&&p.projectionDigest===loaded.source.policy.projectionDigest&&p.originalSourceId===loaded.source.policy.canonicalSourceId,'NORMAL_OVERLAY_IDENTITY');
 requireThat(p.normalSourceId===NORMAL_ENVIO_SOURCE&&p.normalRpcUrl===NORMAL_ENVIO_RPC&&p.normalSourceId!==p.originalSourceId&&p.headerBatchSize===10&&p.maxMethodsPerSecond===24,'NORMAL_OVERLAY_TRANSPORT');
 requireThat(Date.parse(utc(p.qualifiedAt))<=now&&Array.isArray(p.anchors)&&p.anchors.length>=2&&p.anchors.length<=500,'NORMAL_OVERLAY_QUALIFICATION');
 const seen=new Set<number>();for(const h of p.anchors){parseHeader(h,p.network);requireThat(!seen.has(h.height),'NORMAL_OVERLAY_DUPLICATE_ANCHOR');seen.add(h.height);}return p;
}
/** Qualifying historical facts are never refreshed; every invocation independently rechecks their hashes. */
export async function verifyNormalEnvioOverlay(p:NormalEnvioOverlay,canonical:CanonicalReader,signal:AbortSignal){
 const sample=await canonical.sample(signal);requireThat(sample.sourceId===p.normalSourceId&&Date.now()-Date.parse(sample.checkedAt)>=-5000&&Date.now()-Date.parse(sample.checkedAt)<=30000&&sample.finalized,'NORMAL_OVERLAY_CURRENT_SAMPLE');
 for(const expected of p.anchors){requireThat(expected.height<=sample.head.height,'NORMAL_OVERLAY_ANCHOR_AHEAD');const actual=await canonical.header(expected.height,signal);requireThat(stable(actual)===stable(expected),'NORMAL_OVERLAY_CANONICAL_CONFLICT');}
 signal.throwIfAborted();
}
export async function loadLinuxEnvioNormalProfile(path:string,env:NodeJS.ProcessEnv=process.env){
 const selector=normalEnvioOverlaySelector(env),profileBytes=await readFile(path),loaded=await loadLinuxEnvioProfile(path),proofPath=selector?.path,proofSha=selector?.sha256;
 requireThat((await readFile(path)).equals(profileBytes),'NORMAL_OVERLAY_PROFILE_CHANGED_DURING_LOAD');
 if(!proofPath)return{...loaded,normal:{url:loaded.profile.canonicalRpcUrl,sourceId:loaded.source.policy.canonicalSourceId,policy:loaded.source.policy,overlay:undefined as NormalEnvioOverlay|undefined,overlaySha256:undefined as string|undefined}};
 requireThat(proofPath===root+'/state/envio/normal-rpc-overlay.private.json'&&/^[a-f0-9]{64}$/.test(proofSha!),'NORMAL_OVERLAY_SELECTOR');
 const s=await lstat(proofPath),dir=await lstat(root+'/state/envio');validateNormalOverlayFile(s,dir,await realpath(proofPath),await realpath(root+'/state/envio'));
 const bytes=await readFile(proofPath);requireThat(linuxRawSha256(bytes)===proofSha,'NORMAL_OVERLAY_RAW_CHANGED');const overlay=validateNormalEnvioOverlay(JSON.parse(bytes.toString()),loaded,linuxRawSha256(profileBytes));
 return{...loaded,normal:{url:overlay.normalRpcUrl,sourceId:overlay.normalSourceId,policy:{...loaded.source.policy,canonicalSourceId:overlay.normalSourceId},overlay,overlaySha256:proofSha}};
}
