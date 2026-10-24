# Bounded admission after audited reconciliation

This implementation follows the [actual canonical audit](native-observer-reconciliation-recovery.md)
of the isolated native testnet application. The audit found no conflicting hash
in its captured state. The historical trigger for epoch seven remains unresolved.
A passing implementation check does not clear that incident or prove a new swap.

The Chef correction from commit `611b0c0` was subsequently installed on the VPS
from four hash-verified Git paths. VPS typechecking and all 24 focused tests
passed. The new persisted-state SQL query also passed a real read-only worker
query. Root restarted the ordinary Chef application consumer from its existing
cursor; advancing observations and fresh checkpoints were observed while epoch
seven and the exact paused reconciliation version remained unchanged. No cursor
or account was reset.

Migration 0019 introduces an immutable admission row issued only by the local
administrator. It binds the authority file's SHA, active epoch, two closed parent
orders, direction-specific owner hashes, all-history caps, amount and expiry.
The API can execute the admission function but cannot insert, update, delete or
truncate these rows. Worker and reader roles have SELECT access. The owner has
explicit SELECT/INSERT privileges, and a trigger also rejects row mutation.

The controller can issue this row only alongside its reviewed runtime
compare-and-swap, in the same transaction. It first requires the exact paused
epoch and transaction version, reconciliation required, the Root audit, unchanged
closed financial history, installed function source and privileges, fresh capital
proofs and the simultaneous source window. The transition advances the epoch by
one; it does not reset an epoch or rewrite observed chain history.

If the COMMIT response is unknown, a fresh connection reads transaction status,
the exact runtime epoch/version and the authorization row. Confirmation requires
all three, including the row's creating transaction ID. Enabled booleans alone
cannot prove success, and the original intent is reconciled without replaying it.

The API supplies only the quote ID and its exact loaded authority hash. SQL
derives the epoch, parents, owner for that direction, caps and expiry from the
immutable row. This removes the need for a new function with a different literal
epoch after every audited control transition. Migrations 0017 and 0018 retain
their original bytes and version-specific behavior.

The bounded financial scope remains:

| Condition | Required scope |
| --- | --- |
| Complete prior history | One REFUNDED order and one EXPIRED_UNFUNDED order; neither is excluded from counters |
| Accepted-order caps | Three forward orders and one reverse order across all history |
| New order amounts | 100000 zatoshi and 100000 atomic mockUSDC, with fixture pricing |
| Future forward cutoff | Forty blocks; existing accepted cutoffs remain unchanged |
| Payer preparation/broadcast margin | At least twelve measured blocks |
| Reverse acceptance | Only after the new forward is SETTLED and its reservations are released |
| Source readiness | At least 300 seconds of simultaneous coverage, at most 60-second age and 20-second gaps |
| Financial closure | Complete actual 39-row ledger snapshot and exact closed-order invariants |

The audit protects an exact set of archived `(network, height, hash)` rows.
Every row must remain present and unchanged. A normal observer may add a newly
finalized canonical header at a previously unrecorded height below the old
maximum; a positional first-N comparison would incorrectly reject that case.
Those later rows remain subject to the existing canonical publisher, epoch
fencing and fresh readiness checks. The old audit does not retrospectively
attest to headers that did not exist in its captured set.

The R3 harness preserves the original refunded session, the expired session and
the unused revoked R2 session. It rejects all three prior payer-journal paths
and uses a distinct state and signing-journal namespace. New authority issuance
does not rewrite an earlier session or erase an execution intent.

Root's final focused TypeScript run passed 40 tests with zero skips, and API
typechecking passed. Two real PostgreSQL cases passed with zero skips on the
existing isolated regression branch. They cover exact stored function source,
security-definer settings and privileges, expiry, directional ownership,
immutability, all-history limits and two concurrent clients with one winner.
The concurrency case uses a different authorized epoch, demonstrating that the
new function does not depend on a literal epoch. Invocation-owned schemas were
removed; these tests did not modify the live application database. Independent
review verified the 15-file byte manifest and passed 11 focused pure tests.

At this publication checkpoint, live migration 0019 installation, new Root
authority issuance, fresh readiness, monotonic activation and the actual funded
TAZ to mockUSDC to shielded TAZ circle remain separate operator gates. No new
funded order is claimed. SourceExposure migrations 0015/0016 remain unapplied,
the historical G5 soak remains stopped, and private wallet material, full memos,
receipts and order mappings remain outside Git.
