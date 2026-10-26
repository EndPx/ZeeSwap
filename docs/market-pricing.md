# Market-priced testnet settlement

New quotes can use a server-owned Kraken reference when Root explicitly selects
the new market policy. Accepted orders retain their original source amount,
destination amount and immutable price snapshot. The original fixture mode and
its historical orders remain supported without repricing or data migration.

This is a firm operator testnet quote for TAZ/mockUSDC. It is not an exchange
trade, a mainnet ZEC/USDC settlement, an onchain price oracle or market liquidity.
The public `/market-reference` process remains a read-only information endpoint.
The financial API uses its own fixed-provider sampler and does not trust browser
prices or a browser-submitted reference response.

## Calculation and price lock

Both Kraken ZEC/USD and USDC/USD bid/ask legs are required. The maintained
read-only provider validates TLS, market identity/status, HTTP freshness and a
maximum thirty-second sample lifetime. Its conservative cross prices are:

```text
bid12 = floor12(ZEC/USD bid / USDC/USD ask)
ask12 = ceil12 (ZEC/USD ask / USDC/USD bid)

ZCASH_TO_BASE: numerator = bid12 as a 12-decimal integer; denominator = 10^12
BASE_TO_ZCASH: numerator = 10^12; denominator = ask12 as a 12-decimal integer

outputAtomic = floor(inputAtomic * numerator * 10^destinationDecimals
                     / (denominator * 10^sourceDecimals))
```

USDC/USD is not assumed to equal one. The protocol fee remains zero. Network
fees remain separate, and output is rounded down once. No amount is clipped to
fit inventory or a contract limit.

| Direction | Source range, atomic | Destination range, atomic | Decimals |
| --- | --- | --- | --- |
| TAZ → mockUSDC | 100,000–10,000,000 | 100,000–10,000,000 | 8 → 6 |
| mockUSDC → TAZ | 100,000–10,000,000 | 10,000–10,000,000 | 6 → 8 |

An input within its source range may still be refused because the resulting
output is below its destination minimum, above its maximum or unavailable in
verified inventory. At a synthetic bid of 1,200 and ask of 1,250 USDC/ZEC,
100,000 zatoshis produces 1,200,000 mockUSDC units, while 1,000,000 mockUSDC units
produces 80,000 zatoshis. A 100,000-unit reverse input would produce only 8,000
zatoshis and is refused. The UI defaults to 0.001 TAZ and 1 mockUSDC.

Quote expiry is the earlier of snapshot expiry and 120 seconds after SQL
issuance. SQL uses its actual transaction clock at issuance and acceptance.
Future-dated, stale or expired snapshots are rejected. Acceptance atomically
locks the original output and reserves that exact destination principal plus
both separately funded fee allowances. Later price expiry or provider outage
does not reprice, cancel or prohibit payment of an accepted order. Source-chain,
canonical receipt, lease, epoch, capital and original-journal guards still apply.

## Immutable snapshot and API

The private quote/order view retains its existing `inputAmount`, `outputAmount`,
execution and funding fields. It adds `priceMode: "market-reference"` and:

```text
pricing = {
  version:1, snapshotId, snapshotSha256, source:"Kraken", pair:"ZEC/USDC",
  side:"bid"|"inverse-ask", retrievedAt, expiresAt,
  acceptedAt:null|ISO, locked:boolean,
  rateNumerator, rateDenominator,
  sourcePairs:[{pair,providerPair,bid,ask,mid}, {pair,providerPair,bid,ask,mid}]
}
```

Snapshot SHA256 uses compact UTF-8 JSON of this positional preimage:

```text
["zeeswap-market-price-v1", snapshotId, "Kraken", "ZEC/USDC",
 retrievedAt, expiresAt, "XZECZUSD", zecBid, zecAsk,
 "USDCUSD", usdcBid, usdcAsk]
```

The raw decimal strings and selected twelve-decimal ratio are independently
recomputed in TypeScript, SQL, the browser and the native market protocol. Object
property order is irrelevant. Historical accepted views validate at `acceptedAt`,
not the current time. Legacy views remain `priceMode: "fixture"`, with no market
snapshot.

`GET /pricing` declares mode, server configuration, reference availability,
zero protocol fee and the bounds above. `GET /availability` uses version two
only for an explicitly configured market policy. It retains finite two-per-
direction, 32-quote and one-global-active-order limits, and exposes directional
input/output bounds. Readiness considers the smallest legal market-sized output
at the sampled price against available principal and remaining approved budgets;
an old equal-unit balance cannot make an unfulfillable market direction ready.
The old version-one fixture availability remains unchanged.

POST quote bodies are unchanged. Clients cannot select pricing mode or submit
output, ratio or snapshot fields. Their existing capability and idempotency key
govern creation and access. Unknown creation/acceptance outcomes require reading
the original intent, without silently creating another economic order.

