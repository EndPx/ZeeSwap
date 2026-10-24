import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireLinuxEnvioBootstrap,validateLinuxEnvioShape,type LinuxEnvioProfile} from '../../src/linux-envio-profile.ts';
const root='/opt/zeeswap-testnet',pin=(name:string)=>({path:root+'/secrets/'+name,sha256:'a'.repeat(64)});
const shape=():LinuxEnvioProfile=>({version:1,mode:'LINUX_ENVIO_TESTNET',operatorProfile:pin('linux-operator-profile.private.json'),runtime:pin('runtime.json'),registry:pin('registry.json'),exportProfile:pin('export.json'),exportCredentials:pin('export-credentials.json'),token:pin('token'),relocationProof:pin('relocation-applied-proof.private.json'),oldAdmissionArchives:[pin('old-admission.bin')],admissionPath:root+'/state/envio/admission.live.bin',bootstrapReceiptPath:root+'/state/envio/bootstrap-receipt.private.json',canonicalRpcUrl:'https://base-sepolia.gateway.tenderly.co',sourceUrl:'http://127.0.0.1:8099'});
test('Linux Envio transport refuses absent old journal inventory, path escape and public export',()=>{
 assert.equal(validateLinuxEnvioShape(shape()).version,1);
 for(const mutate of [(p:LinuxEnvioProfile)=>p.oldAdmissionArchives=[],(p:LinuxEnvioProfile)=>p.token.path=root+'/secrets/../state/token',(p:LinuxEnvioProfile)=>p.sourceUrl='http://0.0.0.0:8099',(p:LinuxEnvioProfile)=>p.admissionPath=root+'/state/old.bin']){const p=shape();mutate(p);assert.throws(()=>validateLinuxEnvioShape(p));}
});
test('new empty consumer requires recent bound opening/wallet proof and zero paused epoch0 state',()=>{
 const now=Date.parse('2026-10-24T00:00:00Z'),proof={status:'PREFUNDING_RELOCATION_VERIFIED',profileSha256:'a'.repeat(64),branchId:'br-broad-pine-ao79wemx',database:'zee_app_20261023',openingLedgerUnchanged:true,originalWalletCopyHashesVerified:true,logicalUfvkIdentityVerified:true,operatorNonce:0,verifiedAt:new Date(now-1000).toISOString()},control={accepting_orders:false,dispatch_enabled:false,reconciliation_required:true,epoch:'0'},counts={quotes:'0',orders:'0',deposits:'0',obligations:'0',operations:'0'};
 const check=(p=proof,c=control,n=counts)=>requireLinuxEnvioBootstrap(p,'a'.repeat(64),c,n,now);
 check();for(const key of Object.keys(counts))assert.throws(()=>check(proof,control,{...counts,[key]:'1'}));
 assert.throws(()=>check({...proof,verifiedAt:new Date(now-300001).toISOString()}));assert.throws(()=>check({...proof,verifiedAt:new Date(now+1).toISOString()}));assert.throws(()=>check({...proof,profileSha256:'b'.repeat(64)}));assert.throws(()=>check(proof,{...control,dispatch_enabled:true}));assert.throws(()=>check(proof,{...control,epoch:'1'}));assert.throws(()=>check({...proof,originalWalletCopyHashesVerified:false}));
});
