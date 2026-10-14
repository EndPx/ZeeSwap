import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID,createHash } from 'node:crypto';
import { atomic, toAtomic, fixtureOutput } from '../src/amounts.ts';
import { PrivateData, accessHash } from '../src/private-data.ts';
import { makeMemo, parseMemo } from '../src/repository.ts';
import { readFileSync } from 'node:fs';
import { validateSnapshot } from '../src/observer.ts';
import { filterHistorical,validateCapital } from '../scripts/live-forward-state.ts';
import { withLeaseHeartbeat } from '../src/lease-heartbeat.ts';
import {assertReverseAuthority,approvalDigest} from '../src/reverse-authority.ts';
import type {PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import type {FundingTerms} from '../src/base-escrow.ts';
import {validateReverseCapital,validateCapitalOpening,type ReverseCapitalProof,type CapitalOpening} from '../src/reverse-capital.ts';

test('reverse opening retry rejects changed gas, altered ledger and already reserved or spent capital',()=>{
 const txid='aa'.repeat(32),gas='1000000000000000';
 const opening:CapitalOpening={version:1,eventId:'11111111-1111-1111-1111-111111111111',fundingTxid:txid,tazPrincipal:'190000',tazFee:'10000',baseFee:gas,proofDigest:'bb'.repeat(32)};
 assert.doesNotThrow(()=>validateCapitalOpening(opening,txid,gas,[],[]));
 assert.throws(()=>validateCapitalOpening(opening,txid,'999999999999999',[],[]),/BASE_CAPITAL_CHANGED/);
 const accounts=[{asset:'TAZ',purpose:'principal',balance:'190000',reserved:'0'},{asset:'TAZ',purpose:'fee',balance:'10000',reserved:'0'},{asset:'baseETH',purpose:'fee',balance:gas,reserved:'0'}];
 const ledger=[{asset:'TAZ',bucket:'principal:available',amount:'190000'},{asset:'TAZ',bucket:'principal:operator-capital',amount:'-190000'},
 {asset:'TAZ',bucket:'fee:available',amount:'10000'},{asset:'TAZ',bucket:'fee:operator-capital',amount:'-10000'},
 {asset:'baseETH',bucket:'fee:available',amount:gas},{asset:'baseETH',bucket:'fee:operator-capital',amount:'-'+gas}];
 assert.doesNotThrow(()=>validateCapitalOpening(opening,txid,gas,ledger,accounts));
 assert.throws(()=>validateCapitalOpening(opening,txid,'999999999999999',ledger,accounts),/BASE_CAPITAL_CHANGED/);
 assert.throws(()=>validateCapitalOpening(opening,txid,gas,[...ledger.slice(1),ledger[1]],accounts),/RETRY_INCONSISTENT/);
 assert.throws(()=>validateCapitalOpening(opening,txid,gas,ledger,[{...accounts[0],reserved:'100000'},...accounts.slice(1)]),/RETRY_INCONSISTENT/);
 assert.throws(()=>validateCapitalOpening(opening,txid,gas,ledger,[{...accounts[0],balance:'90000'},...accounts.slice(1)]),/RETRY_INCONSISTENT/);
});

test('reverse capital requires the one approved independent shielded receipt with exact inventory and ten confirmations',()=>{
 const txid='cc'.repeat(32),block='bb'.repeat(32),tip='aa'.repeat(32),now=new Date().toISOString();
 const proof:ReverseCapitalProof={version:1,fundingTxid:txid,capitalBalanceZatoshi:'200000',capitalNotes:[{pool:'ironwood',txid,index:0,value:'200000',height:990,blockHash:block}],
 snapshot:{schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:now,scannedHeight:999,tipHash:tip,
 blocks:[{height:990,hash:block,time:now},{height:999,hash:tip,time:now}],outputs:[{txid,index:0,pool:'ironwood',amount:'200000',receiver:'fixture:capital',memo:null,height:990,blockHash:block,blockTime:now,shieldedSource:true}]}};
 assert.equal(validateReverseCapital(proof,txid).capitalBalanceZatoshi,'200000');
 assert.throws(()=>validateReverseCapital(proof,'dd'.repeat(32)),/INVALID_REVERSE_CAPITAL/);
 assert.throws(()=>validateReverseCapital({...proof,capitalBalanceZatoshi:'200001'},txid),/INVALID_REVERSE_CAPITAL/);
 assert.throws(()=>validateReverseCapital({...proof,capitalNotes:[{...proof.capitalNotes[0],value:'199999'}]},txid),/UNCONFIRMED_OR_UNAPPROVED/);
 assert.throws(()=>validateReverseCapital({...proof,snapshot:{...proof.snapshot,outputs:[{...proof.snapshot.outputs[0],shieldedSource:false}]}},txid),/INDEPENDENT_SHIELDED_CAPITAL/);
 assert.throws(()=>validateReverseCapital({...proof,snapshot:{...proof.snapshot,observedAt:new Date(Date.now()-61000).toISOString()}},txid),/STALE_SNAPSHOT/);
});

test('final reverse broadcast authority rejects stale approval, another order, altered raw bytes and expiry',()=>{
 const id='11111111-1111-1111-1111-111111111111',contract='0x'+'33'.repeat(20);
 const funding={id:'0x'+'11'.repeat(32),token:'0x'+'22'.repeat(20),payer:'0x'+'44'.repeat(20),refundRecipient:'0x'+'55'.repeat(20),amount:'100000',nonce:'1',fundingCutoff:'9000',cancellationAvailableAt:'16200'} as FundingTerms;
 const terms={orderId:id,operationId:'22222222-2222-2222-2222-222222222222',recipient:'fixture:shielded',amountZatoshi:'100000',maxFeeZatoshi:'10000'};
 const prepared:PreparedZcashTransaction={operationId:id,amount:'100000',fee:'10000',recipient:terms.recipient,txid:'aa'.repeat(32),rawTransaction:'abcd',feeZatoshi:'10000',expiryHeight:'1020',
 selectedNotes:[{pool:'ironwood',txid:'bb'.repeat(32),index:0,value:'200000'}],outputs:[{recipient:terms.recipient,amount:'100000',ownChange:false},{recipient:'fixture:change',amount:'90000',ownChange:true}]};
 const approved={version:1,orderId:id,settlementId:funding.id,recipient:terms.recipient,amountZatoshi:'100000',maxFeeZatoshi:'10000',
 base:{contract,token:funding.token,payer:funding.payer,refundRecipient:funding.refundRecipient,amountAtomic:'100000',cancellationAvailableAt:funding.cancellationAvailableAt}};
 const digest=approvalDigest(approved),request={operationId:id,approvedDigest:digest,txid:prepared.txid,rawSha256:createHash('sha256').update(Buffer.from('abcd','hex')).digest('hex')};
 const check=(req=request,a=approved,p=prepared)=>assertReverseAuthority(req,a,digest,id,p,terms,funding,contract,'1000');
 assert.doesNotThrow(()=>check());
 assert.throws(()=>check({...request,operationId:'33333333-3333-3333-3333-333333333333'}),/AUTHORITY_MISMATCH/);
 assert.throws(()=>check({...request,approvedDigest:'00'.repeat(32)}),/AUTHORITY_MISMATCH/);
 assert.throws(()=>check(request,{...approved,recipient:'fixture:other'}),/AUTHORITY_MISMATCH/);
 assert.throws(()=>check(request,approved,{...prepared,rawTransaction:'abce'}),/BYTES_OR_EXPIRY/);
 assert.throws(()=>check(request,approved,{...prepared,expiryHeight:'1019'}),/BYTES_OR_EXPIRY/);
 assert.throws(()=>check(request,approved,{...prepared,operationId:'33333333-3333-3333-3333-333333333333'}),/IMMUTABLE_QUOTE/);
 assert.throws(()=>check(request,approved,{...prepared,amount:'99999'}),/IMMUTABLE_QUOTE/);
});

test('atomic parsing rejects lossy, noncanonical and fractional inputs',()=>{
 for(const bad of ['01','-1','1.2','1e6','NaN',' 1','1'.repeat(79)]) assert.throws(()=>atomic(bad));
 assert.equal(atomic('9007199254740993'),9007199254740993n);
 assert.equal(toAtomic('0.001',8),'100000');
 assert.throws(()=>toAtomic('0.000000001',8));
});
test('fixture conversion uses asset decimals and exact arithmetic in both directions',()=>{
 assert.equal(fixtureOutput(toAtomic('0.01',8),'ZCASH_TO_BASE'),toAtomic('1',6));
 assert.equal(fixtureOutput(toAtomic('10',6),'BASE_TO_ZCASH'),toAtomic('0.1',8));
 assert.throws(()=>fixtureOutput('99999','ZCASH_TO_BASE'));
 assert.throws(()=>fixtureOutput('10000001','BASE_TO_ZCASH'));
});
test('private envelopes are randomized, authenticated and bound to their record',()=>{
 const p=new PrivateData(randomBytes(32),randomBytes(32));const value={recipient:'private shielded receiver'};
 const a=p.seal(value,'quote:a'),b=p.seal(value,'quote:a');
 assert.notDeepEqual(a,b);assert.deepEqual(p.open(a,'quote:a'),value);
 assert.throws(()=>p.open(a,'quote:b'));const corrupted=Buffer.from(a);corrupted[corrupted.length-1]^=1;
 assert.throws(()=>p.open(corrupted,'quote:a'));
 assert.notDeepEqual(p.lookup('reference','x'),p.lookup('receiver','x'));
 assert.equal(accessHash('x').length,32);
});
test('memo permits only canonical versioned references, rejecting duplicate keys and commands',()=>{
 const ref=randomUUID();assert.equal(parseMemo(makeMemo(ref)),ref);
 for(const value of [`{"v":1,"v":1,"ref":"${ref}"}`,`{"v":1,"ref":"${ref}","command":"send"}`,makeMemo(ref)+' ', 'x'.repeat(513)])
  assert.throws(()=>parseMemo(value));
});
test('versioned observer golden fixture passes after refreshing its test clock',()=>{
 const s=JSON.parse(readFileSync(new URL('../../workers/zcash-wallet/snapshot.golden.json',import.meta.url),'utf8'));
 s.observedAt=new Date().toISOString();assert.equal(validateSnapshot(s).scannedHeight,1000);
 assert.throws(()=>validateSnapshot({...s,ufvk:'must never cross this boundary'}),/INVALID_SNAPSHOT_SHAPE/);
 assert.throws(()=>validateSnapshot({...s,network:'zcash-mainnet'}),/INVALID_SNAPSHOT/);
});

test('capital proof excludes held funds exactly and rejects stale, inflated or missing liabilities',()=>{
 const proof={schemaVersion:1,network:'zcash-testnet',observedAt:new Date().toISOString(),scannedHeight:100,
  totalSpendableZatoshis:'590000',excludedHeldZatoshis:'100000',operatorFeeCapitalZatoshis:'490000'};
 assert.equal(validateCapital(proof,103,100000n),'490000');
 assert.throws(()=>validateCapital(proof,107,100000n),/STALE_CAPITAL/);
 assert.throws(()=>validateCapital({...proof,operatorFeeCapitalZatoshis:'590000'},100,100000n),/INVALID_CAPITAL/);
 assert.throws(()=>validateCapital(proof,100,200000n),/INVALID_CAPITAL/);
 assert.throws(()=>validateCapital({...proof,observedAt:new Date(Date.now()-300001).toISOString()},100,100000n),/STALE_CAPITAL/);
});
test('historical exclusion matches audited output identities and preserves unmatched new receipts',()=>{
 const s=JSON.parse(readFileSync(new URL('../../workers/zcash-wallet/snapshot.golden.json',import.meta.url),'utf8'));
 const old={txid:'a'.repeat(64),pool:'ironwood',index:0,amount:'100000',height:990};s.outputs=[old];
 const historical=[{txid:old.txid,pool:old.pool,index:old.index,amount:old.amount,height:old.height}];
 s.outputs.push({...old,index:old.index+1,memo:'unmatched new receipt'});
 const filtered=filterHistorical(s,historical);assert.equal(filtered.outputs.length,1);assert.equal(filtered.outputs[0].index,old.index+1);
 assert.throws(()=>filterHistorical(s,[{...historical[0],amount:'1'}]),/HISTORICAL_OUTPUT_CHANGED/);
 assert.throws(()=>filterHistorical(s,[historical[0],historical[0]]),/DUPLICATE_HISTORICAL/);
});
test('lease heartbeat failure prevents the next signing or broadcast checkpoint',async()=>{
 let renewals=0,broadcasts=0;
 await assert.rejects(()=>withLeaseHeartbeat(async()=>{renewals++;throw Error('paused or stale owner');},async check=>{
  await new Promise(resolve=>setTimeout(resolve,20));await check();broadcasts++;
 },2),/BASE_LEASE_RENEWAL_FAILED/);
 assert.equal(renewals,1);assert.equal(broadcasts,0);
});
test('lease heartbeat serializes renewals and stops after its operation completes',async()=>{
 let concurrent=0,maxConcurrent=0,renewals=0;
 await withLeaseHeartbeat(async()=>{concurrent++;renewals++;maxConcurrent=Math.max(maxConcurrent,concurrent);
  await new Promise(resolve=>setTimeout(resolve,3));concurrent--;
 },async check=>{await new Promise(resolve=>setTimeout(resolve,15));await check();},2);
 const finished=renewals;await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(maxConcurrent,1);assert.equal(renewals,finished);assert.ok(renewals>0);
});
