# G5 retry operator and bounded batches

Recorded 2026-10-15. This evidence covers local software verification. It does
not establish a completed public-testnet swap, a roundtrip, or the twenty-order
soak. The original late-source experiment and its refund history are retained.

The retry target is the explicitly pinned `zeeswap-g5-soak-retry` branch. Its
manifest admits twenty alternating orders in four batches of five. Only orders
within the current batch can be admitted or operated. Each order has its own
credential, immutable quote and durable signing journals. A complete batch must
have five finalized settlements, five fresh receipt checks, no open obligations
or reservations, balanced ledgers, and exact physical inventory reconciliation
before the next batch opens. Ordinary API capacity remains five unresolved
accepted orders.

Migration `0014_targeted_g5_claims.sql` adds order-specific forward and reverse
job claims. The production forward dispatcher accepts an optional order ID;
existing callers retain their FIFO behavior. The new functions retain dispatch
policy, fresh observer, operation kind, execution mode, READY state, lease and
fence checks. They do not replace the original claim or signing fences. The G5
reverse operator uses the targeted claim so operating order four cannot lease
order two's job.

The retry opening allocates 1,000,000 mockUSDC units, 1,000,000 zatoshi of TAZ
principal, 130,000 zatoshi of TAZ fees, and 300,000,000,000,000 wei of operator
Base gas. Of the TAZ allocation, ten isolated 110,000-zatoshi operator wallets
supply the reverse principal and fees; a separately proven 30,000-zatoshi
operator note supplies the remaining fee reserve. The independent user source
wallets are excluded from operator capital.

The five-order admission test exposed a real budget conflict: five original
100,000,000,000,000-wei quote reservations exceeded the 300,000,000,000,000-wei
opening gas allocation. The operator selected a lower **retry-only** per-order
cap of 50,000,000,000,000 wei, so the maximum five simultaneous reservations
total 250,000,000,000,000 wei. The original run retains its original cap and
100,000-zatoshi fee opening. Existing accepted quotes are immutable.

Each operator invocation holds the run lock and ends with intake and dispatch
paused. The independent Base signer retains its shared nonce journal. Before a
new G5 raw transaction is prepared, the nonce guard requires every other
recorded pending operator transaction to have landed with an advanced operator
nonce. The driver must prepare, persist and broadcast one EVM transaction before
preparing another. Source payer transactions use their separate bounded actor.

An incident flag freezes normal admission, dispatch, verification, checkpoint,
bootstrap and reverse operator operations even when a separate refund operator
temporarily clears the database reconciliation flag. Rejecting an already
frozen run does not advance the reconciliation epoch. A narrow incident refund
remains a separate procedure.

`roundtrip-checkpoint` is a bounded acceptance milestone for exactly the first
two settled orders. It requires the reverse recipient to equal the first user
source wallet's agreed shielded refund receiver, rechecks both orders' chain
receipts and the independent recipient SDK receipt, and reconciles the full
physical partition with zero open obligations or reservations. It writes a
private checkpoint with `g5Complete: false` and `batchBarrierAdvanced: false`.
It does not mark the five-order batch complete or unlock order six.

## Verification

- API TypeScript typecheck passed.
- Fifteen G5 pure/runtime checks passed, including historical versus retry
  target/cap separation, four exact batch barriers, frozen incident admission,
  unchanged checkpoint admission state, exact extra fee ownership and a nonce
  guard refusing an unbroadcast or unmined original transaction.
- Seven Linux physical wallet capture checks passed: normal viewing sentinel
  release, timeout retention, and exact 30,000-zatoshi operator note identity
  rejection of user source capital or altered note identities.
- An actual SDK observation showed a confirmed zero-value internal change note
  after an exact principal-plus-fee payout. Physical capture now excludes such
  a zero only after the original confirmed signing journal, immutable approval,
  authenticated recovery and independent raw verifier agree
  on the original bytes, transaction ID and authenticated zero-own-change output
  index. Unknown, external, duplicated, noninteger or unconfirmed zero notes are
  rejected. The general positive-capital selector is unchanged. This is a
  physical accounting distinction, not permission to omit a raw output.
- The SDK was observed to prune its calculation export after confirmed sync.
  When its versioned read-only recovery export is empty, capture requires the
  provider's exact original mined raw bytes, ten confirmations, canonical compact
  block membership and a block re-read. It independently decrypts the zero change
  with the capital UFVK and the full principal with the recipient UFVK before
  journal metadata can enter structural/conservation validation. Missing or
  changed raw bytes, either missing/wrong ciphertext proof, wrong indices,
  external zero change and insufficient confirmations are rejected.
