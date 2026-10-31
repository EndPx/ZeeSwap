# Continuous testnet demo mode

The user authorized continuous demo admission without the historical two-order
per-direction or 32-total-quote limits. This does not authorize larger swaps,
minting, unproven capital or concurrent execution: the fixed size remains 0.001 TAZ
or 0.1 USDC, with one active swap, exact current liquidity and existing fee,
Source, capital, journal and settlement gates. Historical records remain intact.
Quote issuance has a rolling limit of 32 requests per 120 seconds.

## Frontend implementation and verification

The availability decoder accepts the separately authorized version 5 contract:
`capacityBasis: current-liquidity`, null historical admission/quote caps, exact
nonnegative safe-integer capacity for each direction, and the bounded
`quoteRateLimit` object. It requires the existing nonexpiring lifetime proof and
the separate capacity authorization digest. Unexpected fields, malformed
capacity, wrong rate windows and contradictory readiness fail closed. Existing
versions 1 through 4 retain their previous validation and presentation.

The swap card describes capacity as swaps available from current liquidity,
keeps the exact fixed amount read-only and shows the maximum of one active swap.
A `rate_limited` response displays a temporary quote cooldown and disables quote
issuance. No historical total is presented as remaining capacity. The approved
visual design, fixed 1 TAZ = 100 USDC rate and existing private order flow remain
unchanged.

Local verification completed on 31 October 2026:

- All **90 web unit tests passed**, including version 5 liquidity greater than
  two, null historical limits, rolling cooldown/recovery, malformed responses
  and Source/worker/capital/concurrency refusal cases.
- Web TypeScript checking and the production build passed.
- All **8 focused Playwright availability tests passed** against a local
  production preview, including version 5 at a 375-pixel viewport, zero-capacity
  reversal, exact fixed sizes, cooldown and legacy refusal cases. Their API
  routes were synthetic and created **zero POST requests**; no wallet, order,
  acceptance or transaction was performed.
- Scoped `git diff --check` passed.

The first browser run used the production-origin default while its fixtures
expected the local API origin; it failed before exercising those responses.
Rebuilding with the fixture's explicit local API origin produced the passing
result above. That local test build is not a deployable production configuration.

Root publication of migration 0039, actual API/web deployment and live public
verification are pending in this implementation record. These local checks do
not prove live continuous admission or a funded swap.

## SQL, API and protected operator checks

Migration 0039 adds an immutable opt-in authorization tied to the original
policy activation, profile, Source identity and current execution/control CAS.
It preserves the original policy, lifetime/reuse grants, accepted epochs and all
historical quote/admission rows. Only the actual new grant bypasses cumulative
pilot admission, principal and fee ceilings. Each current reservation still
requires exact available inventory, the original per-order fee ceilings and the
single global slot. Retired attempts receiving late funds continue to fence new
admission and financial membership regardless of the removed lifetime counters.

The new grant permits only the reviewed existing-capital targets: 1,000,000
zatoshi of native principal, 200,000 zatoshi of native fee inventory and
9,900,000 atomic mockUSDC principal. Base gas inventory remains unchanged. A
Root publication requires a finite five-minute publication window, fresh
Sources, exact closed books, current control CAS, protected physical-capital
proof and authenticated original signed-journal closure. These allocation
targets are SQL bookkeeping authorization, not newly minted tokens or transfers.

Root-only reconciliation moves an exact finalized, discharged source deposit
from `operator:unreconciled` to principal inventory once. It requires canonical
finalized source and destination receipts, original signed SQL payloads, exact
source classification/amount and a fresh full signed-journal qualification.
Customer-held, unsigned, nonfinal, refunded and late/extra funds cannot qualify.
An immutable deposit/order record prevents duplicate credit. Quote issuance uses
a rolling 32-per-120-second gate; historical issuance remains stored.

The protected operator wrapper authenticates the original persistent closed
recovery authority, financial execution/configuration pins, original profile and
actual VPS primary transport. Existing Root/group-readable transport metadata
retains its reviewed permission exception; new authorization/proof/intent files
are Root-only. Publication/reconciliation write and fsync the original XID
intent before COMMIT. A transport-uncertain commit requires original-transaction
reconciliation. Publication time and initial physical-proof age constrain only
the initial allocation; future inspect/reconciliation does not expire with them.

The continuous journal verifier reads all historical orders in keyset pages of
32, retaining the existing authenticated signed-byte, receipt and journal
checker per page. It accounts for every filesystem file and repeats the full
filesystem fingerprint around qualification. It has no lifetime 64-order or
128-row cutoff; memory limits apply per page. Unknown, missing, changed or
unconsumed journal files remain refusals. This verifier does not itself bypass
the separate Source metadata authority.

Local API typechecking passed. Four new unit tests cover strict version 5
metadata, fresh exact physical-capital proof complete 97-order journal SQL
pagination and exact original-XID outcome classification. The final combined continuous/lifetime/reuse run passed **10/10 tests** with
zero failures or skips. Existing financial worker capture checks were
inspected: they compare actual physical balance against current SQL inventory,
rather than the historical policy's cumulative allocation values.

