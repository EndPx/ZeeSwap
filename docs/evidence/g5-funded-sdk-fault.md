# G5 funded SDK durable-calculate fault recovery

Updated: 2026-10-16 (Asia/Jakarta); actual execution times below are 2026-10-15 UTC.

Status: **actual funded adapter interruption and bounded original-byte recovery
passed**. The strict recovery passed at 18:05:06 UTC at epoch 8 without broadcast
or SQL payout import. The subsequent ordinary recover-zcash import passed,
and root proved one exact original SQL payout row. The normal driver then
broadcast the original transaction, verified its delivery, finalized Base
SETTLE and passed ordinary receipt verification. The funded interruption's
economic recovery is complete for R4. G5 remains open; the first full batch has
now passed with five verified settled orders and one barrier.

## Exact experiment boundary

The optional fault wrapper kills its own Python adapter after the pinned SDK's
durable calculation returns and before the adapter writes PREPARED. The SDK
process has already returned successfully. Evidence from this experiment must
therefore distinguish an adapter interruption at the SDK durability boundary
from SIGKILL inside a still-running SDK process.

The bounded fourth-slot experiment uses the retry run's existing approved
100000-zatoshi shielded payout and separate 10000 fee. Its selected input is
the originally allocated 110000-zatoshi note. It neither adds a payment nor
authorizes a replacement transaction. The first three slots must already be
SETTLED and individually receipt-verified; slot four alone must remain READY
with held principal and fee reservations. No fifth slot may have started.

The root operator holds the controller before R4 PREPARE_ZCASH and explicitly
invokes the fault. The expected adapter failure retains SIGNING_INTENT, the
original durable SDK transaction and a one-shot private marker with its txid
and raw SHA-256. Ordinary core failure handling freezes the run and requires
reconciliation. The fault wrapper remains bound to the same fixed fourth-slot
adapter configuration for subsequent recovery, broadcast and receipt commands.

## Narrow recovery checks

`api/scripts/g5-recover-sdk-fault.ts` is an explicit fourth-slot recovery only.
It requires the exact retry manifest, four-order history, known prepare-zcash
failure, original approval digest/files, one-shot SDK fault marker, exact
capital-note allocation and paused incident/reconciliation state.

It independently checks all earlier original Base receipts and the R2 shielded
delivery; both original Base source fundings and payer approvals; the finalized
R4 COMMIT, successful original calldata and unchanged latest/finalized committed
escrow state; every retained global operator and payer raw journal and canonical
transaction; and exact latest/pending nonces. It refuses additional orders,
refunds, unknown signer transactions, an R4 DB payout or SETTLE, changed jobs or
changed held obligations/reservations. Opening and current books, balanced
ledger groups and separated source proceeds must match exactly.

The fixed `g5-sdk-fault-proof.py` helper obtains the existing fourth-wallet
kernel lock and pins the observed installed SDK, independent Rust structural
verifier and incoming-key reader. It calls only the original adapter's recover
path. That path exports the SDK's original durable calculation, independently
parses its transaction identity/structure/fee, decrypts the actual recipient
ciphertext and persists its existing bytes as PREPARED. Additional incoming
capital-key decryption authenticates the actual internal zero change and index.
The marker txid/raw hash, exact input note, full principal and separate fee must
remain unchanged. A strict network NOT_FOUND is required before and after
recovery; RPC errors, a mempool match or an included original transaction require
separate reconciliation. NOT_FOUND is never permission to replace these bytes.

The physical checkpoint covers ten reverse wallets, the source viewing wallet
and the separate fee wallet. R2 is spent; R4 and the eight later reverse wallets
retain their original notes. The deposit wallet holds exactly the two forward
source notes; the fee wallet retains its original 30000. R4 COMMIT gas is included
in physical expenditure while its application expense remains held until
settlement. Current global inventory excludes the R4 source escrow liability.

Recovery then repeats original-wallet verification, strict NOT_FOUND, expiry,
core evidence and global nonces. An explicit audit is written privately before
the final transaction compares the unchanged reconciliation epoch, paused
controls and order/job identity. It requires the exact faulted lease to have
already been retired and requeued by `enter_reconciliation`, with precisely one
fence increment and null owner/expiry. It never restores or advances that lease. Only then
does it clear reconciliation and the local run incident, retaining the original
failure, marker, SDK journal and recovery audit. Intake and dispatch remain false.
Failure to save local incident state restores the reconciliation pause.

The root operator must next invoke the ordinary `recover-zcash` step to import
these exact recovered bytes under a new lease. This helper makes no DB payout
import, calculation, signature, funding transaction or broadcast. A separate
normal broadcast and finalized recipient/settlement receipt are required to
complete R4 and count it toward twenty swaps.

## Local verification

