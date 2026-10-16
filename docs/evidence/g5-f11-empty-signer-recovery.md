# F11 signer interruption: empty next-payment recovery

Driver82511 stopped at F11 `DISPATCH` on 2026-10-16 at 04:57:34 UTC.
The retained body diagnostic is `BASE_SIGNER_UNAVAILABLE`. Its original wrapper
did not preserve the child failure, so the historical cause remains **UNKNOWN**.
A successful later health check does not establish what failed then.

The wrapper covers authorization, preparation, process startup, timeout,
nonzero exit and malformed output. A signer can persist a nonce/terms intent
before generating raw bytes. This recovery therefore accepts only the
independently proved **EMPTY PAY11** variant. Any unknown intent, raw, temporary
file, nonce, transaction or scoped process refuses it.

## Retained actual observations

Root captured the incident at 05:00:55.886 UTC. The run had ten settled and
ordinarily receipt-verified executions, barriers `[5,10]`, fourteen current
funded execution IDs, and two audited unfunded predecessors. Its sixteen
accepted orders retained forty-eight reservations. Main and controller were
frozen; SQL reconciliation was required at epoch 10 and service controls were
false.

F11 was READY with confirmed RESERVE25 and no PAY row. R12 was READY with its
original SQL-unconfirmed COMMIT26. F13 was READY with SQL-unconfirmed RESERVE27.
R14 was READY without an operator transaction. Controller stages were
respectively `DISPATCH`, `OBSERVE_COMMIT`, `DISPATCH`, and `PREPARE_COMMIT`.

Root's complete financial-artifact directory capture at 05:01:37.123 UTC
retained 64 operator files, including transaction, authorization and typed-data
files. It intentionally excluded the OS `signer.lock` entry. Transaction nonces
were exactly0 through27 with complete raw/hash records, no nonce28 and no
temporary files. The payer capture similarly excluded its OS lock and retained
eight original transactions at nonces5 through12. A separate actual check at
05:01:42.336 UTC reported operator/payer latest and pending nonces
`[28,28,13,13]`. Payer nonces0 through4 are not invented as journal requirements.

Root's read-only signer health check passed between 05:07:47 and 05:07:51 UTC:
chain84532, configured wallet address, settlement/token code hashes, exact F11
reservation at a canonical pinned block, exclusive flock, absent scoped
Python/cast processes, unchanged captured files, absent PAY11 and no temporary
files. No signing or broadcast occurred. Its earlier probe-parser error was a
diagnostic-tool error, not the historical signer cause.

At 05:10:51 UTC root independently verified these original canonical receipts:

| Effect | Nonce | Block | Fee in wei | Final at that observation |
| --- | ---: | ---: | ---: | --- |
| F11 RESERVE | 25 | 48178579 | 3564120000223 | Yes |
| R12 COMMIT | 26 | 48178701 | 749720000092 | Yes |
| F13 RESERVE | 27 | 48179047 | 3222840000217 | No |

That observation's finalized head was48178893. Recovery must independently
require a fresh finalized head covering block48179047 before comparing physical
balances or clearing latches.

## First refusal and exact OS-lock handling

Root's first bounded recovery invocation 91629 refused at 05:26:03 UTC before
any clear. It compared complete live directory names against the immutable
lock-excluding baseline: current operator65 versus retained64, and current
payer9 versus retained8. The only extra entry in each was `signer.lock`.
Both incidents remained set.

Root subsequently confirmed both lock paths with read-only `lstat`: regular
files, not symlinks, exactly zero bytes, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
The corrected helper derives each complete current inventory from all original
entries plus exactly that authenticated empty OS lock. It does not delete,
truncate or create a lock, rewrite the baseline, ignore other files, or allow a
generic lock exception. Missing originals, other extra files, temporary files,
nonempty locks, directories, symlinks and conflicting baseline lock records
refuse recovery.

The complete derived65/9 inventories are retained in private proof and used
for byte checks. Operator quiescence binds the derived65-file digest. The
script rechecks the lock's regular-file type, empty bytes and original
device/inode/birthtime identity at the CAS, alongside its pinned SHA.

## Accounting and protected scope

Charged SQL fees remain **32405480003215 wei** for the first ten settlements.
The three active paid operator transactions add **7536680000532 wei**, giving
known physical fees of **39942160003747 wei**. Recovery does not post those
pending fees. Against opening gas992159619998412 wei, the physical gas target
is952217459994665 wei.

| SQL account | Balance | Reserved |
| --- | ---: | ---: |
| mockUSDC principal, atomic units | 500000 | 200000 |
| TAZ principal, zatoshi | 500000 | 200000 |
| TAZ fee, zatoshi | 80000 | 40000 |
| Base fee, wei | 267594519996785 | 200000000000000 |

Each source asset retains500000 atomic units in operator proceeds and 200000
in customer-held funds, with matching conversion/liability entries. Per-event
balance and available/reserved/spent/capital replay must match these accounts.
All fourteen deposits, obligations, operations and jobs remain unchanged.
Historical DONE metadata remains retained; queued jobs stay retired and no
private old lease is restored as live.

