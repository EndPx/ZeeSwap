# G5 F7 receipt confirmation floor incident

Status: **bounded original-receipt recovery passed; driver held for publication**.
The actual recovery and independent post-check passed. No resumed driver or
completed twenty-order run is claimed. This is a new incident after the published source-7 expiry/archive
milestone; that earlier retained-history proof is not rewritten. Incident times
below are 2026-10-15 UTC; later continuation checks are dated explicitly.
Primary service controls remain disabled.

## Actual retained checkpoint

Driver67501 stopped with UNKNOWN_OR_INCIDENT at sequence 7 DISPATCH at
21:10:20.450. Main and controller incidents were set. The first five verified
settlements and barrier `[5]` remained preserved; the source-7 predecessor
remained EXPIRED_UNFUNDED under its strict no-effect archive. The current
sequence-7 attempt had its distinct canonical shielded source and was READY.
The stopped run had nine current execution slots plus that one archived
accepted attempt: five SETTLED and four READY.

The retained body diagnostic is dispatch/base-preflight,
PRIVATE_DIAGNOSTIC_ERROR, SQLSTATE P0001, with observedAt 21:10:20.013. Its
frames reach `base-settlement.ts` at the `confirm_base_attempt` call and the
inner existing-receipt branch, with the lease-heartbeat wrapper. The original
PostgreSQL exception message was not retained.

Root's first actual read-only audit was captured at **21:15:21.764**, before any
observer refresh or receipt reconciliation. The persisted Base checkpoint had
finalized height **48164490**, latest/scanned height 48165165 and observedAt
21:10:19.042, only 971 ms before the body diagnostic. The original F7 RESERVE
was canonically successful at **48164522**, 32 blocks above that persisted
finalized floor, while its SQL row remained unconfirmed. Its original raw/hash
and protected HMAC matched, its stored receipt-height canonical anchor matched
the actual block hash, and its observed fee was 3222840000412 wei, below the
unchanged 10000000000000-wei signed cap.

Root's corresponding actual canonical receipt audit reported:

| Original operation | Nonce | Included block | SQL confirmed at first audit | Observed fee wei |
| --- | ---: | ---: | --- | ---: |
| R6 COMMIT | 15 | 48164171 | true | 749720000095 |
| F9 RESERVE | 16 | 48164373 | true | 3564840000238 |
| F7 RESERVE | 17 | 48164522 | false | 3222840000412 |
| R8 COMMIT | 18 | 48164843 | false | 749720000163 |
| F9 PAY | 19 | 48165072 | false | 1453060000092 |

The then-current provider finalized head was 48164683. It covered the original
F7 RESERVE but not the included R8 COMMIT or F9 PAY. Inclusion of those latter
transactions is not finalized confirmation or another SQL SETTLED execution.
Root's audit retained their actual original identities privately; no receiver,
memo, credential, raw or private order mapping is published here.

## Causal inference and its limit

The production receipt reader first checks a canonical successful receipt
against a provider finalized head. `saveReceipt` then performs a separate Base
checkpoint read. That later finalized view can fall below this receipt while
still staying at or above the previously persisted frontier, so the ordinary
monotonic publisher check need not reject it. The receipt-height canonical
anchor is then published, followed by an epoch fence and SQL confirmation.

SQL `confirm_base_attempt` requires a fresh persisted Base finalized height at
least the receipt height, with the matching canonical anchor. The retained
fresh height 48164490 could not cover receipt height 48164522. This supports a
**head-race causal inference from persisted evidence and production code**. It
does not recover the original PostgreSQL exception text or justify attributing
earlier unknown scanner/source failures to the same cause.

Epoch fencing protects against an intervening reconciliation epoch; it does
not itself enforce a receipt-height floor. This confirmation function contains
no lease predicate. Lease-heartbeat stack frames alone therefore do not prove
a stale lease. Likewise, an old checkpoint becoming stale during the later
audit would not prove it was stale at the actual failure time.

