# G5 funded SDK durable-calculate fault recovery

Date: 2026-10-15 (Asia/Jakarta).

Status: **local tooling verified; funded interruption and recovery not yet run**.
No new public-testnet settlement, signature, broadcast or wallet recovery is
claimed by this implementation checkpoint. G5 remains open.

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
