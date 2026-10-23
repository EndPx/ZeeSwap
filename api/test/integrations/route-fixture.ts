import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { TestContext } from 'node:test';
import { PrivateData } from '../../src/private-data.ts';
import { RouteEngine } from '../../src/integrations/routes/engine.ts';
import { OneClickHttp, type NetCreditPolicy } from '../../src/integrations/routes/one-click.ts';
import { digest, type QuoteRequest, type RouteRegistry } from '../../src/integrations/routes/policy.ts';
import { PrivateFileRouteStore } from '../../src/integrations/routes/store.ts';
import type { CustomerTerms, FinalReceipt, RoutePlan, RouteProofs } from '../../src/integrations/routes/types.ts';

export const addr = (digit: string) => `0x${digit.repeat(40)}`;
export const tx = (digit: string) => `0x${digit.repeat(64)}`;
export const registry: RouteRegistry = {
  version: 'synthetic-registry-v1', provider: 'synthetic-1click',
  origin: { key: `eip155:84532/erc20:${addr('1')}`, chainId: 84532, contract: addr('1'), decimals: 6, providerId: 'fixture-origin', standard: 'ERC20' },
  destination: { key: `eip155:31337/erc20:${addr('2')}`, chainId: 31337, contract: addr('2'), decimals: 6, providerId: 'fixture-destination', standard: 'ERC20' },
  originVault: addr('3'), refundVault: addr('3'), destinationVault: addr('4'), verified: true, evidence: 'fixture',
};
export const gasAsset = 'eip155:84532/native';
export const sourceAsset = 'zcash:testnet:TAZ';
export const netPolicy: NetCreditPolicy = { evidence: 'fixture', policyDigest: digest('synthetic-net-policy'), amountOutMeaning: 'NET_OF_WITHDRAWAL', withdrawFeeAsset: 'destination', refundFeeAsset: 'origin' };
export function signedWire(request: QuoteRequest, now: number) {
  const data = { timestamp: new Date(now).toISOString(), quoteRequest: request,
    quote: { amountIn: request.dry ? '9900000' : '9980000', minAmountIn: '9800000', amountOut: request.amount,
      minAmountOut: request.amount, refundFee: '10000', withdrawFee: '2000',
      ...(request.dry ? {} : { deadline: request.deadline, timeWhenInactive: request.deadline, depositAddress: addr('5') }) } };
  return { ...data, signature: digest({ fixture: true, data }) };
}
export function fixtureSignature(wire: unknown) { const { signature, ...data } = wire as ReturnType<typeof signedWire>; return signature === digest({ fixture: true, data }); }
export function finalReceipt(kind: string, asset: string, vault: string, amount: string, hash = tx('a')): FinalReceipt {
  const chainIdentity = asset.split('/')[0], transferIndex = 0;
  return { evidence: 'fixture', canonical: true, finalized: true, economicIdentity: digest([chainIdentity, hash, transferIndex]), occurrence: `${kind}:block:log:0`, chainIdentity, transferIndex,
    asset, vault, amount, transactionHash: hash, proofDigest: digest({ kind, asset, vault, amount, hash }) };
}
export async function harness(t: TestContext, reverse = false) {
  const directory = await mkdtemp(join(tmpdir(), 'zeeswap-route-fixture-'));
  t.after(async () => { const checked = resolve(directory); if (!checked.startsWith(resolve(tmpdir()) + sep) || !checked.includes('zeeswap-route-fixture-')) throw Error('UNSAFE_TEST_CLEANUP'); await rm(checked, { recursive: true }); });
  const keys = new PrivateData(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  const store = await PrivateFileRouteStore.create(join(directory, 'private-books.bin'), keys, process.cwd());
  let now = Date.parse('2030-01-01T00:00:00Z'), ready = true, recoverySafe = true, quoteDelay = 0, status = 'SUCCESS';
  let lastWire: ReturnType<typeof signedWire>, calls = 0;
  const provider = new OneClickHttp({ environment: 'fixture', apiKey: 'fixture-not-a-credential', netPolicy, fixtureSignatureVerifier: fixtureSignature, now: () => now,
    fetch: (async (url, init) => { calls++; if (String(url).includes('/quote')) {
      const request = JSON.parse(init!.body as string); lastWire = signedWire(request, now); now += quoteDelay; return new Response(JSON.stringify(lastWire));
    } return new Response(JSON.stringify({ status, updatedAt: new Date(now - 3_600_000).toISOString(), quoteResponse: lastWire, swapDetails: {} })); }) as typeof fetch });
  const proofs: RouteProofs = {
    dispatchReady: async () => ready,
    recovery: async books => ({ booksDigest: digest(books), safe: recoverySafe, evidence: 'fixture' }),
    source: async (_plan, hint) => ({ ...hint as FinalReceipt & { inclusion: number } }),
    treasury: async (_plan, _kind, hint) => ({ ...hint as FinalReceipt & { attributedLocator: string } }),
    journal: async (plan, hint) => ({ operationDigest: plan.operation!.digest, fence: plan.operation!.fence, hash: tx('b'), journalId: 'fixture-journal', journalDigest: digest('fixture-journal'), signedAtMs: now, ...hint as object }),
    cancellation: async (plan, hint) => ({ settlementId: plan.terms.id, finalizedState: reverse ? 'REFUNDED' : 'CANCELLED', latestState: reverse ? 'REFUNDED' : 'CANCELLED',
      proofDigest: digest('fixture-cancellation'), journalFenced: true, allAttemptsReconciled: true, refundFeeCapacity: true, canonicalTimeMs: now, ...hint as object }),
    reverseCommitment: async plan => ({ settlementId: plan.terms.id, payoutOperationId: `${plan.terms.id}:customer-payout`, finalizedState: 'PAYOUT_COMMITTED', latestState: 'PAYOUT_COMMITTED', proofDigest: digest('fixture-commit') }),
    customer: async (_plan, _branch, hint) => ({ ...hint as FinalReceipt & { settlementId: string; terminalState: 'PAID' | 'SETTLED' | 'REFUNDED' } }),
    cost: async (plan, kind, amount) => ({ operationId: plan.operation!.id, kind, amount, proofDigest: digest({ fixture: true, kind, amount }), evidence: 'fixture' }),
  };
  const options = { environment: 'fixture' as const, enableFixtureDispatch: true, now: () => now };
  const engine = new RouteEngine(store, provider, proofs, options);
  await engine.seedFixtureCapital(registry.origin.key, registry.originVault, '20000000');
  await engine.seedFixtureCapital(gasAsset, 'fees', '100000');
  await engine.seedFixtureCapital(sourceAsset, 'fees', '100000');
  if (reverse) await engine.seedFixtureCapital(sourceAsset, 'customer-payout', '20000000');
  await engine.reconcileStartup();
  function terms(id = 'fixture-order'): CustomerTerms { return { id, settlementVersion: 'V1', acceptedDigest: digest({ id, fixture: true }), policyDigest: digest('fixture-policy'), sourceKind: reverse ? 'EVM' : 'ZCASH',
    sourceAsset: reverse ? registry.origin.key : sourceAsset, principalAtomic: '10000000', outputAsset: reverse ? sourceAsset : registry.destination.key,
    outputAtomic: '10000000', recipient: reverse ? 'fixture-shielded-recipient' : addr('6'), refundRecipient: reverse ? addr('7') : 'fixture-shielded-refund',
    sourceCutoff: reverse ? now + 900_000 : 100, cancellationAvailableAtMs: now, acceptUntilMs: now + 120_000, acceptedAtMs: now }; }
  const gasCaps = { [gasAsset]: '10000', [sourceAsset]: '1000' };
  async function accept(id = 'fixture-order') { const preview = await engine.preview(registry, '10000000'); return engine.accept(terms(id), registry, preview, '10000000', gasCaps); }
  async function source(id = 'fixture-order') { const plan = (await engine.snapshot()).plans[id]; return engine.confirmSource(id, { ...finalReceipt('source', plan.terms.sourceAsset, 'fixture-source', '10000000', tx('a')), inclusion: reverse ? now : 100 }); }
  async function funding(id = 'fixture-order') {
    await accept(id); await source(id); await engine.executionQuote(id); await engine.prepareFunding(id, registry.originVault, 0, gasAsset, 1);
    await engine.acknowledgeSigned(id, {}); await engine.noteBroadcast(id, 'UNKNOWN');
    await engine.confirmTreasury(id, 'FUNDING', { ...finalReceipt('funding', registry.origin.key, addr('5'), '9980000', tx('b')), attributedLocator: addr('5'), success: true, gas: { asset: gasAsset, amount: '1000' } });
  }
  async function output(amount = '10000000', hash = tx('c'), id = 'fixture-order') { return engine.confirmTreasury(id, 'OUTPUT', { ...finalReceipt('output', registry.destination.key, registry.destinationVault, amount, hash), attributedLocator: addr('5') }); }
  async function returned(amount = '9900000', hash = tx('d'), id = 'fixture-order') { return engine.confirmTreasury(id, 'RETURN', { ...finalReceipt('return', registry.origin.key, registry.refundVault, amount, hash), attributedLocator: addr('5') }); }
  async function customer(branch: 'DELIVERED' | 'REFUNDED', id = 'fixture-order') {
    const plan = (await engine.snapshot()).plans[id], isRefund = branch === 'REFUNDED';
    return engine.confirmCustomer(id, branch, { ...finalReceipt(`customer:${branch}`, isRefund ? plan.terms.sourceAsset : plan.terms.outputAsset,
      isRefund ? plan.terms.refundRecipient : plan.terms.recipient, isRefund ? plan.terms.principalAtomic : plan.terms.outputAtomic, tx('e')),
      settlementId: id, terminalState: isRefund ? 'REFUNDED' : reverse ? 'SETTLED' : 'PAID',
      gas: { asset: (isRefund && !reverse) || (!isRefund && reverse) ? sourceAsset : gasAsset, amount: '100' } });
  }
  return { directory, store, keys, engine, provider, proofs, options, terms, gasCaps, accept, source, funding, output, returned, customer,
    now: () => now, tick: (ms: number) => { now += ms; }, setReady: (value: boolean) => { ready = value; }, setRecovery: (value: boolean) => { recoverySafe = value; },
    setQuoteDelay: (ms: number) => { quoteDelay = ms; }, setStatus: (value: string) => { status = value; }, calls: () => calls };
}
