/** The original published transport retains its app-root-bound proof on consumer upgrades. */
import{lstat,readFile,realpath}from'node:fs/promises';
import{createHash}from'node:crypto';
import{dirname}from'node:path';
import{pathToFileURL}from'node:url';
import{requireThat}from'./integrations/observation/types.ts';
import type{loadChefPersistedRangeReader}from'./chef-persisted-range-reader.ts';
export const ORIGINAL_CHEF_READER_MODULE={path:'/opt/zeeswap-testnet/releases/native-sibling-08c828d-r1/app/api/src/chef-persisted-range-reader.ts',sha256:'38440dce8f754d185c67182c86d30d2e134b794cec1fedad36e35d3556495ca2'}as const;
export async function loadOriginalChefPersistedReader(expected:Parameters<typeof loadChefPersistedRangeReader>[0]):ReturnType<typeof loadChefPersistedRangeReader>{
 const proof=process.env.ZEESWAP_CHEF_PERSISTED_READER_PROOF,sha=process.env.ZEESWAP_CHEF_PERSISTED_READER_SHA256;
 if(!proof&&!sha)return undefined;
 requireThat(proof==='/opt/zeeswap-testnet/secrets/chef-persisted-range-reader.private.json'&&sha==='ed2ad54cc45c846caa47aba03b1e6d607c053a35911fba9153e72f952164d920','CHEF_ORIGINAL_PERSISTED_PROOF');
 const pin=ORIGINAL_CHEF_READER_MODULE;
 for(let p=dirname(pin.path);p.startsWith('/opt/zeeswap-testnet');p=dirname(p)){const s=await lstat(p);requireThat(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0,'CHEF_ORIGINAL_PERSISTED_DIRECTORY');}
 const s=await lstat(pin.path);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0&&s.size<=16000000&&await realpath(pin.path)===pin.path,'CHEF_ORIGINAL_PERSISTED_MODULE');
 requireThat(createHash('sha256').update(await readFile(pin.path)).digest('hex')===pin.sha256,'CHEF_ORIGINAL_PERSISTED_MODULE_SHA');
 const original=await import(pathToFileURL(pin.path).href)as{loadChefPersistedRangeReader:typeof loadChefPersistedRangeReader};return original.loadChefPersistedRangeReader(expected);
}