Physical inventory equals opening inventory, with 200000 mockUSDC atomic units
reserved for F11/F13 and 200000 in R12/R14 escrows. Seven source notes total
700000 zatoshi. The full twelve-wallet proof requires the first five reverse
wallets spent, all remaining original reverse capital unspent without SDK
calculations, and extra fee capital intact. Both archived receivers and
references remain watched. Original funding and authorization deadlines remain
unchanged.

`api/scripts/g5-recover-f11-empty-signer.ts` binds the exact retained incident,
manifest/controller configurations, epoch 10, both archives, all fourteen slots,
first-ten flags, migration14 names and bytes, global inventory, original raw
signatures and finalized canonical receipts. Financial SQL books must remain
identical. It performs no receipt reconciliation/import, source observation
transition, signing, broadcast, source funding or SDK calculation. R12 COMMIT
and F13 RESERVE remain SQL-unconfirmed for normal observers after recovery.

R12/R14 require unapproved payout digests and absent SDK journal, result,
crash-marker and approval artifacts. Absence uses `lstat`; a dangling intent is
present and unknown. Source11/13 original intents, results and current
Source13 admission artifacts are retained and bound to canonical source notes.

The fixed read-only quiescence program follows the actual forward signer's
configured WSL distribution. It scans processes, acquires the existing flock,
checks the configured wallet address without signing or key export, verifies
directory bytes, releases the lock and scans again. It does not call RPC or
write journals. The core/controller locks remain held through CAS; the program
does not claim to hold its OS flock after returning.

The final near-CAS packet is saved as `intent.currentQuiescence` and re-pinned.
Quiescence 30-second, source 60-second and wallet 300-second age checks run again
immediately before the control update, after file, migration and archive checks.

Durable `PROVED`, `DB_CLEAR` and `COMPLETE` phases support reviewed mixed local
crash states. Save failures re-freeze SQL first and restore only owned original
or proposed files. Foreign state is not overwritten. Successful clear preserves
all order stages and flags and pins the same F11 `DISPATCH` before another
preparation. It claims no new settlement, verification, barrier, or G5 closure.

## Verification

- Seven TypeScript recovery tests passed for literal scope, immutable books,
  money/proceeds, physical fees, same-order priority, refreeze-first saves and
  durable mixed-state continuation.
- Four TypeScript quiescence tests passed for explicit distribution routing,
  complete proof/freshness checks, lstat absence, and the actual baseline 64/8
  versus current 65/9 lock shape, including missing/extra/conflicting entries
  and nonempty/nonregular/symlink lock negatives.
- Six Python tests passed in Ubuntu using synthetic temporary directories,
  actual filesystem flock, fake process records and a dummy process tied to a
  synthetic config. They did not invoke a live signer, RPC or wallet.
- Typecheck and diff checks passed. Root and independent review also checked
  the guard and ledger validator against retained actual incident books using
  pure local reads.

## Actual bounded recovery and independent post-check

The first invocation 91629 refused at 05:26:03 UTC before clearance because the
retained inventory deliberately omitted OS lock metadata while the live
complete directory included it. All financial files matched and the incidents
remained set. That refusal is retained as history; it is not a successful run.
The fix leaves the 64/8 original financial-file baselines immutable and derives
full 65/9 lists by authenticating only the existing regular, non-symlink,
zero-byte signer.lock with its exact empty SHA. Other extras, missing originals,
nonempty or replaced locks remain hard failures. Root's actual filesystem
preflight matched every original byte before retry.

Retry 43816 exited successfully at **2026-10-16 05:36:20.521 UTC**, with the
recovery intent COMPLETE. Its final signer quiescence was observed at
05:36:18.477 UTC and authenticated 65 complete operator-directory entries.
No new payment, source funding, signing, SDK calculation, broadcast or normal
receipt import occurred.

Root's independent post-check at **05:36:32 UTC** passed: economic SQL books
were byte-identical to the first retained incident. There were sixteen accepted
orders, forty-eight reservations with twelve held, four HELD obligations,
fourteen operations and zero LEASED jobs. All ten SQL/ordinary verification
flags, barriers `[5,10]`, and archives `[7,13]` remained unchanged. PAY11 is
absent; R12 COMMIT and F13 RESERVE remain SQL-unconfirmed. F11 has priority
DISPATCH on the same original order. Intake/dispatch/reconciliation are false
at epoch 10, main/controller incidents are false, and normal status passed at
05:36 UTC. The historical signer failure cause remains **UNKNOWN**.

Root's current verification totals are 33 distinct TypeScript tests and 38 Python
tests, with global typecheck and diff checks passed. The Python count includes
quiescence tests once. The driver remains held for grouped publication. Ten
funded settlements, barriers 15/20, close and broader G5 acceptance remain open.
