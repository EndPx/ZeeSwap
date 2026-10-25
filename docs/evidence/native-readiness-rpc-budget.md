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

The new change reduces only the auxiliary readiness reader from batches of ten
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
