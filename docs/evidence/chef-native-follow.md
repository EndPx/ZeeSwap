# Bounded native Chef follow: startup evidence

On 24 October 2026, the operator started the reviewed source-only bounded follow
on the isolated VPS. This establishes that the reviewed transport, protected
profile and native process started. It does **not** establish completed catchup,
a sustained healthy source window, application admission or customer settlement.
Those gates remain pending at the time of this record.

## Verified implementation and scope

The follower uses the installed, pinned `@zeer-dev/chef@0.6.1` official CLI
`main(argv, dependencies)` entry with a customized Prep client. Its public
[bounded client](../../indexers/zeer/bounded-prep-client.mjs) changes each outgoing
query to one block by clipping its upper bound and setting `limit: 1`. It
preserves the caller's filters, field selection, options and AbortSignal, and
returns the actual validated PrepClient response unchanged. It does not
manufacture receipts, continuation cursors, availability or timestamps.

The official project configuration, original account and birthday, source URL,
generation and installed 64-file Chef runtime were preserved and checked against
their pinned identities. The official runtime still validates contiguous page
coverage, epochs, block links, canonical headers, raw transactions, native note
classification and transactional checkpoint application. The same official main
retains its native receipt source across page iterations. This avoids the
operator pattern of launching a separate CLI/native source for every block; no
deployed performance improvement is claimed without a measured run.

The source supervisor holds the existing exclusive lifetime lock. Startup checks
that earlier writers are quiescent and independently verifies the current durable
checkpoint against the configured source. A fresh canonical `ready` or
`reconciling/source` prefix is admitted only when the catchup gap is at most
1,024 blocks. Reorg, blocked, identity-conflicting and noncanonical startup states
are refused. Admitting a source catchup process does not admit financial work.

The protected initial proof lives in service-owned private state, with exclusive
creation and restrictive file permissions; the operator pins its digest in the
root-owned configuration. No secrets-directory permissions were widened. The
reviewed follow supervisor reuses the finite supervisor's exact exported input
verifier, rather than maintaining a separate copy of the runtime checks.

## Source availability and failure behavior

The installed official CLI's temporary-source classifier includes:

- `isSourceUnavailable(error)`: a PrepError with HTTP status 429 or at least 500,
  or a Prep `ReorgError`.
- A PrepError whose code is `TRANSPORT_ERROR`.
- A DOMException whose name is `TimeoutError`.

In official `--follow` mode, these temporary failures wait and retry within the
same main invocation. A validated `ready: false` height response also reaches
the official source-unavailable handling unchanged, after the wrapper verifies
network, payload kind, epoch and source mode. Unavailable observations and source
reconciliation are recorded by the official runtime. No outer process restart
loop was added to the follow supervisor.

A `ready: true` response must still have a fresh source observation, at most six
blocks of source/archive lag and consistent heights. The wrapper's stale or
identity guard failures remain fatal. HTTP 413, authentication failures and
ordinary protocol/native errors are not made temporary by this customization.
A single block exceeding Prep's response limit can still fail closed; one-block
requests do not guarantee that every possible response fits.

Stop and bounded-window expiry send one SIGTERM to official main, permit a
15-second graceful close and then use the pinned Linux process-group/subreaper
cleanup if needed. Cleanup is acknowledged only after the owned group is absent.
Unconfirmed cleanup holds source ownership for operator intervention. New logs
and outcome journals remain private. No financial controller is activated by
the supervisor.

## Validation and operator observations

The public bounded-client tests passed **4/4**; the complete package tests passed
**6/6** and TypeScript checking passed. A separate private suite using official
main, the maintained native scanner, a controlled historical receipt and an
in-memory store passed **4/4**. It verified the expected receipt, reuse of one
scanner across three blocks, clean closure and malformed-raw refusal. These were
local tests, not deployed discovery-latency or settlement measurements.

The finite entry's direct availability tests passed **2/2**. They exercised the
actual PrepClient and official main: a fixture prefix committed before an actual
validated not-ready response, source reconciliation retained that prefix, and a
healthy invocation resumed without duplicate or missing blocks.

The follow startup/quiescence policy tests passed **4/4**, covering a 447-block
canonical source catchup, the 1,024-block boundary, refusal above that boundary,
reorg/blocked/noncanonical refusal and occupied prior-unit cgroup refusal. A
separate actual official-main `--follow` synthetic test passed **1/1**, processing
six contiguous one-block fixture pages before official IPC stop and store
closure. These tests do not prove deployed Linux supervision under failure.

Before applying the follow bundle, the operator independently reran the four
policy tests and the official-follow test successfully. The preceding finite
attempt had committed seven blocks before stopping on `HTTP_ERROR`; its journal
was retained and its owned group was confirmed cleaned. The operator then
independently verified the current canonical source-reconciliation prefix,
captured and pinned a new follow proof, and started the bounded follow with an
86,400-second maximum lifetime. The original finite files and journals were
preserved. The initial process was observed running with the native workload;
running-process status alone is not evidence of current source health.

The operator is responsible for the subsequent complete-gap proof and independent
continuity window. Verified follow exit requires a canonical ready checkpoint
within six blocks of the fresh source. Application observers, admission and
financial controls retain their own gates. No funded customer circle or completed
cross-chain settlement is claimed by this record.
