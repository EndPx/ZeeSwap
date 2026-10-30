# Closed current-policy lineage event catch-up

Prepared 30 October 2026. This is an implementation and local verification
record. No live collection, metadata publication, service restart, activation,
payment or settlement was performed by this coding task.

The separate `ROOT_CLOSED_CURRENT_POLICY_LINEAGE_EVENT_CATCHUP` purpose admits
only the paused current policy at epoch 239/xmin 250387. Its immutable lineage
has two policies, one predecessor link, one lifetime quote and one forward
admission whose order is `EXPIRED_UNFUNDED`, with no policy deposit, active order,
global work or worker lease. Both policies retain the original expiry
`2026-10-30T08:13:20.732Z`. The previous empty unused policy purpose and its
epoch 236 guard are unchanged. Previously collected quiet coverage cannot be
replayed as this current baseline.

Root preparation pins the actual financial books, complete policy/link/quote/
admission/runtime rows, Native checkpoint, Base checkpoint, retained headers,
sealed admission bytes and original R15 scope. The implementation retains the
legacy books and does not infer that all historical orders or deposits are new
pilot funds. It preserves the lifetime capacities of one forward attempt, two
reverse attempts and 31 quotes. The exact original successor receipt and its
committed transaction are checked separately from current paused control.

Collection covers every interval from the retained checkpoint overlap through
one actual SDK target, with a 50,000-block ceiling. Each interval queries raw SDK
events and independent unfiltered settlement-contract logs. The independent
1,000-block query uses the existing batch of five contiguous 200-block requests.
Any event refuses publication and requires a separately reviewed explanation;
this implementation has no event allowlist and drops no event. Dual canonical
boundaries, packet seams, retained receipt anchors, actual SDK generation,
original processor clock and finality remain required. No observation time is
replaced with local time to make the source fresh.

Publication changes only Base observation anchors, its checkpoint and the
corresponding sealed admission frontier. It takes the existing operator,
observer and worker locks, durably records the original XID before writes,
uses the original checkpoint xmin and fields in its CAS, and classifies the
exact resulting state before commit. All other state, including Native
checkpoint, runtime history, policy rows, counters, financial books and paused
control, must match exactly. Unknown acknowledgements use `finish` against the
original journal; an existing intent refuses a new publication. Ordinary source
operation and financial activation remain separate operator actions.

Local verification passed:

- API TypeScript check (`tsc --noEmit`).
- Thirteen tests across the original empty-policy recovery and the new closed
  lineage recovery. These cover complete intervals, unexpected SDK/log events,
  changed books/leases, canonical forks, incomplete proofs, finality regression,
  exact R15 scope, original-XID intent-before-CAS ordering, lifetime/expiry/link
  rejection and Native-state reconciliation.

Private Root helpers are intentionally outside Git. Preparation reads protected
selectors and creates a seed configuration; the CLI `prepare` reads actual SQL
state and returns a pinned configuration without Source RPC requests. The
reviewed run helper collects and publishes once, then leaves observer restart
to Root. Root must record any actual execution result separately.
