import test from 'node:test';
import assert from 'node:assert/strict';
import { atomic, buildRequest, canonical, digest, inputCap, parseQuote, pollDelay, sourceTimely, validateQuote, validateRegistry } from '../../src/integrations/routes/policy.ts';
import { decodeOneClickQuote, OneClickHttp } from '../../src/integrations/routes/one-click.ts';
import { fixtureSignature, harness, netPolicy, registry, signedWire } from './route-fixture.ts';

test('Q03/Q05 exact integers, ceiling cap, uint256 and strict inclusion boundary', () => {
  assert.equal(inputCap('9900000'), '9999000'); assert.equal(inputCap('1'), '2');
  for (const bad of ['01','1.0','-1','1e6',1,Number.MAX_SAFE_INTEGER, (2n ** 256n).toString()]) assert.throws(() => atomic(bad));
  assert.throws(() => inputCap((2n ** 256n - 1n).toString()), /OVERFLOW/);
  assert.equal(sourceTimely('ZCASH',100,100), true); assert.equal(sourceTimely('EVM',100,100), false);
  assert.equal(sourceTimely('EVM',99,100), true); assert.equal(canonical({ z:1,A:2,a:3 }), '{"A":2,"a":3,"z":1}');
  assert.equal(pollDelay(0),5000); assert.equal(pollDelay(120000),15000); assert.equal(pollDelay(600000),60000); assert.equal(pollDelay(0,90000),90000);
});
test('Q01/Q04 actual dry wire omits execution fields and cannot become executable', () => {
  const now = Date.parse('2030-01-01T00:00:00Z'), request = buildRequest(registry,'10000000',true,now+600000);
  const wire = signedWire(request,now), quote = decodeOneClickQuote(wire,netPolicy);
  assert.equal(quote.deadlineMs,null); assert.equal(quote.inactiveAtMs,null); assert.equal(quote.depositAddress,null);
  validateQuote(quote,request,now);
  assert.throws(() => validateQuote({...quote, request:{...request,dry:false}}, {...request,dry:false},now), /DEADLINE_UNSAFE/);
  assert.throws(() => decodeOneClickQuote({...wire, quote:{...wire.quote, unknownRequired:true}},netPolicy), /SCHEMA_UNSUPPORTED/);
  assert.throws(() => parseQuote({...quote, netSemantics:'GUESS'}), /NET_SEMANTICS/);
});
test('Q04 separate fee semantics cannot silently guess a net withdrawal', () => {
  const now = 1_893_456_000_000, request=buildRequest(registry,'10000000',true,now+600000), wire=signedWire(request,now);
  const gross=decodeOneClickQuote(wire,{...netPolicy,amountOutMeaning:'GROSS_BEFORE_WITHDRAWAL'});
  assert.equal(gross.netOutputAtomic,'9998000'); assert.throws(()=>validateQuote(gross,request,now),/NET_CREDIT_TOO_SMALL/);
  assert.throws(()=>decodeOneClickQuote(wire,{...netPolicy,policyDigest:''}),/NET_POLICY_UNVERIFIED/);
});
test('Q06 reject unverified/wrong chain registry and token identity', () => {
  assert.throws(()=>validateRegistry({...registry, evidence:'production'},'fixture'),/UNVERIFIED_REGISTRY/);
  assert.throws(()=>validateRegistry({...registry,origin:{...registry.origin,chainId:1}},'fixture'),/IDENTITY_MISMATCH/);
  assert.throws(()=>validateRegistry({...registry,origin:{...registry.origin,standard:'NATIVE' as 'ERC20'}},'fixture'),/UNSUPPORTED_ASSET/);
});
test('Q07/Q11 signature, auth, net-policy, echo and unknown modes fail closed before funding', async () => {
  const now=1_893_456_000_000, request=buildRequest(registry,'10000000',true,now+600000), wire=signedWire(request,now);
  const make=(body:unknown, key='fixture-key', verifier=fixtureSignature)=>new OneClickHttp({environment:'fixture',apiKey:key,netPolicy,fixtureSignatureVerifier:verifier,fetch:(async()=>new Response(JSON.stringify(body))) as typeof fetch});
  await assert.rejects(make({...wire,signature:'tampered'}).quote(request,now),/INVALID_SIGNATURE/);
  await assert.rejects(make(wire,'').quote(request,now),/AUTH_REQUIRED/);
  await assert.rejects(make(signedWire({...request,recipient:'0x'+'9'.repeat(40)},now)).quote(request,now),/ECHO_MISMATCH/);
  const missingPolicy=new OneClickHttp({environment:'fixture',apiKey:'fixture',fixtureSignatureVerifier:fixtureSignature,fetch:(async()=>new Response(JSON.stringify(wire))) as typeof fetch});
  await assert.rejects(missingPolicy.quote(request,now),/NET_POLICY_UNVERIFIED/);
  await assert.rejects(make(wire,'fixture',()=>false).quote(request,now),/INVALID_SIGNATURE/);
});
test('production execution and default network disabled; no unauthenticated retry or redirect', async () => {
  let calls=0; const client=new OneClickHttp({environment:'production',apiKey:'fixture-unused',fetch:(async()=>{calls++;throw Error('should not fetch');}) as typeof fetch});
  const now=1_893_456_000_000;
  await assert.rejects(client.quote(buildRequest({...registry,evidence:'production'},'1',false,now+600000),now),/PRODUCTION_EXECUTION_DISABLED/);
  await assert.rejects(client.quote(buildRequest({...registry,evidence:'production'},'1',true,now+600000),now),/NETWORK_DISABLED/);
  assert.equal(calls,0);
});
test('HTTP response arrival clock cannot launder a slow 31s quote; old unchanged status remains observation', async t => {
  const h=await harness(t); h.setQuoteDelay(31000); await assert.rejects(h.engine.preview(registry,'10000000'),/STALE/);
  h.setQuoteDelay(0); await h.funding(); h.tick(3_600_000); assert.equal(await h.engine.observeProvider('fixture-order'),'SUCCESS');
  assert.equal((await h.engine.snapshot()).plans['fixture-order'].outputReceived,'0');
  h.setStatus('MANUAL_HOLD'); await assert.rejects(h.engine.observeProvider('fixture-order'),/UNKNOWN_STATUS/);
});
test('Q03 cap drift refuses execution; Q05 amountIn is preserved rather than minAmountIn', async t => {
  const h=await harness(t); await h.accept(); await h.source(); const quote=await h.engine.executionQuote('fixture-order');
  assert.equal(quote.quote.minAmountIn,'9800000');
  const instruction=await h.engine.prepareFunding('fixture-order',registry.originVault,0,'eip155:84532/native',1);
  assert.equal(instruction.amount,'9980000'); assert.notEqual(instruction.amount,quote.quote.minAmountIn);
  assert.throws(()=>validateQuote({...quote.quote,amountIn:'10010000'},quote.quote.request,h.now(),'9999000',quote.receivedAtMs),/INPUT_CAP_EXCEEDED/);
});
