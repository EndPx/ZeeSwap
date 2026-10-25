# Readiness RPC budget alongside live observation

This checkpoint follows the [unpublished checkpoint correction](native-unpublished-checkpoint-guard.md).
The application remains paused at the exact epoch-ten reconciliation version.
No new customer quote or payment is claimed.

Two later readiness attempts collected a full window but failed the continuous
SQL freshness requirement. In one attempt, an older Base observation was
52,070 ms old at a sample and 62,546 ms old at the following sample. The
60-second requirement correctly refused activation. During that attempt, the
normal Envio journal recorded nine RPC HTTP 429 responses, including a second
failed attempt, one failed 15,285-ms consumer cycle and a subsequent successful
25,129-ms recovery cycle. These are actual read-side observations, not a
successful cross-chain settlement.

A separate intermediate attempt passed 31 samples over 301,406 ms on the VPS.
Its local SSH transport did not deliver completion to the orchestrator even
after the remote window process had ended. Root identified and stopped only
that owned read-only transport, retained the passing window and verified no
activation or financial effect. Its proof had expired and was not reused.
The exact transport cause remains unproven. Later private orchestration added
SSH/SCP keepalives without adding economic retries or native-process kills.

Root's read-only closure checks after these attempts found the exact paused
control version, complete 39-row financial snapshot, two quotes and orders,
zero new admission rows, an empty R3 session and absent payer/control journals.
Earlier attempt intents, logs and proofs were retained separately.

The first pacing change reduced only the auxiliary readiness reader from batches of ten
and twelve methods per second to **batches of four and four methods per second**.
The normal Envio observer retains its existing twelve-method configuration and
elapsed-cycle cadence. The canonical provider, source identity, network,
header comparisons and 300/60/20-second gates are unchanged. This reduces one
competing client's configured request pressure; it does not establish the
provider's total quota or guarantee that HTTP 429 responses are resolved.

The production factory is exercised through the canonical transport seam. Four
behavioral tests passed: an oversized batch is rejected before transport,
concurrent batch and scalar reads share the paced queue, an aborted queued read
makes no later transport/retry, and source identity, endpoint, clock and read-only
RPC semantics are preserved. Root's combined run passed **44 tests with zero
skips**, and API typechecking passed. Independent review verified the two Git
paths and reran the four transport tests.

Live evaluation must run this reader concurrently with the normal observers.
A new passing window, fresh capital/preflight evidence, exact committed
activation and the funded two-way circle remain separate gates. This code
checkpoint does not renew an old observation timestamp or change an accepted
order's terms. No migration or authority-schema change is required.

## Concurrent result and combined-reader correction

The actual concurrent window with auxiliary batches/rate four **failed**. It
collected 31 samples, but a Base checkpoint reached 65,741 ms of age at the next
sample. The normal observer recorded 18 HTTP 429 responses, one failed
13,960-ms cycle and a subsequent 26,230-ms recovery cycle covering 196 block
headers. Root verified unchanged paused controls, the complete financial
snapshot, zero authorization rows and no new quote, payer or controller effects.
This result does not establish the cause or quota of the provider's throttling.

The recovery range matters when selecting a lower rate. With three required
anchors, the normal cycle reads approximately 13 additional methods beyond its
range. The measured 196-header cycle therefore requires about 209 methods.
At eight or nine methods per second, pacing plus the observed residual cycle
time would exceed the unchanged 30-second read budget. Ten methods per second
leaves approximately 0.3 seconds of modeled margin. These are capacity estimates
from measured cycles, not acceptance results or a guarantee about future latency.

The next bounded configuration uses **normal batches of five at eleven methods
per second**, alongside **auxiliary batches of one at one method per second**.
Each reader has its own weighted queue. Their configured sum of twelve is not a
shared cross-process limiter or a strict rolling rate cap; initial requests can
align. The smaller batches reduce the maximum combined initial method burst
from fourteen to six relative to the previous configuration. Provider, source
identity, complete range/header verification, retained admission history,
overlap and all 30/60/20/300-second gates remain unchanged.

Concurrent live acceptance remains required before activation and financial
work. No stale window is reused and no observation timestamp is renewed by this
configuration change.

