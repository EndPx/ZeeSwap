import {test} from 'node:test';import assert from 'node:assert/strict';
import {continuationTables,continuationDigest as digest} from '../src/native-circle-continuation.ts';
import {servicePolicyTables} from '../src/testnet-service-policy.ts';import {POLICY_SHA} from './fixtures/service-policy-fixture.ts';import {launchFixture} from './fixtures/service-launch-fixture.ts';
import {validateServiceLaunchWindow,validateServiceCurrentSourceProof,validateCurrentSourceActivation,activateServicePolicy,type CurrentSourceActivation,type ServiceActivationIntent,type ServiceLaunchState} from '../src/testnet-service-launch.ts';
function fixture(){const now=Date.now(),s:ServiceLaunchState={control:{epoch:'235',xmin:'43503',accepting_orders:false,dispatch_enabled:false,reconciliation_required:true},authorizationRows:0,globalBusy:false,feeXmin:'100',snapshot:Object.fromEntries([...continuationTables,...servicePolicyTables].map(t=>[t,[]]))};
 s.snapshot.inventory_accounts=[['TAZ','principal','200000'],['TAZ','fee','40000'],['mockUSDC','principal','200000'],['baseETH','fee','400000000000000']].map(([asset,purpose,balance])=>({asset,purpose,balance,reserved:'0'}));
 const{p,w}=launchFixture(s,now);p.publicCommit='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc';
 const proof={version:1 as const,status:'ROOT_TESTNET_SERVICE_CURRENT_SOURCE_VERIFIED' as const,mode:'CURRENT_SOURCE' as const,noStabilityClaim:true as const,auditMode:'CURRENT_SOURCE_FINANCIAL_AUDIT' as const,nativeHistoricalReadinessClaimed:false as const,nativeHeadEvidence:'LATEST_HEIGHT_METADATA_ONLY' as const,policySha256:POLICY_SHA,canonicalAuditSha256:p.canonicalAuditSha256,sourceIdentity:w.sourceIdentity,capturedAt:w.samples.at(-1)!.at,sample:structuredClone(w.samples.at(-1)!),snapshotSha256:digest(s.snapshot),sourceReset:false as const,auditCursorFloor:w.auditCursorFloor};
 const pin=(name:string)=>({path:'/opt/zeeswap-testnet/state/service-policy/'+name+'.private.json',sha256:POLICY_SHA});
 const q:CurrentSourceActivation={mode:'CURRENT_SOURCE',permitSha256:POLICY_SHA,proof,proofSha256:POLICY_SHA,permit:{version:1,purpose:'CURRENT_SOURCE_PILOT_ACTIVATION',status:'ROOT_CURRENT_SOURCE_PILOT_ACTIVATION_APPROVED',permitId:'12345678-1234-4234-8234-123456789abc',financialPublicCommit:p.publicCommit,activatorPublicCommit:'b'.repeat(40),database:'zee_app_20261023',databaseSystemIdentifier:'7701863382450487342',policySha256:POLICY_SHA,profileSha256:p.profileSha256,sourceIdentityDigest:p.sourceIdentityDigest,auditedControl:p.auditedControl,activeEpoch:p.activeEpoch,sourceProof:pin('current'),canonicalAudit:pin('audit'),allocationReceipt:pin('allocation'),launchCapital:pin('capital'),neutralWrapper:pin('wrapper'),neutralCapture:pin('capture'),neutralStart:pin('start'),humanOverride:{kind:'DIRECT_BROWSER_TRANSACTION_WITHOUT_OBSERVER_TESTS',attestedBy:'ROOT',instructionSha256:POLICY_SHA,attestedAt:new Date(now).toISOString()},noStabilityClaim:true,verifiedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString()}};
 return{s,p,w,q,now};}
