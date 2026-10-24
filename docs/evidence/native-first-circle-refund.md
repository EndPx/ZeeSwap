# First native attempt: late funding and confirmed refund

This is a recovery outcome for the isolated native testnet application on
25 October 2026 in Jakarta. It is not a successful swap circle and does not
resume or close the historical G5 soak.

The original source transaction was acknowledged by the node, then included
after its accepted height cutoff. Independent lookup matched the original raw
bytes. Chef discovered its single shielded receipt and the application correctly
classified the payment as LATE / REFUND_REQUIRED. No mockUSDC payout was made.
The accepted cutoff, recipient, memo and amount were not extended or replaced.

Root paused the application at epoch five with reconciliation already clear.
The scoped refund runner planned the refund, durably signed and broadcast the
original Base cancellation, and waited for its canonical finalized terminal state.
Only then did it approve and sign the native refund. Its capital approval linked
the immutable original opening provenance and the actual single-output Chef
receipt for this order's confirmed source.

An outer native command returned an error after the wallet journal had persisted
broadcast acknowledgment. Root retained the original transaction, independently
found matching raw bytes in the chain, and reconciled that original hash without
resending or replacing it. The precise cause of that outer command error remains
unresolved; the later terminal receipt does not establish that it was fixed.

After native confirmation, SQL recorded REFUNDED, the obligation was DISCHARGED,
the real refund operation was CONFIRMED, its outbox job was DONE, and all three
reservations were released. A separate recipient-side SDK/viewing context found
exactly one Ironwood note for the original refund receiver, with shielded inputs
and exactly 100000 zatoshi. Its block hash matched the operator receipt, which
reported fourteen confirmations. This independently verified receipt is distinct
from broadcast acknowledgment or the API status alone.

Terminal application balances, all with zero reserved:

| Asset / purpose | Atomic balance |
| --- | ---: |
| TAZ principal | 200000 |
| TAZ fee | 10000 |
| mockUSDC principal | 200000 |
| Base ETH fee | 498993659999835 |

The operator paid a 10000-zatoshi native refund fee and 1006340000165 wei for the
Base cancellation. The user's original 10000-zatoshi sending fee is separate;
the refund returned the full 100000-zatoshi principal. Whole-wallet post-refund
note-set captures remain a separate continuation check.

One timing sample recorded 897 milliseconds from the persisted SDK receipt
snapshot's observation time to SQL deposit creation, and 16.880 seconds from the
block timestamp to SQL creation. The actual first block-availability timestamp
was not measured. These figures are not a complete discovery-latency benchmark;
the later HTTP status poll was also not the discovery time.

The failed attempt's local state, prepared bytes, journals, ledger and receipts
are preserved. Original one-acceptance limits remain in force until a separately
reviewed bounded continuation is deployed and activated. No replacement funding,
new reverse order, successful new swap or completed circle is claimed here.
Private addresses, memos, order mappings and raw receipts remain outside Git.

Root continuation checks on 25 October confirmed the unchanged paused epoch
five/xmin311173, reconciliation false, exactly one refunded order, zero ordinary
Base bindings and zero payout attempts. A coherent read-only snapshot retained
27 ledger rows, one confirmed refund operation, one done outbox job and three
released reservations. Operator whole-wallet capture verified 12490000 zatoshi
in two mature canonical Ironwood notes with an empty calculated cache. The user
whole-wallet capture is still under investigation; its reserved empty proof is
preserved and is not counted as passed.

The frozen continuation implementation passed Root TypeScript checking and
26 focused tests, followed by three cutoff-wire regression checks, all zero
skipped. The first cutoff-only invocation used the repository root and failed
to resolve tsx; its corrected API-directory invocation passed all three cases.
The independent review and separately executed serial and concurrent PostgreSQL
admission fixtures passed. These are implementation checks, not evidence of a
new live acceptance, migration installation, activation or successful circle.

## Bounded continuation and preparation guard

The corrected private USER read-only helper subsequently passed after separating
the scheme-free gRPC host/port from the HTTPS CLI endpoint. Both USER and
operator captures verified two mature notes totalling 12490000 zatoshi and empty
calculated caches. Root explicitly installed only migration 0017, verified its
body/security/owner/ACL and committed transaction status, and retained the same
financial books. SourceExposure migrations 0015/0016 remain unapplied.

The new source window passed 32 samples over 307.360 seconds. Fresh native/Base
captures, preflight, loaded API bounds and local control checks passed. The
committed continuation activated epoch 6. One additional forward order was
accepted with a forty-block window.

Preparation stopped before any financial journal was created. A separately
reviewed owned read-only prefix, with signing and every durable write denied,
confirmed that the actual two notes had exactly the approved identities and
values, but a different list order. Both totals were 12490000; neither list had
duplicate identities. The payer now compares exact unique identity/value sets,
with canonical four-field note validation, instead of list order. Root ran all
seven payer tests in Ubuntu/WSL: permutation succeeds; duplicate identities,
changed values, missing/extra notes and malformed fields fail.

The same accepted order was retained. Its next prepare attempt stopped at the
unchanged twelve-block lead gate with eleven blocks remaining, before invoking
the payer helper. No new calculation, signed transaction, broadcast or fee was
created. Root paused epoch 6 with reconciliation false. The accepted order is
still unfunded at this checkpoint; official expiry requires the fresh application
scanner to reach cutoff plus nine. Its closure and any separately authorized
continuation remain pending. This is not a successful new circle.
