/** Dedicated October 23 testnet API. This runner never changes controls or starts a payout worker. */
import {readFile} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract,type BaseRegistry} from '../src/base-contract.ts';
import {LocalReverseBaseSigner} from '../src/base-signer.ts';
import {LocalWalletAdapter} from '../src/wallet-adapter.ts';
import {createApi} from '../src/http-api.ts';
const expected={host:'ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech',branch:'br-broad-pine-ao79wemx',database:'zee_app_20261023'};
const path=process.argv[2];if(!path||process.argv.length!==3)throw Error('Explicit private live-testnet launch config required');
const launch=JSON.parse(await readFile(path,'utf8'));const relative=(p:string)=>isAbsolute(p)?p:resolve(dirname(resolve(path)),p);
const runtime=JSON.parse(await readFile(relative(launch.runtimeConfig),'utf8'));
if(runtime.projectId!=='raspy-truth-63998651'||runtime.branchId!==expected.branch||runtime.database!==expected.database)throw Error('Dedicated live target metadata mismatch');
for(const value of [runtime.apiUrl,runtime.workerUrl]){const u=new URL(value);if(u.hostname!==expected.host||u.pathname!=='/'+expected.database)throw Error('Dedicated live target URL mismatch');}
const registry=JSON.parse(await readFile(relative(launch.baseRegistry),'utf8')) as BaseRegistry;
if(registry.chainId!==84532)throw Error('Base Sepolia required');
if(!Number.isInteger(launch.port)||launch.port<1024||launch.port>65535||!/^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(launch.allowedOrigin))throw Error('Explicit local browser origin and port required');
if(typeof launch.walletPython!=='string'||!Array.isArray(launch.baseSignerArgs)||launch.baseSignerArgs.some((v:unknown)=>typeof v!=='string')||typeof launch.baseSignerCommand!=='string')throw Error('Explicit wallet and restricted signer required');
const wallet=new LocalWalletAdapter(relative(launch.walletPython),[relative(launch.walletScript),'--config',relative(launch.walletConfig)]);
const signer=new LocalReverseBaseSigner(launch.baseSignerCommand,launch.baseSignerArgs);
const api=connect(runtime.apiUrl),worker=connect(runtime.workerUrl);
const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
const base=new BaseContract(registry);
const server=createApi({pool:api,keys,wallet,base,quoteBounds:{inputAmountAtomic:'100000',maxAcceptedPerDirection:1},allowedOrigin:launch.allowedOrigin,baseFeeBudget:launch.baseFeeBudget||'100000000000000',escrow:{pool:worker,authorize:terms=>signer.authorizeFunding(terms)}});
server.listen(launch.port,'127.0.0.1',()=>console.log(JSON.stringify({status:'API_LISTENING',port:launch.port,branchId:expected.branch,database:expected.database,chains:['zcash-testnet','base-sepolia']})));
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{void Promise.all([api.end(),worker.end()]);});};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
