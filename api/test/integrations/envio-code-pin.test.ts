import test from 'node:test';import assert from 'node:assert/strict';
import {closedV2Fixture} from './envio-event-first-closed-fixture.ts';
import {validateV2CollectionPermit,validateV2PublicationPermit,validateV2CodePin,type V2CollectionPermit} from '../../src/integrations/observation/envio-event-first-closed.ts';
import {PARALLEL_CONSUMER_EXECUTION,requireConsumerExecutionPins} from '../../src/integrations/observation/envio-consumer-execution.ts';
import {persistValidatedV2Collection} from '../../scripts/prepare-linux-envio-closed-v2.ts';
const ROOT='/opt/zeeswap-testnet',APP=ROOT+'/releases/consumer-node-pin-fixed/app',NODE={path:'/usr/bin/node',sha256:'e237a2839d0cbdc9a9a2adda1a184afc0f5b20306ffbe923af5686550472d8a8'};
// Reviewed68 runtime names; self-contained CI fixture, no private operator file.
const RUNTIME_FILES=[
 "api/package.json",
 "api/scripts/observe-linux-envio.ts",
 "api/scripts/prepare-linux-envio-closed-v2.ts",
 "api/scripts/prepare-linux-envio-event-first-cutover.ts",
 "api/scripts/recover-linux-chef.ts",
 "api/scripts/recover-linux-envio-event-first-closed.ts",
 "api/src/amounts.ts",
 "api/src/app-chef-metadata-repair.ts",
 "api/src/base-contract.ts",
 "api/src/base-escrow.ts",
 "api/src/base-observer-read-retry.ts",
 "api/src/base-signer-protocol.ts",
 "api/src/base-signer.ts",
 "api/src/db.ts",
 "api/src/envio-event-first-profile.ts",
 "api/src/integrations/observation/canonical-rpc.ts",
 "api/src/integrations/observation/chef-canonical-local.ts",
 "api/src/integrations/observation/chef-live-cursor.ts",
 "api/src/integrations/observation/chef-live.ts",
 "api/src/integrations/observation/chef-recovery.ts",
 "api/src/integrations/observation/chef-wallet-bridge.ts",
 "api/src/integrations/observation/chef.ts",
 "api/src/integrations/observation/envio-closed-recovery.ts",
 "api/src/integrations/observation/envio-closed-v2-linux.ts",
 "api/src/integrations/observation/envio-closed-v2-rpc.ts",
 "api/src/integrations/observation/envio-closed-v2-store.ts",
 "api/src/integrations/observation/envio-consumer-execution.ts",
 "api/src/integrations/observation/envio-event-first-closed.ts",
 "api/src/integrations/observation/envio-event-first-consumer-performance.ts",
 "api/src/integrations/observation/envio-event-first-consumer.ts",
 "api/src/integrations/observation/envio-event-first-rpc.ts",
 "api/src/integrations/observation/envio-event-first.ts",
 "api/src/integrations/observation/envio-linked-campaign.ts",
 "api/src/integrations/observation/envio-live.ts",
 "api/src/integrations/observation/envio-owned-byte-ledger.ts",
 "api/src/integrations/observation/envio-recovery.ts",
 "api/src/integrations/observation/envio-required-anchors.ts",
 "api/src/integrations/observation/envio-selected-export.ts",
 "api/src/integrations/observation/envio-source-cutover.ts",
 "api/src/integrations/observation/envio.ts",
 "api/src/integrations/observation/types.ts",
 "api/src/linux-control.ts",
 "api/src/linux-envio-event-first-profile.ts",
 "api/src/linux-envio-normal-profile.ts",
 "api/src/linux-envio-profile.ts",
 "api/src/linux-testnet-profile.ts",
 "api/src/live-testnet-opening.ts",
 "api/src/market-pricing.ts",
 "api/src/market-reference/cache.mjs",
 "api/src/market-reference/provider.mjs",
 "api/src/native-circle-continuation.ts",
 "api/src/native-circle-reconciled.ts",
 "api/src/native-circle-replacement.ts",
 "api/src/observer-cadence.ts",
 "api/src/observer-frontiers.ts",
 "api/src/observer.ts",
 "api/src/prefunding-epoch.ts",
 "api/src/private-data.ts",
 "api/src/repository.ts",
 "api/src/reverse-settlement.ts",
 "api/src/source-refunds.ts",
 "api/src/testnet-policy-refund.ts",
 "api/src/testnet-service-policy.ts",
 "api/src/wallet-adapter.ts",
 "api/src/wallet-scanner-protocol.ts",
 "pnpm-lock.yaml",
 "workers/zcash-wallet/chef_headers.py",
 "workers/zcash-wallet/snapshot.schema.json"
] as const;
async function fullPermit(){const x=await closedV2Fixture();/* Synthetic bytes/financial fixture: no installed-code claim. */
 const names=RUNTIME_FILES;
 const codePins=[...names.map(path=>({path:APP+'/'+path,sha256:x.H})),...Array.from({length:5},(_,i)=>({path:ROOT+'/tools/node-dependencies/entry-'+i+'.js',sha256:x.H})),NODE];
 const a:V2CollectionPermit={...x.a,execution:PARALLEL_CONSUMER_EXECUTION,codePins};return{...x,a};}
