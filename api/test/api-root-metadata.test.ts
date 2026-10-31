import test from 'node:test';
import assert from 'node:assert/strict';
import {requireApiRootMetadataPermissions} from '../src/api-root-metadata.ts';

test('API Root metadata accepts exact private mode or the dedicated API read group',()=>{
 for(const stat of [{uid:0,gid:0,mode:0o100600},{uid:0,gid:978,mode:0o100600},{uid:0,gid:978,mode:0o100640}])assert.doesNotThrow(()=>requireApiRootMetadataPermissions(stat));
});
test('API Root metadata refuses another owner/group, write/world access and special permission bits',()=>{
 const original={uid:0,gid:978,mode:0o100640};
 const rejected=[{...original,uid:986},{...original,gid:977},{...original,gid:0},
  ...[0o400,0o440,0o644,0o660,0o666,0o604,0o601,0o610,0o620,0o700,0o1640,0o2640,0o4640,0o1600,0o2600,0o4600].map(mode=>({...original,mode:0o100000|mode})),
  {...original,uid:NaN},{...original,gid:-1},{...original,mode:-1},{...original,mode:0o640+0.5}];
 for(const stat of rejected)assert.throws(()=>requireApiRootMetadataPermissions(stat),/LINUX_API_FAST_ROOT_METADATA_PERMISSIONS/);
});
