# Closed Native tip recovery

On 1 November 2026 the public API was `reconciling`: the Native consumer had
stopped with `CHEF_LIVE_SOURCE_REGRESSION` and subsequently
`CHEF_LIVE_CURSOR_REORG`. Its last SQL/cursor height was 4,564,767. Independent
header reads verified that only this unfinalized tip changed. Its parent at
4,564,766, finalized anchor at 4,564,758, and all four distinct financial anchors
still matched. Chef itself was healthy and ahead of the stopped consumer.

The repair kernel accepts only the verified sibling replacement above finality.
It compares the original row and checkpoint versions, preserves scan height,
finalized height and the original observation clock, and retains the existing
reconciliation triggers. Financial records remain unchanged. Durable original
transaction evidence controls the SQL-to-cursor boundary; an uncertain outcome
is resolved before another mutation.

The protected operator collects bounded linked ranges before publishing a
genuine current Native tail. It refuses positive observations in this closed
metadata path and independently rechecks financial anchors. Existing archive
rows are retained. A fixed retained-header projection avoids treating archive
size as a lifetime recovery limit.

The optional watchdog hook requires fully closed paused books, no financial
worker or lease, an inactive Native consumer, fresh Base state, and no unresolved
Source publication. Only an exact completed recovery permits Native startup.
It leaves the healthy Base consumer running. Financial recovery follows on a
later cycle after real Source freshness returns.

Implementation checks: three focused Native kernel tests, API typechecking and
44 watchdog tests passed. The watchdog tests ran under Ubuntu 24.04 WSL and
cover paired protected pins, funded/unknown state, pending outcomes, changed
state, and Native-only restart. Actual SQL fixture and deployment results are
recorded separately below when complete.

The disposable PostgreSQL fixture passed 14 checks and fully rolled back. It
verified the original enabled triggers, the expected two-epoch reconciliation
change, exact header/checkpoint compare-and-swap, unchanged scan/finality and
observation clocks, and unchanged hashes/counts for all 19 financial tables.
Both stale-row-version cases refused. No Main database or service was changed
by this fixture.

The first actual recovery repaired the tip and collected linked packet proofs,
but refused final publication when the healthy Core checkpoint advanced during
verification. A separate closed-metadata opt-in now accepts at most six blocks
of forward movement while rechecking the selected canonical target after the
Core read. Generation changes, regressions, forks and larger movement remain
refusals. Existing callers retain exact-tail matching by default. All 20 linked
recovery tests and API typechecking passed.

The watchdog also handles an inactive Native process before a still-fresh SQL
checkpoint can authorize a financial restart. It fences and rechecks an active
but fully closed worker before stopping only that worker; funded or unknown
books cannot take this path. Recovery no longer depends on waiting for the old
checkpoint to become stale. All 47 watchdog tests passed under Ubuntu 24.04 WSL.

## Actual recovery and application verification

Root repaired the single tip in transaction `850206`, preserving its scan and
finalized heights and original observation clock. The first final-tail attempt
refused a moving checkpoint before publication. The v2 operator retained and
independently reverified completed coverage, then published through block
4,567,964 with finalized height 4,567,955 in transaction `852468`. Six linked
packets covered the suffix. Financial fingerprints remained unchanged across
both committed boundaries, and both original-XID/file completions were exact.

The ordinary Native consumer resumed real observations. The enabled supervisor
then appended the new execution generation and started the financial worker
automatically; its log recorded `WATCHDOG_CLOSED_WORKER_START_REQUESTED` and the
worker recorded `POLICY_IDLE_CAPITAL_VERIFIED`. A later supervisor cycle reopened
intake. The public API was `ready` at **11:55:50 WIB on 1 November**, with no
active order and both directions available.

A fresh headless browser verified the real production bundle and both quote
dialogs with zero JavaScript errors. A separate actual frontend `ZeeApi.create`
request returned HTTP 201 and decoded a `QUOTED` forward request for 100,000
zatoshi to 100,000 atomic USDC. Exactly one POST was made. Its token, original
idempotency request and full response remain Root-only. The quote was not
accepted, funding instructions were absent and active orders remained zero.
This is real quote-creation evidence, not a new funded settlement.

The recovery entry and configuration are private, byte-pinned server artifacts.
The timer and existing ordinary services remain enabled. Supported automatic
repair is the verified single unfinalized sibling case with unchanged finalized
and financial anchors; deeper forks or changed financial evidence remain
refusals. No reboot, funded reorg or deliberately injected outage was performed.
