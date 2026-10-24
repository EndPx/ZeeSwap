import {readFile} from "node:fs/promises";
import {isAbsolute, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {parseEnv} from "node:util";
import {setTimeout as delay} from "node:timers/promises";
import {connect} from "../src/db.ts";
import {PrivateData} from "../src/private-data.ts";
import {isObserverWait} from "../src/observer-frontiers.ts";
import {observeChefOnce} from "../src/integrations/observation/chef-live.ts";
import {ChefWalletBridge,localChefDecoder} from "../src/integrations/observation/chef-wallet-bridge.ts";
import {localChefCanonical} from "../src/integrations/observation/chef-canonical-local.ts";
import {parseChefStatus,readJson,safeEndpoint} from "../src/integrations/observation/chef.ts";
import {digest,requireThat,type Policy} from "../src/integrations/observation/types.ts";

/** Deliberately scoped to the newly authorized October testnet application.
 * Existing primary/G5 configs cannot be supplied as fallback targets. */
export async function loadLiveChefConfig(path: string) {
 requireThat(isAbsolute(path), "EXPLICIT_PRIVATE_CHEF_CONFIG_REQUIRED");
 const c=JSON.parse(await readFile(path,"utf8"));
 requireThat(c.mode==="LIVE_TESTNET_CHEF" && c.birthday===4532047 && c.project==="zeeswap_shadow_app_20261023", "WRONG_LIVE_CHEF_SCOPE");
 for(const key of ["runtimePath","chefEnvPath","decoderConfigPath","pythonPath","receiptScript","headerScript"]) requireThat(typeof c[key]==="string" && isAbsolute(c[key]), "ABSOLUTE_PRIVATE_PATH_REQUIRED");
 requireThat(c.pollSeconds===5 || c.pollSeconds===10, "INVALID_CHEF_POLL_INTERVAL");
 const bytes=await readFile(c.runtimePath);
 requireThat(digest(bytes.toString("utf8"))===c.runtimeDigest,"LIVE_RUNTIME_CHANGED");
 const runtime=JSON.parse(bytes.toString("utf8"));
 requireThat(runtime.projectId==="raspy-truth-63998651" && runtime.branchId==="br-broad-pine-ao79wemx" && runtime.database==="zee_app_20261023", "WRONG_LIVE_APPLICATION_DATABASE");
 const worker=new URL(runtime.workerUrl);
 requireThat(worker.hostname===runtime.host && decodeURIComponent(worker.pathname.slice(1))==="zee_app_20261023" && decodeURIComponent(worker.username)==="zee_app_worker_20261023", "WRONG_LIVE_WORKER_TARGET");
 const env=parseEnv(await readFile(c.chefEnvPath,"utf8"));
 requireThat(env.ZEESWAP_CHEF_PROJECT===c.project && env.ZEESWAP_CHEF_BIRTHDAY===String(c.birthday) && env.CHEF_API_TOKEN, "WRONG_CHEF_ENVIRONMENT");
 const decoder=JSON.parse(await readFile(c.decoderConfigPath,"utf8"));
 requireThat(decoder.canonicalSourceId===c.canonicalSourceId && decoder.lightwalletd==="testnet.zec.rocks:443", "WRONG_CHEF_CANONICAL_CONFIG");
 const policy:Policy={adapter:"zeer-chef",network:"zcash-testnet",birthday:c.birthday,registryDigest:c.registryDigest,
  projectionDigest:c.projectionDigest,canonicalSourceId:c.canonicalSourceId,accountFingerprint:env.ZEESWAP_CHEF_KEY_FINGERPRINT,maxBlocks:1000,maxObservations:1000};
 requireThat(typeof c.openingCapitalProofPath==="string" && isAbsolute(c.openingCapitalProofPath),"OPENING_CAPITAL_PROOF_REQUIRED");
 const capitalBytes=await readFile(c.openingCapitalProofPath,"utf8");requireThat(digest(capitalBytes)===c.openingCapitalProofDigest,"OPENING_CAPITAL_PROOF_CHANGED");
 const capital=JSON.parse(capitalBytes),note=capital.capitalNotes?.[0],output=capital.snapshot?.outputs?.[0];
 requireThat(capital.version===1 && capital.capitalNotes.length===1 && capital.snapshot.outputs.length===1 && note.pool==="ironwood" && note.txid===capital.fundingTxid
  && note.value==="12500000" && capital.capitalBalanceZatoshi==="12500000" && output.txid===note.txid && output.index===note.index && output.pool===note.pool
  && output.amount===note.value && output.shieldedSource===true && output.blockHash===note.blockHash && output.height===note.height
  && capital.snapshot.scannedHeight-note.height+1>=10,"INVALID_AUDITED_OPENING_CAPITAL_PROOF");
 // This immutable historical artifact only authorizes exclusion. Each live
 // occurrence is still independently canonical/native bound before exclusion.
 const openingCapital={txid:note.txid,pool:"ironwood" as const,index:note.index,amount:note.value,receiver:output.receiver,height:note.height,blockHash:note.blockHash,proofDigest:c.openingCapitalProofDigest};
 return {c,runtime,env,policy,openingCapital};
}

export async function runLiveChef(path:string,once:boolean) {
 const {c,runtime,env,policy,openingCapital}=await loadLiveChefConfig(path),pool=connect(runtime.workerUrl,1);
 const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,"hex"),Buffer.from(runtime.lookupKeyHex,"hex"));
 const stop=new AbortController(); process.once("SIGINT",()=>stop.abort());process.once("SIGTERM",()=>stop.abort());
 try {
  do {
   try {
    const identity=(await pool.query("SELECT current_database() AS database,current_user AS role")).rows[0];
    requireThat(identity.database==="zee_app_20261023" && identity.role==="zee_app_worker_20261023", "WRONG_CONNECTED_LIVE_DATABASE");
    const url=safeEndpoint(c.sourceUrl),signal=AbortSignal.timeout(15000);
    const response=await fetch(new URL("/status",url),{headers:{authorization:`Bearer ${env.CHEF_API_TOKEN}`},signal,redirect:"error"});
    requireThat(response.ok,"CHEF_HTTP_ERROR");
    const status=parseChefStatus(await readJson(response,signal),c.project,Date.now());
    requireThat(status.checkpoint.height-c.birthday+1<=1000,"CHEF_LIVE_RANGE_CAPACITY_REACHED");
    const bridge=new ChefWalletBridge(localChefDecoder(c.pythonPath,[c.receiptScript,"--config",c.decoderConfigPath]),openingCapital);
    const canonical=localChefCanonical(c.pythonPath,[c.headerScript,"--config",c.decoderConfigPath],c.canonicalSourceId,{fromHeight:c.birthday,throughHeight:status.checkpoint.height});
    const result=await observeChefOnce(pool,keys,{url:c.sourceUrl,token:env.CHEF_API_TOKEN!,project:c.project,policy,canonical},bridge,c.birthday);
    console.log(JSON.stringify({event:"chef-live-observation",...result,dispatchAuthority:false}));
   } catch(error) {
    const code=(error as {code?:unknown}).code;
    const wait=isObserverWait(error) || ["WAIT_SOURCE_UNAVAILABLE","WAIT_SOURCE_UNREADY","STALE_SOURCE"].includes(String(code));
    if(!wait)throw error;
    console.log(JSON.stringify({event:"chef-live-observation",status:"WAIT_SOURCE",dispatchAuthority:false}));
   }
   if(!once && !stop.signal.aborted) await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(!once && !stop.signal.aborted);
 }finally{await pool.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 try {const path=process.argv[2];requireThat(path,"EXPLICIT_PRIVATE_CHEF_CONFIG_REQUIRED");await runLiveChef(path,process.argv.includes("--once"));}
 catch(error){console.error(JSON.stringify({event:"chef-live-observation",status:"BLOCKED",code:typeof (error as {code?:unknown}).code==="string"?(error as {code:string}).code:"LIVE_CHEF_OBSERVATION_FAILED"}));process.exitCode=1;}
}
