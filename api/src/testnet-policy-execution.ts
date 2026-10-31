/** Audited policy-worker JS import and literal source-asset closure.
 * Native SDK/wallet scripts stay separately bound to the original profile. */
import {posix} from 'node:path';
export const POLICY_WORKER_EXECUTION_PATHS=[
  "api/scripts/work-linux-testnet-policy.ts",
  "api/src/amounts.ts",
  "api/src/base-contract.ts",
  "api/src/base-escrow.ts",
  "api/src/base-observer-read-retry.ts",
  "api/src/base-receipt-readiness.ts",
  "api/src/base-settlement.ts",
  "api/src/base-signer-protocol.ts",
  "api/src/base-signer.ts",
  "api/src/db.ts",
  "api/src/fixed-pricing.ts",
  "api/src/integrations/observation/types.ts",
  "api/src/lease-heartbeat.ts",
  "api/src/linux-control.ts",
  "api/src/linux-forward-dispatch.ts",
  "api/src/linux-native-dispatch.ts",
  "api/src/linux-testnet-profile.ts",
  "api/src/live-dispatch-scope.ts",
  "api/src/live-reverse-capital.ts",
  "api/src/live-reverse-dispatch.ts",
  "api/src/live-source-refund.ts",
  "api/src/live-testnet-opening.ts",
  "api/src/main-database-relocation.ts",
  "api/src/market-pricing.ts",
  "api/src/market-reference/cache.mjs",
  "api/src/market-reference/provider.mjs",
  "api/src/native-circle-continuation.ts",
  "api/src/native-circle-reconciled.ts",
  "api/src/native-circle-replacement.ts",
  "api/src/observer-frontiers.ts",
  "api/src/observer.ts",
  "api/src/prefunding-epoch.ts",
  "api/src/private-data.ts",
  "api/src/repository.ts",
  "api/src/reverse-authority.ts",
  "api/src/reverse-settlement.ts",
  "api/src/reverse-wallet-adapter.ts",
  "api/src/source-refunds.ts",
  "api/src/testnet-policy-capital-builder.ts",
  "api/src/testnet-policy-capital.ts",
  "api/src/testnet-policy-execution.ts",
  "api/src/testnet-policy-refund.ts",
  "api/src/testnet-policy-worker.ts",
  "api/src/testnet-service-policy.ts",
  "api/src/wallet-adapter.ts",
  "api/src/wallet-scanner-protocol.ts",
  "contracts/deployments/base-sepolia.json",
  "workers/zcash-wallet/snapshot.schema.json"
] as const;
export interface WorkerExecutionPin {path:string;sha256:string;}
export interface WorkerExecutionConfig {executionRoot:string;publicCommit:string;executionManifest:WorkerExecutionPin;forwardFastExecution?:WorkerExecutionPin;}
/** Root review changes only forward execution, retaining the original policy and native profiles. */
export interface ForwardFastExecutionApproval {
 nativeExecution?:WorkerExecutionPin;
 version:1;purpose:'ROOT_BASE_L2_FAST_EXECUTION';policySha256:string;activeEpoch:string;policyPublicCommit:string;profileSha256:string;
 executionRoot:string;publicCommit:string;executionManifest:WorkerExecutionPin;
 signerScript:WorkerExecutionPin;signerDiagnostics:WorkerExecutionPin;supervisor:WorkerExecutionPin;signerConfig:WorkerExecutionPin;originalSignerConfigSha256:string;
}
export function requireForwardFastExecution(a:ForwardFastExecutionApproval,c:WorkerExecutionConfig,policy:{sha256:string;activeEpoch:string;publicCommit:string},profileSha256:string){
 need(a?.version===1&&a.purpose==='ROOT_BASE_L2_FAST_EXECUTION','FORWARD_FAST_PURPOSE');
 need(a.policySha256===policy.sha256&&a.activeEpoch===policy.activeEpoch&&a.policyPublicCommit===policy.publicCommit&&a.profileSha256===profileSha256,'FORWARD_FAST_POLICY');
 need(/^[a-f0-9]{64}$/.test(a.policySha256)&&/^[1-9][0-9]*$/.test(a.activeEpoch)&&/^[a-f0-9]{64}$/.test(profileSha256)&&/^[a-f0-9]{40}$/.test(a.policyPublicCommit),'FORWARD_FAST_PINS');
 workerExecutionRoot(c.executionRoot+'/api/scripts/work-linux-testnet-policy.ts',c.executionRoot);
 need(a.executionRoot===c.executionRoot&&a.publicCommit===c.publicCommit&&/^[a-f0-9]{40}$/.test(a.publicCommit)&&a.publicCommit!==a.policyPublicCommit&&a.executionManifest.path===c.executionManifest.path&&a.executionManifest.sha256===c.executionManifest.sha256,'FORWARD_FAST_EXECUTION');
 need(c.forwardFastExecution&&/^\/opt\/zeeswap-testnet\/state\/service-policy\/[A-Za-z0-9._-]+\.private\.json$/.test(c.forwardFastExecution.path),'FORWARD_FAST_APPROVAL_PATH');
 for(const pin of[a.executionManifest,a.signerScript,a.signerDiagnostics,a.supervisor,a.signerConfig,c.forwardFastExecution])need(pin&&/^[a-f0-9]{64}$/.test(pin.sha256)&&pin.sha256!=='0'.repeat(64),'FORWARD_FAST_DIGEST');
 need(a.signerScript.path===c.executionRoot+'/workers/base-signer/signer.py'&&a.signerDiagnostics.path===c.executionRoot+'/workers/base-signer/signer_diagnostics.py'&&a.supervisor.path===c.executionRoot+'/workers/zcash-wallet/owned_wallet_call.py','FORWARD_FAST_SIGNER_PATH');
 need(/^\/opt\/zeeswap-testnet\/secrets\/forward-fast-[A-Za-z0-9._-]+\.private\.json$/.test(a.signerConfig.path)&&/^[a-f0-9]{64}$/.test(a.originalSignerConfigSha256),'FORWARD_FAST_CONFIG_PATH');
}
export function requireForwardFastSignerConfig(actual:Record<string,unknown>,original:Record<string,unknown>){
 const {forwardFastSettlement,...rest}=actual;
 need(forwardFastSettlement===true&&Object.keys(rest).length===Object.keys(original).length&&Object.keys(original).every(key=>Object.hasOwn(rest,key)&&rest[key]===original[key]),'FORWARD_FAST_SIGNER_CONFIG');
}
function need(v:unknown,c:string):asserts v{if(!v)throw Error('POLICY_WORKER_EXECUTION_'+c);}
export function workerExecutionRoot(actualEntry:string,configuredRoot:string){
 const suffix='/api/scripts/work-linux-testnet-policy.ts';
 need(actualEntry.endsWith(suffix),'ENTRY');const root=actualEntry.slice(0,-suffix.length);
 need(/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{0,79}\/app$/.test(root)&&posix.normalize(root)===root&&root===configuredRoot,'ROOT');return root;
}
export function workerExecutionPins(manifest:unknown,root:string,publicCommit:string):WorkerExecutionPin[]{
 workerExecutionRoot(root+'/api/scripts/work-linux-testnet-policy.ts',root);
 need(/^[a-f0-9]{40}$/.test(publicCommit),'COMMIT');
 const m=manifest as {publicCommit?:unknown;files?:unknown};
 need(m&&m.publicCommit===publicCommit&&Array.isArray(m.files)&&m.files.length>0&&m.files.length<=300,'MANIFEST');
 const paths=new Set<string>();const pins:WorkerExecutionPin[]=[];
 for(const raw of m.files){
  const f=raw as {path?:unknown;relativePath?:unknown;sha256?:unknown};
  need(f&&typeof f.relativePath==='string'&&/^(api|workers|contracts)\/[A-Za-z0-9._/-]+$/.test(f.relativePath)&&f.relativePath.split('/').every(s=>s!==''&&s!=='.'&&s!=='..')&&posix.normalize(f.relativePath)===f.relativePath&&!paths.has(f.relativePath),'PATH');
  need(typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&f.sha256!=='0'.repeat(64),'DIGEST');
  const path=root+'/'+f.relativePath;need(f.path===undefined||f.path===path,'PATH_BINDING');paths.add(f.relativePath);pins.push({path,sha256:f.sha256});
 }
 need(POLICY_WORKER_EXECUTION_PATHS.every(p=>paths.has(p)),'IMPORT_CLOSURE');return pins;
}
export function requireWorkerPolicyCommit(executionCommit:string,policyCommit:string){need(executionCommit===policyCommit&&/^[a-f0-9]{40}$/.test(executionCommit),'POLICY_COMMIT');}

/** The immutable Root SQL resumption changes execution control only, never admission history. */
export async function readPolicyExecutionEpoch(db:{query:(sql:string,args?:any[])=>Promise<any>},policySha256:string,originalEpoch:string){
 need(/^[a-f0-9]{64}$/.test(policySha256)&&/^[1-9][0-9]*$/.test(originalEpoch),'EXECUTION_EPOCH_BINDING');
 const installed=(await db.query("SELECT to_regprocedure('zee.testnet_policy_execution_epoch(zee.digest)') IS NOT NULL installed")).rows[0]?.installed;
 if(!installed)return originalEpoch;
 const value=(await db.query('SELECT zee.testnet_policy_execution_epoch($1)::text epoch',[Buffer.from(policySha256,'hex')])).rows[0]?.epoch;
 need(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&BigInt(value)>=BigInt(originalEpoch)&&BigInt(value)<=9223372036854775807n,'EXECUTION_EPOCH');return value;
}