## Implemented repair and bounded recovery

The implemented forward confirmation repair adds a persistent receipt-height and
freshness guard under the same runtime lock before SQL confirmation. A fresh
coherent observation that is merely below the exact unchanged canonical
receipt may yield a typed non-advancing wait. Missing, reverted, changed or
unavailable original evidence, an altered/missing anchor, fee or reservation
failure, and incoherent reads retain hard failure behavior. An expired persisted
checkpoint yields a non-advancing CHECKPOINT_STALE wait after those hard checks;
it supplies no fresh confirmation proof.
No generic P0001-to-WAIT or NULL-to-WAIT conversion is permitted.

New diagnostics classify only exact known SQLSTATE/message literals
at the known confirmation-call boundary into closed static reasons. Arbitrary
PostgreSQL message/detail/hint/where/query/parameter text is not retained. That
classification cannot retroactively supply the lost original message.
The regression exercises the real publisher/confirmation boundary with a high
receipt view followed by a lower but still monotonic checkpoint view.

The targeted rerun passed **15/15 tests**: three actual schema-14 receipt
readiness cases, three pure SQL diagnostic cases, three existing G5 diagnostic
cases and six child diagnostic cases. The first rerun exposed a duplicate
receiver collision in a test fixture; assigning unique fixture receivers fixed
that isolation issue. The subsequent owned disposable-database run exited
successfully and cleaned up normally. Typecheck and diff checks passed. The
receipt regression uses injected Base views and synthetic signed payloads with
the actual publisher, SQL schema and restricted worker permissions. It proves
the application/SQL boundary, not a real chain reorganization or a new live
cryptographic settlement. Independent static review also passed.

A separate literal epoch-9 reconciliation is implemented around the exact
nine current execution IDs, the retained archive and all original journals.
It must first wait for all known originals through nonce 19 to become
canonically final, prove complete partial books and physical balances, preserve
the first five/barrier, and prove no SDK preparation or payout for R6/R8.
R6's immutable approval already exists and must remain bound to COMMIT15.

Only normal receipt reconciliation of F7 RESERVE17 and F9 PAY19 is in the
approved import scope. R8 COMMIT18 remains SQL-unconfirmed for normal later
observation, even though its actual included fee belongs in the physical
proof. Importing F9 PAY creates a sixth SETTLED execution, not a sixth
verified/barrier-completed slot: ordinary verification must still run. No
new source, quote, signature, SDK calculation, broadcast, capital credit,
replacement nonce or changed fee/cutoff belongs in the reconciliation.

The partial layout is not a sequential 4-forward/2-reverse prefix and must not
be forced through a helper that requires forward-minus-reverse at most one.
Book execution fees are charged at completed PAY/SETTLE, whereas a confirmed
RESERVE/COMMIT may already have consumed real gas. The bounded proof must keep
those amounts separate and exclude double charging. All derived targets and
fresh actual proofs remain subject to the final protected same-epoch CAS.

The recovery author's seven focused tests passed, with global typecheck. They
cover all four allowed original-receipt import subsets, retained historical
DONE-job lease metadata, protected byte/archive/accounting failures, exact
settled-book versus physical fees, owned local-write failure restoration and
durable-intent recovery from mixed original/next local states. These are pure
injected accounting and lifecycle tests. They do not prove a live wallet audit,
filesystem power-loss behavior or actual receipt imports. Independent review
of the final helper, CLI and tests passed. Root independently reran all seven
tests and typecheck successfully before actual execution.

The implementation pins root's fixed global-journal inventory, including exact
filenames, raw-byte file hashes and its retained nonce ranges. A fresh physical
finalized head must cover every retained economic receipt before balance
comparison. The durable recovery intent records PROVED, DB_CLEAR and COMPLETE;
an interrupted local-save continuation accepts only the exact original or
derived next files, verifies the post-import books and refreezes before owned
restoration. It never restores a lease, replaces transaction bytes or advances
F7 to verification. F9 must enter ordinary VERIFY after its original PAY import.

