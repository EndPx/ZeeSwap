import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requireExplicitObserverWallet} from '../src/explicit-observer-wallet.ts';

const prefix=join(tmpdir(),'zeeswap-observer-config-'),directory=await mkdtemp(prefix);
after(async()=>{if(!resolve(directory).startsWith(resolve(prefix)))throw Error('Unexpected test cleanup path');await rm(directory,{recursive:true});});
const wallet={walletDir:'/synthetic/viewing-wallet',lockPath:'/synthetic/viewing-wallet.lock',protoDir:'/synthetic/proto',cliCommand:['synthetic-sdk'],readCommand:['synthetic-reader']};
const path=join(directory,'wallet.json'),bytes=JSON.stringify(wallet),digest=createHash('sha256').update(bytes).digest('hex');
await writeFile(path,bytes,{mode:0o600});

test('legacy operator config must explicitly identify an absolute viewing-wallet config and its exact byte digest',async()=>{
 for(const invalid of [{},{observerWalletConfig:path},{observerWalletConfig:'relative.json',observerWalletConfigSha256:digest},
  {observerWalletConfig:path,observerWalletConfigSha256:'unknown'}])
  await assert.rejects(()=>requireExplicitObserverWallet(invalid),/EXPLICIT_OBSERVER_WALLET_CONFIG_REQUIRED/);
 assert.equal(await requireExplicitObserverWallet({observerWalletConfig:path,observerWalletConfigSha256:digest}),resolve(path));
});

test('changed bytes and capital-header proof files cannot become a legacy viewing-wallet capability',async()=>{
 await assert.rejects(()=>requireExplicitObserverWallet({observerWalletConfig:path,observerWalletConfigSha256:'00'.repeat(32)}),/DIGEST_CHANGED/);
 const headerPath=join(directory,'headers.json'),headers=JSON.stringify({snapshot:{scannedHeight:12345,outputs:[]}});
 await writeFile(headerPath,headers,{mode:0o600});
 await assert.rejects(()=>requireExplicitObserverWallet({observerWalletConfig:headerPath,observerWalletConfigSha256:createHash('sha256').update(headers).digest('hex')}),/VIEWING_WALLET_CONFIG_INVALID/);
});

test('both real legacy entrypoints reject unmigrated config before reading database config or entering policy cleanup',async()=>{
 const configPath=join(directory,'unmigrated-operator.json');
 await writeFile(configPath,JSON.stringify({databaseConfig:join(directory,'database-must-not-be-read.json'),runtimeConfig:join(directory,'runtime-must-not-be-read.json')}));
 for(const [script,step] of [['reverse-operator.ts','observe-zcash'],['refund-operator.ts','status']]){
  const child=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../scripts/'+script,import.meta.url)),step,configPath],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.notEqual(child.status,0);assert.match(child.stderr,/EXPLICIT_OBSERVER_WALLET_CONFIG_REQUIRED/);
  assert.doesNotMatch(child.stderr,/ENOENT|database-must-not-be-read|runtime-must-not-be-read|permission denied/);
 }
});
