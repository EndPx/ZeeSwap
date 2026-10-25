# Application Chef fatal conflict: supervision correction

Recorded 25 October 2026. The application Chef observer is stopped pending an
independent all-persisted canonical audit. Financial preparation is on hold.
This document separates the observed conflict, repeated supervisor starts and
the local prevention change; it does not claim a repaired source or cursor.

## Actual incident observations

Root's application journal first recorded `CANONICAL_CHECKPOINT_MISMATCH` at
15:07:29 UTC in `TRAVERSE` before publication, followed by persistent
`CHEF_LIVE_CURSOR_REORG` in `VERIFY_ANCHORS`. The native application's systemd
restart count reached 209. A 16:06:11 UTC read showed paused/reconciling epoch
213; after Root stopped the application consumer at 16:07, the frozen readback
at 16:09:50 UTC showed epoch 217 and control transaction version 538330.

The application cursor and SQL checkpoint remained at 4540629, finalized at
4540620, with retained tip:

```text
0000407ce84f8804fb0baa33ee07355ebd39407b0c1bbe96edf9061bfe7d743f
```

Chef Core and Prep independently reported 4540746 and ready, without a Core
Docker restart. Healthy current source metadata does not establish that the
retained application cursor is canonical. The first tip mismatch and later
persisted-cursor conflicts require the independent audit; their underlying
cause is not inferred from these journal codes alone.

The full financial digest remained unchanged across 19 tables/70 rows, with
zero authorization rows, acceptance/dispatch disabled and reconciliation required.
The E10/E11 issuance basis is no longer current; no financial authority, window,
driver or payment may be issued/executed from that earlier basis. No new payment,
financial activation or G5 continuation occurred during this correction.

The Base application observer separately failed `ENVIO_ADMISSION_GAP` after
`FINALITY_BEHIND` while its provider's finalized view regressed. That path remains
a separate triage item; this Chef-specific change does not diagnose or repair it.

## Minimal prevention change

The existing eleven-code fatal reconciliation set is shared by the consumer's
SQL boundary and its exit classifier. A connected fatal conflict requests the
existing reconciliation function once per invocation, then exits 78. Unknown
acknowledgement is reported as unknown while preserving the original fatal
classification; it cannot fall back to an ordinary restartable exit one.
Ordinary transient/safe waits keep the existing loop behavior. No database
function, global reconciliation semantics, source checks or financial gate was
changed.

The shipped application systemd template and a dedicated drop-in set
`RestartPreventExitStatus=78`. Together with the existing restart policy, the
intent is to stop automatic repeated reconciliation requests and require
operator review. Root owns actual unit deployment and verification. The
[installation runbook](../../deploy/linux/chef-observer/README.md) preserves the
incident evidence and requires an isolated supervision test rather than forcing
a live reconciliation failure. Manual restarts remain explicit operator actions.

This is prevention of supervisor repetition after an already fatal refusal.
It does not identify the original canonical discrepancy, repair persisted
history, clear markers, advance a cursor, reset an epoch or authorize finances.

## Local verification and outstanding gates

The local tests exercise the exact fatal set versus transient/unknown errors,
one reconciliation attempt including unknown acknowledgement, the actual CLI
exit/allowlisted-output boundary and a separate-process import that must not
start the observer. Existing canonical-head/cursor tests protect safe waits and
publication boundaries. Root's actual systemd policy installation and controlled
restart-prevention verification remain separate pending operator work.
On 25 October the local focused run passed 27 tests with zero skips, including
the separate-process CLI import check, and full API typechecking passed. Diff
checking passed with source-file line-ending warnings only. No local systemd
unit was started and no live database was used by these tests.
The broader Chef/recovery/continuation regression run passed 86 cases with zero
skips and API typechecking passed again. Independent peer review passed all four
new supervision cases with zero skips and found no blocking defect. These are
separate local runs, not a combined count or actual systemd acceptance.

Root independently reran 25 focused supervision, canonical-head and live-runner
cases with zero skips. The current implementation preparation does not itself
change any live service, database, wallet or authority.

## Independent persisted-state diagnostic

The read-only VPS diagnostic completed at 16:20:13 UTC. It compared all 1,671
retained Native application rows and 267 Base rows, both checkpoints, cursor,
finalized anchors and financial anchors against independent chain reads.
Exactly one retained Native height, 4540629, conflicted with the canonical chain.
The contiguous stored common ancestor is 4540628; Native finalized 4540620
remained canonical. There were no financial-anchor or Base-anchor conflicts.
The complete persistent-state digest matched before and after the diagnostic.

This establishes the later persisted orphan; it does not establish the exact
cause of the first prepublication mismatch. The result is a diagnostic, not a
repair attestation or financial authorization. A separately reviewed bounded
metadata repair, actual policy installation and subsequent ordinary following
remain required. The financial snapshot and paused epoch-217 controls remained
unchanged. Earlier passing source or application snapshots cannot replace those
current checks.
