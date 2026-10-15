import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';

/** Legacy operator configs must explicitly migrate to the correct source
 * viewing wallet. A development default or a capital-header file is not a
 * scanner capability. Bind the exact private configuration bytes before I/O
 * can reach a database, signer or policy mutation.
 */
export async function requireExplicitObserverWallet(config:any){
 if(typeof config?.observerWalletConfig!=='string'||!isAbsolute(config.observerWalletConfig)
  ||!/^[0-9a-f]{64}$/.test(config.observerWalletConfigSha256??''))throw Error('EXPLICIT_OBSERVER_WALLET_CONFIG_REQUIRED');
 const path=resolve(config.observerWalletConfig),bytes=await readFile(path);
 if(createHash('sha256').update(bytes).digest('hex')!==config.observerWalletConfigSha256)throw Error('OBSERVER_WALLET_CONFIG_DIGEST_CHANGED');
 const wallet=JSON.parse(bytes.toString('utf8'));
 if(['walletDir','lockPath','protoDir'].some(k=>typeof wallet[k]!=='string'||!wallet[k])
  ||['cliCommand','readCommand'].some(k=>!Array.isArray(wallet[k])||!wallet[k].length||wallet[k].some((v:unknown)=>typeof v!=='string'||!v)))
  throw Error('OBSERVER_VIEWING_WALLET_CONFIG_INVALID');
 return path;
}
