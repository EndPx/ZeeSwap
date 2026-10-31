import {parseArgs} from 'node:util';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {loadBridgeL2NativeExecution} from '../src/bridge/base-l2-execution.ts';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {pinnedFile} from '../src/bridge/adapters/profile.ts';
import {nativeDigest,verifyNativeAuthority,verifyNativeBroadcastGuard,type NativeBridgeRequest} from '../src/bridge/adapters/native-authority.ts';

async function main(){
 const {values:v}=parseArgs({options:{profile:{type:'string'},'profile-sha256':{type:'string'},request:{type:'string'},'approved-digest':{type:'string'},mode:{type:'string'},'fast-base-l2':{type:'string'},'fast-base-l2-sha256':{type:'string'}}});
 if(!v.profile||!v['profile-sha256']||!v.request||!v['approved-digest']||!['authority','broadcast-guard'].includes(v.mode??'')||process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_PREFLIGHT_ARGUMENTS');
 const profile=JSON.parse((await pinnedFile({path:v.profile,sha256:v['profile-sha256']},true)).toString());
 const requestPath=resolve(v.request),stat=await lstat(requestPath);
 if(await realpath(requestPath)!==requestPath||stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o077)!==0||stat.size>8192)throw Error('BRIDGE_REQUEST_FILE');
 const q=JSON.parse(await readFile(requestPath,'utf8')) as NativeBridgeRequest;
 if(nativeDigest(q)!==v['approved-digest'])throw Error('BRIDGE_REQUEST_DIGEST');
 if(!!v['fast-base-l2']!==!!v['fast-base-l2-sha256'])throw Error('BRIDGE_L2_PIN_REQUIRED');
 const fastL2=await loadBridgeL2NativeExecution(v['fast-base-l2']?{path:v['fast-base-l2'],sha256:v['fast-base-l2-sha256']!}:undefined,v['profile-sha256'],import.meta.url);
 const proof=await verifyNativeAuthority(new CanonicalBridgeBase(profile,false,fastL2),q,v['approved-digest']);
 if(v.mode==='authority'){process.stdout.write(JSON.stringify(proof));return;}
 let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>8192)throw Error('BRIDGE_GUARD_INPUT_BOUND');}
 const guard=JSON.parse(input),path=join(dirname(requestPath),'native-intent.private.json'),s=await lstat(path);
 if(await realpath(path)!==path||s.isSymbolicLink()||!s.isFile()||(s.mode&0o077)!==0||s.size>16*1024*1024)throw Error('BRIDGE_GUARD_PRIVATE_JOURNAL');
 const journal=JSON.parse(await readFile(path,'utf8'));
 process.stdout.write(JSON.stringify(verifyNativeBroadcastGuard(q,v['approved-digest'],journal,guard)));
}
main().catch(()=>{process.stderr.write('BRIDGE_BASE_PREFLIGHT_REFUSED\n');process.exitCode=1;});
