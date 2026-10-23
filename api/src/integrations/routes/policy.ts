import { createHash } from 'node:crypto';

export const MODE = 'evm-treasury-route-v1' as const;
export function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export function atomic(value: unknown, positive = true): bigint {
  invariant(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 78, 'ROUTE_ATOMIC_INTEGER_REQUIRED');
  const units = BigInt(value);
  invariant(units < 2n ** 256n, 'ROUTE_UINT256_OVERFLOW');
  invariant(!positive || units > 0n, 'ROUTE_POSITIVE_AMOUNT_REQUIRED');
  return units;
}
export function integer(value: unknown): asserts value is number {
  invariant(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'ROUTE_SAFE_INTEGER_REQUIRED');
}
export function strict(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'ROUTE_OBJECT_REQUIRED');
  invariant(Object.keys(value).every(key => keys.includes(key)) && keys.every(key => key in value), 'ROUTE_SCHEMA_FIELDS');
}
export function address(value: unknown): asserts value is string {
  invariant(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value), 'ROUTE_EVM_ADDRESS_REQUIRED');
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

export interface EvmAsset { key: string; chainId: number; contract: string; decimals: number; providerId: string; standard: 'ERC20'; }
export interface RouteRegistry {
  version: string; provider: string; origin: EvmAsset; destination: EvmAsset;
  originVault: string; destinationVault: string; refundVault: string;
  /** Must come from independent token code/decimals, chain and vault control checks. */
  verified: boolean; evidence: 'fixture' | 'production';
}
export function validateRegistry(registry: RouteRegistry, environment: 'fixture' | 'production') {
  invariant(registry.verified && registry.evidence === environment && registry.version.length > 0 && registry.provider.length > 0, 'ROUTE_UNVERIFIED_REGISTRY');
  for (const asset of [registry.origin, registry.destination]) {
    integer(asset.chainId); integer(asset.decimals); address(asset.contract);
    invariant(asset.chainId > 0 && asset.decimals <= 36 && asset.standard === 'ERC20' && asset.key.length > 0 && asset.providerId.length > 0, 'ROUTE_UNSUPPORTED_ASSET');
    invariant(asset.key === `eip155:${asset.chainId}/erc20:${asset.contract.toLowerCase()}`, 'ROUTE_ASSET_IDENTITY_MISMATCH');
  }
  for (const vault of [registry.originVault, registry.destinationVault, registry.refundVault]) address(vault);
  invariant(registry.originVault.toLowerCase() === registry.refundVault.toLowerCase(), 'ROUTE_REFUND_MUST_RETURN_ORIGIN_VAULT');
}

export interface QuoteRequest {
  dry: boolean; swapType: 'EXACT_OUTPUT'; amount: string; originAsset: string; destinationAsset: string;
  depositType: 'ORIGIN_CHAIN'; recipientType: 'DESTINATION_CHAIN'; recipient: string;
  refundType: 'ORIGIN_CHAIN'; refundTo: string; slippageTolerance: number; deadline: string;
}
/** ZeeSwap normalized DTO, not a claim of upstream wire compatibility. A pinned
 * wire decoder and official signature verifier must be injected into transport. */