- API global TypeScript typecheck: passed.
- Five TypeScript tests: passed, covering exact R4 guard/marker/approval history,
  changed original bytes/notes/fees, held books, physical escrow/gas exposure and
  the exact already-retired lease fence.
- Four Linux Python tests: passed, covering original intent/PREPARED authority,
  rejection of acknowledged/confirmed journals or changed original bytes,
  exact internal-zero ciphertext/viewing identity and strict NOT_FOUND versus
  mempool or unavailable-provider responses.

These tests use synthetic data and invoke no funded wallet, signer or network
transaction. The actual interruption, recovered original bytes, receipt and
post-recovery reconciliation must be recorded separately after root execution.
Private journals, marker, approved request, viewing keys, raw bytes and order
mapping remain outside Git. Completion of this experiment alone cannot close
the remaining twenty-order, barrier and reorg requirements of G5.

## Actual fourth-slot interruption and recovery preflight

After ordinary COMMIT finalization and immutable wallet approval, root's
direct fourth-slot invocation reached the expected
SDK_DURABLE_BEFORE_ADAPTER_PREPARED interruption marker. The SDK calculation
was durable, while the adapter journal remained SIGNING_INTENT without
PREPARED. The main incident and expected prepare-zcash failure were retained.
No transaction broadcast occurred. Original transaction identity and raw-byte
digest remain in private evidence; neither a replacement calculation nor a
replacement transaction is authorized by this result.

The first strict recovery invocation stopped at 17:43:38 UTC before SDK export:
its obligations query incorrectly sorted by an `id` column absent from the
actual schema. The real primary key is `deposit_id`. The query now uses that
key through the same twelve-query production capture helper at preflight and
final CAS. A newly created UUID PostgreSQL database with exactly the first
fourteen migrations executed all twelve queries, then created a real confirmed
deposit/HELD obligation and proved stable repeated capture. This regression
passed and its ownership-scoped database cleanup completed with exit 0.

Recovery also now explicitly verifies the applied fourteen migration names
and SHA-256 hashes against their current working-file bytes before SDK
recovery and again at the paused final CAS. The final pins must equal the
initial pins. Future migrations remain unapplied; an extra migration or altered
applied/working bytes is refused. The fixture helper's default behavior is
unchanged; its explicit schema-14 option applies only to this invocation-owned
regression database. API typecheck and the five existing SDK-fault guard checks
passed after this change. Root's subsequent original-byte recovery reached
PREPARED, without broadcast or SQL payout import, then stopped at physical
capture at 17:48:58 UTC. Its main/reconciliation latches remained set.

The observed physical state is **locked capital**, not available capital. The
approved original 110000-zatoshi note is marked calculated-spent in the exact
original transaction; the only unspent note is its internal zero-valued change,
with calculated rather than confirmed status. Root verified the original
calculation height, current scan and raw expiry in read-only mode. These facts
do not make 110000 zatoshi spendable or establish recipient delivery.

The fault-specific TypeScript validator now shares the normal twelve-wallet
identity/freshness, deposit proceeds and extra-fee checks, while requiring R4's
actual spendable amount to be zero, notes to be empty and pending locked capital
to be exactly 110000. It accepts exactly one pending calculation bound to the
original marker, selected input, raw digest, approval digest, independently
verified prepared output, calculated height and original expiry. The fixed
original-proof binary pins and strict NOT_FOUND authority must match. No clone
or synthetic available note is used to satisfy the ordinary validator.

The other nine reverse wallets retain their exact cash/note requirements. R2's
authenticated zero-change identity must match its already verified protected
original prepared transaction; the other eight unused wallets may have no
zero-change or pending calculation. Ordinary wallet validation rejects this
fault metadata and remains unable to pass a pending locked input as spendable.
Four new locked-capital checks plus the five existing SDK-fault and fifteen
run checks passed, as did API typecheck and diff checks. Negative cases cover
normal-path rejection, changed original raw/input/pins, unavailable lookup,
positive shadow balances, unknown notes, multiple calculations, expiry type and
height errors, altered zero-change identity and any other wallet discrepancy.
These local checks alone do not establish incident clearance, ordinary import,
broadcast or final delivery. The separate actual capture and strict recovery
results follow below; ordinary import and payment remain separate gates.

Root independently reran the current bounded change: **29 TypeScript checks**
(including the real fourteen-migration PostgreSQL capture, run/SDK guards,
locked-capital and diagnostic checks) and **15 Ubuntu Python capture checks**
passed. Independent review passed as well. Those checks preceded the explicit
read-only capture probe and same-original recovery; their actual results below
provide separate execution evidence.

At 18:02:30 UTC, root's actual read-only R4 physical probe passed using the
configured reverse-wallet Python runtime. It reported
R4_PENDING_CAPITAL_READ_ONLY_PROVED: zero spendable, zero available notes,
110000 locked, exactly one pending calculation, original transaction NOT_FOUND
and original expiry height 4505690. This is physical evidence for the locked
state, not recipient delivery or available capital. An earlier diagnostic
probe used a different system Python without grpc; the operator's configured
runtime was already correct and no product dependency change was required.

