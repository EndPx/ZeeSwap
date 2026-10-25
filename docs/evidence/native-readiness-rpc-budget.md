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
