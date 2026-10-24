# Bounded header transport review

Recorded 24 October 2026. This artifact addresses the isolated Base Sepolia
indexer's catch-up capacity. Its local/VPS test evidence is separate from actual
source catch-up, canonical freshness and financial settlement.

The original six header effects per second each issued three RPC methods. A
processing cap of 100 improved recurring checkpoint publication, but did not
remove redundant chain-ID/latest requests. The new transport retains the exact
per-height projection inputs and stock validation while collecting concurrent
requests into short cohorts. A complete twelve-header cohort uses fifteen
methods, including a sampled-head recheck. It reserves final-check capacity
before sampling, enforces a rolling eighteen-method client-dispatch limit and
preserves abort/deadline behavior. Native datasource requests remain outside
this header-only budget; no total-provider quota claim is made.

Root reviewed the implementation and required two corrections before application:
streaming byte bounds before decoding, and full normalized consistency for
duplicate-height headers. Both corrections were implemented. The final transport
module is 18382 bytes with SHA-256
`f88b8789d019f04d93e6c01124b0a4b9f64c55aedc1bd918cb7e74ae06d1dbdd`.
The separately modified Main artifact has SHA-256
`f86148bd6e8cbe777b5021f2e7f58ed6b717af4182c0e00f032036e93e8ae82f`.
See [the implementation and operator contract](../../deploy/linux/envio/RPC-TRANSPORT.md).

Root's actual VPS rerun passed **24 tests, zero failures and zero skips**, using
the installed exact SDK and archived original Main source. The first invocation
used the underlying pnpm directory as its fixture root and failed one module
resolution test. Repeating it with the documented project `node_modules/envio`
entry resolved that fixture setup error; the full suite then passed. No SDK file,
producer state or database was modified by either test run.

An independent Sol 6.1 review identified no blocking findings and independently
reran all 24 tests on the Linux SDK fixture. Tests include the actual descriptor's
first-use limit, stock retry behavior, rolling-boundary counterexamples,
randomized reservations/cancellations, native loopback aborts, oversized lazy
streams and filesystem hardlink preservation.

A separate read-only probe exercised the actual SDK preload path with distinct
inputs and fake RPC responses. Twelve jobs arrived within 2.266–17.351 ms and
formed one twelve-job cohort, using fifteen methods. Twenty-four jobs formed two
twelve-job cohorts approximately one second apart, using thirty methods. This
checks the burst-admission premise; it does not prove real provider capacity.

Application must preserve the existing producer generation, source code, YAML,
schema, birthday, projection identity, rollback state and journals. The result
must be described as a modified Envio runtime with bounded header transport.
Only actual provider responses, recurring atomic commits, positive backlog
reduction and a subsequent five-minute canonical freshness window can close
source readiness. Customer intake and financial dispatch remain paused during
these operator steps.

## Actual isolated VPS application and Base window

Root applied the published transport after stopping the isolated engine and
verifying its empty process group. Both installed hashes matched the reviewed
artifacts. The original producer generation, configuration, projection, schema,
birthday and rollback state were retained; no reset or database migration ran.
The engine resumed and its real provider responses formed twelve-header cohorts.

A read-only interval from 08:16:39.694 to 08:17:40.349 UTC measured 700 newly
committed blocks while the sampled source head advanced 309 blocks. Backlog fell
from 2226 to 1835, a reduction of 391 blocks in about 60.65 seconds. Seven storage
writes committed during that interval. A single observed HTTP 429 at
08:14:15.254 was followed by a verified cohort at 08:14:16.718 and continued
progress. This is measured provider behavior, not a quota or throughput guarantee.

After catch-up, a separate Base-specific window ran from 08:26:48.723 to
08:31:54.563 UTC on 24 October 2026. The UTC endpoint span was 305.840 seconds;
the monitor's separately bounded monotonic sample interval was 304.685 seconds.
Both exceeded five minutes. Its 62 samples passed the existing source and SQL
freshness gates. Maximum sampled producer-head lag was 13 blocks;
maximum observed application SQL age was 41.026 seconds, with a conservative
between-sample upper bound of 46.028 seconds. Thirteen new canonical observer
publications succeeded, with no observer waiting result during the window.
The header transport separately refused one eight-job cohort as
`INVALID_OR_ABORTED_COHORT`; its underlying cause was not established. A verified
cohort followed approximately 1.795 seconds later without a reset. That transport
refusal is distinct from the zero observer waiting results. Producer and consumer
progress remained monotonic; generation, profiles and process identities
were stable. A later independently sampled head is recorded separately as a
latency diagnostic, rather than conflated with the earlier source-sample lag.

This closes the measured **Base-only** catch-up/freshness checkpoint for that
runtime interval. Chef was still catching up. Epoch remained zero, intake and
dispatch remained disabled, reconciliation remained required and customer books
were empty. The window is not simultaneous two-source readiness, activation or a
new cross-chain settlement. Any later service/profile intervention requires a new
relevant readiness window before financial activation.
