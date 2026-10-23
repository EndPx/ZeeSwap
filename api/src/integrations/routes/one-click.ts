import { verifyQuoteSignature } from '@defuse-protocol/one-click-sdk-typescript';
import { atomic, digest, integer, invariant, parseQuote, validateQuote, type QuoteRequest, type VerifiedQuote } from './policy.ts';

export const ONE_CLICK_ORIGIN = 'https://1click.chaindefuser.com';
export const ONE_CLICK_SDK_PIN = '0.1.26';
export const PROVIDER_STATUSES = ['PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','INCOMPLETE_DEPOSIT','PROCESSING','SUCCESS','REFUNDED','FAILED'] as const;
export type ProviderStatus = typeof PROVIDER_STATUSES[number];
export interface QuoteEnvelope { quote: VerifiedQuote; wire: unknown; digest: string; receivedAtMs: number; evidence: 'fixture' | 'production'; }
export interface StatusEnvelope { status: ProviderStatus; updatedAtMs: number; queriedAtMs: number; quoteDigest: string; wire: unknown; digest: string; }
export interface QuoteProvider {
  quote(request: QuoteRequest, nowMs: number): Promise<QuoteEnvelope>;
  status(locator: { address: string; memo: string | null }, originalQuoteDigest: string, nowMs: number): Promise<StatusEnvelope>;
}
function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'ONE_CLICK_OBJECT_REQUIRED');
  const row = value as Record<string, unknown>;
  invariant(required.every(key => key in row) && Object.keys(row).every(key => required.includes(key) || optional.includes(key)), 'ONE_CLICK_SCHEMA_UNSUPPORTED');
  return row;
}
function timestamp(value: unknown): number {
  invariant(typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value), 'ONE_CLICK_TIMESTAMP_REQUIRED');
  const result = Date.parse(value); integer(result); return result;
}
/** This is a separately approved fee semantic, never inferred from the integer
 * fields. No production policy is supplied in this repository. */
export interface NetCreditPolicy {
  evidence: 'fixture' | 'production'; policyDigest: string;
  amountOutMeaning: 'NET_OF_WITHDRAWAL' | 'GROSS_BEFORE_WITHDRAWAL';
  withdrawFeeAsset: 'destination'; refundFeeAsset: 'origin';
}
export function decodeOneClickQuote(wire: unknown, policy: NetCreditPolicy): VerifiedQuote {
  invariant(/^[0-9a-f]{64}$/.test(policy.policyDigest), 'ONE_CLICK_NET_POLICY_UNVERIFIED');
  invariant(['NET_OF_WITHDRAWAL','GROSS_BEFORE_WITHDRAWAL'].includes(policy.amountOutMeaning) && policy.withdrawFeeAsset === 'destination' && policy.refundFeeAsset === 'origin', 'ONE_CLICK_FEE_POLICY_UNSUPPORTED');
  const envelope = fields(wire, ['timestamp','signature','quoteRequest','quote'], ['correlationId']);
  invariant(typeof envelope.signature === 'string' && envelope.signature.length > 0, 'ONE_CLICK_SIGNATURE_MISSING');
  const request = fields(envelope.quoteRequest, ['dry','swapType','amount','originAsset','destinationAsset','depositType','recipientType','recipient','refundType','refundTo','slippageTolerance','deadline'], ['depositMode']);
  invariant(request.depositMode === undefined || request.depositMode === 'SIMPLE', 'ONE_CLICK_DEPOSIT_MODE_UNSUPPORTED');
  const { depositMode: _, ...normalizedRequest } = request;
  const quote = fields(envelope.quote, ['amountIn','minAmountIn','amountOut','minAmountOut','refundFee','withdrawFee'],
    ['deadline','timeWhenInactive','amountInFormatted','amountInUsd','amountOutFormatted','amountOutUsd','timeEstimate','depositAddress','depositMemo']);
  const amountOut = atomic(quote.amountOut), withdraw = atomic(quote.withdrawFee, false);
  atomic(quote.refundFee, false); atomic(quote.minAmountOut);
  const net = policy.amountOutMeaning === 'NET_OF_WITHDRAWAL' ? amountOut : amountOut - withdraw;
  invariant(net > 0n, 'ONE_CLICK_NET_OUTPUT_INVALID');
  return parseQuote({ version: 1, request: normalizedRequest, amountIn: quote.amountIn, minAmountIn: quote.minAmountIn,
    amountOut: quote.amountOut, withdrawFee: quote.withdrawFee, netOutputAtomic: net.toString(), netSemantics: 'VERIFIED_NET_CREDIT',
    quotedAtMs: timestamp(envelope.timestamp), deadlineMs: quote.deadline === undefined ? null : timestamp(quote.deadline), inactiveAtMs: quote.timeWhenInactive === undefined ? null : timestamp(quote.timeWhenInactive),
    depositAddress: quote.depositAddress ?? null, depositMemo: quote.depositMemo ?? null,
    providerFees: [{ asset: request.destinationAsset, amount: quote.withdrawFee }, { asset: request.originAsset, amount: quote.refundFee }] });
}