Root started the same-original strict SDK recovery at 18:02:40 UTC. It passed
at 18:05:06 UTC with G5_R4_ORIGINAL_SDK_FAULT_RECOVERED_PAUSED at epoch 8,
reporting originalTransactionsPreserved and originalBytesRecovered true,
broadcast false and imported false. The full physical proof was freshly
captured at 18:04:32 UTC. The bounded incident/reconciliation clear passed its
original-effect, physical, ledger, nonce, migration and paused-epoch checks;
this did not import a SQL payout, broadcast or establish recipient delivery.

The ordinary recover-zcash invocation passed at approximately 18:06 UTC with
ZCASH_SIGNED_DURABLY, importing the original prepared bytes under normal
fencing. Root's independent SQL comparison at 18:06:40 UTC proved exactly one
R4 row, its transaction identity and raw digest equal to the original marker,
the protected HMAC valid, amount 100000 and fee 10000. The row remained
unconfirmed. Main incident and SQL reconciliation were false at epoch 8,
intake/dispatch remained paused and all first-three receipt flags stayed true.

Only after that comparison did root explicitly release PREPARE_ZCASH, the
four-active scheduling cap and admission beyond sequence 4. All three release
commands passed. The bounded driver resumed at 18:07:30 UTC with maxActive 4
and admission through sequence 20. Its ordinary preparation path detects the
existing journal and invokes recover-zcash; it does not calculate another
transaction. This is an active continuation, not evidence of R4 broadcast,
delivery, settlement or a batch checkpoint. G5 remains at three settled orders
and zero of four barriers.

The coordinator groups these actual results and their supporting fixes into
one verified reliability milestone. Broadcast acknowledgement remains distinct
from the pending delivery, settlement and full-soak acceptance gates.

At 18:17:45 UTC, the normal driver reported F5 OBSERVE_SOURCE READY and R4
BROADCAST_ZCASH AWAITING_ZCASH_FINALITY. R4's original recovered transaction
therefore has a broadcast acknowledgement through the ordinary fenced path.
The controller remained healthy, with three settled orders and zero barriers.
This acknowledgement does not establish ten Zcash confirmations, independent
recipient delivery verification, Base SETTLE or a fourth settlement. The driver
remains active under the reviewed four-active policy while those gates wait.

## Actual R4 settlement and ordinary verification

Root observed the original R4 Base SETTLE finalized and the order SETTLED at
18:50:23 UTC, after settlement nonce 13 in block 48160408 became final. The
normal controller then passed G5_ORDER_RECEIPTS_VERIFIED at 18:54:42 UTC and
retained slot 4 as DONE with controller incident false. This closes the funded
SDK interruption through original-byte recovery, exact SQL import, original
broadcast, independent delivery and ordinary terminal verification. No second
calculation or replacement payment was used.

At the subsequent F5 observation, its original RESERVE nonce 12 in block
48160096 is final, and its PAY nonce 14 was canonically successful in block
48160895 while finality was still pending at root's earlier check. The latest
reported controller state then had sequence 5 DISPATCH inflight, four verified
settlements and no batch barrier. Admission to sequence 6 then remained behind the
five-order barrier. Neither this recovery milestone nor four settlements
completes the twenty-order soak or wider source-reorg/loss acceptance.

The preceding nineteen-file SDK recovery milestone is published as
`97cc9d03c546151f64f2ec3fbffbd4c673b210b8`; root verified the remote SHA at
18:21 UTC. These later delivery/settlement observations are local evidence
updates for the next grouped milestone.

The first batch barrier later passed with G5_BATCH_VERIFIED at 19:15:16 UTC;
root confirmed both barrier lists `[5]`, all first five DONE/receipt flags and
controller health at 19:16:54 UTC. Its exact aggregate was five settled
(three forward/two reverse), 17905260001754 wei actual Base fees, balanced
ledger and zero unexplained deficits. Progress is now 5/20 verified settled
and 1/4 barriers. The second batch subsequently stopped with UNKNOWN_OR_INCIDENT
at sequence 7 SOURCE_FUND at 19:20:18 UTC, with only the controller latch set and the main
run/first barrier preserved. Strict handling of its accepted but unfunded quote
passed its bounded expiry/archive at 20:03:04 UTC, independently checked at
20:04:12.582 UTC. No successor quote or funding is claimed, and the driver
remains held for reviewed publication after the post-ingestion archive guard and actual healthy watcher passed. That
separate [source-7 lifecycle](g5-source7-unfunded-recovery.md) does not undo R4's
verified original-transaction recovery or complete the remaining G5 gates.
