# Source13 unfunded predecessor: bounded lifecycle

The live G5 retry reached ten ordinarily verified settlements and barriers
`[5,10]` before its controller stopped at Source13 `SOURCE_FUND` on
2026-10-16 at 03:41:31 UTC. The retained child diagnostic identifies
`G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW` at `FUNDING_BINDING`. The accepted
cutoff and the minimum eight-block funding margin remain unchanged.

This diagnostic can arise before proposal creation or after the proposal's
final tip check. The code and absent intent/result files alone do not establish
an empty SDK calculation state. The archival path requires independent, fresh
wallet evidence. Any calculation, locked input, unknown child process, or
unexplained output refuses this path and requires reconciliation of the original
operation.

## Actual observations before expiry

Root retained the first incident snapshot at 03:43:17.053 UTC, before any
recovery transition. Main remained healthy; the controller remained frozen;
epoch was 9 with intake, dispatch, and reconciliation all false. The first ten
orders were settled. Source11 was `CONFIRMING`, with its original deposit and
HELD obligation metadata but no operation or job. R12 remained
`AWAITING_FUNDS` with its original payer transaction known. Source13 remained
`AWAITING_FUNDS` without a deposit or operation.

The accounting distinction is deliberate. Source11's original physical note
accounts for another 100000 zatoshi (0.001 TAZ) beyond the 500000 zatoshi (0.005 TAZ) already recorded in
`operator:unreconciled`; the unconfirmed source has not posted
`customer:held` or `customer:liability` ledger entries. Both totals remain zero.
R12's physical 100000 mockUSDC atomic units (0.1 mockUSDC) in escrow are likewise unobserved by its SQL order.
The recovery preserves these two pending source gaps instead of posting credits
or importing their normal source-confirmation transitions.

Root's read-only Source13 SDK inspection at 03:45:33 UTC found zero exported
calculations and the sole approved 110000 input confirmed and unspent, with
no intent, result, or scoped process. A later full actor audit returned scan
4507035 and tip 4507036 against immutable cutoff 4507017. That audit therefore
passed the stricter cutoff-plus-ten scan gate. It also reported 110000
spendable, zero calculations, six view-wallet notes, zero nonconfirmed notes,
and released owned locks. These are read-only no-send observations; they do not
expire the order or authorize reuse of a stale audit.

Root's retained global journal inventory contains operator nonces 0 through 24
and payer nonces 5 through 11. Its separate 03:52:04 UTC read confirmed latest
and pending nonces `[25,25,12,12]`. Payer nonces 0 through 4 are not invented as
journal requirements. The operator independently verifies current canonical
receipts and file bytes during recovery.

## Implemented scope

`api/scripts/g5-recover-unfunded-source13.ts` takes the explicit manifest,
controller config, and the fixed retained incident artifact. It acquires the
existing core lock and an owned controller sentinel, authenticates the exact
incident and private file bytes, and requires the original epoch-9 paused
profile. It does not sign, broadcast, fund, requote, calculate a transaction,
change a deadline, or progress Source11/R12.

Before ordinary expiry, it verifies the first ten original completed receipts,
R12's exact payer raw transaction, immutable approval and signature, canonical
finalized funding event, escrow, application/global journals, nonce inventory,
fourteen migration names and byte hashes, full twelve-wallet partition, source
notes, and exact book-to-ledger reconciliation. The actual physical Base head
must cover all economic receipts before its balances are compared. The fixed
Source13 sync and complete no-effect audit run after the slower wallet work.
Freshness is checked again at the expiry CAS.

The expected six source outputs are authenticated against retained SQL
identities, HMAC receiver/reference bindings, amounts, and canonical anchors.
Known Source11 is preserved as `CONFIRMING`. Any unexpected output, including
either retired receiver or reference, is ingested before refusal so its
observed liability survives. Expected outputs are not re-ingested merely to
normalize Source11 into a different state.

Only `expire_unfunded` may release Source13's original three reservations.
The exact release entries remain balanced; account balances, proceeds, prior
events, original sources, and paid transactions are retained. The existing
Source7 archive and artifact bytes are preserved. The resulting local change
appends one Source13 predecessor, allocates a new unique owner for attempt 2,
returns only controller slot13 to `SYNC`, and clears its precisely bound
incident. It creates no successor quote or funding artifact.

