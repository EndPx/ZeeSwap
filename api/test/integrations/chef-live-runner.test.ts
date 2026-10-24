import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {loadLiveChefConfig} from "../../scripts/observe-live-chef.ts";
import {digest} from "../../src/integrations/observation/types.ts";

test("live observer refuses default paths and historical runtime scopes before database I/O",async()=>{
 await assert.rejects(loadLiveChefConfig("relative.json"),/EXPLICIT_PRIVATE_CHEF_CONFIG_REQUIRED/);
 const root=await mkdtemp(join(tmpdir(),"chef-scope-"));
 try {
  const path=join(root,"config.json"),runtimePath=join(root,"runtime.json");
  const base={mode:"LIVE_TESTNET_CHEF",birthday:4532047,project:"zeeswap_shadow_app_20261023",pollSeconds:10,runtimePath,
   chefEnvPath:join(root,"chef.env"),decoderConfigPath:join(root,"decoder.json"),pythonPath:join(root,"python"),receiptScript:join(root,"receipt.py"),headerScript:join(root,"header.py")};
  const runtime={projectId:"raspy-truth-63998651",branchId:"br-twilight-heart-ao6cx6pg",database:"neondb"};
  const bytes=JSON.stringify(runtime);await writeFile(runtimePath,bytes);
  await writeFile(path,JSON.stringify({...base,runtimeDigest:digest(bytes)}));
  await assert.rejects(loadLiveChefConfig(path),/WRONG_LIVE_APPLICATION_DATABASE/);
  await writeFile(path,JSON.stringify({...base,runtimeDigest:digest("other bytes")}));
  await assert.rejects(loadLiveChefConfig(path),/LIVE_RUNTIME_CHANGED/);
  await writeFile(path,JSON.stringify({...base,birthday:4498501}));
  await assert.rejects(loadLiveChefConfig(path),/WRONG_LIVE_CHEF_SCOPE/);
 }finally{await rm(root,{recursive:true,force:true});}
});
