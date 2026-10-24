import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLinuxProfileShape,type LinuxOperatorProfile} from '../src/linux-testnet-profile.ts';
function fixture():LinuxOperatorProfile{
 const base='/opt/zeeswap-testnet',release=base+'/releases/linux-reviewed',state=base+'/state',secrets=base+'/secrets';
 const pin=(path:string)=>({path,sha256:'a'.repeat(64)});
 return {version:1,profile:'zeeswap-linux-operator-20261023',
  identity:{projectId:'raspy-truth-63998651',branchId:'br-broad-pine-ao79wemx',database:'zee_app_20261023',host:'ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech',operator:'0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087',sourceFingerprint:'b'.repeat(64),chefAccountId:'private-test-identity',birthday:4532047,chainId:84532,settlement:'0xe99ac648f85450b8ddeaea088aa99749c5e16da3',token:'0xd64c116352cef2adc9484098ae332fd9ba339a63',account:'zeeswap-live-20261023-operator'},
  roots:{base,release,state,secrets},
  paths:{operatorWallet:state+'/operator-wallet',watchWallet:state+'/deposit-view',operatorUfvk:secrets+'/operator.ufvk',walletLock:state+'/operator-wallet.lock',baseJournal:state+'/base-signer-journal',basePassword:secrets+'/operator-password',baseKeystore:base+'/home/.foundry/keystores/zeeswap-live-20261023-operator'},
  credentials:{operatorKeystore:pin(base+'/home/.foundry/keystores/zeeswap-live-20261023-operator'),operatorPassword:pin(secrets+'/operator-password')},
  artifacts:{reader:pin(release+'/bin/reader'),zingo:pin(release+'/bin/zingo'),verify:pin(release+'/bin/verify'),cast:pin(release+'/bin/cast'),scanner:pin(release+'/bin/scanner')},
  immutable:{openingProof:pin(secrets+'/opening.json'),chefOpeningProof:pin(secrets+'/chef-opening.json'),operatorBinding:pin(secrets+'/binding.json'),runtime:pin(secrets+'/runtime.json'),registry:pin(secrets+'/registry.json'),operatorUfvk:pin(secrets+'/operator.ufvk')},
  transport:{prefunding:true,sourceWritersStoppedAt:'2026-10-24T00:00:00Z',originalCodeCommit:'c'.repeat(40),walletTrees:[
   {logicalId:'operator-spend-wallet',path:state+'/operator-wallet',files:[{relative:'wallet.dat',bytes:1,sha256:'d'.repeat(64)}]},
   {logicalId:'operator-view-wallet',path:state+'/deposit-view',files:[{relative:'wallet.dat',bytes:1,sha256:'e'.repeat(64)}]},
   {logicalId:'operator-base-journal',path:state+'/base-signer-journal',files:[]},
   {logicalId:'operator-reverse-journals',path:state+'/reverse-orders',files:[]}]}};
}
test('explicit native operator fixture and empty journal inventories are valid',()=>{
 const profile=fixture();assert.equal(validateLinuxProfileShape(profile),profile);
});
test('wrong network/database/operator and Windows transports refuse',()=>{
 for(const mutate of [(p:LinuxOperatorProfile)=>{p.identity.branchId='production';},(p:LinuxOperatorProfile)=>{p.identity.chainId=8453;},(p:LinuxOperatorProfile)=>{p.identity.account='deployer';},(p:LinuxOperatorProfile)=>{p.artifacts.zingo.path='C:\\private\\zingo.exe';},(p:LinuxOperatorProfile)=>{p.artifacts.reader.path=p.roots.release+'/bin/../reader';}]){
  const profile=fixture();mutate(profile);assert.throws(()=>validateLinuxProfileShape(profile),/LINUX_PROFILE/);
 }
});
test('relocation refuses payer identities, missing original wallets and tree escapes',()=>{
 for(const mutate of [(p:LinuxOperatorProfile)=>{p.transport!.walletTrees[0].path=p.roots.state+'/user-payer';},(p:LinuxOperatorProfile)=>{p.transport!.walletTrees[0].files=[];},(p:LinuxOperatorProfile)=>{p.transport!.walletTrees.pop();},(p:LinuxOperatorProfile)=>{p.transport!.walletTrees[0].files[0].relative='../user-payer/wallet.dat';},(p:LinuxOperatorProfile)=>{p.transport!.originalCodeCommit='HEAD';}]){
  const profile=fixture();mutate(profile);assert.throws(()=>validateLinuxProfileShape(profile),/LINUX_PROFILE/);
 }
});
