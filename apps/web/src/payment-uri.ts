import { bech32m } from 'bech32';
import { uuid, type OrderView } from './protocol.ts';

export interface FundingPaymentRequest {
  uri: string;
  receiver: string;
  memo: string;
  amount: string;
  cutoffHeight: number | null;
  cutoffTime: string | null;
}

/** Single native-ZEC ZIP 321 request, presented as TAZ in this testnet UI.
 * No capability/order access token is accepted or copied into the URI.
 * API validation remains authoritative for the UA's decoded Orchard receiver;
 * the browser additionally verifies network, encoding and Bech32m checksum. */
export function fundingPaymentRequest(order: OrderView, nowMs = Date.now()): FundingPaymentRequest | null {
  if (order.direction !== 'ZCASH_TO_BASE' || order.status !== 'AWAITING_FUNDS' || !order.funding
    || order.source.received || order.source.confirmed) return null;
  return nativeFundingRequest(order.funding, order.inputAmount, 100_000n, 10_000_000n, nowMs);
}

export function nativeFundingRequest(funding: NonNullable<OrderView['funding']>, inputAmount:string, minimum:bigint, maximum:bigint, nowMs=Date.now(), opaqueMemo=false):FundingPaymentRequest|null {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('Invalid funding clock.');
  if (funding.network !== 'zcash-testnet' || typeof funding.receiver !== 'string'
    || !/^utest1[023456789acdefghjklmnpqrstuvwxyz]{30,506}$/.test(funding.receiver)) {
    throw new Error('A shielded Zcash testnet receiver is required.');
  }
  try {
    const decoded = bech32m.decode(funding.receiver, 512);
    if (decoded.prefix !== 'utest' || decoded.words.length < 30) throw new Error();
    bech32m.fromWords(decoded.words);
  } catch { throw new Error('The testnet receiver checksum is invalid.'); }

  // Match the current API's bounded native-asset terms using integer arithmetic.
  if (typeof inputAmount !== 'string' || !/^[1-9][0-9]{0,8}$/.test(inputAmount)) throw new Error('A canonical positive source amount is required.');
  const atomic = BigInt(inputAmount);
  if (atomic < minimum || atomic > maximum) throw new Error('The source amount is outside the supported testnet range.');
  const amount = `${atomic / 100_000_000n}.${(atomic % 100_000_000n).toString().padStart(8, '0')}`;

  if (typeof funding.memo !== 'string') throw new Error('The payment memo is invalid.');
  const memoBytes = new TextEncoder().encode(funding.memo);
  if (memoBytes.length === 0 || memoBytes.length > 512) throw new Error('The payment memo is invalid.');
  if(!opaqueMemo){let parsed: unknown;
  try { parsed = JSON.parse(funding.memo); } catch { throw new Error('The payment memo is invalid.'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The payment memo is invalid.');
  const value = parsed as Record<string, unknown>;
  if (value.v !== 1 || typeof value.ref !== 'string' || !uuid(value.ref)
    || JSON.stringify({ v: 1, ref: value.ref }) !== funding.memo) throw new Error('The payment memo is not canonical.');}

  if (funding.cutoffHeight !== null && (!Number.isSafeInteger(funding.cutoffHeight) || funding.cutoffHeight <= 0)) throw new Error('The funding cutoff is invalid.');
  if (funding.cutoffHeight === null && funding.cutoffTime === null) throw new Error('A funding cutoff is required.');
  if (funding.cutoffTime !== null) {
    if (typeof funding.cutoffTime !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(funding.cutoffTime)) throw new Error('The funding cutoff is invalid.');
    const cutoff = Date.parse(funding.cutoffTime);
    if (!Number.isFinite(cutoff) || new Date(cutoff).toISOString().replace('.000Z', 'Z') !== funding.cutoffTime.replace('.000Z', 'Z')) throw new Error('The funding cutoff is invalid.');
    if (nowMs >= cutoff) return null;
  }
  // ZIP 321 requires UTF-8 memo bytes encoded as unpadded base64url, never URI
  // percent encoding or ordinary padded base64. Canonical routing memo is ASCII.
  const memo = btoa(String.fromCharCode(...memoBytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return {
    uri: `zcash:${funding.receiver}?amount=${amount}&memo=${memo}`,
    receiver: funding.receiver, memo: funding.memo, amount,
    cutoffHeight: funding.cutoffHeight, cutoffTime: funding.cutoffTime,
  };
}
