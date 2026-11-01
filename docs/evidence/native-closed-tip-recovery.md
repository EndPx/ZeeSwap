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
