/** Explicit Root opt-in; original profiles and native confirmation rules stay pinned. */
import {lstat} from 'node:fs/promises';
import {readRootPermit} from './operator-qualification.ts';
import {fileURLToPath} from 'node:url';
import {pinnedFile,type FilePin} from './adapters/profile.ts';
export type BridgeL2Approval={version:1;purpose:'ROOT_BRIDGE_BASE_L2_EXECUTION';baseProfileSha256:string;castProfileSha256:string;publicPermitSha256:string;publicCommit:string;executionRoot:string;files:FilePin[];nativeSpend?:{templateSha256:string;workerSha256:string;supervisorSha256:string}};
export function requireBridgeL2Approval(a:BridgeL2Approval,scope:{baseProfileSha256:string;castProfileSha256:string;publicPermitSha256:string},actualEntry:string){
 if(a?.version!==1||a.purpose!=='ROOT_BRIDGE_BASE_L2_EXECUTION'||!scope||Object.entries(scope).some(([k,v])=>a[k as keyof BridgeL2Approval]!==v||!/^[a-f0-9]{64}$/.test(v))||!/^[a-f0-9]{40}$/.test(a.publicCommit)||!/^\/opt\/zeeswap-bridge-testnet\/releases\/[A-Za-z0-9._-]+\/app$/.test(a.executionRoot)||![a.executionRoot+'/api/scripts/serve-bridge-public-pilot.ts',a.executionRoot+'/api/scripts/bridge-base-preflight.ts'].includes(actualEntry))throw Error('BRIDGE_L2_ROOT_SCOPE');
 const required=['api/scripts/serve-bridge-public-pilot.ts','api/scripts/bridge-base-preflight.ts','api/src/bridge/base-l2-execution.ts','api/src/bridge/adapters/base.ts','api/src/bridge/adapters/cast.ts','api/src/bridge/model.ts','api/src/bridge/runtime.ts','api/src/bridge/reverse.ts','api/src/bridge/public-pilot.ts','api/src/bridge/public-worker.ts','api/src/bridge/adapters/native-authority.ts'];
 if(!Array.isArray(a.files)||a.files.length>300||new Set(a.files.map(p=>p.path)).size!==a.files.length||required.some(p=>!a.files.some(pin=>pin.path===a.executionRoot+'/'+p))||a.files.some(p=>!p.path.startsWith(a.executionRoot+'/')||p.path.split('/').some(s=>s==='..'||s==='.')||!/^[a-f0-9]{64}$/.test(p.sha256)))throw Error('BRIDGE_L2_EXECUTION_FILES');
}
export async function loadBridgeL2Execution(pin:FilePin|undefined,scope:{baseProfileSha256:string;castProfileSha256:string;publicPermitSha256:string},entryUrl:string){
 if(!pin)return undefined;
 if(!/^\/opt\/zeeswap-bridge-testnet\/private\/[A-Za-z0-9._-]+\.private\.json$/.test(pin.path))throw Error('BRIDGE_L2_ROOT_PIN');
 const recheck=async()=>{const a=await readRootPermit(pin.path,pin.sha256) as BridgeL2Approval;requireBridgeL2Approval(a,scope,fileURLToPath(entryUrl));for(const file of a.files){const s=await lstat(file.path);if(s.uid!==0||(s.mode&0o022)!==0)throw Error('BRIDGE_L2_CODE_OWNER');await pinnedFile(file);}return a;};
 const approval=await recheck();return {approval,pin,recheck:async()=>{await recheck();}};
}

export async function loadBridgeL2NativeExecution(pin:FilePin|undefined,baseProfileSha256:string,entryUrl:string){
 if(!pin)return undefined;const a=await readRootPermit(pin.path,pin.sha256) as BridgeL2Approval;
 return loadBridgeL2Execution(pin,{baseProfileSha256,castProfileSha256:a.castProfileSha256,publicPermitSha256:a.publicPermitSha256},entryUrl);
}