test('one current proof is a distinct qualification, never a fabricated300-second window; legacy window still validates',()=>{
 const{s,p,w,q,now}=fixture();validateServiceLaunchWindow(w,p,POLICY_SHA,now);validateCurrentSourceActivation(q,p,POLICY_SHA,now);
 assert.equal(q.proof.mode,'CURRENT_SOURCE');assert.equal(q.proof.noStabilityClaim,true);assert.equal('samples'in q.proof,false);
 assert.throws(()=>validateServiceLaunchWindow(q.proof as any,p,POLICY_SHA,now),/WINDOW_SCOPE/);
 assert.throws(()=>validateServiceLaunchWindow({...w,samples:[w.samples.at(-1)!]},p,POLICY_SHA,now),/WINDOW_SCOPE/);
 assert.equal(q.proof.snapshotSha256,digest(s.snapshot));
});
test('current mode refuses staleSQL, falsecanonical/source identity, missinghumanoverride and changed Root authority pins',()=>{
 const mutate:Array<(f:ReturnType<typeof fixture>)=>void>=[
  f=>{f.q.proof.sample.sql[0]!.observedAt=new Date(f.now-30001).toISOString();},
  f=>{f.q.proof.sample.sql[0]!.canonical.hash='b'.repeat(64);},f=>{f.q.proof.sample.envio.generation='other';},
  f=>{f.q.proof.sample.cursor.sourceId='other';},f=>{f.q.proof.sourceReset=true as any;},f=>{f.q.proof.noStabilityClaim=false as any;},
  f=>{f.q.permit.humanOverride.kind='UNAPPROVED' as any;},f=>{f.q.permit.policySha256='b'.repeat(64);},
  f=>{f.q.permit.canonicalAudit.sha256='b'.repeat(64);},f=>{f.q.permit.allocationReceipt.sha256='b'.repeat(64);},
  f=>{f.q.permit.auditedControl={epoch:'236',xmin:'43503'};},f=>{f.q.permit.databaseSystemIdentifier='other';},
  f=>{f.q.permit.expiresAt=new Date(f.now-1).toISOString();},f=>{f.q.permit.activeEpoch='237';},
 ];for(const change of mutate){const f=fixture();change(f);assert.throws(()=>validateCurrentSourceActivation(f.q,f.p,POLICY_SHA,f.now));}
 const f=fixture();assert.throws(()=>validateServiceCurrentSourceProof({...f.q.proof,status:'ROOT_TESTNET_SERVICE_SOURCE_WINDOW_VERIFIED' as any},f.p,POLICY_SHA,f.now));
});
test('current SQL issuance is 30 seconds while transferred proof freshness stays 60 and live SQL remains a separate guard',()=>{
 const f=fixture();validateCurrentSourceActivation(f.q,f.p,POLICY_SHA,f.now);
 const q=structuredClone(f.q),captured=new Date(f.now-40000).toISOString(),observed=new Date(f.now-50000).toISOString();q.proof.capturedAt=captured;q.proof.sample.at=captured;
 for(const r of q.proof.sample.sql){r.observedAt=observed;r.canonical.checkedAt=captured;}
 for(const r of[q.proof.sample.chef,q.proof.sample.envio]){r.sampledAt=captured;r.canonical.checkedAt=captured;}
 q.proof.sample.cursor.checkedAt=captured;validateCurrentSourceActivation(q,f.p,POLICY_SHA,f.now);
 const future=structuredClone(q);future.proof.sample.sql[0]!.observedAt=new Date(Date.parse(captured)+5001).toISOString();assert.throws(()=>validateCurrentSourceActivation(future,f.p,POLICY_SHA,f.now),/CURRENT_SQL_30_SECONDS/);
 const stale=structuredClone(q);stale.proof.sample.sql[0]!.observedAt=new Date(f.now-71000).toISOString();assert.throws(()=>validateCurrentSourceActivation(stale,f.p,POLICY_SHA,f.now));
 assert.throws(()=>validateCurrentSourceActivation(q,f.p,POLICY_SHA,f.now+20001),/CURRENT_SOURCE_SCOPE/);
 const issuance=structuredClone(f.q);issuance.proof.capturedAt=new Date(f.now-10000).toISOString();issuance.proof.sample.at=issuance.proof.capturedAt;issuance.proof.sample.sql[0]!.observedAt=new Date(f.now-40001).toISOString();assert.throws(()=>validateCurrentSourceActivation(issuance,f.p,POLICY_SHA,f.now),/CURRENT_SQL_30_SECONDS/);
});
test('current activation uses the same originalXID/CAS/limits and three capital guards, with an explicit non-stability intent',async()=>{
 const{s,p,q}=fixture(),sql:string[]=[],inserts:any[]=[];let guards=0,capital=0,intent:ServiceActivationIntent|undefined;
 const c={async query(text:string,args?:unknown[]){sql.push(text);if(text.includes('pg_try_advisory'))return{rows:[{locked:true}]};if(text.includes('pg_control_system'))return{rows:[{database:'zee_app_20261023',role:'zee_app_admin_20261023',system_identifier:'7701863382450487342'}]};if(text.includes('pg_current_xact_id'))return{rows:[{id:'60001'}]};if(text.includes('pg_xact_status'))return{rows:[{status:'in progress'}]};if(text.startsWith('INSERT'))inserts.push(args);if(text.startsWith('UPDATE'))return{rows:[{xmin:'60001'}]};return{rows:[]};}};
 await activateServicePolicy(c as any,async()=>{guards++;return structuredClone(s);},p,POLICY_SHA,q,async()=>{capital++;},async i=>{intent=i;assert.ok(!sql.some(x=>x.startsWith('INSERT')));});
 assert.equal(capital,3);assert.equal(guards,2);assert.equal(sql.at(-1),'COMMIT');assert.equal(inserts.length,1);assert.deepEqual(intent?.qualification,{mode:'CURRENT_SOURCE',noStabilityClaim:true,permitSha256:POLICY_SHA,sourceProofSha256:POLICY_SHA,activatorPublicCommit:q.permit.activatorPublicCommit});
 assert.ok(sql.find(x=>x.startsWith('INSERT'))!.includes('100000,2,2,1,32,40,12,200000,200000,40000,400000000000000'));
});
test('current activation refuses wrong actualdatabase or latecapital/intervenedstate before policy/control writes',async()=>{
 for(const fault of ['database','capital','intervention']){const{s,p,q}=fixture(),sql:string[]=[];let reads=0;const c={async query(text:string){sql.push(text);if(text.includes('pg_try_advisory'))return{rows:[{locked:true}]};if(text.includes('pg_control_system'))return{rows:[{database:'zee_app_20261023',role:'zee_app_admin_20261023',system_identifier:fault==='database'?'other':'7701863382450487342'}]};if(text.includes('pg_current_xact_id'))return{rows:[{id:'60001'}]};if(text.includes('pg_xact_status'))return{rows:[{status:'in progress'}]};return{rows:[]};}};
  await assert.rejects(activateServicePolicy(c as any,async()=>{reads++;return fault==='intervention'&&reads>1?{...s,authorizationRows:1}:s;},p,POLICY_SHA,q,async()=>{if(fault==='capital')throw Error('ACTUAL_CAPITAL_AGED');},async()=>{}));
  assert.equal(sql.at(-1),'ROLLBACK');assert.ok(!sql.some(x=>x.startsWith('INSERT')||x.startsWith('UPDATE')));
 }
});
