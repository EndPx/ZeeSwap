import assert from 'node:assert/strict';
import test from 'node:test';
import { bech32m } from 'bech32';
import { fundingPaymentRequest } from '../src/payment-uri.ts';
import type { OrderView } from '../src/protocol.ts';

// Public synthetic encoding fixture only; not a spendable address or real order.
const receiver = bech32m.encode('utest', bech32m.toWords(new Uint8Array(64).fill(7)), 512);
const memo = '{"v":1,"ref":"11111111-1111-4111-8111-111111111111"}';
const now = Date.parse('2026-10-23T00:00:00Z');
function order(): OrderView {
  return {
    id: '22222222-2222-4222-8222-222222222222', direction: 'ZCASH_TO_BASE', status: 'AWAITING_FUNDS',
    inputAmount: '1234567', outputAmount: '1234567', executionMode: 'base-settlement-v1', priceMode: 'fixture', integrationOnly: true,
    expiresAt: '2026-10-22T00:00:00Z', // Acceptance expiry does NOT invalidate already accepted timely funding.
    source: { received: false, confirmed: false, confirmations: 0, policy: 'zcash-10-confirmations', requiredConfirmations: 10 },
    funding: { network: 'zcash-testnet', receiver, memo, cutoffHeight: 5_000_012, cutoffTime: null, cancellationAvailableAt: null },
  };
}

test('ZIP 321 URI decodes to exact server receiver, 8-decimal source amount and UTF-8 canonical memo', () => {
  const request = fundingPaymentRequest(order(), now)!;
  assert.equal(request.amount, '0.01234567');
  assert.ok(request.uri.startsWith(`zcash:${receiver}?`));
  const params = new URLSearchParams(request.uri.split('?')[1]);
  assert.equal(params.get('amount'), '0.01234567');
  assert.equal(Buffer.from(params.get('memo')!, 'base64url').toString('utf8'), memo);
  assert.match(params.get('memo')!, /^[A-Za-z0-9_-]+$/);
  assert.ok(!/[+=/%]/.test(params.get('memo')!));
  assert.deepEqual([...params.keys()], ['amount', 'memo']);
});

test('fixed testnet amounts never use floats or exponent output and retain all eight decimals', () => {
  for (const [atomic, expected] of [['100000', '0.00100000'], ['10000000', '0.10000000'], ['100001', '0.00100001']]) {
    const o = order(); o.inputAmount = atomic!;
    assert.equal(fundingPaymentRequest(o, now)!.amount, expected);
  }
  for (const bad of ['0','-1','01','1e6','1.0','+100000',' 100000','99999','10000001','999999999999999999999999999999']) {
    const o = order(); o.inputAmount = bad;
    assert.throws(() => fundingPaymentRequest(o, now));
  }
  const numeric = order(); numeric.inputAmount = 1e6 as unknown as string;
  assert.throws(() => fundingPaymentRequest(numeric, now));
});

test('wrong network, transparent/mainnet receiver and malformed checksum cannot produce a URI', () => {
  for (const bad of [receiver.slice(0,-1)+(receiver.endsWith('q')?'p':'q'), bech32m.encode('u', bech32m.toWords(new Uint8Array(64).fill(7)), 512), 'tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU', receiver.toUpperCase(), `${receiver}?memo=secret`]) {
    const o = order(); o.funding!.receiver = bad;
    assert.throws(() => fundingPaymentRequest(o, now));
  }
  const o = order(); (o.funding as unknown as { network: string }).network = 'zcash-mainnet';
  assert.throws(() => fundingPaymentRequest(o, now));
});

test('duplicate, extra, reordered, invalid reference and noncanonical memo bytes refuse', () => {
  for (const bad of ['', 'not JSON', 'null', '[]', `${memo} `, '{"ref":"11111111-1111-4111-8111-111111111111","v":1}',
    '{"v":1,"v":1,"ref":"11111111-1111-4111-8111-111111111111"}', '{"v":1,"ref":"not-a-reference"}',
    '{"v":1,"ref":"11111111-1111-4111-8111-111111111111","command":"send"}', 'é'.repeat(257),
    '{"v":1,"ref":"11111111-1111-4111-8111-111111111111","label":"✨"}']) {
    const o = order(); o.funding!.memo = bad;
    assert.throws(() => fundingPaymentRequest(o, now));
  }
});

test('funding disappears for every non-awaiting status, reverse direction and detected source', () => {
  for (const status of ['QUOTED','CONFIRMING','READY','REFUND_REQUIRED','REVIEW_REQUIRED','EXPIRED_UNFUNDED','REORGED','SETTLED','REFUNDED'] as const) {
    const o = order(); o.status = status; assert.equal(fundingPaymentRequest(o, now), null);
  }
  const reverse = order(); reverse.direction = 'BASE_TO_ZCASH'; assert.equal(fundingPaymentRequest(reverse, now), null);
  const detected = order(); detected.source.received = true; assert.equal(fundingPaymentRequest(detected, now), null);
  const missing = order(); delete missing.funding; assert.equal(fundingPaymentRequest(missing, now), null);
});

test('explicit funding deadline closes at the exact boundary; quote acceptance expiry does not', () => {
  const o = order(); assert.ok(fundingPaymentRequest(o, now));
  o.funding!.cutoffTime = new Date(now + 1000).toISOString();
  assert.ok(fundingPaymentRequest(o, now + 999));
  assert.equal(fundingPaymentRequest(o, now + 1000), null);
  o.funding!.cutoffTime = 'not-a-date'; assert.throws(() => fundingPaymentRequest(o, now));
  o.funding!.cutoffTime = '2027-02-30T00:00:00Z'; assert.throws(() => fundingPaymentRequest(o, now));
  o.funding!.cutoffTime = null; o.funding!.cutoffHeight = null; assert.throws(() => fundingPaymentRequest(o, now));
});

test('capability, API origin, order ID and unrelated caller fields never enter the payment URI', () => {
  const o = { ...order(), token: 'SECRET_PRIVATE_ACCESS_CAPABILITY', apiOrigin: 'https://private.example' };
  const request = fundingPaymentRequest(o, now)!;
  for (const privateValue of [o.token, o.apiOrigin, o.id]) assert.ok(!request.uri.includes(privateValue));
  assert.equal(request.memo, memo);
});