export class OneClickHttp implements QuoteProvider {
  private busy = false;
  constructor(private readonly options: {
    environment: 'fixture' | 'production'; apiKey: string; netPolicy?: NetCreditPolicy;
    /** Explicit opt-in for read-only live previews/status. Execution stays disabled. */
    allowReadOnlyNetwork?: boolean; fetch?: typeof fetch;
    now?: () => number;
    fixtureSignatureVerifier?: (wire: unknown) => boolean;
  }) {}
  private async read(path: string, init: RequestInit): Promise<unknown> {
    invariant(this.options.apiKey.length > 0, 'ONE_CLICK_AUTH_REQUIRED');
    invariant(!this.busy, 'ONE_CLICK_REQUEST_ALREADY_IN_FLIGHT');
    invariant(this.options.environment === 'fixture' ? !!this.options.fetch : this.options.allowReadOnlyNetwork === true, 'ONE_CLICK_NETWORK_DISABLED');
    this.busy = true;
    try {
      const response = await (this.options.fetch ?? fetch)(`${ONE_CLICK_ORIGIN}${path}`, { ...init,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.options.apiKey }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      invariant(response.ok, `ONE_CLICK_HTTP_${response.status}`);
      // Bound body before parsing; no provider links or redirects are followed.
      invariant(response.body !== null, 'ONE_CLICK_BODY_REQUIRED');
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
        invariant(size <= 262_144, 'ONE_CLICK_RESPONSE_TOO_LARGE'); chunks.push(next.value); } }
      finally { await reader.cancel(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { this.busy = false; }
  }
  private verify(wire: unknown) {
    const valid = this.options.environment === 'fixture'
      ? this.options.fixtureSignatureVerifier?.(wire) === true
      : verifyQuoteSignature(wire as Parameters<typeof verifyQuoteSignature>[0]);
    invariant(valid, 'ONE_CLICK_INVALID_SIGNATURE');
  }
  private decode(wire: unknown) {
    this.verify(wire);
    invariant(this.options.netPolicy && this.options.netPolicy.evidence === this.options.environment, 'ONE_CLICK_NET_POLICY_UNVERIFIED');
    return decodeOneClickQuote(wire, this.options.netPolicy);
  }
  async quote(request: QuoteRequest, nowMs: number): Promise<QuoteEnvelope> {
    invariant(request.dry || this.options.environment === 'fixture', 'ONE_CLICK_PRODUCTION_EXECUTION_DISABLED');
    const wire = await this.read('/v0/quote', { method: 'POST', body: JSON.stringify(request) });
    const receivedAtMs = this.options.environment === 'fixture' ? this.options.now?.() ?? nowMs : Date.now();
    const quote = this.decode(wire); validateQuote(quote, request, receivedAtMs);
    return { wire, quote, digest: digest(wire), receivedAtMs, evidence: this.options.environment };
  }
  async status(locator: { address: string; memo: string | null }, originalQuoteDigest: string, nowMs: number): Promise<StatusEnvelope> {
    const params = new URLSearchParams({ depositAddress: locator.address }); if (locator.memo !== null) params.set('depositMemo', locator.memo);
    const wire = await this.read(`/v0/status?${params}`, { method: 'GET' });
    const row = fields(wire, ['status','updatedAt','quoteResponse','swapDetails'], ['correlationId']);
    const quote = this.decode(row.quoteResponse);
    invariant(digest(row.quoteResponse) === originalQuoteDigest && quote.depositAddress === locator.address && quote.depositMemo === locator.memo, 'ONE_CLICK_STATUS_LOCATOR_MISMATCH');
    invariant(PROVIDER_STATUSES.includes(row.status as ProviderStatus), 'ONE_CLICK_UNKNOWN_STATUS');
    const updatedAtMs = timestamp(row.updatedAt);
    const queriedAtMs = this.options.environment === 'fixture' ? this.options.now?.() ?? nowMs : Date.now();
    invariant(updatedAtMs <= queriedAtMs + 5_000, 'ONE_CLICK_STATUS_FUTURE');
    // swapDetails is retained as untrusted discovery data. The quote signature
    // does not authenticate it or provide a canonical receipt attribution proof.
    return { status: row.status as ProviderStatus, updatedAtMs, queriedAtMs, quoteDigest: originalQuoteDigest, wire, digest: digest(wire) };
  }
}
