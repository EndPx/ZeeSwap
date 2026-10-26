import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {isAddress} from 'viem';
import {LIVE_DISPATCH_SCOPE} from '../../live-dispatch-scope.ts';
import {integer} from '../model.ts';

export type FilePin={path:string;sha256:string};
export type BridgeBaseProfile={version:1;mode:'BRIDGE_BASE_TESTNET';chainId:84532;rpcUrls:[string,string];
 contractAddress:`0x${string}`;runtimeCodeHash:`0x${string}`;deployment:{transactionHash:`0x${string}`;blockHeight:number;blockHash:`0x${string}`};
 admin:`0x${string}`;operator:`0x${string}`;authorizer:`0x${string}`;maximumObservationAgeSeconds:60;
 maximumGas:string;gasPriceWei:string;maximumTransactionCostWei:string;minimumGasBalanceWei:string;
 principalAccount:string;feeAccount:string;swapAccount:string};
export type BridgeCastProfile={version:1;mode:'BRIDGE_CAST_TESTNET';enabled:false|true;root:string;cast:FilePin;
 operatorAccount:string;authorizerAccount:string;operatorKeystore:FilePin;authorizerKeystore:FilePin;operatorPassword:FilePin;authorizerPassword:FilePin;journalRoot:string};
export function validateBridgeBaseProfile(p:BridgeBaseProfile,localTest=false){
 if(p.version!==1||p.mode!=='BRIDGE_BASE_TESTNET'||p.chainId!==84532||p.maximumObservationAgeSeconds!==60||!Array.isArray(p.rpcUrls)||p.rpcUrls.length!==2)throw Error('BRIDGE_BASE_PROFILE');
 const urls=p.rpcUrls.map(u=>new URL(u));for(const u of urls)if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||(localTest&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Error('BRIDGE_BASE_RPC_SCOPE');
 if(localTest&&urls.some(u=>u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)))throw Error('BRIDGE_LOCAL_CHAIN_ONLY');
 if(!localTest&&urls[0].hostname===urls[1].hostname)throw Error('BRIDGE_INDEPENDENT_BASE_READERS_REQUIRED');
 for(const a of [p.contractAddress,p.admin,p.operator,p.authorizer])if(!isAddress(a)||/^0x0+$/.test(a))throw Error('BRIDGE_BASE_ADDRESS');
 if(new Set([p.admin.toLowerCase(),p.operator.toLowerCase(),p.authorizer.toLowerCase()]).size<2||p.admin.toLowerCase()===p.operator.toLowerCase()||p.admin.toLowerCase()===p.authorizer.toLowerCase())throw Error('BRIDGE_BASE_ROLE_ISOLATION');
 if([p.operator,p.authorizer].some(a=>a.toLowerCase()===LIVE_DISPATCH_SCOPE.operator))throw Error('BRIDGE_SWAP_SIGNER_REUSE_FORBIDDEN');
 if(!/^0x[0-9a-f]{64}$/.test(p.runtimeCodeHash)||!/^0x[0-9a-f]{64}$/.test(p.deployment.transactionHash)||!/^0x[0-9a-f]{64}$/.test(p.deployment.blockHash)||!Number.isSafeInteger(p.deployment.blockHeight)||p.deployment.blockHeight<1)throw Error('BRIDGE_DEPLOYMENT_PIN');
 if(integer(p.maximumGas)<21000n||integer(p.maximumGas)>450000n||integer(p.gasPriceWei)<1n||integer(p.gasPriceWei)>20000000n||integer(p.maximumTransactionCostWei)<integer(p.maximumGas)*integer(p.gasPriceWei)||integer(p.maximumTransactionCostWei)>10000000000000n||integer(p.minimumGasBalanceWei)<integer(p.maximumTransactionCostWei))throw Error('BRIDGE_BASE_GAS_CAP');
 if(!p.principalAccount||!p.feeAccount||!p.swapAccount||new Set([p.principalAccount,p.feeAccount,p.swapAccount]).size!==3)throw Error('BRIDGE_ACCOUNT_ISOLATION_REQUIRED');
 return p;
}
export async function pinnedFile(pin:FilePin,secret=false){
 if(!isAbsolute(pin.path)||! /^[a-f0-9]{64}$/.test(pin.sha256))throw Error('BRIDGE_FILE_PIN');const s=await lstat(pin.path);
 if(!s.isFile()||s.isSymbolicLink()||await realpath(pin.path)!==resolve(pin.path)||s.size>16*1024*1024||(secret&&process.platform!=='win32'&&(s.mode&0o077)!==0))throw Error('BRIDGE_PROTECTED_FILE');
 const bytes=await readFile(pin.path);if(createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw Error('BRIDGE_FILE_PIN_CHANGED');return bytes;
}
export async function pinnedExecutable(pin:FilePin){
 if(!isAbsolute(pin.path)||! /^[a-f0-9]{64}$/.test(pin.sha256))throw Error('BRIDGE_EXECUTABLE_PIN');const before=await lstat(pin.path);
 if(!before.isFile()||before.isSymbolicLink()||await realpath(pin.path)!==resolve(pin.path)||before.size<1||before.size>512*1024*1024||(process.platform!=='win32'&&((before.mode&0o002)!==0||(before.mode&0o6000)!==0)))throw Error('BRIDGE_EXECUTABLE_FILE');
 const hash=createHash('sha256');let size=0;for await(const chunk of createReadStream(pin.path)){size+=chunk.length;if(size>512*1024*1024)throw Error('BRIDGE_EXECUTABLE_SIZE');hash.update(chunk);}
 const after=await lstat(pin.path);if(hash.digest('hex')!==pin.sha256||size!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino)throw Error('BRIDGE_EXECUTABLE_PIN_CHANGED');
}
export function validateBridgeCastProfile(p:BridgeCastProfile){
 if(p.version!==1||p.mode!=='BRIDGE_CAST_TESTNET'||typeof p.enabled!=='boolean'||!isAbsolute(p.root)||!isAbsolute(p.journalRoot)||relative(p.root,p.journalRoot).startsWith('..')||!/^[a-z0-9-]*bridge[a-z0-9-]*$/.test(p.operatorAccount)||!/^[a-z0-9-]*bridge[a-z0-9-]*$/.test(p.authorizerAccount)||[p.root,p.journalRoot,p.operatorPassword.path,p.authorizerPassword.path].some(x=>/g5|reverse-capital|zeeswap-testnet-20261023|zeeswap-g1/i.test(x)))throw Error('BRIDGE_DEDICATED_SIGNER_PROFILE');
 for(const pin of [p.operatorPassword,p.authorizerPassword,p.operatorKeystore,p.authorizerKeystore])if(relative(p.root,pin.path).startsWith('..')||!isAbsolute(pin.path))throw Error('BRIDGE_SIGNER_SECRET_SCOPE');return p;
}
