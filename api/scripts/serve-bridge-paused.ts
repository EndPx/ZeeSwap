/** Dedicated UID bridge read qualification. No swap endpoints or signer effects.
 * Provision schema/grants separately; --initialize-paused is explicit first seed. */
import {parseArgs} from 'node:util';
import {createServer} from 'node:http';
import {connectBridgeDatabase} from '../src/bridge/database.ts';
import {PrivateData} from '../src/private-data.ts';
import {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';
import {pinnedFile} from '../src/bridge/adapters/profile.ts';
import {PinnedBridgeReadAdapter,createPausedBridge} from '../src/bridge/runtime.ts';
import {handleBridge} from '../src/bridge/http.ts';

const {values:v}=parseArgs({options:{config:{type:'string'},'config-sha256':{type:'string'},'initialize-paused':{type:'boolean',default:false},'initialize-opening-fees':{type:'string'}}});
if(v['initialize-paused']&&v['initialize-opening-fees'])throw Error('BRIDGE_OPENING_MODE_CONFLICT');
if(!v.config||!v['config-sha256']||process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_LAUNCH_LINUX_PROFILE_REQUIRED');
const config=JSON.parse((await pinnedFile({path:v.config,sha256:v['config-sha256']},true)).toString());
if(config.version!==1||config.mode!=='BRIDGE_READ_PAUSED_API'||config.root!=='/opt/zeeswap-bridge-testnet'||config.serviceUid!==process.getuid()||!v.config.startsWith(config.root+'/')||config.port!==3032||config.allowedOrigin!=='https://zeeswap.endpx.cloud'||!/^([a-f0-9]{64})$/.test(config.payloadKeyHex)||!/^([a-f0-9]{64})$/.test(config.lookupKeyHex))throw Error('BRIDGE_LAUNCH_PROFILE');
const base=new CanonicalBridgeBase(JSON.parse((await pinnedFile(config.baseProfile,true)).toString())),native=await PinnedBridgeReadAdapter.create(config.native),pool=await connectBridgeDatabase(config.databaseUrl,config.databaseTransport);
const keys=new PrivateData(Buffer.from(config.payloadKeyHex,'hex'),Buffer.from(config.lookupKeyHex,'hex'));
const {store,runtime,service}=createPausedBridge(pool,keys,base,native);
try{if(v['initialize-paused']||v['initialize-opening-fees'])await store.initializePaused();if(v['initialize-opening-fees'])await runtime.initializePausedWithVerifiedOpeningFees(store,v['initialize-opening-fees']);else await runtime.refreshPaused(store);}catch{await pool.end();throw Error('BRIDGE_PAUSED_INITIAL_RECONCILIATION_FAILED');}
let refreshing=false,statusPending=false,stopping=false;
const timer=setInterval(()=>{if(refreshing||statusPending||stopping)return;refreshing=true;void runtime.refreshPaused(store).catch(()=>{console.error('BRIDGE_PAUSED_REFRESH_REFUSED');}).finally(()=>{refreshing=false;});},20000);
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.headers.origin===config.allowedOrigin)res.setHeader('Access-Control-Allow-Origin',config.allowedOrigin);
 // Expose only the real paused aggregate. This qualification launcher cannot
 // become an admission route merely because a database flag is changed.
 if(req.method!=='GET'||req.url!=='/v1/bridge/status'){res.statusCode=503;res.end(JSON.stringify({error:'BRIDGE_PAUSED_QUALIFICATION_ONLY'}));return;}
 if(statusPending||refreshing){res.statusCode=503;res.end(JSON.stringify({error:'BRIDGE_RECONCILIATION_BUSY'}));return;}
 statusPending=true;try{await handleBridge(req,res,req.url,service);}catch{res.statusCode=503;res.end(JSON.stringify({error:'BRIDGE_RECONCILIATION_UNAVAILABLE'}));}finally{statusPending=false;}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(3032,'127.0.0.1',()=>{console.log(JSON.stringify({status:'BRIDGE_READ_PAUSED_LISTENING',port:3032,admission:false,signing:false}));});
const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);server.close(()=>{void pool.end();});};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
