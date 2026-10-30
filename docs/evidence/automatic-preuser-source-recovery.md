# Automatic pre-user Source metadata recovery

Prepared 31 October 2026 (Asia/Jakarta). This records implementation and local
verification. Deployment, actual Source coverage, metadata publication and
continuous runtime operation require separate Root execution evidence.

The user requested services that recover automatically after ordinary Source
failures. A separate Root-pinned automatic purpose now permits metadata-only
Base catch-up while the existing current financial policy is unexpired and has
no current quote, admission or process journal. It does not extend expiry,
allocate capital, reset quotas, insert a policy, change control, sign a payment
or claim that an active process has established Source freshness.

The Root authorization binds the current policy bytes, exact active control
epoch/xmin, original financial digest, existing expiry and remaining one forward
attempt, two reverse attempts and 31 quotes. The exact current lineage retains
four policies, three predecessor links, four runtime rows and one renewal row.
Only the original ancestor's one expired-unfunded forward admission and quote
may exist across that lineage. Its deposits and holds must remain absent. Full
financial books must match the policy's original approved digest. Global
unresolved orders, operations, jobs, pending signing, current process journals,
new interactions or an execution-time worker lease refuse recovery.

The automatic kernel is separate from the historical epoch-239 recovery. It
uses complete raw SDK event queries and independent unfiltered contract-log
coverage, with at most 500,000 blocks per recovery, 1,000 blocks per packet and
a final actual fresh SDK tail of at most 5,000 blocks. Every SDK event and
independent log must be absent. Canonical producer/independent boundaries,
receipt anchors, packet seams, generation, revision and finality checks remain.
The final observation timestamp comes from the actual final SDK selection.

Each attempt captures the actual Base and Native checkpoints, retained headers,
complete financial/lineage/runtime rows and sealed admission bytes after the
ZeeSwap consumers and idle financial worker are stopped. Native remains frozen
through that attempt. Metadata publication takes the existing locks on one
Main connection, durably records its original transaction ID before writes,
uses the original checkpoint CAS and changes only Base observation anchors,
checkpoint and matching sealed admission frontier. Whole-state reconciliation
checks preserve current control, original policy expiry, quotas, Native state
and financial history.

`recover-automatic-testnet-source.ts` defaults to inspection. Inspection makes
no Source RPC request and creates no files. Its stop qualification derives from
the financial and process-journal checks; a visible idle worker lease is allowed
only for inspection after matching the exact current runtime backend PID. Actual
recovery requires no worker lease and explicit Root `--execute` authorization.
Inspection also reports actual freshness of both SQL checkpoints and whether an
original publication is pending or a manual-review marker exists.

The supervisor durably points to one original attempt. An existing publication
intent is reconciled through its original transaction and sealed candidate
before any new attempt. An exact acknowledgement permits ordinary consumers to
resume. A recognized transient read failure before publication preserves all
attempt evidence, creates no new checkpoint and permits ordinary consumers to
resume for the next supervised retry. A pending intent keeps consumers stopped
until exact reconciliation. Unexpected events, changed financial state or an
unclassifiable original operation create a sticky manual-review marker; the
supervisor does not clear it automatically.

The single watchdog and timer are owned by the separate service-supervision
change. This recovery command does not start, stop or modify Core Chef, Core
Envio, wallets or financial execution. The watchdog must not signal an active
financial worker. It may pause only ZeeSwap's ordinary consumers during a
qualified closed recovery, honor `resumeOrdinaryConsumers`, and start the
financial worker only through its existing fresh-Source pre-user gate.

Local verification passed:

- API TypeScript check and `git diff --check`.
- 29 focused tests covering the new authority/replay decisions, previous empty
  and closed recovery kernels, and the existing idle financial restart guard.
- Private Root configuration-helper Python syntax.
- Read-only local evaluation of the new financial/lineage guard against Root's
  protected captured current snapshot. Only a pass marker was printed.
- A synthetic no-RPC event-coverage proof using those protected financial books
  with synthetic chain headers and clocks; proof qualification and validation
  passed. This is local simulated coverage, not a live Source result.

Protected snapshots, Root authorization/config files, raw attempt packets,
sealed candidates, transaction intents and process journals stay outside Git.

A shared Root-owned recovery-active marker now blocks the financial worker's
ExecCondition throughout consumer pausing, collection, SQL commit and sealed
admission acknowledgement. Both the direct supervisor and operator verify its
exact Root config/policy scope and mode-0600 bytes. The supervisor removes only
its exact marker after an exact acknowledgement, a proven no-intent transient
read failure or a qualified no-recovery-needed result. It preserves the marker
for a pending or ambiguous original operation and manual review. Completion
reconciliation verifies and reuses an existing exact durable receipt, rather
than overwriting it when an acknowledgement was lost.
