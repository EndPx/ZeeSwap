# Actual source reorg recovery and prefunding continuation

Recorded 24 October 2026 for the isolated new native testnet application. This
does not resume or close the intentionally stopped historical G5 run.

At 13:11:32 UTC, the Chef application observer stopped during canonical checks
and entered paused reconciliation at application epoch one. Customer books
remained empty. Prep's separate source-data epoch changed from 27 to 28;
network, payload type, source mode and Chef generation were unchanged.

Independent investigation made 498 Zcash anchor comparisons. Only the newest
core checkpoint at 4535991 differed from the canonical reader. Application SQL
anchors and the existing cursor at 4535990 still matched. All 59 Base comparisons
matched. The original observer's precise typed error was lost in its generic
CLI catch; no particular unrecorded code is claimed retrospectively. The source
follower separately stopped because its explicit Prep-epoch pin had changed.

## Actual official rollback and replay

Root reviewed a one-time helper restricted to common ancestor 4535990 and
replacement 4535991, original source configuration and the approved old/new Prep
epochs. Its application connection performed read-only checks of the exact
database/worker role, paused epoch one, empty customer books and leases,
disabled assets and unchanged application checkpoint. The source operation used
the official pinned Chef 0.6.1 `sync --to 4535991`: retained ancestor discovery,
transactional undo and replacement replay with the native scanner. No direct
SQL deletion, reset, generation replacement or package/configuration change
was used to repair the source.

Peer review corrected a process-ownership gap before execution. The new operator
retains stops received during creation, holds the source lock for an unknown
spawn result and requires positive group cleanup before releasing known
ownership. Five actual Linux ownership tests passed and were independently
repeated, including a real signal during spawn, stubborn descendant and lost
child handle. Separate source-scope tests used the official CLI with fixture
store/source boundaries; they were not counted as actual source recovery.

The actual operator SHA256 was
`9f490ed2ae37380d90f717d8ce13de87d3e8b09ead4da034c0abd85164596d02`;
the actual entry was
`d589698f231f7fb305f8591279959f94d38af0f8047e352e90de378c550f52ba`.
A later readiness-precheck candidate was not executed.

| Actual VPS step | UTC record | Result |
| --- | --- | --- |
| Check | 13:47:29 | Scoped precheck; no source write |
| Reconcile | 13:47:47 | Official single-block undo/replay completed |
| Verify | 13:47:54 | Canonical replacement, unchanged generation and exact revision change verified |

Revision advanced from 3953 to 3955 for rollback and replay. Every step reported
positive group cleanup and unchanged application epoch one. Private logs,
hashes and original journals were retained. All three steps completed before
archiving the old follow configuration/proof and capturing the new Prep-epoch
proof. Root restarted the same frozen helper and source unit. At 14:00:02 UTC,
authenticated status showed checkpoint 4536125 against head 4536126, ready and
available state and one-second source age. Root resumed the existing application
cursor; ordinary publications subsequently reached 4536131 with zero customer
outputs or operations. No cursor reseed or application epoch reset occurred.

## Actual epoch-one authorization

The app-only continuation code was published as
`b1e6adc7c58fc8085aa240435584d56799e80a3b`, with remote SHA verified.
Coordinator API typecheck and 83 tests passed without skips. The restricted
worker also executed the actual coherent snapshot SELECT in a read-only
transaction: epoch one, six zero customer/lease counts, three disabled assets,
four original capital accounts and eight opening entries.

Root issued a separate continuation proof after checking the three source
receipts, unchanged stored SQL anchors/cursor, fresh canonical prefix and
replacement checks, original generation and unchanged R9 handoff/opening files.
It binds exact epoch one and runtime-row xmin. Fresh SDK and Base reads verified
the original 12500000-zatoshi native capital, operator nonce zero,
500000000000000 wei gas and original contract capital boundaries. Financial
workers were absent. Its capital observation was at 13:57:23 UTC; it does not
remain a fresh activation preflight indefinitely.

The private authority SHA256 is
`6256e36cf1e1aa363460fc0f6fb10b54bd540e80f950ac451da2e18c0f231b6f`;
its source-resolution receipt SHA256 is
`c22a75fc6b9a79844d8b3d7231c2877c1d92b7fb006307ee5358cae0532a0cd9`.
It binds the original 142-proof Envio prefix and original identity, SQL and
encrypted-admission digests. It authorizes guarded prefunding continuation;
it does not clear reconciliation or activate financial dispatch.

## Remaining acceptance gates

The guarded Envio driver resumed the same history with two header batches and
the explicit recovery-only 80-method preset. Its first subsequent twenty-proof
invocation passed without stderr. At 14:22:44 UTC, the journal contained 250
proofs through 49609618, with a sampled remaining gap of 39764 blocks. Coverage
was still partial; it had not renewed the application Base checkpoint.

Complete Envio recovery and ordinary observation, a simultaneous five-minute
source/SQL window, fresh capital/activation evidence, exact activation CAS and
the new funded two-way circle remain separate gates. Intake and dispatch remain
disabled at epoch one. No new customer quote, signature, source payment, payout
or cross-chain settlement is claimed in this record.