Root executed the real PostgreSQL fixture against the explicitly disposable
`zee_continuous_demo_test_20261031`, containing a copy of the full closed current
books and migration 0038. The latest run passed **31 assertions**, including
publication and unchanged original policy/history, liquidity-derived capacities
above two, chargeable admissions beyond the old cap, original single-slot
reservation refusal, retained quote history above 32, rolling rate rejection,
low-liquidity refusal, exact finalized proceeds credit, idempotence, immutable
records and restricted worker reconciliation permissions. The entire fixture
transaction rolled back; Main and global roles were not modified.

Two earlier fixture runs refused and rolled back before successful completion:
the function-tail baseline assumed LF while the actual installed body retained
CRLF, and allocation reused one event ID for both native principal and native
fees, conflicting with the ledger's unique event/asset/bucket key. The exact
unique budget-tail token and a separate balanced event for each allocation
purpose corrected those failures. Neither failure was bypassed on Main.

## Continuous supervision and original transaction recovery

The protected continuous helper also supplies the complete existing closed
supervision interface: inspect, gate, pause, resume and intake. Every action uses
the paged journal qualification and the original immutable 0038 parent authority.
The original recovery grant and generations are retained; the old inspector's
64-order lifetime limit is not used for continuous supervision.

A Root-only, fsynced pending pointer binds the original XID intent and its exact
new authorization/proceeds/generation and ledger rows. Before another credit or
closed-service action, a committed original must match those immutable effects
and closed balanced books; the helper then records completion without crediting
again. An aborted original records its outcome before a new attempt. An in-flight
original or a later active order waits. Unknown XIDs, tampered pointers or effect
conflicts refuse further action. Complete intents and outcome records remain on
private disk. Empty reconciliation cycles create no new financial intent.

The continuous watchdog/start wrapper passed **36/36 watchdog tests** under WSL,
**4/4 TypeScript start-wrapper tests**, API typechecking and scoped diff checking.
Optional continuous authority/entry selectors are paired and bound to the
original parent plus the exact version 4 Source configuration. Every closed
service action routes through the new paged helper. Qualified fresh closed books
are reconciled before intake; unresolved original transactions fence new starts
and intake. A stale 30-second observation never stops a healthy worker. These
checks are local orchestration evidence; deployment and actual execution remain
separate Root results.

## Continuous capital successor

Inspection found a separate deterministic blocker in the old financial release:
its capital builder refused a fifth historical settled member, independently of
SQL admission capacity. Continuous capital therefore requires a newly reviewed
financial execution manifest/configuration, rather than modifying the old
release. Migration 0039 binds the successor worker configuration, execution
manifest, execution approval and separate Root capital approval. Its initial
publication qualifies the original closed worker; later inspection and recovery
validate the exact successor tuple while retaining the original recovery grant
as the historical SQL permission anchor.

The continuous builder resolves provenance only for the bounded current physical
outputs: exact primary source identity or exact confirmed outgoing transaction
HMAC. Historical member count no longer controls this opt-in. Existing provenance
kernels still authenticate the original receipt, amount, recipient and signed
journal; missing or ambiguous provenance refuses. A continuous refund-change
source additionally requires actual membership in the explicitly authorized
policy and fully discharged original refund accounting. Legacy capital callers
retain their historical limits and LATE-refund restriction.

A new `testnet_continuous_capital.py` variant retains the original capture file
byte-for-byte. Root validates the standalone approval and both script pins before
the owned child drops to the existing wallet UID/GID. It delegates original
canonical/decryption checks through the original profile loader. All unspent rows
are validated before selecting the largest 32 whole mature notes. The capture
balance is the selected sum, not a claim about the complete wallet balance. The
ordinary worker additionally requires that selected, provenance-checked physical
capital covers current SQL principal and fee inventory. Insufficient selected
backing fails admission.

The new capture/permission tests passed **10/10** under WSL with no skips,
including Root-only file permissions, changed pin refusal, selected-note bounds
and retained original script bytes. Execution tests passed **8/8**, and API
checking passed. The final capital-builder/native/refund regression run passed **18/18**,
including actual continuous-policy grant checks for discharged refund change.
The coordinating final targeted run passed **23/23** and API typechecking. These checks are not new
native signatures, payments or a live successor deployment.

### Actual read-only journal probe

At 31 October 2026, approximately **07:55 UTC**, the new paged journal algorithm
passed against the actual VPS primary `zee_app_20261023`, using the restricted
worker role and verified system identifier `7701863382450487342`. Its
repeatable-read, read-only transaction qualified **9 retained orders, 18 journal
files and one page**, with the original persistent authority and published
cryptographic journal checker. Qualification digest:
`9fde2a6a2f1dc7b4121bef0f73ae143bc961bf768480ae19e7204e8708516f02`.
The diagnostic public module's imports were redirected to the existing published
checker for this probe; it did not install a release, change units/configuration,
mutate Main, start a financial actor or claim live continuous authority.

### Explicit bounded exception

The physical capture selects the largest 32 eligible whole notes. If a future
refund's small primary funding note is excluded from that selection, its mandatory
explicit own-source approval can refuse even when the selected operator capital
would cover the payout. This remains a safe refusal requiring operator review;
no priority-note selector or broader refund-source bypass was implemented. This
is distinct from the removed lifetime admission/quote counters and must not be
represented as unrestricted unattended recovery of every financial exception.
Freshness, available capital and fees, original signed-byte recovery and the
existing funded/uncertain handoff boundaries remain enforced.
