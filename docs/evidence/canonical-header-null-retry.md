# Bounded canonical batch null-header retry

29 October 2026. Root's actual R10 first cycle completed four Source packets of
64,64,64,32 headers but stopped at21.945 seconds with `CANONICAL_RPC_ERROR` in an
Official10-header batch. HTTP was200, with no429 or deadline timeout. The old
reader conflated null results, RPC errors and missing IDs, so this record does
not claim that the actual failed row was null.

The batch reader now reports four numeric/null fields: `kind` (1=explicit null,
2=RPC error,3=missing/malformed row), requested `height`, numeric `rpcCode` or
null, and numeric response `id` or null. Diagnostics never include RPC error
messages, params, response payloads, headers, credentials or URLs. They follow
the existing stderr diagnostic channel unless an explicit diagnostic callback
is supplied. Root should retain stderr alongside its private first-cycle trace.

Only a structurally complete numeric-header batch with an explicit null result
can retry. All IDs and every non-null header are validated first. After250ms,
only null request slots are read once more at the same provider and heights,
using the original signal and dispatch queue. Duplicate heights retain distinct
original response slots; no height-keyed cache merges their claims. A second
null remains fatal. Missing IDs/results, RPC errors and wrong non-null headers
never receive this retry. Single-header/tag reads are unchanged.

The retry consumes actual additional weighted methods under the existing queue;
no deadline, Source clock, finality, header hash or publication guard is relaxed.
The HTTP-layer retry policy is unchanged. This patch adds no transaction,
signing, wallet or write method and makes no claim of live readiness.

Local checks passed, zero skips:

```sh
pnpm --dir api exec tsx --test test/canonical-header-null-retry.test.ts test/observer-cadence-rpc.test.ts test/integrations/envio-consumer-performance.test.ts
pnpm --dir api typecheck
```

All29 cases passed. New cases cover null-then-valid, terminal second null,
missing/error/wrong-height refusal, duplicate-height slot preservation,
cancellation during delay and retry, and actual rolling24 charging for
10 original +10 retry +10 subsequent methods. Scoped diff/new-file whitespace
checks passed. No new Source/RPC probe or remote mutation was performed by the
coding agent. Root must qualify the next actual first cycle and preserve any
new row diagnostic before financial activation.
