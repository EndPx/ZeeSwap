# Current operator browser pilot: live testnet admission

29 October 2026. This records Root's actual deployment observations. It is a
bounded testnet opening, not a mainnet deployment or a new settlement claim.

At **12:40:42.659173 UTC**, the public Main API returned `status: "ready"`, with both
directions enabled, two accepted-order slots remaining per direction, zero active
orders, 32 quotes remaining and input amount 100000 atomic units. The browser
pilot route is **0.001 TAZ → 0.1 USDC**, with one active order globally.
These counters describe that observation; they are not a promise that capacity
remains unused after the user begins trading.

Root's R6 current-source activation committed as original PostgreSQL transaction
**99985**, opening epoch 236. Its explicitly authorized qualification mode was
`CURRENT_SOURCE`: one actual coherent current-source proof, with no claim of a
300-second stability window or complete historical-header readiness. The
financial worker remains on its pinned 6ebb execution and original financial
manifest. The existing principal/fee budgets, two-per-direction caps, canonical
and finality checks, journal/receipt guards and original-XID/CAS boundaries remain
in force.

After activation, the separately reviewed R4 quiet-event catch-up verified
**Base Sepolia blocks 51,750,805 through 51,774,678**, in 24 contiguous packets. It
compared direct SDK event reads with independent unfiltered contract logs and
required both event sets to be empty throughout that range. The receipt and
proof have abbreviated digest prefixes `6d85a8…` and `53ecd…`, respectively.
Its declared financial action was false: it preserved the active unused policy,
financial books and prior opening scope while completing the original metadata
checkpoint/filesystem boundary. This is `CLOSED_EVENT_COVERAGE`; it does not
claim that every intervening historical header was individually audited.

The new normal Source observer is active with a fixed read-start target. It
checks the complete selected range rather than chasing a moving SDK tip, while
retaining the Source clocks, independent canonical checks, complete event/log
comparisons and finite range/read budgets. The separate versioned PostgreSQL
shim now allows the unchanged financial worker to use the verified VPS primary
transport. Root observed **two actual `POLICY_IDLE_CAPITAL_VERIFIED` worker
ticks** before reporting the public API ready. Unit startup alone was not used
as a readiness claim. The narrowly scoped permission repair has its own
[evidence record](policy-owner-keyshare-acl-repair.md).

Root also inspected the served frontend in a separate hidden browser tab without
changing the user's tab. The DOM showed input 0.001, output 0.1, an enabled
**Review swap** button and **“Ready for a bounded testnet quote”**, with two slots
remaining, zero active orders and maximum concurrency 1. The inspection connected
no wallet, accepted no quote and created no transaction. It establishes the
deployed interface's available state, not wallet interoperability or settlement.

No new user payment, payout or cross-chain settlement is claimed in this record.
The user was notified that the bounded route was available and can initiate the
transaction from their own wallet. Old G5 campaign actors and their retained
histories are not resumed or reclassified by this opening.

This milestone changed documentation only. Verification was limited to the
recorded live observations above, repository/plan review and a whitespace check;
no service restart, Source probe, observer test or financial action was performed
to prepare this document.
