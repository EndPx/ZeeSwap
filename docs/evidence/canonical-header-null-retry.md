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
cancellation during delay and retry, and actual rolling 24 charging for
10 original +10 retry +10 subsequent methods. Scoped diff/new-file whitespace
checks passed. No new Source/RPC probe or remote mutation was performed by the
coding agent. Root must qualify the next actual first cycle and preserve any
new row diagnostic before financial activation.

## Explicit -32007 recovery and ordinary sample batching

A later actual daemon log established a distinct cause: numeric-header RPC error
**-32007**, kind2, at public height51,715,992 after13.012 seconds, followed by
independent-source failures, a tail-budget refusal, timeouts and an admission
gap. The old null-only retry correctly did not retry that error. The earlier
independent failures did not log their conjuncts, so no mLag attribution is made.

Root explicitly authorized a single numeric-header retry for this exact -32007
code. It shares the same one-total-retry budget with null: null→-32007,
-32007→null and repeated -32007 all terminate after the second response. The same
provider, requested numeric heights, original signal and weighted method queue
are retained. Other error codes, malformed/missing rows and non-null contradictory
responses remain terminal. Latest/finalized tags never receive this retry.

Only ordinary observation opts into a three-method independent sample batch:
chain ID, latest header and finalized header are actual responses in one HTTP
request. All three methods are charged. Exact IDs, network, headers and finality
remain checked; the original end fences and Source freshness conjuncts, including
claimed Source lag 40, are unchanged. Default/producer/other callers retain their
previous sampling behavior. Source timestamps are not renewed by peer batching.

The main observer now logs the already-defined `safeIndependentSourceDetails`
on its exact typed failure: six boolean conjuncts, public heights and original
Source/peer timestamps. No event payload, order, recipient, auth or endpoint is
included. This permits the next failure to be attributed without guessing or
removing a freshness guard.

Focused local checks passed: 9 current RPC cases, 19 consumer-performance cases
and 5 cadence/RPC cases (33 total across the scoped runs), zero skips; API
typecheck and scoped whitespace checks passed. Added cases cover one-total
-32007/null retry, batched network/finality facts, bad IDs/tags refusing, actual
rolling 24 accounting for the 3-method sample and cancellation/draining. No live
observer execution or new Source/RPC probe was performed for this implementation.
A new scoped opening and Root's actual successful observation remain required.
