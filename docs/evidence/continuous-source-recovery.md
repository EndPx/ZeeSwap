# Continuous closed-state Source recovery

31 October 2026. This implementation extends the separate Root metadata
recovery path. It does not authorize signing, payouts, policy resets, changing
source identity or changing the original financial worker's execution bytes.

Source authority version 4 requires a new protected continuous-mode authority,
its exact SQL authorization digest and the pinned continuous inspector. It
retains the original closed-recovery parent, profile, policy, activation XID,
transport identity and per-campaign bounds. Versions 1, 2 and 3 retain their
existing qualification branches and reject nonempty event packets.

The continuous inspector independently qualifies fully closed financial books
and every original terminal journal in bounded pages. Source recovery also
requires the financial unit to be inactive or failed with `MainPID=0`, no
foreign financial/operator lease, paused admission and dispatch, and no active
financial order. During publication the inspector reuses the actual writer's
repeatable-read transaction and observer mutex. It excludes only that actual
backend from lease checks.

The Source state fingerprint reads every financial row, quote binding and
admission binding in ordered 128-row keyset pages. It records counts and SHA-256
commitments rather than truncating lifetime history into fixed-size arrays.
Current checkpoint headers remain compact; every retained monetary canonical
anchor is independently checked in pages. The original checkpoint headers are
also retained during original-XID finish so that the exact permitted metadata
delta remains reproducible after a restart.

Each bounded raw SDK packet must exactly match all independent contract logs,
including event positions, topics, data and current canonical block headers.
Nonempty packets qualify only when every event matches an already finalized
terminal order whose original signed bytes, encrypted SQL receipt and journal
inventory were authenticated. Supported trade events are reserve, pay, funding,
commit, settlement, cancellation and refund. Unknown inventory activity,
unmatched events, pending or funded orders, changed receipts, signatures,
canonical anchors or financial fingerprints remain blocked for review. This
path observes existing closed trades and publishes only Source metadata.

The maximum campaign remains 500,000 blocks, with 1,000-block packets, a final
tail of at most 5,000 blocks, the existing deadlines, exact admission scope and
original transaction-ID reconciliation. A successful local test is not remote
activation or a continuous availability guarantee.

Local checks cover historical counts beyond the earlier quote and row limits,
all-table fingerprinting beyond page boundaries, terminal payout receipt and
signed-byte mismatches, unknown events, exact SDK/log equality, missing logs,
packet tampering even after digest recomputation, and original-XID metadata
classification. Legacy Source and event-first verification tests remain part
of the focused run: all 27 tests passed, and API typecheck passed. Operator
deployment and actual end-to-end recovery evidence
must be recorded separately.
