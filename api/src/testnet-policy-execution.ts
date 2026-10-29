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
export interface WorkerExecutionConfig {executionRoot:string;publicCommit:string;executionManifest:WorkerExecutionPin;}
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