The shared classifier permits only ordered archive sets `[7]` and `[7,13]`.
Each predecessor independently requires its protected quote, original receiver
and reference, `EXPIRED_UNFUNDED` order, no deposit or financial effect, three
released reservations, twelve exact accept/release ledger entries, and fixed
retained funding/audit bytes. A late output to either old receiver or reference
invalidates the exception. Neither predecessor is hidden by a general expired
order filter.

Durable `PROVED`, `DB_EXPIRED`, `LOCAL_SAVE_FAILED`, and `COMPLETE` phases support
known before/after-expiry and mixed local-file recovery. A failed local save
re-freezes SQL before restoring only files equal to this recovery's original or
proposed values. Foreign state is never overwritten. Compound failures in
which re-freezing succeeds but the failure-intent write also fails remain
fail-closed and may require a separately reviewed reconciliation; this is not
an arbitrary filesystem-failure recovery guarantee.

The actual second archive now makes the required final acceptance profile
**20 funded settlements, 22 accepted attempts and 66 released reservation rows**. Immediately after expiry and before the
successor is accepted, twelve current accepted orders plus two archived
predecessors make fourteen accepted attempts. These are retained-attempt counts, not successor payment, barrier15/20, close
or G5 completion evidence.

## Local verification

- Five Source13 lifecycle tests passed: literal incident binding, immutable
  Source7/first12 successor diff, fresh no-calculation proof, exact pending
  unposted accounting, release-only ledger replay, durable mixed-state resume,
  and refreeze-first local failure behavior.
- Two archive tests passed, including an invocation-owned disposable schema14
  database exercising ordinary expiry, replay, distinct successor acceptance,
  the structural 22/66 profile, unknown orders, and both old late liabilities.
  Its other completed-order scaffolding is synthetic and does not demonstrate
  twenty network settlements.
- Two further disposable schema14 tests passed for the two-archive source
  observer. A late Source13 output committed its real SQL liability before the
  post-prepare guard refused SQL raw storage or broadcast. The original prepared
  raw remained in the fixture's in-memory signer journal, and replay did not
  prepare again. Base and the signer were mocked; this test does not claim a
  new filesystem durability or public-network broadcast proof.
- The six existing Source7 lifecycle tests passed unchanged. TypeScript
  typecheck passed. Disposable fixtures cleaned up normally; retained live
  fixtures were untouched.

## Actual expiry and independent post-check

Root's bounded operator exited successfully at **2026-10-16 04:15:42.460 UTC**
with G5_SOURCE13_EXPIRED_NO_EFFECT_SUCCESSOR_READY. The intent is COMPLETE.
Ten settlements and barriers `[5,10]` were preserved, and exactly one second
predecessor was appended. Successor13 attempt2 is at SYNC with no accepted
quote, funding artifact or payment. Source12's original funding is preserved.
No new quote, funding, SDK calculation, signature or broadcast occurred.

Root's independent post-check at **04:16:17 UTC** passed. SQL intake/dispatch/
reconciliation were false at epoch 9; main and controller incidents were false.
There were fourteen quotes/orders, forty-two reservations with six still held,
one HELD obligation metadata row, ten operations and zero LEASED jobs.
All ten ordinary receipt flags and both barriers remained unchanged. The first
twelve slots were preserved: source11 CONFIRMING and source12 AWAITING_FUNDS.

Exact book balances/reservations matched: TAZ fee 80000/20000 zatoshi,
TAZ principal 500000/100000 zatoshi, Base fee 267594519996785/100000000000000 wei,
and mockUSDC principal 500000/100000 atomic units. Root's normal status command
also passed at 04:16 UTC. The execution retained a fresh actor proof observed at
11:14:49 WIB, source scan 4507087, and currentProof timestamp 04:15:40 UTC;
the earlier read-only audit was not reused as a new observation.

The driver remains held for grouped publication. The separately reviewed
[coherent source admission](g5-source-admission.md) is implemented and tested,
but its normal testnet admission/funding execution remains pending. Progress
is **10/20 ordinarily verified, barriers [5,10]**. Ten more funded settlements,
barriers 15/20, close and the wider G5 failure/loss gates remain open.
