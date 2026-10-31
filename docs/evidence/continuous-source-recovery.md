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

## Actual metadata activation

The Root operator activated the protected Source v4 and supervisor metadata on
31 October. The Source authority SHA-256 is
`55a30490437b4b8da15e04a6f941ce870a12be96038ba358b0a11acb48d212af`;
the Source configuration SHA-256 is
`07208f999917a73afb2869f18587ebf6a08a2def3166dbbc55f64ea4ac2cbfde`.
Its 87 code pins bind the reviewed Root operator release
`755c4218f020e74178b09015fb7e24adc55be132`. The supervisor configuration
SHA-256 is
`3fea5c017de775a6d55956def288d433eedacf9f1db4bf964ac8329615a57006`.
The atomic environment selector switch was verified at SHA-256
`f54ad50e063ed24b82f0874b844e72411a41f85225199b1baabd9b282783b7e5`,
and the supervision timer was active afterward.

The financial release remains separately bound to
`d69ac905ea51f713b66cfd82e04457686cedc952`, R2 worker configuration
`f5b8fd87d022354300a6fb23122568a3db2bf26f50ce345ec05ceaa3339ce942`.
The actual watchdog credited one previously finalized proceed and subsequently
reported `WAIT_EXISTING_WORKER`. The bounded operator snapshot around 08:17 UTC
(15:17 WIB) showed Base height 52563758 with a 20-second observation age and
Native height 4562607 with a 12-second observation age. The Root operator also
verified the public v5 availability response and both direction dialogs through
GET-only browser checks. These observations establish the recorded activation
and readiness snapshot, rather than a continuous availability measurement.

Staging and activation of this Source v4 metadata did not restart either Base
or Native observer units. The earlier ordinary Native archive-growth fix in
this work was a separate activation. This Source v4 activation did not execute
a new eventful catch-up campaign, crash/reboot recovery or reorg drill. The 27
local checks above remain implementation evidence, not a live campaign result.

Ordinary Native observation still retains its existing 128-financial-row and
500-anchor guards; ordinary Base observation retains its 500-anchor guard.
The continuous catch-up path pages its own historical proofs, but that does not
remove these ordinary-consumer guards. Actual allocated liquidity and fee
budgets also remain finite. No indefinite funded-history or unlimited-trade
claim is established by this activation.
