# Ordinary Envio final-tail bound

Recorded 29 October 2026. This document records the actual failed R6 first-cycle
trace and a bounded local fix. Deployment and a successful new live cycle remain
Root execution steps; local tests do not establish financial readiness.

## Recorded first-cycle failure

Root published the scoped R6 opening, then immediately executed the exact
published `43e32b0` ordinary observer with `--once` before starting its daemon.
The private trace SHA-256 is
`d0e46e8d875c84ef06e4619a1bae7854a4aff04413f01ef34bc4ef7a0e0ca924`.
All Source HTTP responses were 200; no HTTP 429 was observed. The cycle timed
out at 30.028 seconds while independently verifying its final extra packet.

The retained opening height was 51,642,637 with Source sample time
05:06:36.861 UTC. Approval was issued at 05:06:45.216 UTC; the ordinary cycle's
Source status request began at 05:07:13.501 UTC, 36.640 seconds after that sample.
The initial ordinary target was already 51,642,868: 231 blocks beyond the opening,
or 263 headers including the existing 32-block overlap. Immediate invocation
after publication therefore did not imply a fresh height handoff.

The cycle requested packet widths **64, 64, 64, 64, 7, 49**, covering 312 headers.
The short seven-block packet began at cycle 19.858 seconds. A subsequent response
extended the moving target by another 49 blocks; that extra request began only
at cycle 24.518 seconds. Its Source response succeeded, but its independent
verification could not complete within the original deadline. This establishes
late moving-target extension as part of the demonstrated failure.

## Bounded ordinary-only behavior

The ordinary observer now explicitly opts into a bounded final tail. Its initial
target remains fixed while full packets are dispatched. Immediately before
**one final partial Source HTTP request**, including a lookahead-prefetched
request, it may fetch one fresh Source status and coalesce the current partial
range with that status's committed progress. Selection occurs before export
HTTP dispatch, not after receiving an already short packet.

The complete selected tail must fit one packet of at most 64 headers and the
whole replacement must remain within the existing 1,000-block/policy bound.
Selection must leave at least ten seconds of the original 30-second budget,
checked both before and after the status read. Oversized, regressed, stale,
wrong-identity or late selection refuses the cycle. There is no split remainder,
recursive target chase, partial-range publication or deadline renewal. Existing
callers without the ordinary opt-in retain their previous behavior.

Every selected header, exact log comparison and initial/end canonical fence
still runs through the existing verifier and weighted RPC queue. Source clocks
are preserved; the replacement still carries the oldest packet Source sample.
The ordinary cycle additionally compares its final independent sample's actual
head against the replacement's published through-height: a lead above 40 blocks
refuses before any hint-journal save or SQL publication. A producer's earlier
claimed head is insufficient to pass this check.

The existing one-current/one-future collector drains both the status and tail
export on cancellation or failure. This patch changes no source producer image,
Main transport receipt, financial worker, admission policy or source registry.
The original 30-second deadline, rolling 24-method rate, packet limits, finality
checks, clocks and source identities remain in force. A selected tail may still
fail the real deadline or final lag check; this is not a live performance claim.

## Local verification

```sh
pnpm --dir api exec tsx --test test/integrations/envio-ordinary-final-tail.test.ts test/integrations/envio-consumer-performance.test.ts test/integrations/envio-live-admission.test.ts
pnpm --dir api typecheck
```

All 29 focused cases passed with zero skips; API typechecking and scoped diff
whitespace checks passed. Seven new cases reproduce the R6 short7+49 merge into
one56 packet, reject oversized/whole-range/late tails, drain cancellation during
status and export, reject an independently observed 41-block final lag before
writes, and retain the old adaptive caller without opt-in. Existing cases cover
full fence comparisons, reorgs, source-clock expiry, pacing and admission bounds.
No new Source/RPC probe, remote file change or observer execution was performed
by the coding agent for this patch. Root reviews and publishes the observer-only
release before another scoped opening and exact first-cycle qualification.

## R9 two-page correction

The initial3f implementation above introduced two additional restrictions. Root's
actual R9 first cycle requested two64-header packets, then refused the final
selection at10.077 seconds with `EVENT_FIRST_FINAL_TAIL_RANGE`; it wrote no hints
or observer SQL. The trace proves the selection exceeded64, but did not record
its exact size. A71-header selection in the regression test represents that
same two-page boundary pattern, not an invented actual R9 measurement.

The approved correction permits one fixed final selection of at most128 headers,
consumed as at most two Source packets of at most64 each. No recursive selection
or third tail page is allowed. Original30-second deadlines,10-second selection
reserve, complete1000-block bound, packet verification, log equality, fences,
Source clocks and baselineSource-claimed-head lag40 remain. A Source target
regression and a selection above128 have distinct error codes; diagnostics expose
only initial/selected target, tail start and tail width as integers.

The extra3f final independent-peer-head-to-published-through40 upper bound is
removed. The lower bound remains: the final fresh peer head must reach the
published through-height, or the cycle refuses before hints or SQL writes.
It was a new strengthening, rather than a pre3f acceptance gate. Original
per-packet independent Source sampling, head/finality checks, fresh end fences,
Source-claimed-head lag40 and receipt guards are unchanged. The correction does
not promise a successful live first cycle; Root must qualify its next actual run.

Current checks:36 focused TypeScript cases pass with zero skips; APItypecheck
and scoped whitespace checks pass. Tests include one fixed two-page tail, >128
refusal, distinct regressed target, original claimedSource lag40 refusal,
clock/deadline bounds, cancellation/draining on either tail page and strict
numeric-only diagnostics. The boundary follow-up proves that a final head one
block below through refuses without writes, while a head41 blocks above does
not introduce the removed upper bound. No new live Source/RPC probe was performed.
