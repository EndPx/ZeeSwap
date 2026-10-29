/** Root explicitly opens a finite public pilot only after a live funded circle. */
import {parseArgs} from 'node:util';
import {connectBridgeDatabase} from '../src/bridge/database.ts';
import {PrivateData} from '../src/private-data.ts';
import {BridgeRepository} from '../src/bridge/repository.ts';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {CastBridgeBaseSigner} from '../src/bridge/adapters/cast.ts';
import {pinnedFile,pinnedExecutable} from '../src/bridge/adapters/profile.ts';
import {PinnedBridgeReadAdapter} from '../src/bridge/runtime.ts';
import {loadRootPublicPilotPermit,FundedBridgeCircle,PublicBridgePilotRuntime,PublicBridgeMintCoordinator,PublicBridgeReverseCoordinator,validateQualifiedNativeTemplate} from '../src/bridge/public-pilot.ts';
import {PublicBridgeWorker} from '../src/bridge/public-worker.ts';
import {PublicBridgeStatusCache,createPublicBridgeHttp} from '../src/bridge/public-http.ts';

const {values:v}=parseArgs({options:{config:{type:'string'},'config-sha256':{type:'string'},permit:{type:'string'},'permit-sha256':{type:'string'},'open-public-pilot':{type:'boolean',default:false},'recover-native-order':{type:'string'}}});
if(!v.config||!v['config-sha256']||!v.permit||!v['permit-sha256']||process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_PUBLIC_LINUX_PROFILE_REQUIRED');
const config=JSON.parse((await pinnedFile({path:v.config,sha256:v['config-sha256']},true)).toString()),binding=await loadRootPublicPilotPermit(v.permit,v['permit-sha256']);
if(config.version!==1||config.mode!=='BRIDGE_PUBLIC_PILOT_API'||config.root!=='/opt/zeeswap-bridge-testnet'||config.serviceUid!==process.getuid()||config.port!==3032||config.allowedOrigin!=='https://zeeswap.endpx.cloud'||!v.config.startsWith(config.root+'/'))throw Error('BRIDGE_PUBLIC_LAUNCH_SCOPE');
if(!config.nativeSpend||!config.qualificationNative||!config.qualificationRecipient)throw Error('BRIDGE_PUBLIC_NATIVE_STACK_REQUIRED');
const template=JSON.parse((await pinnedFile(config.nativeSpend.template,true)).toString()),qualified=JSON.parse((await pinnedFile(config.qualificationNative.profile,true)).toString());validateQualifiedNativeTemplate(template,qualified,config.nativeSpend,config.qualificationNative);await pinnedExecutable(config.nativeSpend.python);await pinnedFile(config.nativeSpend.worker);
const pool=await connectBridgeDatabase(config.databaseUrl,config.databaseTransport),keys=new PrivateData(Buffer.from(config.payloadKeyHex,'hex'),Buffer.from(config.lookupKeyHex,'hex'));
const base=new CanonicalBridgeBase(JSON.parse((await pinnedFile(config.baseProfile,true)).toString())),native=await PinnedBridgeReadAdapter.create(config.native),store=new BridgeRepository(pool,keys),circle=new FundedBridgeCircle(base,native,binding,config.qualificationNative,config.qualificationRecipient),pilot=new PublicBridgePilotRuntime(base,native,binding,{databaseName:'zee_bridge_20261029',databaseRole:'zee_bridge_runtime_20261029',nativeReadProfileSha256:config.native.profile.sha256},circle),reverse=new PublicBridgeReverseCoordinator(pilot);
pilot.reverse=reverse;const signer=new CastBridgeBaseSigner(base,JSON.parse((await pinnedFile(config.castProfile,true)).toString()),keys,new PublicBridgeMintCoordinator(pilot),reverse);reverse.bindSigner(signer);
const worker=new PublicBridgeWorker(store,pilot,reverse,signer,keys,config.nativeSpend,config.root+'/operator/public-native-journal'),cache=new PublicBridgeStatusCache(),execution={busy:false};
try{if(v['open-public-pilot'])await pilot.open(store);else pilot.assertBinding(await store.read());if(v['recover-native-order'])await worker.recoverNative(v['recover-native-order']);const status=await worker.tick();if(status)cache.recordVerified(await store.read(),status);}catch{await pool.end();throw Error('BRIDGE_PUBLIC_FUNDED_QUALIFICATION_REQUIRED');}
const {server}=createPublicBridgeHttp(store,pilot,cache,execution,config.allowedOrigin);
let stopping=false;const tick=async()=>{if(stopping||execution.busy)return;execution.busy=true;try{const status=await worker.tick();if(status)cache.recordVerified(await store.read(),status);else cache.invalidate();}catch{cache.invalidate();console.error('BRIDGE_PUBLIC_WORKER_RECONCILIATION_REQUIRED');await store.update(b=>{pilot.assertBinding(b);b.paused=true;}).catch(()=>{});}finally{execution.busy=false;}};
const timer=setInterval(()=>{void tick();},20000);server.listen(3032,'127.0.0.1',()=>console.log(JSON.stringify({status:'BRIDGE_PUBLIC_PILOT_LISTENING',port:3032,amountAtomic:'100000',maxAcceptedPerDirection:1,maxConcurrent:1})));
const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);server.close(()=>{void pool.end();});};process.on('SIGINT',stop);process.on('SIGTERM',stop);
