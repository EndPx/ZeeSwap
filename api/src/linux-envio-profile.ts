/** Separate Linux transport profile; never rewrites the Windows admission journal. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {posix} from 'node:path';
import {linuxRawSha256,type PinnedFile} from './linux-testnet-profile.ts';
import {validatePolicy,requireThat,type Policy} from './integrations/observation/types.ts';
const root='/opt/zeeswap-testnet';
export interface LinuxEnvioProfile {
 version:1;mode:'LINUX_ENVIO_TESTNET';
 operatorProfile:PinnedFile;runtime:PinnedFile;registry:PinnedFile;exportProfile:PinnedFile;exportCredentials:PinnedFile;token:PinnedFile;
 relocationProof:PinnedFile;oldAdmissionArchives:PinnedFile[];
 admissionPath:string;bootstrapReceiptPath:string;canonicalRpcUrl:string;sourceUrl:string;
}
export function validateLinuxEnvioShape(p:LinuxEnvioProfile){
 requireThat(p?.version===1&&p.mode==='LINUX_ENVIO_TESTNET','LINUX_ENVIO_PROFILE_REQUIRED');
 for(const item of [p.operatorProfile,p.runtime,p.registry,p.exportProfile,p.exportCredentials,p.token,p.relocationProof,...(p.oldAdmissionArchives??[])]){
  requireThat(item&&typeof item.path==='string'&&item.path.startsWith(root+'/secrets/')&&posix.normalize(item.path)===item.path&&!item.path.includes('\\')&&/^[0-9a-f]{64}$/.test(item.sha256),'LINUX_ENVIO_PIN_REQUIRED');
 }
 requireThat(p.oldAdmissionArchives?.length>0&&new Set(p.oldAdmissionArchives.map(i=>i.path)).size===p.oldAdmissionArchives.length,'LINUX_ENVIO_OLD_JOURNAL_INVENTORY_REQUIRED');
 requireThat(p.admissionPath===root+'/state/envio/admission.live.bin'&&p.bootstrapReceiptPath===root+'/state/envio/bootstrap-receipt.private.json','LINUX_ENVIO_STATE_PATH');
 requireThat(p.operatorProfile.path===root+'/secrets/linux-operator-profile.private.json'&&p.relocationProof.path===root+'/secrets/relocation-applied-proof.private.json','LINUX_ENVIO_HANDOFF_PATH');
 requireThat(p.sourceUrl==='http://127.0.0.1:8099'&&p.canonicalRpcUrl==='https://base-sepolia.gateway.tenderly.co','LINUX_ENVIO_ENDPOINT_SCOPE');return p;
}
export async function readLinuxEnvioPin(item:PinnedFile){
 const s=await lstat(item.path);requireThat(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o027)===0&&await realpath(item.path)===item.path,'LINUX_ENVIO_PRIVATE_FILE_REQUIRED');
 const bytes=await readFile(item.path);requireThat(linuxRawSha256(bytes)===item.sha256,'LINUX_ENVIO_PIN_CHANGED');return bytes;
}
export function requireLinuxEnvioBootstrap(proof:any,profileSha256:string,control:any,counts:Record<string,unknown>,now=Date.now()){
 const age=now-Date.parse(proof.verifiedAt);
 requireThat(proof.status==='PREFUNDING_RELOCATION_VERIFIED'&&proof.profileSha256===profileSha256&&proof.branchId==='br-broad-pine-ao79wemx'&&proof.database==='zee_app_20261023'&&proof.openingLedgerUnchanged===true&&proof.originalWalletCopyHashesVerified===true&&proof.logicalUfvkIdentityVerified===true&&proof.operatorNonce===0&&age>=0&&age<=300000,'LINUX_ENVIO_FRESH_HANDOFF_PROOF_REQUIRED');
 requireThat(control?.accepting_orders===false&&control.dispatch_enabled===false&&control.reconciliation_required===true&&String(control.epoch)==='0'&&Object.keys(counts).sort().join(',')==='deposits,obligations,operations,orders,quotes'&&Object.values(counts).every(n=>String(n)==='0'),'LINUX_ENVIO_EMPTY_PAUSED_APP_REQUIRED');
}
export async function loadLinuxEnvioProfile(path:string){
 requireThat(process.platform==='linux'&&path===root+'/secrets/linux-envio-profile.private.json','LINUX_ENVIO_NATIVE_PATH_REQUIRED');
 const stat=await lstat(path);requireThat(!stat.isSymbolicLink()&&(stat.mode&0o027)===0&&await realpath(path)===path,'LINUX_ENVIO_PRIVATE_PROFILE_REQUIRED');
 const p=validateLinuxEnvioShape(JSON.parse(await readFile(path,'utf8')));
 const operator=JSON.parse((await readLinuxEnvioPin(p.operatorProfile)).toString());
 requireThat(operator.immutable?.runtime?.sha256===p.runtime.sha256&&operator.immutable?.registry?.sha256===p.registry.sha256,'LINUX_ENVIO_OPERATOR_BINDING');
 const values=await Promise.all([p.runtime,p.registry,p.exportProfile,p.exportCredentials,p.token,...p.oldAdmissionArchives].map(readLinuxEnvioPin));
 const runtime=JSON.parse(values[0]!.toString()),registry=JSON.parse(values[1]!.toString()),source=JSON.parse(values[2]!.toString()) as {schema:string;policy:Policy;port:number;databaseUrlEnv:string;tokenEnv:string;generation:string};
 requireThat(runtime.projectId==='raspy-truth-63998651'&&runtime.branchId==='br-broad-pine-ao79wemx'&&runtime.database==='zee_app_20261023'&&runtime.host==='ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech','LINUX_ENVIO_RUNTIME_SCOPE');
 const worker=new URL(runtime.workerUrl);requireThat(worker.hostname===runtime.host&&worker.pathname==='/zee_app_20261023'&&decodeURIComponent(worker.username)==='zee_app_worker_20261023','LINUX_ENVIO_WORKER_SCOPE');
 validatePolicy(source.policy);
 requireThat(source.schema==='envio_live_final'&&source.port===8099&&source.policy.birthday===49128651&&source.policy.adapter==='envio-hyperindex'&&source.policy.network==='eip155:84532'&&source.policy.projectionDigest==='91dad6a1a769d95f7ccfa8286e5bf2d55bf01225e1e86f9adbf9f2bcc1662e27'&&source.policy.canonicalSourceId==='base-sepolia-tenderly-rpc','LINUX_ENVIO_SOURCE_SCOPE');
 requireThat(source.generation==='envio314-91dad6a1a769d95f7ccfa828-preintake-20261023T113615131Z','LINUX_ENVIO_ORIGINAL_GENERATION_REQUIRED');
 requireThat(registry.chainId===84532&&registry.operator.toLowerCase()==='0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'&&source.policy.contract===registry.contracts.ZeeSwapSettlement.address.toLowerCase()&&source.policy.token===registry.contracts.MockUSDC.address.toLowerCase(),'LINUX_ENVIO_REGISTRY_SCOPE');
 const credential=JSON.parse(values[3]!.toString()),exportDb=new URL(credential.databaseUrl);
 requireThat(exportDb.hostname===runtime.host&&exportDb.pathname==='/zee_envio_20261023'&&decodeURIComponent(exportDb.username)==='zee_envio_export_20261023','LINUX_ENVIO_EXPORT_ROLE_SCOPE');
 const token=values[4]!.toString().trim();requireThat(token.length>=32,'AUTH_REQUIRED');
 return {profile:p,runtime,registry,source,credential,token};
}