Root verification passed **45 focused tests with zero skips** and API
typechecking. Five tests exercise the actual fixed factories through the
transport seam: batch limits, concurrent independent weighted queues, a
209-normal-method/seven-auxiliary-method scheduling fixture, caller-budget
abort without later transport and fixed endpoint/network/source semantics.
The scheduling fixture has zero transport latency; it demonstrates queue
behavior, not live recovery capacity. Independent review also checked that
wrapping the normal CLI for importable tests preserves its existing command
body and ordinary admission-state behavior.

## Short live failure and measured diagnostic gate

The combined-reader version was installed on the VPS with a graceful restart of
only the normal Envio consumer, retaining its existing admission journal. The
same 45 tests and API typechecking passed on the VPS. All four application and
source services remained active.

The next actual window stopped after three samples with Chef's
`WAIT_SOURCE_UNREADY`. The three recorded sample times also contained a
**24,651-ms gap**, exceeding the unchanged 20-second limit. No readiness proof,
capital capture, control mutation or new customer order followed. During that
short interval, the normal Base reader recorded three successful cycles, a
maximum cycle duration of 22,002 ms and **zero recorded HTTP 429 responses**.
That short result does not establish a passing five-minute window or resolved
provider throttling. Chef subsequently reported ready with the same generation;
Root again verified the complete unchanged financial snapshot and paused epoch.

The auxiliary export has variable size. Status supplies height H, while the
subsequent repeatable-read export can have a later through-height M. The
consumer independently checks all **M - H + 1 headers**, plus the other source
and SQL anchors. The failed attempt did not record the export's starting height
or header count, so extra headers are a plausible contributor, not a measured
explanation for the gap.

The next bounded correction uses auxiliary batches/rate **two/two**, keeping
normal observation at five/eleven. Private phase records retain range sizes,
method counts and elapsed durations so the next decision can use measured work.
A short diagnostic rehearsal must remain explicitly unqualified: it cannot
write a passing readiness proof or call activation. Only a subsequent complete
window may satisfy the existing admission gates.

Chef status reads may wait briefly for HTTP 503 or an explicit unready
checkpoint, with at most three reads and delays of 250 and 500 ms. Every read
shares the original cycle deadline. A successful HTTP response must match the
authorized project and generation before an unready status can be retried.
Other failures remain fatal. The eventual actual response must pass all status,
canonical, financial-history and source-freshness checks. Private wait records
do not refresh source timestamps, and an excessive sample gap now refuses
immediately instead of waiting for final window validation.

Root's actual short rehearsal ran for approximately 61 seconds with both readers
active. Its five exports contained **12, 8, 8, 5 and 12 headers**. Successive
sample gaps were **11,288, 11,372, 9,644 and 13,552 ms**. Export verification
took 6,268–10,684 ms; the Chef checkpoint canonical read took 526–547 ms, the
read-only SQL snapshot 120–235 ms and SQL/cursor canonical reads 1,342–1,412 ms.
These measurements confirm variable export size in this run and identify export
verification as its largest measured phase. They do not establish the exact
cause of the earlier uninstrumented gap.

During that same interval, the normal observer recorded **four successful
cycles, zero HTTP 429 responses and zero waiting cycles**, with a maximum
20,945-ms cycle. The maximum age of a previous SQL observation at the next
sample was 24,687 ms for Zcash and 42,155 ms for Base. No Chef status retry was
needed, so retry behavior is supported by tests rather than this live run.

The rehearsal completed with explicit `readinessQualified: false`, retained
only its private attempt journal and wrote **no output proof**. Root's review
accepted these measurements for proceeding to a full window; it did not accept
them as readiness, activation or settlement evidence.

Root verification passed **51 focused tests with zero skips** and API
typechecking. Eleven factory/helper tests cover independent queues, batch/rate
limits, original-deadline propagation, abort behavior, numeric RPC counters,
bounded status waits, identity and full-envelope rejection, and the exact
successive-gap boundary. Three private probe tests additionally verify its
reversible relationship to the candidate, absence of a passing proof and private
failure diagnostics. Independent review verified the frozen source and all
fourteen helper/probe cases. Normal observation and its journal were unchanged
for this correction; no service restart, migration or authority reset is needed.