- The pinned maintained SDK calls same-account change `AccountInternal`.
  A separate `decrypt_own_change` command in the local Rust reader emits only
  these internal incoming-key decryptions. Existing `decrypt` behavior remains
  incoming external notes only. The operator built a separate retry reader and
  observed exactly the actual confirmed zero internal output at index one; the
  historical shared reader was restored. That check used the existing refund
  transaction, not a claimed successful G5 swap.
- The operator also exercised `mined_zero_export` against that actual refund:
  exact original provider raw bytes, compact block membership and canonical
  re-read, independent capital zero-change decryption, independent recipient
  100,000-zatoshi principal decryption, and 33 confirmations passed. Original
  signed bytes were unchanged and no SDK calculation was performed. The full
  G5 capture still intentionally requires a reverse-order approval; the incident
  refund approval is not repurposed as operator swap authority.
- Three new Anvil plus invocation-owned disposable PostgreSQL checks passed:
  five alternating admissions, refusal of the sixth unresolved admission,
  canonical source escrows, targeted reverse order-four selection without
  stealing order two, wrong-mode and paused claim rejection, stale fence
  rejection, and settlement of all five orders with once-only accounting.
- The five-order test uses real local Anvil contracts and Base transactions.
  Its Zcash source and destination proofs are synthetic fixtures. It is not
  public-testnet shielded settlement evidence.
- The final Anvil test revision passed all three checks in about twenty seconds.
  Earlier revisions exposed the gas reservation conflict above, a test-only ABI
  name mismatch, and a test finality wait that mined before a submitted
  transaction was included. The final wait first confirms inclusion and then
  waits for canonical finalized state. It does not retry economic operations.
- Disposable database cleanup passed; historical databases and public-testnet
  evidence branches were not reset. `git diff --check` passed.

Live proof remains separate: actual fresh funding and finalized recipient
receipts are required before recording the first roundtrip, and all twenty
settlements and four physical barriers are required before closing G5.

## Empty-opening configuration recovery

The first retry admission stopped before creating a quote, order or private
slot. The operator found a platform configuration error: the Windows wallet
adapter had been pointed at a direct Linux CLI/protobuf configuration. The
Linux physical capture configuration was valid. Correcting the private Windows
wrapper, protobuf and shared sentinel paths allowed the complete read-only
boundary diagnostic to pass with zero orders and fees, balanced ledgers and no
unexplained physical deficit. No payment was initiated by this failed admission.

Normal incident protection remains in force. `diagnose` runs the existing
boundary checks without SQL writes or changing the incident/reconciliation
state. Failures write only static error codes, exception class, phase and source
locations to an ignored private diagnostic file; arbitrary RPC/SQL error text,
credentials, raw bytes and memos are excluded. `status` also avoids SQL writes.

An explicitly invoked `recover-empty-opening` is available only for the literal
retry branch before its first policy initialization. It requires an incident,
zero private slots and barriers, paused intake/dispatch and reconciliation still
required. All quotes, orders, deposits, liabilities, reservations, operations,
jobs, bindings, attempts, refunds and order events must be absent. The only
ledger entries may be the exact eight opening entries. Full account and physical
reconciliation must pass again.

The operator supplies a fresh private no-funding/no-signing audit that names all
ten actual user source configurations. The recovery checks their exact branch,
run, wallet path and agreed refund receiver; fixed funding intents, results,
actor locks and core funding instructions must be absent. All ten reverse
states, raw signing journals and approvals must be absent and their private
approved digests must still be zero. It records a separate private proof before
clearing only the local empty-opening incident flag. It does not clear database
reconciliation, activate intake/dispatch, recover any funded order, or apply to
the historical late-source incident. The next normal empty admission retains
its original once-only policy initialization checks.

The coordinator executed the reviewed empty-opening recovery after supplying
its explicit private audit. It returned G5_EMPTY_OPENING_RECOVERED_PAUSED with
zero settled orders, zero Base execution fees, balanced ledgers and no physical
deficit. Acceptance and dispatch remained false and database reconciliation
remained required. No quote, source transfer or signature was created by this
recovery; the next source sync and first admission still require normal checks.