## SQL and authority boundary

Apply only reviewed missing `0020_bounded_testnet_service_policy.sql`,
`0021_testnet_service_refunds.sql` and `0023_market_pricing.sql` as appropriate.
Do not run the directory-wide migrator against this deployment: unrelated
0015/0016 and bridge 0022 remain outside this feature's installation.

Migration 0023 changes no old quote rows or columns. The fixture equality check
is retained within an explicit mode constraint. Separate immutable snapshot and
quote-price mapping tables hold market data. Only the trusted worker publisher
can register a snapshot; the API role cannot insert/update snapshots, mappings,
admissions or Root policies. `issue_market_quote` recomputes output and expiry in
SQL from a published snapshot. A direct API market-row insert lacks the private
mapping and is refused. Accepted rows and mappings cannot be updated or deleted.

The new Root policy has its own table and namespace. It binds profile, source
identity/audit, capital allocation, starting books, public commit, deployment,
finite lifetime, active epoch and explicitly approved principal budgets. Budgets
sum actual accepted destination outputs by direction, rather than assuming that
input atomic units equal output atomic units. Admission also locks the existing
inventory rows and checks the complete global unresolved slot, including older
orders and liabilities. No new inventory or fee credit is created automatically.

Accepted worker membership is checked against the recorded snapshot at acceptance
and the original policy epoch, with a live worker lease and fresh chain views.
Current provider availability and current snapshot/policy admission expiry are
not drain gates for accepted liabilities. Pausing/reconciling control, losing a
lease or changing epoch still fences financial effects.

## Concrete Linux entrypoints

The existing Linux API entry supports these explicit Root selectors:

```text
ZEESWAP_MARKET_POLICY_PROOF=/opt/zeeswap-testnet/state/market-policy/<name>.private.json
ZEESWAP_MARKET_POLICY_SHA256=<raw SHA256>
```

They are mutually exclusive with the old fixture service and continuation
selectors. Absent selectors retain the existing default read-only behavior.
The private proof is Root-owned, group 978, mode 0640; its directory is Root-owned,
group 978, mode 0750. The loader verifies actual public pricing-module pins and
the exact SQL permit. It does not activate controls or provision funds.

The dedicated Root worker is:

```sh
node --import <release>/app/api/node_modules/tsx/dist/loader.mjs \
  <release>/app/api/scripts/work-linux-market-policy.ts \
  /opt/zeeswap-testnet/secrets/market-policy-worker.private.json <raw-config-SHA> [--once]
```

Its mode is `ROOT_MARKET_TESTNET_SERVICE_WORKER`; disabled configuration exits
before effectful startup. Enabled operation requires explicitly enabled/bound
forward, new market reverse and new market refund transports, matching Root
profile/code pins, the real application database/role and the exclusive worker
lease. Before readiness it captures actual native notes, verifies immutable
provenance, checks current Base inventory/gas/nonce and compares physical backing
against the ledger. Per-order capital approvals are frozen from that evidence.

`market-reverse-v1` binds actual Base input and accepted native output separately.
It uses the maintained SDK through a new protected native profile and concrete
canonical COMMIT, price-lock, worker/lease and original-byte guards.
`market-refund-v1` returns the actual confirmed primary source amount, including
bounded under/over/late deposits, after permanent canonical Base cancellation.
It does not refund the converted destination amount. Larger/extra/ambiguous
liabilities remain open for separately budgeted operator recovery. Both protocols
retain the original signed transaction and refuse automatic economic replacement
after an unknown outcome. Old fixture/native/G5 guards are unchanged.

Root can inspect installation and bindings without mutation using:

```sh
node --import <release>/app/api/node_modules/tsx/dist/loader.mjs \
  <release>/app/api/scripts/inspect-market-policy.ts [<private-proof> <raw-SHA>]
```

This reports missing exact migrations or read-only control/source/inventory and
permit bindings. It does not fetch a price, install SQL, mint authority, allocate
capital, change control, sign or broadcast. `marketPolicyInsert` provides the
finite owner-only permit statement for Root's separately reviewed, journaled
operator transaction; services cannot execute that owner operation.

## Operator acceptance remains separate

Root must first reconcile the existing stopped/stale application observers and
qualify fresh canonical sources. Then install only reviewed SQL, verify actual
effective roles/catalog, provision genuinely backed destination inventory and
external fee allowances, bind the new release/profiles, prepare and journal the
new Root permit/control transition, and supervise the worker/API. A healthy price
feed alone cannot complete those gates. Preserve all old accepted orders,
receipts, balances, journals and the stopped G5 experiment.

Acceptance requires an actual browser-backed two-way market-sized testnet circle
with independent destination receipts and exact ledger closure. Local tests,
Anvil execution and synthetic native transactions are implementation evidence.
They must not be presented as that funded testnet result or mainnet readiness.
