import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RouteEngine } from '../../src/integrations/routes/engine.ts';
import { digest } from '../../src/integrations/routes/policy.ts';
import { addr, finalReceipt, gasAsset, harness, registry, tx } from './route-fixture.ts';

test('Q01/Q02 delayed discovery uses original inclusion; preview expiry cannot reprice terms', async t=>{
  const h=await harness(t); await h.accept(); const accepted=(await h.engine.snapshot()).plans['fixture-order'].terms;
  h.tick(600000); await h.source(); await h.engine.executionQuote('fixture-order');
  assert.deepEqual((await h.engine.snapshot()).plans['fixture-order'].terms,accepted);
});
test('Q10/R18 atomic competing accepts reserve complete route input once', async t=>{
  const h=await harness(t), preview=await h.engine.preview(registry,'10000000');
  const results=await Promise.allSettled(['a','b'].map(id=>h.engine.accept(h.terms(id),registry,preview,'10000000',h.gasCaps)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal(Object.keys((await h.engine.snapshot()).plans).length,1);
});
test('Q12/R08 provider SUCCESS is neither treasury capital nor customer completion', async t=>{
  const h=await harness(t); await h.funding(); await h.engine.observeProvider('fixture-order');
  await assert.rejects(h.customer('DELIVERED'),/DELIVERY_NOT_ELIGIBLE/);
  const p=(await h.engine.snapshot()).plans['fixture-order']; assert.equal(p.customer,'OPEN'); assert.equal(p.outputReceived,'0');
});
test('R09/R16 full source refund independent of partial provider return; late output cannot redeliver', async t=>{
  const h=await harness(t); await h.funding(); await h.returned(); await h.engine.cancelCustomer('fixture-order',{}); await h.customer('REFUNDED');
  let books=await h.engine.snapshot(),p=books.plans['fixture-order'];
  assert.equal(p.customer,'REFUNDED'); assert.equal(p.inputSpent,'9980000'); assert.equal(p.inputRecovered,'9900000');
  assert.equal(books.balances[`${p.terms.sourceAsset}|customer-liability:fixture-order`],'0');
  await assert.rejects(h.engine.close('fixture-order'),/BOOKS_STILL_OPEN/);
  await h.output(); await assert.rejects(h.customer('DELIVERED'),/ALREADY_TERMINAL/);
  await h.engine.recordCost('fixture-order','LOSS','80000',{}); await h.engine.close('fixture-order');
  books=await h.engine.snapshot(); assert.equal(books.plans['fixture-order'].customer,'REFUNDED');
  assert.equal(books.plans['fixture-order'].outputReceived,'10000000');
});
test('R16 late provider return after recognized loss reverses expense without second refund', async t=>{
  const h=await harness(t); await h.funding(); await h.returned(); await h.engine.cancelCustomer('fixture-order',{}); await h.customer('REFUNDED');
  await h.engine.recordCost('fixture-order','LOSS','80000',{}); await h.engine.close('fixture-order');
  await h.returned('80000',tx('f'));
  const books=await h.engine.snapshot(),p=books.plans['fixture-order']; assert.equal(p.inputRecovered,'9980000'); assert.equal(p.recognizedLoss,'0'); assert.equal(p.customer,'REFUNDED');
  assert.equal(books.balances[`${registry.origin.key}|operator-loss-expense`],'0');
  await assert.rejects(h.returned('1',tx('9')),/EXCEEDS_EXPOSURE/);
});
test('R04/R05/Q08 signed original survives expiry and unknown broadcast; no second attempt', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order');
  await h.engine.prepareFunding('fixture-order',registry.originVault,7,gasAsset,1); await h.engine.acknowledgeSigned('fixture-order',{}); await h.engine.noteBroadcast('fixture-order','UNKNOWN'); h.tick(900000);
  await assert.rejects(h.engine.executionQuote('fixture-order'),/SOURCE_OR_UNSIGNED_REQUIRED/); await assert.rejects(h.engine.abandonUnsigned('fixture-order'),/POSSIBLE_FUNDING/);
  const p=(await h.engine.snapshot()).plans['fixture-order']; assert.equal(p.operation!.nonce,7); assert.equal(p.operation!.signedHash,tx('b')); assert.equal(p.attempts.length,1);
});
test('R17 unique economic transfer allocation survives block/global-log index change', async t=>{
  const h=await harness(t); await h.funding(); await h.output();
  const receipt={...finalReceipt('reincluded',registry.destination.key,registry.destinationVault,'10000000',tx('c')), occurrence:'new-block:log:900',attributedLocator:addr('5')};
  await assert.rejects(h.engine.confirmTreasury('fixture-order','OUTPUT',receipt),/ALREADY_ALLOCATED/);
  await assert.rejects(h.output('10000000',tx('c')),/ALREADY_ALLOCATED/);
  await assert.rejects(h.engine.confirmTreasury('fixture-order','OUTPUT',{...receipt,economicIdentity:'forged'}),/ECONOMIC_IDENTITY/);
});
test('R17 wrong vault/token and partial customer delivery cannot discharge liability', async t=>{
  const h=await harness(t); await h.funding();
  await assert.rejects(h.engine.confirmTreasury('fixture-order','OUTPUT',{...finalReceipt('wrong-vault',registry.destination.key,addr('8'),'10000000',tx('c')),attributedLocator:addr('5')}),/ENDPOINT_MISMATCH/);
  await h.output('5000000'); await assert.rejects(h.customer('DELIVERED'),/DELIVERY_NOT_ELIGIBLE/);
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].state,'RECONCILING');
});
test('output then unused-input refund keeps independent receipt sets and per-asset balance', async t=>{
  const h=await harness(t); await h.funding(); await h.output(); await h.customer('DELIVERED');
  await h.returned('80000'); await h.engine.recordCost('fixture-order','CONSUMED','9900000',{}); await h.engine.close('fixture-order');
  const books=await h.engine.snapshot(),assets=new Set(books.ledger.map(e=>e.asset));
  for(const asset of assets){ const sums=new Map<string,bigint>(); for(const row of books.ledger.filter(e=>e.asset===asset)){
    sums.set(row.debit,(sums.get(row.debit)??0n)+BigInt(row.amount)); sums.set(row.credit,(sums.get(row.credit)??0n)-BigInt(row.amount)); }
    assert.equal([...sums.values()].reduce((a,b)=>a+b,0n),0n);
    for(const [name,value] of sums)assert.equal(books.balances[`${asset}|${name}`],value.toString()); }
  assert.equal(books.plans['fixture-order'].customer,'DELIVERED'); assert.equal(books.plans['fixture-order'].state,'CLOSED');
  await assert.rejects(h.engine.cancelCustomer('fixture-order',{}),/SOURCE_REFUND_NOT_ALLOWED/);
});
test('R19 reopening durable encrypted store starts paused; passive mutations cannot unlock', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order');
  const reopened=new RouteEngine(h.store,h.provider,h.proofs,h.options);
  await reopened.markIncident('fixture-order','TIMEOUT',digest('fixture-timeout'));
  await assert.rejects(reopened.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1),/STARTUP_RECONCILIATION/);
  await reopened.seedFixtureCapital('fixture-extra','fees','1'); await assert.rejects(reopened.executionQuote('fixture-order'),/STARTUP_RECONCILIATION/);
  h.setRecovery(false); await assert.rejects(reopened.reconcileStartup(),/EXTERNAL_JOURNALS/);
  const encrypted=await readFile(join(h.directory,'private-books.bin')); assert.equal(encrypted.includes(Buffer.from('fixture-order')),false);
});
test('R01 stale observer blocks new funding even with a fresh quote', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order'); h.setReady(false);
  await assert.rejects(h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1),/OBSERVER_OR_CAPITAL_NOT_READY/);
});
test('R02/R03 quote expiry and uncertain requests are bounded and never fund automatically', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order'); h.tick(31000);
  await assert.rejects(h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1),/STALE/);
  await h.engine.abandonUnsigned('fixture-order');
  // The fixture intentionally reuses one address, which must block the next quote.
  await assert.rejects(h.engine.executionQuote('fixture-order'),/DEPOSIT_ADDRESS_REUSED/);
  h.tick(15000); await assert.rejects(h.engine.executionQuote('fixture-order'),/DEPOSIT_ADDRESS_REUSED/);
  h.tick(30000); await assert.rejects(h.engine.executionQuote('fixture-order'),/BUDGET_EXHAUSTED/);
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].operation,null);
});
test('R13 source reorg preserves signed facts and customer history; no rollback', async t=>{
  const h=await harness(t); await h.funding(); await h.output(); await h.customer('DELIVERED');
  await h.engine.markIncident('fixture-order','SOURCE_REORG',digest('fixture-reorg'));
  const p=(await h.engine.snapshot()).plans['fixture-order']; assert.equal(p.customer,'DELIVERED'); assert.equal(p.inputSpent,'9980000'); assert.equal(p.state,'RECONCILING');
  await assert.rejects(h.engine.close('fixture-order'),/BOOKS_STILL_OPEN/);
});
test('Q09/R14/R15 reverse final branch commitment and committed V1 abort refusal', async t=>{
  const h=await harness(t,true); await h.funding(); await h.output(); await h.engine.commitReverse('fixture-order',{});
  await assert.rejects(h.engine.cancelCustomer('fixture-order',{}),/COMMITTED_REVERSE_ABORT_UNSUPPORTED/);
  await h.customer('DELIVERED'); assert.equal((await h.engine.snapshot()).plans['fixture-order'].customer,'DELIVERED');
});
test('R14 cancellation before commitment prevents Zcash branch and late treasury credit remains operator capital', async t=>{
  const h=await harness(t,true); await h.funding(); await h.engine.cancelCustomer('fixture-order',{}); await h.customer('REFUNDED'); await h.output();
  await assert.rejects(h.engine.commitReverse('fixture-order',{}),/REVERSE_COMMIT_NOT_ALLOWED/); await assert.rejects(h.customer('DELIVERED'),/ALREADY_TERMINAL/);
});
test('R13 known source reorg independently refuses reverse commitment', async t=>{
  const h=await harness(t,true); await h.funding(); await h.output(); await h.engine.markIncident('fixture-order','SOURCE_REORG',digest('fixture-source-reorg'));
  await assert.rejects(h.engine.commitReverse('fixture-order',{}),/REVERSE_COMMIT_NOT_ALLOWED/);
});
test('final tombstone forbids fresh route funding before customer refund ACK', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order'); await h.engine.cancelCustomer('fixture-order',{});
  await assert.rejects(h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1),/FUNDING_NOT_ALLOWED/);
  await assert.rejects(h.engine.executionQuote('fixture-order'),/SOURCE_OR_UNSIGNED_REQUIRED/);
});
test('V2 committed abort requires canonical expiry/all journals and unique final terminal proof', async t=>{
  const h=await harness(t,true), preview=await h.engine.preview(registry,'10000000');
  await h.engine.accept({...h.terms(),settlementVersion:'V2'},registry,preview,'10000000',h.gasCaps);
  await h.source(); await h.engine.executionQuote('fixture-order'); await h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1); await h.engine.acknowledgeSigned('fixture-order',{});
  await h.engine.confirmTreasury('fixture-order','FUNDING',{...finalReceipt('funding',registry.origin.key,addr('5'),'9980000',tx('b')),attributedLocator:addr('5'),success:true,gas:{asset:gasAsset,amount:'1000'}});
  await h.output(); await h.engine.commitReverse('fixture-order',{});
  const guardedAbort={mode:'V2_ABORT',operationId:'fixture-order:customer-payout',nonce:0,noSuccessfulOrValidPayouts:true,expiryCanonical:true,eventDigest:digest('fixture-abort-event'),recoveryDigest:digest('fixture-recovery')};
  await assert.rejects(h.engine.cancelCustomer('fixture-order',{guardedAbort:{...guardedAbort,expiryCanonical:false}}),/GUARDED_ABORT_PROOF/);
  await assert.rejects(h.engine.cancelCustomer('fixture-order',{guardedAbort,allAttemptsReconciled:false}),/CANCELLATION_AND_JOURNAL/);
  await h.engine.cancelCustomer('fixture-order',{guardedAbort}); await assert.rejects(h.engine.cancelCustomer('fixture-order',{guardedAbort}),/GUARDED_ABORT_PROOF/);
  await h.customer('REFUNDED'); assert.equal((await h.engine.snapshot()).plans['fixture-order'].customer,'REFUNDED');
});
test('R06 canonical funding revert records gas only, forbids second funded route and permits guarded refund', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order');
  await h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1); await h.engine.acknowledgeSigned('fixture-order',{});
  await h.engine.confirmTreasury('fixture-order','FUNDING',{...finalReceipt('revert',registry.origin.key,addr('5'),'0',tx('b')), attributedLocator:addr('5'),success:false,gas:{asset:gasAsset,amount:'1000'}});
  await assert.rejects(h.engine.executionQuote('fixture-order'),/SOURCE_OR_UNSIGNED_REQUIRED/);
  await h.engine.cancelCustomer('fixture-order',{}); await h.customer('REFUNDED'); await h.engine.close('fixture-order');
  const books=await h.engine.snapshot(); assert.equal(books.plans['fixture-order'].inputSpent,'0'); assert.equal(books.balances[`${gasAsset}|operator-gas-expense`],'1000');
});
test('R07 signed funding lands after quote deadline: original receipt remains reconcilable', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order');
  await h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1); await h.engine.acknowledgeSigned('fixture-order',{}); h.tick(900000);
  await h.engine.confirmTreasury('fixture-order','FUNDING',{...finalReceipt('late-funding',registry.origin.key,addr('5'),'9980000',tx('b')), attributedLocator:addr('5'),success:true,gas:{asset:gasAsset,amount:'1000'}});
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].inputSpent,'9980000');
  await assert.rejects(h.engine.executionQuote('fixture-order'),/SOURCE_OR_UNSIGNED_REQUIRED/);
});
test('R10/R11 customer receipt ACK is unique and opposing refund cannot follow successful delivery', async t=>{
  const h=await harness(t); await h.funding(); await h.output(); await h.customer('DELIVERED');
  await assert.rejects(h.customer('DELIVERED'),/ALREADY_TERMINAL/); await assert.rejects(h.engine.cancelCustomer('fixture-order',{}),/SOURCE_REFUND_NOT_ALLOWED/);
  const books=await h.engine.snapshot(); assert.equal(books.ledger.filter(e=>e.id==='fixture-order:customer-output').length,1);
});
test('R12/R20 30min and 2h timers retain principal/exposure and authorize no transfer', async t=>{
  const h=await harness(t); await h.funding(); h.tick(1_800_000); assert.equal(await h.engine.reviewProgress('fixture-order'),'RECONCILE_AND_GUARDED_CANCEL');
  h.tick(5_400_000); assert.equal(await h.engine.reviewProgress('fixture-order'),'OPERATOR_INCIDENT');
  const p=(await h.engine.snapshot()).plans['fixture-order']; assert.equal(p.customer,'OPEN'); assert.equal(p.inputSpent,'9980000'); assert.equal(p.inputRecovered,'0');
});
test('R19 revision change during readiness prevents new funding intent atomically', async t=>{
  const h=await harness(t); await h.accept(); await h.source(); await h.engine.executionQuote('fixture-order');
  h.proofs.dispatchReady=async()=>{await h.store.transaction(books=>books.incidents.push({plan:'external',reason:'external-journal-change',digest:digest('fixture-external')}));return true;};
  await assert.rejects(h.engine.prepareFunding('fixture-order',registry.originVault,0,gasAsset,1),/BOOKS_CHANGED_RECONCILE_FIRST/);
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].operation,null);
});
test('R20 unsupported provider status durably pauses mode without erasing exposure', async t=>{
  const h=await harness(t); await h.funding(); h.setStatus('MANUAL_INVESTIGATION');
  await assert.rejects(h.engine.observeProvider('fixture-order'),/UNKNOWN_STATUS/);
  assert.equal((await h.engine.snapshot()).dispatchPaused,true); await h.engine.reconcileStartup();
  await assert.rejects(h.engine.executionQuote('fixture-order'),/PROVIDER_MODE_PAUSED/);
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].inputSpent,'9980000');
});
