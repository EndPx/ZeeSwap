# G2 database foundation evidence

Date: 2026-10-14 (Asia/Jakarta).

This records the database-foundation milestone. Later API/scanner integration
added migrations 0006–0008 and isolated regression fixtures in a third branch;
see [the newer evidence report](g2-api-scanner.md) for current status.

User authorized database implementation after supplying Neon project
`raspy-truth-63998651`. Five versioned SQL migrations were applied and tested on
development branch `br-solitary-flower-ao8ccjex` (`zeeswap-g2-database`), then
applied to the previously empty user-selected primary branch
`br-empty-meadow-aowxzfl5` (`production`).

## Observed results

| Check | Result |
| --- | --- |
| Direct node-postgres connection | Certificate-verified TLS 1.3; PostgreSQL 18.6; `neondb` |
| API and worker pooled logins | Separate restricted logins connected successfully with verified TLS |
| Primary migrations | 5 checksummed migrations installed |
| Primary application tables | 15 tables under schema `zee` |
| Primary business data | 0 quotes, orders, deposits, operations and jobs; 0 nonzero inventory accounts |
| Primary controls | `accepting_orders=false`, `dispatch_enabled=false`, `reconciliation_required=true` |
| Migration rerun | Existing checksums verified; no duplicate migration application |
| TypeScript check | Passed |
| Pure unit tests | 4 passed |
| Live Neon integration tests | 31 passed |

Integration tests exercised actual PostgreSQL transactions and separate
connections, not an in-memory substitute. Coverage included:

- Exact amount parsing, fractional rejection and fixture conversion in both directions.
- Authenticated encrypted quote access, immutable terms and expired quotes.
- Inventory/fee reservation rollback, capacity limit and concurrent oversubscription.
- Deposit identity replay/conflict, copied memo/wrong receiver, transparent funding.
- Whole-principal under/over/late refund obligations and independent extra deposits.
- Canonical inclusion, 9/10-confirmation boundary and Base finalized-head checks.
- The exact Base funding cutoff and immutable 7,200-second cancellation delay.
- One operation per deposit; one payout per order; no on-chain authorization before G3.
- Balanced append-only journals and customer funds kept separate from operator inventory.
- Unfunded expiry only after reconciled scan depth; late discovery after release goes to review.
- Stale observers, canonical hash changes and checkpoint rewinds pause processing.
- Expiring/fenced leases, stale-owner rejection and recovery-mode invalidation.
- Restricted role permissions through real pooled logins.
- Connection loss rolls back an uncommitted quote; a subsequent connection succeeds.

## Implementation details that affect interpretation

The initial suite found two timing issues: separate calls to `clock_timestamp()`
could put expiry microseconds beyond a strict 120-second window, and JavaScript
Date precision differed from PostgreSQL microseconds at the Base deadline. Quote
creation now uses one materialized timestamp; Base cutoff/cancellation times are
defined in whole seconds. The final suite passed after these corrections.

An idle-connection failure during the first run also exposed the need for a pool
error handler. Failed idle clients are discarded; active transaction failures
still propagate and are rolled back. The later disconnect test verified rollback.

The G2 test data is synthetic and lives only in the development branch. On test
completion, reservations were released, synthetic inventory was zeroed and
processing was paused. Historical test quote/event rows remain deliberately
preserved. No real G1 wallet receipt or private memo was copied into Neon.

Private credentials and encryption/lookup keys reside in ignored local operator
files and `api/.env`, with Windows ACLs restricted to the current user and SYSTEM.
Their values are omitted from this report and Git. Runtime logins have no direct
inventory/ledger/control mutation rights; migration credentials are separate.

## Scope

This completes the database foundation requested in this turn. It does not close
all G2 integration gates or prove a cross-chain payment. The database trusts the
future validated observer adapter; no scanner-to-Neon service, HTTP API, Base
contract, on-chain exclusion attestation or payout worker was deployed.

Recovery controls were exercised in PostgreSQL. A real Neon historical restore
combined with an independent signer journal, automated funding reconciliation,
on-chain payout/refund race handling and a full settlement lifecycle remain to
be tested with the later services. Queued operations are evaluation work only;
on-chain authorization is structurally disabled.

Reproduction: [API database guide](../../api/README.md).
