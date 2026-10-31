import test from 'node:test';import assert from 'node:assert/strict';
import {requireBridgeL2Approval,type BridgeL2Approval} from '../src/bridge/base-l2-execution.ts';
test('bridge L2 Root proof binds existing Base/cast/permit and reviewed execution; legacy has no opt-in',()=>{
 const root='/opt/zeeswap-bridge-testnet/releases/fast-r1/app',hash='a'.repeat(64),scope={baseProfileSha256:hash,castProfileSha256:hash,publicPermitSha256:hash};
 const paths=['api/scripts/serve-bridge-public-pilot.ts','api/scripts/bridge-base-preflight.ts','api/src/bridge/base-l2-execution.ts','api/src/bridge/adapters/base.ts','api/src/bridge/adapters/cast.ts','api/src/bridge/model.ts','api/src/bridge/runtime.ts','api/src/bridge/reverse.ts','api/src/bridge/public-pilot.ts','api/src/bridge/public-worker.ts','api/src/bridge/adapters/native-authority.ts'];
 const a:BridgeL2Approval={version:1,purpose:'ROOT_BRIDGE_BASE_L2_EXECUTION',...scope,publicCommit:'b'.repeat(40),executionRoot:root,files:paths.map(p=>({path:root+'/'+p,sha256:hash}))};
 requireBridgeL2Approval(a,scope,root+'/api/scripts/serve-bridge-public-pilot.ts');requireBridgeL2Approval(a,scope,root+'/api/scripts/bridge-base-preflight.ts');
 for(const changed of[{purpose:'OTHER'},{baseProfileSha256:'c'.repeat(64)},{executionRoot:'/tmp/app'},{files:a.files.slice(1)},{files:[...a.files,a.files[0]]},{publicCommit:'unreviewed'}])assert.throws(()=>requireBridgeL2Approval({...a,...changed} as BridgeL2Approval,scope,root+'/api/scripts/serve-bridge-public-pilot.ts'),/BRIDGE_L2/);
});
