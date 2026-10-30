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
an initial actual SDK target, followed by one fresh SDK final-tail selection,
with a 250,000-block total ceiling and a 15-minute collection deadline. Each interval queries raw SDK
events and independent unfiltered settlement-contract logs. The independent
1,000-block query uses the existing batch of five contiguous 200-block requests.
Any event refuses publication and requires a separately reviewed explanation;
this implementation has no event allowlist and drops no event. Dual canonical
boundaries, packet seams, retained receipt anchors, actual SDK generation,
actual per-packet processor clocks and finality remain required. Historical
coverage ends immediately before the initial target. A separate actual fresh SDK
selection then defines the final contiguous tail of 1 to 5,000 blocks; it uses the
same raw SDK and independent log checks in intervals of at most 1,000 blocks.
The published observation timestamp must equal that final selection's actual
processor timestamp. The initial state remains recorded with its original
clock, even when historical collection makes that clock too old for admission.
No observation time is replaced with local time to make the source fresh.

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
- Seventeen tests across the original empty-policy recovery and the new closed
  lineage recovery. These cover complete intervals, unexpected SDK/log events,
  changed books/leases, canonical forks, incomplete proofs, finality regression,
  exact R15 scope, original-XID intent-before-CAS ordering, lifetime/expiry/link
  rejection and Native-state reconciliation. Added tests cover a 155,032-block
  historical proof, a retained old initial clock with an actual fresh final
  selection, a fabricated publication timestamp, a missing or nonempty final
  tail, oversized history or tail, changed generation, and an advancing final SDK
  target with three contiguous tail packets.

Private Root helpers are intentionally outside Git. Preparation reads protected
selectors and creates a seed configuration; the CLI `prepare` reads actual SQL
state and returns a pinned configuration without Source RPC requests. The
reviewed run helper collects and publishes once, then leaves observer restart
to Root. Root must record any actual execution result separately.

Root reported the first actual collection refused `FIXED_COMPLETE_RANGE` before
proof or intent creation: the observed gap was approximately 155,000 blocks,
exceeding the initial 50,000 assumption. The R2 resource amendment increases only
the historical read bound to 250,000 and separates historical clocks from the
actual fresh final-tail clock. It changes no financial cap, lifetime counter,
expiry, policy, paused control or payment authority. A new Root preparation is
required after the independently reconciled Native catch-up; the refused R1
baseline and any partial artifacts remain retained. This record does not claim
R2 live execution or source readiness.

The user subsequently authorized a new 24-hour policy with the same remaining
one forward attempt, two reverse attempts and 31 quotes. This metadata CLI may
prepare and publish against the already expired d699 parent only when its config
pins a fresh Root-owned mode-0600 authorization validated by the shared
`ROOT_RENEW_EXPIRED_POLICY_24H_SAME_QUOTA` validator. It rechecks that raw pin,
finite authorization window, exact paused control and metadata-only permission
at state reads and publication fences. Without that authorization, the original
expired-parent refusal remains. This exception writes no policy or predecessor,
changes no original expiry, and enables no financial admission. A separate
reviewed policy-renewal commitment remains necessary for financial availability.
The added test rejects absent/stale authority, reset quota, financial permission,
wrong control/parent and duration changes; successful validation preserves the
original expired policy and authorization unchanged.

The historical resource ceiling remains 250,000 total blocks. Root must stop only
the ZeeSwap Native consumer while taking the new baseline and collecting and
publishing Base coverage, then reconcile exact publication acknowledgements
before resuming both ordinary consumers. Core Chef and Envio are unchanged.
