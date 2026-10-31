/** Fresh read-only wallet/RPC qualification for the explicit Root continuation gate. */
import {readFile,lstat,mkdir,realpath} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadLinuxNativeDispatch} from '../src/linux-native-dispatch.ts';
import {validatePolicyCapitalProof} from '../src/testnet-policy-capital.ts';
import {BaseContract} from '../src/base-contract.ts';
import type {loadLinuxForward} from '../src/linux-forward-dispatch.ts';
type Verified=Awaited<ReturnType<typeof loadLinuxForward>>['verified'];
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CONTINUOUS_DELIVERED_RESTART_'+c);}
export function requireDeliveredRestartBase(v:{nonce:number;pending:number;gas:string;available:string}){
 need(Number.isSafeInteger(v.nonce)&&v.nonce>=0&&v.pending===v.nonce,'PENDING_BASE_NONCE');
 need(/^[0-9]+$/.test(v.gas)&&/^[0-9]+$/.test(v.available)&&BigInt(v.gas)>=100000000000000n&&BigInt(v.available)>=100000n,'BASE_CAPITAL');
}
export async function checkDeliveredRestartCapital(c:any,v:Verified,db:{query:(s:string,args?:any[])=>Promise<any>}){
 need(process.platform==='linux'&&process.getuid?.()===0&&c.continuousCapital,'ROOT');
 const native=await loadLinuxNativeDispatch('/opt/zeeswap-testnet/secrets/reverse-profile.private.json','reverse');
 need(native.verified.profileSha256===v.profileSha256,'PROFILE');
 const directory='/opt/zeeswap-testnet/state/testnet-policy/'+c.policy.sha256+'/capital-captures';
 await mkdir(directory,{recursive:true,mode:0o700});const st=await lstat(directory);
 need(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o077)===0&&await realpath(directory)===directory,'CAPTURE_DIRECTORY');
 const path=directory+'/'+randomUUID()+'.private.json';
 await promisify(execFile)(native.c.python,[c.captureScript.path,'--profile-sha256',v.profileSha256,'--policy-sha256',c.policy.sha256,'--output',path,'--continuous-capital-approval',c.continuousCapital.path,'--continuous-capital-sha256',c.continuousCapital.sha256],{timeout:90000,maxBuffer:16384});
 const raw=await readFile(path),proof=JSON.parse(raw.toString());
 const expected={policySha256:c.policy.sha256,profileSha256:v.profileSha256,loaderSha256:native.c.scripts.profile.sha256,captureScriptSha256:c.captureScript.sha256};
 validatePolicyCapitalProof(proof,expected);
 const base=new BaseContract(v.registry),heads=await base.preflight();
 const [nonce,pending,gas]=await Promise.all([base.client.getTransactionCount({address:v.registry.operator,blockTag:'latest'}),base.client.getTransactionCount({address:v.registry.operator,blockTag:'pending'}),base.client.getBalance({address:v.registry.operator,blockNumber:BigInt(heads.latest)})]);
 requireDeliveredRestartBase({nonce,pending,gas:gas.toString(),available:heads.availableInventory});
 validatePolicyCapitalProof(proof,expected);
 need((await db.query('SELECT NOT zee.testnet_global_slot_busy() yes')).rows[0]?.yes===true,'FOREGROUND_CHANGED');
 need((await db.query("SELECT count(*)=2 yes FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds'")).rows[0]?.yes===true,'SOURCES_AGED_DURING_CAPTURE');
 return{path,sha256:createHash('sha256').update(raw).digest('hex'),financialAction:false};
}
