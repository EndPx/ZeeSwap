# Read-only ZEC/USDC market reference — 26 October 2026

Subsequent Root execution completed the corrected Linux suite, separate service
deployment, actual public price reads and browser verification. Those operator
results are recorded in [live deployment evidence](market-reference-live.md).
The preparation checkpoints below retain their original pending/live distinctions.

The user selected market reference display first, with testnet payouts continuing
to follow their existing quotes. This implementation adds a separate native
read-only process. It does not import the application API, database, wallet,
signer, policy, quote arithmetic or settlement modules. No historical fixture,
quoted amount or payout rate is changed.

## Data and timestamp meaning

The provider is Kraken's public spot API:

- [System status](https://docs.kraken.com/api-reference/market-data/get-system-status)
  must report online with a finite recent provider status timestamp.
- [Tradable asset pairs](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs)
  must identify exactly `XZECZUSD` (`ZEC/USD`, base `XZEC`, quote `ZUSD`) and
  `USDCUSD` (`USDC/USD`, base `USDC`, quote `ZUSD`), both online.
- [Ticker information](https://docs.kraken.com/api-reference/market-data/get-ticker-information)
  supplies each pair's ask `a[0]` and bid `b[0]`. Both legs are required and their
  positive integer-decimal prices must satisfy bid ≤ ask.

The ticker response does not supply an exchange update timestamp used by this
implementation. Consequently `exchangeUpdatedAt` is explicitly null. The UI may
say sampled or retrieved; it must not relabel retrieval time as exchange price
update time or imply guaranteed live/executable liquidity. System health and HTTP
Date are separate observations, not timestamps of the exchange bid/ask update.

The response's `retrievedAt` is the earliest completed HTTP retrieval in the
three-response sample. `expiresAt` is bounded by 30 seconds after that retrieval,
each response's HTTP Date and Age, and the provider status timestamp. An older
cached upstream response cannot acquire a new full lifetime on download. Wall
clock validation is supplemented with monotonic expiry, and cached timestamps
are never renewed by a browser read.

## Exact arithmetic and safety boundaries

Prices are parsed from canonical positive decimal strings into 18-decimal scaled
BigInts, without floating-point conversion. The published derived prices use
12 fractional digits:

```text
reference bid = floor12(ZEC/USD bid ÷ USDC/USD ask)
reference ask = ceil12 (ZEC/USD ask ÷ USDC/USD bid)
reference mid = floor12((ZEC/USD bid + ZEC/USD ask)
                       ÷ (USDC/USD bid + USDC/USD ask))
```

USDC/USD is not assumed to equal one. This is a public market reference for actual
market asset names ZEC/USDC, separate from valueless TAZ/mockUSDC testnet assets and
from the immutable accepted payout quote. Display precision does not make the
derived cross an executable venue quote or account for fees, depth or slippage.

Production has exactly three allowlisted HTTPS GET URLs, a four-second absolute
timeout per request, 64 KiB body and 8 KiB header limits, no automatic retry,
redirect following, URL environment override, credentials or arbitrary pair proxy.
Normal Node certificate and hostname verification is preserved. A disabled TLS
verifier fails closed. Provider errors/offline status, mismatched assets, invalid
prices, stale/future headers, excessive Age, stale warnings, stale cache modes,
unexpected encodings or malformed bodies make the reference unavailable.

The process samples every 15 seconds, with one in-flight sample and an attempt
cooldown. Browser requests only read its memory cache. A failed refresh clears
the numeric cache, and expiry returns unavailable without old prices. No fallback
price is installed. Process restart begins unavailable until a new valid sample.

## HTTP contract

`GET /market-reference` returns HTTP 200 with:

```json
{
  "schemaVersion": 1,
  "status": "available",
  "source": "Kraken",
  "pair": "ZEC/USDC",
  "priceMode": "reference-only",
  "marketAssets": {"base": "ZEC", "quote": "USDC", "via": "USD"},
  "rate": {"mid": "101.000000000000", "bid": "99.009900990099", "ask": "103.030303030304", "decimals": 12},
  "sourcePairs": [
    {"pair": "ZEC/USD", "providerPair": "XZECZUSD", "bid": "100.00000000", "ask": "102.00000000", "mid": "101.000000000000"},
    {"pair": "USDC/USD", "providerPair": "USDCUSD", "bid": "0.99000000", "ask": "1.01000000", "mid": "1.000000000000"}
  ],
  "retrievedAt": "<actual retrieval ISO timestamp>",
  "expiresAt": "<bounded expiry ISO timestamp>",
  "exchangeUpdatedAt": null,
  "maxAgeSeconds": 30,
  "pollIntervalSeconds": 15
}
```

The numbers above are deterministic test fixtures, not a recorded market sample.
HTTP 503 returns the following shape without `rate`, `sourcePairs` or any cached
numeric price:

```json
{
  "schemaVersion": 1,
  "status": "unavailable",
  "source": "Kraken",
  "pair": "ZEC/USDC",
  "priceMode": "reference-only",
  "reason": "MARKET_REFERENCE_UNAVAILABLE",
  "retrievedAt": null,
  "expiresAt": null,
  "exchangeUpdatedAt": null,
  "maxAgeSeconds": 30,
  "pollIntervalSeconds": 15
}
```

HEAD returns the corresponding status without a body; OPTIONS returns 204 and the
allowed methods. Other methods return 405. The exact path rejects bodies, query
proxies and arbitrary symbols. Responses are `Cache-Control: no-store`; no private
capability is needed or sent upstream, and provider errors/prices are not logged.

## Verification and operator boundary

Commands:

```powershell
pnpm --dir api exec tsx --test test/market-reference.test.ts
pnpm --dir api typecheck
```

Final local verification: **16/16 passed, zero skips**, and API typechecking passed.
Cases cover exact ratios with a non-one USDC leg; number/exponent/negative/zero and
precision rejection; wrong/offline assets; provider/status/retrieval staleness;
Date/Age/cache rules; real bounded local HTTP requests on all three fixed paths;
explicit loopback-only test injection; redirect/error no-retry behavior; body/JSON/
timeout failure; singleflight/cooldown/browser independence; complete removal of
failed/stale numbers; monotonic expiry; local GET/HEAD/OPTIONS/method/body/path
behavior; 503 shape; and standalone native Node import with zero network calls.
The test upstream and sample values are explicitly synthetic; no production URL
can be selected from a test environment variable or browser request.

Root's first actual Linux test run reported **15 passed / 1 failed, zero skips**,
in 0.679 seconds. The failure was the redirect/error test's assertion that all
three concurrent request handlers had already run when `Promise.all` rejected
its first response; Linux observed one handler at that instant. This exposed a
test synchronization race, not a production retry or redirect. The original
private Linux log is preserved by Root. Only that test was corrected: it now
waits at most one second to observe all three original paths, keeps a real local
redirect target observable for an additional bounded 100 ms, and checks the exact
request multiset for duplicates or followed redirects. All four production
module bytes are unchanged. The corrected local rerun passed **16/16, zero
skips**; Root's corrected Linux rerun is a separate pending operator result.

Root independently observed normal TLS public Kraken HTTP 200 on the VPS before
implementation. At 10:41:16 UTC its SystemStatus Date was current, no Age/Warning,
Cache-Control `no-cache, max-age=0`; AssetPairs used `public, max-age=1, s-maxage=1`,
Ticker `public, max-age=2`. Those are provider preflight observations, not a test
of this implemented service. The laptop's earlier TLS certificate mismatch was
not bypassed and no production provider calls were made by this coding agent.

Root then executed the implemented standalone sampler on the VPS with normal TLS
and no URL override. At **10:53:38 UTC** it returned available with ZEC/USDC mid
`1230.737684421105`, bid `1230.416083216643`, ask `1231.059317795339`, expiry
**10:54:08 UTC**, and `exchangeUpdatedAt: null`. This is an actual retrieved market
reference sample, not an exchange trade, payout or a service/browser acceptance
result. The Node process with `--max-old-space-size=24` measured **63,356,928 bytes
RSS**, reported maximum RSS **62,000 KiB**, before cgroup overhead. Root therefore
authorized changing only the unit resource policy to `MemoryHigh=80M` and
`MemoryMax=96M`, retaining heap 24 MiB, CPU 25% and TasksMax 16. The initial 64 MiB
hard limit was too close to the actual measured footprint. Service installation,
steady-state cgroup memory qualification and public-browser checks remain pending
at this checkpoint.

The deployment README and public systemd template describe a separate loopback
3032 process, 96 MiB hard memory cap and exact same-origin Nginx location. Actual VPS
service execution, runtime memory qualification, public HTTP/browser verification,
publication and remote-SHA confirmation belong to Root's operator milestone and
must be recorded from actual results. No application API restart, live SQL,
financial action, quote/payout change or G5 continuation occurred in this work.
