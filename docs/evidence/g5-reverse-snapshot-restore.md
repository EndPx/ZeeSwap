# G5 reverse snapshot and journal reconstruction

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`0cb796ccaa00747a094b16e32960755378b9f562`.

The coordinator ran the completed reverse snapshot test suite: **5/5 passed in
38.932 seconds**, using an invocation-owned disposable Neon database, actual
PostgreSQL 18 dump/restore and actual contracts on loopback Anvil. The Zcash
transaction and delivery verifier in this suite are synthetic fixtures. This
does not claim a live wallet-database restore or another testnet settlement.

## Actual database rollback

The fixture accepts and funds a reverse escrow, finalizes COMMIT, and captures
an old database snapshot before the Zcash payout is stored. It then advances
the independent original transaction journals, supplies a synthetic verified
Zcash delivery, executes and finalizes SETTLE on Anvil, and reaches SETTLED in
the database. Restoring the old archive genuinely removes the payout/SETTLE
records and accounting. Restore plus reconciliation pause commit atomically;
fresh connections cannot see restored active dispatch before the pause.

The chain and private journals retain the original completed operations.
`reverse-restore.ts` requires a database-owner connection, paused controls, the
existing immutable escrow binding and finalized COMMIT, matching original SDK
and Base journal identities, independently validated signed bytes, a fresh
canonical Zcash delivery and finalized COMMIT/SETTLE receipts. Only then can it
import missing durable records and invoke the existing receipt/accounting path.
It neither signs nor broadcasts, enables dispatch, nor refunds an unknown
committed delivery.

## Verified cases

| Case | Result |
| --- | --- |
| Real old snapshot restore | Paused state with finalized COMMIT and missing payout/SETTLE, despite advanced chain and journals |
| Missing/corrupt journals and changed authority/bytes | Rejected without importing a replacement operation |
| Unknown delivery, changed inclusion and stale receipt | Rejected with the source obligation retained |
| Active controls and worker-role import | Rejected without new economic action |
| Concurrent and repeated recovery | One original payout and SETTLE restored; exact once-only principal/fee accounting, released reservations and discharged liability |

The suite checks exactly the two original Base preparations/broadcasts, unchanged
operator nonce after recovery, exact TAZ principal and fee debits, both actual
Base fees, balanced events and no replay ledger growth. The temporary database
was removed and historical `neondb` retained. TypeScript typecheck passed.

As a separate read-only interoperability check, `readReverseRestoreJournal`
successfully parsed the actual preserved G4 journal for Zcash transaction
`35289d8965f6e87a1ba1cba65a11ae47866202dd0b9bd8f8a0a9556cff2877ab`,
its original approval and original Base signer files. No G4 database, wallet,
journal or chain state was changed, and those records were not replayed.

## SDK interruption rehearsal support

The optional `g5-sdk-crash.py` wrapper retains the unchanged approved adapter
configuration and writer lock. On one explicitly selected prepare operation it
waits for the pinned real SDK's durable calculate/export to return, fsyncs a
one-shot private marker and kills its own process before the adapter writes
PREPARED. The original SIGNING_INTENT remains. Other commands use the original
adapter, including recovery of the original bytes.

Three Linux wrapper tests passed, including a real child-process SIGKILL with a
synthetic export. A funded real SDK interruption has **not** run yet. The marker,
raw transaction, recipient mapping and journal remain private. This wrapper is
opt-in test tooling, not a normal production failure mode.

Reproduction requires the private synthetic database configuration, PostgreSQL
18 client tools in `Ubuntu-24.04`, compiled contract artifacts and loopback
Anvil on chain ID 84532:

```powershell
cd api
pnpm exec tsx scripts/test-g5-reverse-restore.ts
```

The broader G5 gate remains open: live refunds, the late-source incident, a real
SDK process-kill rehearsal and twenty verified alternating public-testnet swaps
still require their own evidence.
