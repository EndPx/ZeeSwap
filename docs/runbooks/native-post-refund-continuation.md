# One post-refund native circle

This procedure prepares a separate authority for one successful forward/reverse
circle after the original late deposit is fully refunded. It grants no authority
to finish the old refund, sign a transaction, or operate a wallet. Root must
complete and independently verify the original refund first. Prepared code and
templates are not actual execution evidence.

The original R9 profile, handoff, opening proof and eight opening ledger rows
remain immutable. The previous prefunding controller remains unchanged. This
controller accepts only paused epoch 5, xmin 311173, reconciliation false, and
resumes to epoch 6. It does not clear reconciliation or change live asset flags.

Root's private approval is version 1, status
`ROOT_POST_REFUND_ONE_CIRCLE_APPROVED`, armed true, with the exact fields in
`ContinuationApproval` in `api/src/native-circle-continuation.ts`. Do not create
an armed approval from sample values. Fill actual old order/opening event IDs,
receipt digests, archival capital proof digests, nativeNotesDigest from the sorted actual current capitalNotes, fresh source identities, owner token hashes and shielded payer
receiver only after verification. Approval also carries acceptanceFunctionSha256 for the exact reviewed installed SQL function body. Approval expiry is bounded to 24 hours.
Store the single service-readable Root authority in `/opt/zeeswap-testnet/state/continuation/<basename>.private.json`, owned by Root, group 978, with mode 0640. Its parent directory must be Root-owned, group 978, mode 0750. The Root window and preflight commands read this exact same authority file and hash as the API. Both reject symbolic paths, incorrect ownership/modes and authorities larger than 256 KiB.

Store captures, windows, preflights and their private attempt journals separately in `/opt/zeeswap-testnet/state/continuation-preflight/`, with parent Root-owned mode 0700 and files Root-owned mode 0600. Admin configuration and local control journals stay on
the local Windows/WSL operator mount and never go to the VPS or Git.

The exact history gate requires one refunded forward order, the original
100000 late deposit at height 4536778 after cutoff 4536773, discharged liability,
confirmed source_refunds refund operation, one CONFIRMED ordinary refund operation and one DONE outbox row, three released reservations, confirmed
Base CANCEL and native refund, and zero Base payout attempts. It compares all
financial tables using one coherent bounded SELECT and checks every opening,
reservation, customer liability and refund ledger row. Account principal remains
200000 TAZ and 200000 mockUSDC. TAZ fee capital becomes 10000; Base fee capital is
500000000000000 minus the actual CANCEL gas expense.

Physical Base contract inventory is distinct from those SQL principal books.
The preflight requires physical inventory 10100000, available 10000000,
reserved 100000 and liability 100000, preserving the excluded legacy fixture.
Latest and pending operator nonces must both be 1. Its only nonce-zero
transaction must be the original successful canonical finalized CANCEL. The preflight decrypts the durable CANCEL payload, verifies its lookup HMAC, and uses the decrypted transaction hash for chain reads. It independently validates signed calldata and the canonical Cancelled event with terminal contract state 3; the stored lookup HMAC is never used as a network transaction hash.
Native physical capital is 12490000 in the actual current mature Ironwood notes;
the original opening note identity is not reused as a current-capital assertion.

Configure the API with `ZEESWAP_CIRCLE_CONTINUATION_PROOF=/opt/zeeswap-testnet/state/continuation/<basename>.private.json` and `ZEESWAP_CIRCLE_CONTINUATION_SHA256` equal to that file's actual SHA-256. UID 986 reads the Root-controlled authority through group 978. Copy the same authority bytes to the local operator configuration and pin the same hash; no second VPS authority copy is required.

Run the Root source capture with explicit authority and private output paths:

```text
pnpm --dir api exec tsx scripts/capture-linux-continuation-window.ts APPROVAL_PRIVATE_JSON WINDOW_PRIVATE_JSON
```

Every actual sample preserves paused epoch/xmin/reconciliation state and the
same historical financial snapshot digest. The source rules retain independent
canonical checks, source identities, actual progress, 60-second freshness,
300-second coverage and at most 20-second gaps. An attempted or expired window
does not authorize resume. Capture attempt journals remain private.

Root preflight takes explicit approval, native capture, Base capture and new
output paths:

```text
pnpm --dir api exec tsx scripts/linux-continuation-preflight.ts APPROVAL_PRIVATE_JSON NATIVE_PRIVATE_JSON BASE_PRIVATE_JSON PREFLIGHT_PRIVATE_JSON
```

The Base capture has version 1, status
`ROOT_POST_REFUND_BASE_CAPITAL_CAPTURED`, verifiedAt, latestNonce, pendingNonce,
gasWei, inventory, available, reserved, liability, cancelHash,
actualCancelFeeWei, receiptBlockNumber and receiptBlockHash. The preflight
independently compares these values against actual canonical finalized RPC
reads. It verifies the native capture with its pinned capture code and actual
current notes, reads the exact historical books, and requires financial workers
stopped. Issue fresh native and Base captures after the five-minute window. Their raw hashes may differ from archival authority captures; their note-set digest and exact financial values must match the authority. The preflight records the fresh hashes, and the local configuration pins the preflight itself. Captures and preflight must satisfy the 60-second freshness gate at resume. CANCEL gas includes both execution gas and the mandatory actual Base l1Fee; missing L1 fee is refused. Both preflight and local control require the exact continuation API health and installed SQL body/security/ACL. The local fixed localhost port 3031 must be a trusted operator tunnel to the VPS API. Health is read again immediately before CAS.

The local configuration uses version 1 and mode
`LOCAL_POST_REFUND_ONE_CIRCLE_CONTROL`, adminConfig, journalPath, and
approval/window/preflight objects each containing path and sha256. Keep the
config under the existing `.deploy-local/live-testnet-20261023/` directory.