## Evidence boundaries

The retained initial checkpoint/receipt audit above is actual read-only testnet
and database evidence from root. Source inspection explains a concrete possible
race and the retained predicate failure. Floor/diagnostic tests and their static
review passed as described above. The seven scoped recovery tests and final
static recovery review passed with their limited scope recorded above. Root's
subsequent actual recovery proof and independent post-check are recorded below.

Root's independent 2026-10-16 rerun passed nine readiness/SQL/G5 diagnostic
tests and then six child diagnostic cases in their correctly named separate
invocation: fifteen distinct targeted tests in total. Typecheck passed. The existing isolated
Anvil settlement integration passed 15/15 with normal owned-database cleanup
after applying its documented zero-basefee fixture configuration. These are
separate test suites, not additional actual settlements. Root's actual
read-only check at **2026-10-16 01:29:59 UTC** retained frozen epoch9, observed
operator latest/pending nonces 20/20 and payer 10/10, and finalized height
48172387 covering all known originals through receipt48165072. R6's approval
was present with no SDK journal; R8 had neither approval nor SDK journal.
That checkpoint performed no recovery imports or incident clearance. The full
recovery proof must still be refreshed and checked at execution.

## Actual bounded execution and independent post-check

At **2026-10-16 01:38:55 UTC**, root's bounded recovery exited successfully as
G5_F7_ORIGINAL_RECEIPTS_RECOVERED_PAUSED at epoch 9. It imported the original
F7 RESERVE and F9 PAY once, retained R6/F7/R8 HELD/READY, preserved F7 DISPATCH
and set F9 VERIFY with receiptVerified false. Barrier `[5]` remained unchanged.
No new payment, SDK calculation, signature or broadcast occurred.

Root's independent post-check at **01:39:10 UTC** passed:

| Check | Actual result |
| --- | --- |
| SQL SETTLED sequences | 1, 2, 3, 4, 5, 9: four forward, two reverse |
| Ordinary receipt verifications / barriers | Five / `[5]` |
| Current funded IDs / retained archived predecessor | Nine / one EXPIRED_UNFUNDED |
| Active source obligations / unreleased reservations | Three HELD / nine |
| LEASED jobs | Zero; historical DONE-job metadata preserved |
| Forward attempts | Nine confirmed; no PAY for F7 |
| Control intake / dispatch / reconciliation | false / false / false, epoch 9 |
| Recovery intent | COMPLETE |

The exact protected account targets matched: mockUSDC principal balance 600000,
reserved 100000; TAZ principal balance 800000, reserved 200000; TAZ fee
balance 110000, reserved 30000; Base fee balance 277076839997916 wei,
reserved 150000000000000 wei. The six-settlement charged Base fee subtotal is
22923160002084 wei. Physical known fees are 27645440002754 wei, including
4722280000670 wei spent by active operations and not yet charged as completed
PAY/SETTLE expenses. These are partial totals with different scopes.

The actual twelve-wallet proof was observed at 08:38:23.272 WIB, preceding the
source snapshot and 08:38:55 WIB clearance by less than 33 seconds. The recovery
validated that proof with the five exact source notes and only the two original
reverse wallets spent. The full proof stays private. Root's normal operator
status check passed at 01:40 UTC. The driver remains held for grouped publication;
no continuation or later settlement is claimed here.

The goal remains twenty funded alternating settlements, the retained
twenty-one accepted-attempt history, four barriers and close, followed by the
remaining G5 failure/loss gates. Current progress is **6/20 SQL SETTLED,
5/20 ordinarily receipt-verified and barrier `[5]`**. Fourteen economic
settlements, fifteen ordinary verifications, barriers 10/15/20 and close remain
open. The source-7 history, earlier R4 original-byte recovery and
first-five fee subtotal retain their own evidence scopes. Future migrations
0015/0016 remain unwired to the fourteen-migration run.
