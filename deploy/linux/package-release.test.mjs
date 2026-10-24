import test from 'node:test';
import assert from 'node:assert/strict';
import {publicReleasePath,packageRelease} from './package-release.mjs';
test('packager permits application sources and rejects private/generated/escaping inputs',()=>{
 for(const path of ['api/src/http-api.ts','api/scripts/serve-linux-testnet.ts','workers/zcash-wallet/verify/Cargo.lock','deploy/linux/nginx-tls.conf','pnpm-lock.yaml'])assert.equal(publicReleasePath(path),true,path);
 for(const path of ['.deploy-local/live-testnet-20261023/runtime.private.json','api/runtime.private.json','apps/web/.env.production','api/node_modules/a/index.js','workers/zcash-wallet/verify/target/key.rs','workers/wallet.dat','api/state/capture.json','api/../password.json','api\\secret.json','secrets/keys.ts','docs/evidence/foo.md'])assert.equal(publicReleasePath(path),false,path);
});
test('packager refuses ambiguous revisions before creating output',async()=>{
 await assert.rejects(()=>packageRelease('HEAD','linux-reviewed','unused-output'),/EXACT_COMMIT/);
 await assert.rejects(()=>packageRelease('a'.repeat(40),'../../bad','unused-output'),/EXACT_COMMIT/);
});