```text
pnpm --dir api exec tsx scripts/control-linux-continuation.ts check LOCAL_PRIVATE_CONFIG
pnpm --dir api exec tsx scripts/control-linux-continuation.ts resume LOCAL_PRIVATE_CONFIG
pnpm --dir api exec tsx scripts/control-linux-continuation.ts reconcile LOCAL_PRIVATE_CONFIG
```

The journal fsyncs transaction identity and expected xmin before the CAS. It
fsyncs COMMIT intent before sending COMMIT. Any existing transaction intent
forces readback only, including after unknown COMMIT. Readback requires
`pg_xact_status` committed plus exact epoch 6 and transaction xmin; enabled
booleans alone are insufficient. An aborted or intervened result never replays
the transaction. Do not delete or replace a journal to retry.

Local implementation verification: API TypeScript check passed; 29 focused
TypeScript tests passed across continuation controls, API/harness admission,
native provenance/dispatch and the cutoff-wire regression. Root separately executed the admission fixtures on
the existing isolated regression branch: the serial test and the independently
selected two-client concurrency test each passed with zero skips, with their
invocation-owned schemas removed. The concurrent test observed the second
client blocked on the real runtime lock, then verified exactly one accepted
forward, one reservation set and one ledger event after the first committed.
These tests use the shipped 0003 acceptance
and 0007 runtime lock definitions plus the new 0017 function. Its first attempt
exposed a PL/pgSQL CASE-expression syntax error; the corrected body passed the
actual PostgreSQL rerun. This is isolated fixture evidence, not a live admission
or continuation. The reviewed function-body SHA is
`b42da08d64d3a873950b0f28c87d5cc588dfd06a55da5dd45a03057de0748454`.

Root independently verified the original full refund and the user's shielded
100000 receipt. The retained terminal state contains one CONFIRMED REFUND
operation and one DONE outbox row, not an empty application. No subsequent
successful circle or continuation activation is established by those receipts.
Actual fresh captures, source window and Root continuation approval remain
separate execution gates.

### Wallet ownership after a native financial CLI

The original Root-run refund CLI atomically replaced the mutable
`/opt/zeeswap-testnet/state/operator-wallet/zingo-wallet.dat` as root:root0600.
That blocked the next read-only capture after its required drop to UID986/GID978.
Root verified owned-child cleanup, acquired the existing operator-wallet lock,
checked the fixed realpath and regular file, and restored only that file to
986:978. Its bytes/hash and mode0600 were unchanged. R9 profiles, SDK artifacts,
wallet contents and financial journals were not rewritten.

Until a separate financial-subprocess identity change is reviewed, the operator
must audit this mutable file after each positively reaped native financial CLI
termination and before another native read or signing step. Any restoration
requires the same exclusive wallet lock, fixed regular-file realpath, unchanged
hash and preserved0600 mode. Do not recursively chown the wallet or its journals,
weaken the reader identity, or retry a financial command to repair permissions.
Unknown cleanup or lock ownership stops this procedure for review.

Root's subsequent read-only operator capture verified the actual post-refund
12490000 balance in two mature canonical Ironwood notes: refund own change and
the unspent old late-deposit residual. Its calculated cache was empty after
ordinary read-only synchronization; no retirement, deletion or reset was needed.

### New user harness namespace

Use profile `native-one-circle-continuation-testnet` with a `continuation` object
containing `approval:{path,sha256}`, `parentState:{path,sha256}`,
`originalNativeConfig`, and `owners:{ZCASH_TO_BASE,BASE_TO_ZCASH}`. The two new
private capability tokens must be generated and their hashes approved before
the Root authority is issued. The old harness state must already be REFUNDED,
have no reverse route or EVM artifacts, and remain byte-identical thereafter.
Supply a separate payer config and journal with the actually verified current
unspent payer notes. Keep the same payer wallet, receiver and EVM config.

The harness writes only `circle-continuation-*` state/artifacts while retaining
the shared harness lock. It checks the real API health for explicit all-history
caps2F/1R and the approved policy SHA. New native prepare and broadcast steps
require a fresh canonical sample with at least twelve remaining blocks. This
is a pre-step safety margin, not a mining guarantee; actual inclusion must still
be at or before the new immutable cutoff. A late result stops for refund review,
and there is no automatic additional attempt or fee top-up.

### Expected terminal accounting if the continuation succeeds

The additional forward must settle and release its unused native refund-fee
reservation before accepting the reverse. The remaining10000 TAZ fee budget
then funds that one reverse. A second late forward would instead consume this
budget in its refund and stop the continuation; it does not authorize a third
forward or another fee allocation.

After one successful additional forward and reverse, the existing accounting
leaves100000 in each principal inventory account and zero in the TAZ fee
account. Incoming settled proceeds remain `operator:unreconciled`; no automatic
reclassification restores the principal accounts to200000. Base fee inventory
equals the original500000000000000 minus the actual cancellation and subsequent
operator transaction fees, never the signed gas caps.

With both new native fees exactly10000 and no unrelated transfers, the payer
and operator each move from post-refund12490000 to terminal12480000 physically.
The original refunded attempt and its fees remain part of lifetime conservation.
The post-refund capital capture is a resume-only proof of12490000, not a terminal
balance proof for the successful circle. Final canonical receipts, books and
current note sets still require independent reconciliation.

Final shape audit: a LATE source refund uses source_refunds and has no ordinary Base payout binding. The continuation guard requires zero base_bindings and zero base_attempts; a synthetic terminal-ledger fixture passes with that shape and rejects an injected ordinary binding even when its snapshot digest is approved. This follows the shipped refund path; Root must confirm the actual snapshot before issuing authority.
