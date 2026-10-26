# Market-priced quote and payout preparation — 26 October 2026

The user explicitly superseded display-only pricing for **new quotes**. This
milestone implements a separate market policy and exact price-lock path through
quote issuance, SQL acceptance, private views, concrete worker and native payout/
refund guards. Earlier fixture orders and their agreed amounts are preserved.
The standalone read-only market-reference process is unchanged.

## Implemented boundaries

- Own fixed Kraken sampler, with both source legs and no browser price authority.
- Conservative selected twelve-decimal bid / inverse ask, exact 8/6-unit integer
  output floor, fixed source/destination bounds and zero protocol fee.
- Positional snapshot digest, immutable SQL snapshot/mapping and recomputed output.
- Worker-only publication; API cannot forge snapshot, mapping, permit or admission.
- Actual database-clock freshness at issuance/acceptance; accepted-time historical
  validation for all later reads/payments, without provider refresh or repricing.
- Atomic exact destination principal/both fee reservations, real inventory checks,
  one global unresolved order, two admissions per direction, 32 quotes and Root
  physically backed aggregate destination budgets.
- Explicit private Linux API selector and a concrete Root worker using actual
  capital capture/provenance, targeted forward dispatcher, new native market
  reverse and full-source refund factories, late canonical/lease/epoch guards,
  durable originals and independent recipient verification kernels.
- Separate market refund SQL/dispatch/capital provenance, preserving the original
  permanent cancellation-before-refund and full actual source principal rules.

No old SQL migration, historical quote row, fixture equality or legacy native
request validator was rewritten. Migration 0023 does not depend on bridge 0022.
It uses only the already shipped core/0020/0021 foundation; installation must skip
unrelated future 0015/0016 and bridge 0022.

## Executed local verification

The pure market-pricing suite passed **9/9, zero skips**, covering two-way units,
USDC depeg, output/input bounds, exact expiry, historical acceptance-time use,
altered source/digest, positional property-order independence, positive decimal
parsing, unchanged fixture equality and the smallest legal market-sized capacity.
The maintained read-only provider's 16 cases remain passing. The native owner's
independent Node/Python and Python/legacy regressions are recorded separately in
`market-native-protocol.md`; those use explicit synthetic raw transactions.
API typechecking passes with all backend, frontend and native integration imports.

The final combined local regression run passed **46/46, zero skips**: the nine
market-pricing cases, sixteen read-only provider cases, four independent
Node/Python market protocol cases and seventeen existing API unit cases. These
are the same suites counted together, not forty-six additional unique cases.
The native owner separately reports **86 Python cases passing** (eighteen new
market cases plus sixty-eight maintained native/fixture/bridge regressions).
A read-only peer inspected the SQL, repository, HTTP, entrypoints, capital and
refund paths and independently passed thirteen market/Node-Python cases; it
reported no confirmed P0/P1 defect. Peer inspection is not SQL execution or live
wallet qualification. The scoped diff whitespace check also passed.

The real local Anvil fixture passed **4/4 including its parent, zero skips**:

1. Synthetic price/source data for 100,000 zatoshis produces a signed reservation
   of exactly 1,200,000 mockUSDC units through the existing settlement contract.
2. Actual canonical PAY credits the separate recipient exactly 1,200,000 units.
   A second PAY is refused. A now-expired price would reject a new quote but does
   not change the original signed contract payment terms.
3. Actual reverse escrow funds/commits 1,000,000 mockUSDC units, while the accepted
   native quote is separately 80,000 zatoshis. No fabricated native receipt is
   used to close that onchain commitment.

The Anvil instance was invocation-owned, loopback-only and chain 84532; its keys
and contracts were synthetic. No existing server, public-chain transaction,
Docker, wallet database, G5 process or production credential was used.

Commands:

```powershell
pnpm --dir api exec tsx --test test/market-pricing.test.ts test/market-reference.test.ts test/market-native.test.ts test/unit.test.ts
pnpm --dir api exec tsx --test test/market-pricing-anvil.test.ts
pnpm --dir api typecheck
```

## Actual isolated PostgreSQL verification

`api/test/market-pricing-postgres.test.ts` requires the explicit private
`ZEE_MARKET_TEST_CONFIG` selector. It checks the exact existing disposable test
project/branch/direct hostname/database before connecting, creates only a
validated invocation-owned random schema, strips cluster-role creation/grants,
and applies rewritten 0001–0014, 0017–0021 and 0023 inside that schema. It never
applies 0015/0016/0022, modifies the actual application or installs local PG.

