import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLinuxNativeScope,validateLinuxCapitalApproval,loadLinuxNativeDispatch,nativeOrderDirectory,type LinuxNativeConfig} from '../../src/linux-native-dispatch.ts';
import {parseLinuxNativeArgs} from '../../src/linux-native-runner.ts';
import {LIVE_DISPATCH_SCOPE as s,type LiveBaseSignerConfig} from '../../src/live-dispatch-scope.ts';
import type {LinuxOperatorProfile} from '../../src/linux-testnet-profile.ts';
const base='/opt/zeeswap-testnet',release=base+'/releases/fixture',hash='a'.repeat(64),id='11111111-2222-3333-4444-555555555555',pin=(path:string)=>({path,sha256:hash});
const p={roots:{base,release,secrets:base+'/secrets',state:base+'/state'},identity:{sourceFingerprint:hash},paths:{baseJournal:base+'/state/base-signer-journal',basePassword:base+'/secrets/operator-password'},artifacts:{cast:pin(release+'/bin/cast')},immutable:{chefOpeningProof:pin(base+'/secrets/opening.json')}} as LinuxOperatorProfile;
const signer:LiveBaseSignerConfig={cast:p.artifacts.cast.path,rpcUrl:'https://sepolia.base.org',account:s.account,operator:s.operator,passwordFile:p.paths.basePassword,journalRoot:p.paths.baseJournal,token:s.token,settlement:s.settlement,tokenCodeHash:s.tokenCodeHash,settlementCodeHash:s.settlementCodeHash};
function config(purpose:'reverse'|'refund'):LinuxNativeConfig{
 const scripts={native:'workers/zcash-wallet/linux_native_wallet.py',profile:'workers/zcash-wallet/linux_operator_profile.py',supervisor:'workers/zcash-wallet/owned_wallet_call.py',preparedKernel:'workers/zcash-wallet/prepared_raw.py',refundKernel:'workers/zcash-wallet/refund_raw.py',outgoingKernel:'workers/zcash-wallet/outgoing_recovery.py',preflight:`workers/zcash-wallet/${purpose}_preflight.py`,guard:`api/scripts/${purpose}-linux-broadcast-guard.ts`,baseSigner:`workers/base-signer/${purpose==='reverse'?'reverse_signer':'refund_signer'}.py`};
 return {version:1,mode:purpose==='reverse'?'LINUX_TESTNET_REVERSE':'LINUX_TESTNET_REFUND',enabled:false,operatorProfile:base+'/secrets/linux-operator-profile.private.json',python:base+'/tools/python/bin/python',node:pin('/usr/bin/node'),signerConfig:pin(base+'/secrets/'+purpose+'-signer.private.json'),handoffProof:base+'/secrets/relocation-applied-proof.private.json',protoDir:release+'/proto',pollSeconds:5,maxCycles:10,maxAmountZatoshi:'100000',scripts:Object.fromEntries(Object.entries(scripts).map(([k,v])=>[k,pin(release+'/app/'+v)])) as LinuxNativeConfig['scripts']};
}
test('Linux scope keeps fresh operator/shared nonce journal and exact reviewed release transport',()=>{
 for(const purpose of ['reverse','refund'] as const){const c=config(purpose);assert.doesNotThrow(()=>validateLinuxNativeScope(c,p,purpose,signer));
  for(const changed of [{...c,python:'/home/albary/old/python'},{...c,operatorProfile:'/tmp/profile'},{...c,maxAmountZatoshi:'200001'},
   {...c,scripts:{...c.scripts,guard:pin(release+'/app/api/scripts/arbitrary.ts')}},{...c,protoDir:'/tmp/proto'}])assert.throws(()=>validateLinuxNativeScope(changed,p,purpose,signer));
  assert.throws(()=>validateLinuxNativeScope(c,p,purpose,{...signer,journalRoot:'/home/albary/old-journal'}));}
});
test('capital approval binds each order/account/opening and only explicit in-order proof paths',()=>{
 const approval={version:1,orderId:id,sourceFingerprint:hash,openingProofSha256:hash,sources:[{kind:'settled-source',path:nativeOrderDirectory(p,'reverse',id)+'/proofs/settled.json',sha256:hash,orderId:id}]};
 assert.doesNotThrow(()=>validateLinuxCapitalApproval(p,'reverse',id,approval));
 for(const changed of [{...approval,orderId:'wrong'},{...approval,sourceFingerprint:'b'.repeat(64)},{...approval,openingProofSha256:'b'.repeat(64)},
  {...approval,sources:[{...approval.sources[0],path:base+'/secrets/some.json'}]},{...approval,sources:[{...approval.sources[0],kind:'refund-source'}]},
  {...approval,sources:[{...approval.sources[0],kind:'opening'}]}])assert.throws(()=>validateLinuxCapitalApproval(p,'reverse',id,changed));
 assert.throws(()=>validateLinuxCapitalApproval(p,'refund',id,{...approval,sources:[]}),/LINUX_REFUND_OWN_SOURCE_REQUIRED/);
 assert.doesNotThrow(()=>validateLinuxCapitalApproval(p,'refund',id,{...approval,sources:[{...approval.sources[0],kind:'refund-source',path:nativeOrderDirectory(p,'refund',id)+'/proofs/source.json'}]}));
});
test('Linux financial CLI rejects typos/duplicates/unbounded retries before loading profile or DB',async()=>{
 assert.equal(parseLinuxNativeArgs('reverse',['/profile','--once','--order',id,'--step','NATIVE']).step,'NATIVE');
 assert.equal(parseLinuxNativeArgs('refund',['/profile','--once','--order',id]).order,id);
 for(const args of [['/profile','--oncefoo'],['/profile','--once','--once'],['/profile','--order',id,'--step','NATIVE'],['/profile','--retry-same-bytes'],['/profile','--once','--order',id,'--step','APPROVE_NATIVE','--retry-same-bytes']])assert.throws(()=>parseLinuxNativeArgs('reverse',args));
 assert.throws(()=>parseLinuxNativeArgs('refund',['/profile','--once']));
 await assert.rejects(loadLinuxNativeDispatch('/wrong','reverse'),/LINUX_NATIVE_EXACT_PROFILE/);
});
