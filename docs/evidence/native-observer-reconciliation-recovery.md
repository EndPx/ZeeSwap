# Native observer reconciliation checkpoint

This records the isolated testnet application on 25 October 2026, following
the refund and zero-effect expiry described in
[the unfunded replacement checkpoint](native-unfunded-replacement.md).
It is not evidence of a successful new two-way swap circle.

After that code checkpoint, Root installed migration 0018 explicitly and verified
its committed transaction, stored function source, owner, security-definer search
path and execution privileges. Migration 0017 remained unchanged; SourceExposure
migrations 0015 and 0016 remained unapplied. The replacement API authority was
installed with the original amount, all-history acceptance caps and future-order
cutoff. No replacement quote was accepted.

One subsequent simultaneous source window passed 31 samples over 301,667 ms.
The local activation check refused its aged evidence before any runtime update.
A separate reviewed one-shot execution then started a new window. It stopped
after 15 samples because runtime control no longer matched the exact approved
paused version. Its capital, preflight and activation stages did not run, and
its durable execution intent was retained rather than replayed.

Runtime was paused in reconciliation at monotonic epoch seven. The existing
authority no longer authorized admission. The journal contained a generic Chef
failure and ordinary observations from both networks, without a recorded
observer-frontier conflict. That label alone cannot establish which component
caused the epoch change. The historical trigger remains unproven; a transient
unpublished-head race is a hypothesis, not a verified diagnosis.

## Actual read-only chain audit

Root stopped only the Chef application consumer, retaining its existing cursor.
Chef core, the normal Envio consumer and the API remained running. A private,
hash-pinned audit helper passed strict typechecking on the VPS and then ran
from 23:17:28.758 to 23:18:27.967 UTC on 24 October (25 October in Jakarta).
The helper used the restricted application worker connection in read-only
repeatable-read transactions. It did not open a wallet or mutate SQL.

| Evidence checked independently | Actual result |
| --- | --- |
| Retained native SQL headers | All 1,324 hashes matched |
| Retained Base SQL headers | All 114 hashes matched |
| Native cursor | Existing cursor matched its canonical header and source identity |
| Application checkpoints and finalized anchors | Both networks matched independently read hashes |
| Financial inclusion anchors | Original deposit, source refund and Base cancellation matched |
| Chef core | Before/after checkpoint hashes matched; generation and profile were preserved |
| Runtime and financial history | Exact paused reconciliation version and complete 39-row ledger snapshot unchanged |
| Additional Base rows during the captured interval | Zero |

Native verification included headers before the current account birthday, using
contiguous chunks of at most 1,000 headers with parent-link and sampled-head
rechecks. Base verification used batches of four with four methods per second
while the normal consumer remained active. All observed persisted hashes were
compared; the helper did not sample only the latest tips.

This audit establishes hash canonicality for the captured state. It does not
independently validate stored `block_time` or `finalized_time` values, prove the
historical error's cause, or cover headers appended after its captured prefix.
Freshness and canonical checks are still required before activation. No flag
was cleared as part of the audit, and no funded order was created.

The financial result remains one REFUNDED order, one EXPIRED_UNFUNDED order,
one discharged obligation, one confirmed refund operation, one done job and six
released reservations. The unfunded candidate incurred no transaction fee.
Original wallet and signing journals, closed sessions and the unused replacement
session are preserved. Raw receipts, memos, viewing material and private order
mappings remain outside Git.

## Observer correction and local verification

The reviewed correction distinguishes a typed sampled-head change from a
persisted-anchor conflict. A normal wait is allowed only before any SQL
publication attempt, with the changed height strictly above every retained
native SQL header, cursor, checkpoint, finalized height and financial anchor.
All retained hashes are independently rechecked in bounded dense chunks, then
the captured SQL state and cursor must remain unchanged. A conflicting SQL hash
at the cursor cannot be overwritten by the cursor's hash during this comparison.

Transport errors, timeout, a fork between dense chunks, a changed end-head or a
failed state reread preserve the original typed error and reconciliation path.
Errors after publication, changed generation, cursor, checkpoint and note
conflicts cannot become waits. Private fsynced diagnostics retain the phase and
exception details; public failures expose allowlisted codes and phases. A shared
runtime epoch change is labelled accordingly and does not identify Chef as the
incident's cause.

Root's final focused run passed 24 tests with zero skips across head-change,
cursor, anchor-header and live-runner suites; API typechecking also passed.
These are local behavioral checks, separate from the actual read-only chain
audit above. They do not prove that the old live incident followed the newly
recognized safe-wait path. Deployment and resumed observation are subsequent
operator gates.

## Remaining execution gates

The next continuation must bind an explicit Root authority to the exact current
runtime version, direction-specific owners, amount, all-history caps and expiry.
It must preserve the verified historical prefix, recheck current canonical
anchors and physical capital, complete the simultaneous source window and
commit a separately journaled monotonic runtime transition. Passing the audit
alone does not authorize an application reset or a new payment.

The new funded forward order, finalized Base payout, reverse escrow, shielded
payout, final Base acknowledgement and independent whole-circle reconciliation
remain pending. The stopped historical G5 soak is outside this task.
