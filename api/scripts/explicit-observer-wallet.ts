import {fileURLToPath} from 'node:url';
import {LocalWalletAdapter} from '../src/wallet-adapter.ts';
import {requireExplicitObserverWallet} from '../src/explicit-observer-wallet.ts';

export async function explicitObserverWallet(config:any){
 const path=await requireExplicitObserverWallet(config);
 const python=process.env.ZEE_WALLET_PYTHON||fileURLToPath(new URL('../../.deploy-local/g1-python/Scripts/python.exe',import.meta.url));
 return new LocalWalletAdapter(python,[fileURLToPath(new URL('../../workers/zcash-wallet/live_wallet.py',import.meta.url)),'--config',path]);
}