test('full74 code-pin collection authority admits exact physical Node provenance without changing oldselector or execution',async()=>{const x=await fullPermit();assert.equal(x.a.codePins.length,74);const identity=structuredClone(x.a.identity);requireConsumerExecutionPins(x.a.codePins,APP+'/api/scripts/prepare-linux-envio-closed-v2.ts');validateV2CollectionPermit(x.a);assert.deepEqual(x.a.identity,identity);assert.deepEqual(x.a.execution,PARALLEL_CONSUMER_EXECUTION);});
test('Node executable pin never becomes private admission, selector, archive, profile, manifest or publication authority',async()=>{const x=await fullPermit(),{a}=x;for(const key of['originalAdmission','selector','closedAuthority'] as const)assert.throws(()=>validateV2CollectionPermit({...a,[key]:NODE}),/ENVIO_CLOSED_V2_PIN/);for(const key of['exportProfile','codeManifest'] as const)assert.throws(()=>validateV2CollectionPermit({...a,identity:{...a.identity,[key]:NODE}}),/ENVIO_CLOSED_V2_PIN/);assert.throws(()=>validateV2CollectionPermit({...a,archivePins:[NODE]}),/ENVIO_CLOSED_V2_PIN/);assert.throws(()=>validateV2PublicationPermit({...x.publication,audit:NODE},a,x.H,x.appended.next,x.candidate),/ENVIO_CLOSED_V2_PIN/);});
test('code provenance rejects other executables, node aliases/traversal/URLs and invalid hashes',async()=>{for(const path of['/usr/bin/bash','/usr/bin/python3.12','/usr/bin/nodejs','/usr/bin/./node','/usr/bin/../bin/node','/usr//bin/node','/usr/bin/node/','/usr/bin/node.exe','file:///usr/bin/node','https://example.test/node',ROOT+'/releases/../node',ROOT+'//releases/node',ROOT+'/releases/./node'])assert.throws(()=>validateV2CodePin({...NODE,path}),/CODE_PIN/);for(const sha256 of['0'.repeat(64),'a'.repeat(63),'A'.repeat(64),'not-a-hash'])assert.throws(()=>validateV2CodePin({...NODE,sha256}),/CODE_PIN/);const {a}=await fullPermit();assert.throws(()=>validateV2CollectionPermit({...a,codePins:a.codePins.map(p=>p===NODE?{...NODE,path:'/usr/bin/./node'}:p)}),/CODE_PIN/);});
test('production preparation persistence boundary refuses invalid complete authority or raw bytes before any write callback',async()=>{const x=await fullPermit();let writes=0;await assert.rejects(persistValidatedV2Collection({...x.a,selector:NODE},x.original,async()=>{writes++;}),/ENVIO_CLOSED_V2_PIN/);assert.equal(writes,0);await assert.rejects(persistValidatedV2Collection({...x.a,codePins:[{...NODE,path:'/usr/bin/bash'}]},x.original,async()=>{writes++;}),/CODE_PIN/);assert.equal(writes,0);await assert.rejects(persistValidatedV2Collection(x.a,Buffer.from('changed original'),async()=>{writes++;}),/ORIGINAL_BYTES/);assert.equal(writes,0);await persistValidatedV2Collection(x.a,x.original,async permit=>{writes++;assert.equal(permit,x.a);});assert.equal(writes,1);});