The prepared cases compare the old fixture tuple before/after migration, exercise
real API/worker roles and publication/mapping immutability, issue actual local
HTTP quotes and reject browser output fields, race two admissions for one global
slot, verify exact unequal destination/fee reservations and balanced ledger,
reject an unaccepted expired snapshot, retain an accepted snapshot/worker price
lock after expiry, refund actual underpaid source principal through the new SQL
namespace once, release its reservations and admit a fresh reverse 80,000-unit
native output after the global slot closes. Canonical chain receipts in this DB
fixture are explicitly synthetic; the separate Anvil fixture supplies actual
contract behavior.

Root executed the harness against the existing isolated Neon test branch. The
final run passed **12/12 tests, zero skips**. Two earlier runs failed before any
application migration: an incorrect assumed legacy constraint name, then an
unparenthesized CASE expression in a PL/pgSQL budget condition. Both were fixed
and the complete harness rerun. The migration now discovers and verifies the
exact legacy check's columns and expression before dropping its catalog name;
a changed legacy expression is rejected with rollback. Each run cleans up only
its own random test schema.

Review also caught a worker heartbeat age gate that could self-fence a valid
accepted payout during a long native SDK call. The correction preserves the
live backend lease, original epoch, dispatch and fresh source checks for
accepted orders. New admission still requires a fresh heartbeat and physical
capital proof. The PostgreSQL regression proves that an accepted order can
drain with a 61-second-old readiness sample while a new quote and a missing
worker lease are both refused. No timestamp is refreshed to disguise old capital.

```powershell
$env:ZEE_MARKET_TEST_CONFIG='.deploy-local/neon-settlement-tests.json'
pnpm --dir api exec tsx --test test/market-pricing-postgres.test.ts
```

## Open operator acceptance

Root still needs production installation/catalog/grant readback, fresh source
recovery/readiness, genuinely allocated market-sized capital and fees, reviewed
private release/profile/permit binding, supervised service startup and the funded
browser-backed two-way market circle with independent recipient/ledger closure.
The last Root-reported application checkpoint was paused with stale observers;
it is not represented as fresh or activated by this work. No live SQL, authority,
wallet startup, signing, broadcast, source repair, G5 continuation, commit or push
was performed by this coding agent. Implementation preparation is not acceptance.

## Root independent checks and current live boundary

Root independently ran these suites on the reviewed working tree:

| Check | Result | Evidence scope |
| --- | --- | --- |
| Market arithmetic, Node/Python protocol and actual Anvil contracts | 17 passed, zero skips | Synthetic source receipts and native raw bytes; actual local EVM deployment, reserve, pay and escrow COMMIT |
| Existing API, fixture policy, worker, capital and refund regressions | 42 passed, zero skips | Local behavior; preserves the old fixture route |
| Maintained market provider/cache/HTTP | 16 passed, zero skips | Local transport fixtures; no laptop TLS bypass |
| Native market/refund and maintained raw/preflight/owned/outgoing/capital Python | 75 passed, zero skips | Actual Python on Ubuntu 24.04 WSL; synthetic SDK boundaries |
| New isolated PostgreSQL migration/HTTP/permissions/accounting | 12 passed, zero skips | Actual remote PostgreSQL and restricted roles, synthetic chain observations |
| Web protocol/pricing/activity/bridge regressions | 63 passed, zero skips | Local unit tests |
| Browser interaction and responsive regressions | 35 passed, zero skips | Actual local Chromium with explicitly synthetic intercepted API responses |
| API typecheck and web production build | Passed | Compilation and bundling |

Suite counts overlap the earlier owner runs; they are not additional unique
cases to add to those totals.

A separate Root read-only canonical audit completed at **15:20:58 UTC on
26 October**. It compared 2,264 retained Zcash headers and 269 Base headers.
Exactly one persisted Zcash tip/checkpoint/cursor at height 4,541,825 conflicted
with the canonical source; no financial anchor conflicted. Its immediate
predecessor was absent from retained application rows, so no contiguous common
ancestor is claimed. The retained finalized anchor at 4,541,816 matched.
The audit made no SQL, cursor, source or financial changes and does not authorize
a repair. Ordinary consumers and trading remain paused pending separately
verified metadata recovery. No funded market-priced cross-chain settlement has
been demonstrated.