export interface VerifiedQuote {
  version: 1; request: QuoteRequest; amountIn: string; minAmountIn: string; amountOut: string;
  withdrawFee: string; netOutputAtomic: string; netSemantics: 'VERIFIED_NET_CREDIT';
  quotedAtMs: number; deadlineMs: number | null; inactiveAtMs: number | null;
  depositAddress: string | null; depositMemo: string | null;
  providerFees: { asset: string; amount: string }[];
}
export function parseQuote(value: unknown): VerifiedQuote {
  strict(value, ['version','request','amountIn','minAmountIn','amountOut','withdrawFee','netOutputAtomic','netSemantics','quotedAtMs','deadlineMs','inactiveAtMs','depositAddress','depositMemo','providerFees']);
  invariant(value.version === 1 && value.netSemantics === 'VERIFIED_NET_CREDIT', 'ROUTE_NET_SEMANTICS_UNVERIFIED');
  strict(value.request, ['dry','swapType','amount','originAsset','destinationAsset','depositType','recipientType','recipient','refundType','refundTo','slippageTolerance','deadline']);
  const request = value.request;
  invariant(typeof request.dry === 'boolean' && request.swapType === 'EXACT_OUTPUT' && request.depositType === 'ORIGIN_CHAIN'
    && request.recipientType === 'DESTINATION_CHAIN' && request.refundType === 'ORIGIN_CHAIN', 'ROUTE_UNSUPPORTED_QUOTE_MODE');
  invariant(typeof request.originAsset === 'string' && typeof request.destinationAsset === 'string' && typeof request.deadline === 'string', 'ROUTE_REQUEST_FIELDS');
  atomic(request.amount); address(request.recipient); address(request.refundTo); integer(request.slippageTolerance);
  for (const field of ['amountIn','minAmountIn','amountOut','netOutputAtomic'] as const) atomic(value[field]);
  atomic(value.withdrawFee, false);
  integer(value.quotedAtMs);
  for (const field of ['deadlineMs','inactiveAtMs'] as const) if (value[field] !== null) integer(value[field]);
  if (value.depositAddress !== null) address(value.depositAddress);
  invariant(value.depositMemo === null || typeof value.depositMemo === 'string', 'ROUTE_INVALID_MEMO');
  invariant(Array.isArray(value.providerFees), 'ROUTE_FEE_AMOUNTS_REQUIRED');
  for (const fee of value.providerFees) {
    strict(fee, ['asset','amount']); invariant(typeof fee.asset === 'string' && fee.asset.length > 0, 'ROUTE_FEE_ASSET_REQUIRED'); atomic(fee.amount, false);
  }
  return structuredClone(value) as unknown as VerifiedQuote;
}
export function buildRequest(registry: RouteRegistry, amount: string, dry: boolean, deadlineMs: number, slippageBps = 50): QuoteRequest {
  atomic(amount); integer(deadlineMs); integer(slippageBps); invariant(slippageBps <= 50, 'ROUTE_SLIPPAGE_CAP');
  return { dry, swapType: 'EXACT_OUTPUT', amount, originAsset: registry.origin.providerId, destinationAsset: registry.destination.providerId,
    depositType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN', recipient: registry.destinationVault,
    refundType: 'ORIGIN_CHAIN', refundTo: registry.refundVault, slippageTolerance: slippageBps, deadline: new Date(deadlineMs).toISOString() };
}
export function validateQuote(quote: VerifiedQuote, request: QuoteRequest, nowMs: number, inputCap?: string, receivedAtMs = nowMs) {
  parseQuote(quote);
  integer(nowMs); integer(receivedAtMs);
  invariant(digest(quote.request) === digest(request), 'ROUTE_QUOTE_ECHO_MISMATCH');
  invariant(quote.quotedAtMs <= nowMs + 5_000 && nowMs - quote.quotedAtMs <= 30_000 && nowMs >= receivedAtMs && nowMs - receivedAtMs <= 30_000, 'ROUTE_QUOTE_STALE');
  if (!request.dry) invariant(quote.deadlineMs !== null && quote.inactiveAtMs !== null && Date.parse(request.deadline) === quote.deadlineMs
    && Math.min(quote.deadlineMs, quote.inactiveAtMs) - nowMs >= 185_000, 'ROUTE_DEADLINE_UNSAFE');
  invariant(atomic(quote.netOutputAtomic) >= atomic(request.amount) && atomic(quote.amountOut) >= atomic(quote.netOutputAtomic), 'ROUTE_NET_CREDIT_TOO_SMALL');
  invariant(atomic(quote.minAmountIn) <= atomic(quote.amountIn), 'ROUTE_MINIMUM_INPUT_INVALID');
  if (request.dry) invariant(quote.depositAddress === null && quote.depositMemo === null, 'ROUTE_PREVIEW_MUST_NOT_FUND');
  else invariant(quote.depositAddress !== null && quote.depositMemo === null, 'ROUTE_UNSUPPORTED_FUNDING_INSTRUCTION');
  if (inputCap !== undefined) invariant(atomic(quote.amountIn) <= atomic(inputCap), 'ROUTE_INPUT_CAP_EXCEEDED');
  invariant(quote.providerFees.every(fee => fee.asset === request.originAsset || fee.asset === request.destinationAsset), 'ROUTE_UNKNOWN_FEE_ASSET');
}
export function inputCap(previewInput: string, riskBps = 100): string {
  integer(riskBps); invariant(riskBps <= 100, 'ROUTE_RISK_ALLOWANCE_CAP');
  const result = ((atomic(previewInput) * BigInt(10_000 + riskBps) + 9_999n) / 10_000n).toString(); atomic(result); return result;
}
export function sourceTimely(kind: 'ZCASH' | 'EVM', canonicalInclusion: number, cutoff: number) {
  integer(canonicalInclusion); integer(cutoff); return kind === 'ZCASH' ? canonicalInclusion <= cutoff : canonicalInclusion < cutoff;
}
export function pollDelay(elapsedMs: number, retryAfterMs = 0): number {
  integer(elapsedMs); integer(retryAfterMs);
  return Math.max(elapsedMs < 120_000 ? 5_000 : elapsedMs < 600_000 ? 15_000 : 60_000, retryAfterMs);
}
