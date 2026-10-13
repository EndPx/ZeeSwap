import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PrivateData } from '../src/private-data.ts';
import { LocalWalletAdapter } from '../src/wallet-adapter.ts';

export async function runtime(development=false){
 const data=JSON.parse(await readFile(process.env.ZEE_RUNTIME_CONFIG || new URL(development?'../../.deploy-local/neon-g2-runtime.json':'../../.deploy-local/neon-primary-runtime.json',import.meta.url),'utf8'));
 const walletConfig=process.env.ZEE_WALLET_CONFIG || fileURLToPath(new URL(development?'../../.deploy-local/observer-wallet.json':'../../.deploy-local/observer-wallet-primary.json',import.meta.url));
 const python=process.env.ZEE_WALLET_PYTHON || fileURLToPath(new URL('../../.deploy-local/g1-python/Scripts/python.exe',import.meta.url));
 const script=fileURLToPath(new URL('../../workers/zcash-wallet/live_wallet.py',import.meta.url));
 return {apiUrl:data.apiUrl as string,workerUrl:data.workerUrl as string,
  keys:new PrivateData(Buffer.from(data.payloadKeyHex,'hex'),Buffer.from(data.lookupKeyHex,'hex')),
  wallet:new LocalWalletAdapter(python,[script,'--config',walletConfig])};
}
