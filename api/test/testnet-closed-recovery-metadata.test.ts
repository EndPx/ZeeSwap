import test from 'node:test';
import assert from 'node:assert/strict';
import {requireClosedTransportMetadataPermissions} from '../scripts/recover-testnet-closed-service.ts';
const root='/opt/zeeswap-testnet',paths={proof:root+'/state/database-relocation/main-primary.private.json',ca:root+'/secrets/app-postgres-ca.pem',baseline:root+'/state/database-relocation/main-restored-baseline.private.json',classification:root+'/state/database-relocation/main-origin-classifications.private.json'};
test('existing exact Root database metadata permits 0640 group978 while new secrets keep independent gates',()=>{
 for(const [field,path] of Object.entries(paths))for(const stat of [{uid:0,gid:0,mode:0o100600},{uid:0,gid:978,mode:0o100640}])assert.doesNotThrow(()=>requireClosedTransportMetadataPermissions(field as keyof typeof paths,path,stat));
});
test('database metadata exception refuses other paths, owners, groups and broadened permissions',()=>{
 for(const [field,path] of Object.entries(paths)){
  for(const stat of [{uid:986,gid:978,mode:0o100640},{uid:0,gid:0,mode:0o100640},{uid:0,gid:978,mode:0o100660},{uid:0,gid:978,mode:0o100644},{uid:0,gid:978,mode:0o104640}])assert.throws(()=>requireClosedTransportMetadataPermissions(field as keyof typeof paths,path,stat));
  assert.throws(()=>requireClosedTransportMetadataPermissions(field as keyof typeof paths,root+'/secrets/main-admin.private.json',{uid:0,gid:978,mode:0o100640}),/TRANSPORT_METADATA_PATH/);
 }
});
